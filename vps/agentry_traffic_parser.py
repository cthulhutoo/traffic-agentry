#!/usr/bin/env python3
"""
Agentry traffic parser.

Reads the last 30 days of nginx access logs and writes a JSON snapshot
to /var/lib/agentry/traffic_metrics.json, matching the dashboard's
MetricsResponse shape.

Run via cron every 10 minutes:
  */10 * * * * /usr/local/bin/agentry_traffic_parser.py >> /var/log/agentry/traffic_parser.log 2>&1

Reads:
  /var/log/nginx/access.log           (current)
  /var/log/nginx/access.log.1         (yesterday's rotated file)
  /var/log/nginx/access.log.*.gz      (older rotated/gzipped files)

Combined log format expected (default nginx):
  $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent
    "$http_referer" "$http_user_agent"
"""

from __future__ import annotations

import gzip
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

LOG_DIR = Path("/var/log/nginx")
OUT_PATH = Path("/var/lib/agentry/traffic_metrics.json")
RANGE_DAYS = 30

# Skip noise: VPS self-pings, Tailscale, health probes
SKIP_IPS = {"127.0.0.1", "::1", "107.173.231.193", "100.100.18.38"}
SKIP_UA_SUBSTR = ("kube-probe", "ELB-HealthChecker", "GoogleHC")

WELL_KNOWN_PATHS = {
    "/.well-known/mcp.json": "discoveryMcp",
    "/.well-known/ai-plugin.json": "discoveryAiPlugin",
    "/.well-known/nostr.json": "discoveryNostr",
}

LOG_RE = re.compile(
    r'(?P<ip>\S+) \S+ \S+ \[(?P<ts>[^\]]+)\] '
    r'"(?P<method>\S+) (?P<path>\S+) [^"]+" '
    r'(?P<status>\d+) \S+ "[^"]*" "(?P<ua>[^"]*)"'
)

TS_FMT = "%d/%b/%Y:%H:%M:%S %z"


def iter_log_files() -> list[Path]:
    """Return log files newest-first so we stop early once we cross the window."""
    plain = sorted(LOG_DIR.glob("access.log*"))
    # access.log (current) first, then .1, .2.gz, ...
    plain.sort(key=lambda p: (0 if p.name == "access.log" else 1, p.name))
    return plain


def open_log(p: Path):
    if p.suffix == ".gz":
        return gzip.open(p, "rt", errors="replace")
    return open(p, "r", errors="replace")


def parse_logs(window_start: datetime):
    """Stream every matching log line within the window."""
    for p in iter_log_files():
        try:
            with open_log(p) as fh:
                for line in fh:
                    m = LOG_RE.match(line)
                    if not m:
                        continue
                    try:
                        ts = datetime.strptime(m.group("ts"), TS_FMT).astimezone(timezone.utc)
                    except ValueError:
                        continue
                    if ts < window_start:
                        # Older lines never come back since logs are append-only.
                        # Bail on rotated files; for the current file keep scanning
                        # because rare clock drift could put older timestamps anywhere.
                        if p.name != "access.log":
                            return
                        continue
                    yield ts, m
        except OSError as e:
            print(f"warn: cannot read {p}: {e}", file=sys.stderr)


def daily_key(ts: datetime) -> str:
    return ts.date().isoformat()


def build_snapshot(range_days: int = RANGE_DAYS) -> dict:
    now = datetime.now(timezone.utc)
    end = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    start = end - timedelta(days=range_days)

    # daily aggregates
    daily_requests: Counter[str] = Counter()
    daily_unique_ips: defaultdict[str, set[str]] = defaultdict(set)
    daily_mcp: Counter[str] = Counter()
    daily_disc: defaultdict[str, Counter[str]] = defaultdict(Counter)

    # global aggregates
    ua_counts: Counter[str] = Counter()
    ua_first_seen: dict[str, str] = {}
    ip_counts: Counter[str] = Counter()
    ip_org: dict[str, str] = {}  # filled later
    recent_discovery: list[dict] = []

    # to detect "new user agents per day"
    seen_ua_before_window: set[str] = set()
    ua_first_seen_in_window: dict[str, str] = {}

    for ts, m in parse_logs(start):
        ip = m.group("ip")
        ua = m.group("ua") or "-"
        path = m.group("path").split("?", 1)[0]
        method = m.group("method")
        status = int(m.group("status"))

        if ip in SKIP_IPS:
            continue
        if any(s in ua for s in SKIP_UA_SUBSTR):
            continue

        d = daily_key(ts)

        daily_requests[d] += 1
        daily_unique_ips[d].add(ip)
        ua_counts[ua] += 1
        ip_counts[ip] += 1

        if ua not in ua_first_seen or d < ua_first_seen[ua]:
            ua_first_seen[ua] = d
        if ua not in ua_first_seen_in_window:
            ua_first_seen_in_window[ua] = d

        # MCP tool call: POST /mcp returning 202
        if method == "POST" and path.rstrip("/") == "/mcp" and status == 202:
            daily_mcp[d] += 1

        # /.well-known discovery
        if path in WELL_KNOWN_PATHS:
            daily_disc[d][WELL_KNOWN_PATHS[path]] += 1
            if len(recent_discovery) < 200:
                recent_discovery.append({
                    "ts": ts.isoformat().replace("+00:00", "Z"),
                    "path": path,
                    "ip": ip,
                    "ua": ua,
                    "status": status,
                })

    # build daily array (zero-fill missing days)
    daily = []
    for i in range(range_days):
        d = (start + timedelta(days=i)).date().isoformat()
        unique = len(daily_unique_ips.get(d, set()))
        new_uas = sum(
            1 for ua, first in ua_first_seen_in_window.items()
            if first == d
        )
        disc = daily_disc.get(d, Counter())
        daily.append({
            "date": d,
            "dailyRequests": daily_requests.get(d, 0),
            "uniqueIps": unique,
            "mcpToolCalls": daily_mcp.get(d, 0),
            "newUserAgents": new_uas,
            "discoveryMcp": disc.get("discoveryMcp", 0),
            "discoveryAiPlugin": disc.get("discoveryAiPlugin", 0),
            "discoveryNostr": disc.get("discoveryNostr", 0),
        })

    # top user agents (10) and top ips (10)
    top_user_agents = [
        {
            "ua": ua,
            "count": cnt,
            "firstSeen": ua_first_seen.get(ua, daily[0]["date"]),
        }
        for ua, cnt in ua_counts.most_common(10)
    ]
    top_ips = [
        {"ip": ip, "count": cnt, "org": guess_org(ip)}
        for ip, cnt in ip_counts.most_common(10)
    ]

    # newest 50 discovery hits
    recent_discovery.sort(key=lambda r: r["ts"], reverse=True)
    recent_discovery = recent_discovery[:50]

    return {
        "generatedAt": now.isoformat().replace("+00:00", "Z"),
        "rangeDays": range_days,
        "daily": daily,
        "topUserAgents": top_user_agents,
        "topIps": top_ips,
        "recentDiscovery": recent_discovery,
    }


def guess_org(ip: str) -> str:
    """Cheap classifier — extend with MaxMind GeoIP2 if you want real ASN data."""
    if ip.startswith(("104.244.", "104.18.", "172.64.", "162.158.")):
        return "Cloudflare"
    if ip.startswith(("34.", "35.", "104.196.", "146.148.")):
        return "Google Cloud"
    if ip.startswith(("3.", "13.", "18.", "52.", "54.", "184.72.")):
        return "AWS"
    if ip.startswith(("20.", "40.", "13.64.", "104.40.")):
        return "Azure"
    if ip.startswith(("65.108.", "78.46.", "95.216.")):
        return "Hetzner"
    if ip.startswith(("134.122.", "159.65.", "159.89.", "165.227.")):
        return "DigitalOcean"
    if ip.startswith("172.225."):
        return "Apple Private Relay"
    return "Other"


def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    snapshot = build_snapshot()
    tmp = OUT_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(snapshot, separators=(",", ":")))
    tmp.replace(OUT_PATH)
    print(
        f"wrote {OUT_PATH} · "
        f"{sum(d['dailyRequests'] for d in snapshot['daily'])} requests · "
        f"{len(snapshot['recentDiscovery'])} recent discovery hits"
    )


if __name__ == "__main__":
    main()
