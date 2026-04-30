#!/usr/bin/env bash
#
# One-shot installer for the Agentry traffic parser on the VPS.
# Run as root on agentry (107.173.231.193).
#
# What it does:
#   1. Installs /usr/local/bin/agentry_traffic_parser.py
#   2. Creates /var/lib/agentry/ and /var/log/agentry/
#   3. Adds a root cron entry (every 10 minutes)
#   4. Drops the nginx snippet into /etc/nginx/snippets/
#   5. Reminds you to include it in api.agentry.com server block + reload nginx
#
# Usage on the VPS:
#   cd /tmp
#   # upload agentry_traffic_parser.py, nginx-traffic-metrics.conf, install.sh
#   chmod +x install.sh
#   sudo ./install.sh
#
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
PARSER_SRC="$SRC_DIR/agentry_traffic_parser.py"
NGINX_SRC="$SRC_DIR/nginx-traffic-metrics.conf"

if [[ ! -f "$PARSER_SRC" ]]; then
  echo "Missing $PARSER_SRC" >&2; exit 1
fi
if [[ ! -f "$NGINX_SRC" ]]; then
  echo "Missing $NGINX_SRC" >&2; exit 1
fi

echo "==> Installing parser to /usr/local/bin/agentry_traffic_parser.py"
install -m 0755 "$PARSER_SRC" /usr/local/bin/agentry_traffic_parser.py

echo "==> Creating data + log directories"
install -d -m 0755 /var/lib/agentry
install -d -m 0755 /var/log/agentry

echo "==> Running parser once to seed /var/lib/agentry/traffic_metrics.json"
/usr/local/bin/agentry_traffic_parser.py || {
  echo "Parser failed on first run. Check /var/log/agentry/traffic_parser.log" >&2
  exit 1
}
ls -l /var/lib/agentry/traffic_metrics.json

echo "==> Installing cron entry (root, every 10 min)"
CRON_LINE='*/10 * * * * /usr/local/bin/agentry_traffic_parser.py >> /var/log/agentry/traffic_parser.log 2>&1'
( crontab -l 2>/dev/null | grep -v 'agentry_traffic_parser.py' ; echo "$CRON_LINE" ) | crontab -
echo "Current root crontab:"; crontab -l | grep agentry || true

echo "==> Installing nginx snippet"
install -d -m 0755 /etc/nginx/snippets
install -m 0644 "$NGINX_SRC" /etc/nginx/snippets/agentry-traffic-metrics.conf

cat <<'NEXT'

==> Manual step: include the snippet in your api.agentry.com server block.

Edit /etc/nginx/sites-available/api.agentry.com (or wherever the
api.agentry.com server { ... } block lives) and add inside it:

    include /etc/nginx/snippets/agentry-traffic-metrics.conf;

Then test and reload:

    sudo nginx -t && sudo systemctl reload nginx

Edit /etc/nginx/snippets/agentry-traffic-metrics.conf and replace the
REPLACE_WITH_TOKEN placeholder with your real token (the same value you
set as VPS_METRICS_TOKEN in Netlify env vars).

Verify from your laptop:

    curl -i "https://api.agentry.com/internal/traffic-metrics?token=$TOKEN" | head

You should see HTTP 200 and a JSON body. A request without the token
should return 403.

NEXT
