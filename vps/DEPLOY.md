# Agentry Traffic — VPS + Netlify Deploy Guide

End-to-end wiring for the live traffic dashboard at **traffic.agentry.com**.

```
nginx access logs
   │  (every 10 min, root cron)
   ▼
/usr/local/bin/agentry_traffic_parser.py
   │  writes atomically
   ▼
/var/lib/agentry/traffic_metrics.json
   │  served by nginx behind ?token=...
   ▼
https://api.agentry.com/internal/traffic-metrics?token=…
   │  fetched server-side by Netlify Function
   ▼
https://traffic.agentry.com/api/metrics   (proxied)
   │
   ▼
React dashboard (Vite + Recharts)
```

---

## 0. Shared token

The token is **not stored in this repo**. It lives in two places:

- the nginx `if ($arg_token != "...")` check on the VPS
  (in `/etc/nginx/snippets/agentry-traffic-metrics.conf` after install — replace the `REPLACE_WITH_TOKEN` placeholder)
- the `VPS_METRICS_TOKEN` env var in Netlify (flag it as a secret)

To rotate, generate a new value with `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`, then update both places at the same time and `nginx -t && systemctl reload nginx`.

---

## 1. VPS install (one-time)

SSH to **agentry** (`107.173.231.193`) as root, then:

```bash
# From your laptop:
scp -r vps/ root@107.173.231.193:/tmp/agentry-vps/

# Then on the VPS:
ssh root@107.173.231.193
cd /tmp/agentry-vps
chmod +x install.sh
./install.sh
```

`install.sh` does the following:

1. Copies `agentry_traffic_parser.py` to `/usr/local/bin/` (mode 0755)
2. Creates `/var/lib/agentry/` and `/var/log/agentry/`
3. Runs the parser once to seed `traffic_metrics.json`
4. Adds a root cron entry: every 10 minutes
5. Drops `nginx-traffic-metrics.conf` into `/etc/nginx/snippets/`

After the script finishes, **edit the api.agentry.com server block** and add:

```nginx
include /etc/nginx/snippets/agentry-traffic-metrics.conf;
```

Then:

```bash
nginx -t && systemctl reload nginx
```

Verify (from your laptop, replace `$TOKEN` with the real value):

```bash
curl -i "https://api.agentry.com/internal/traffic-metrics?token=$TOKEN" | head -20
# 200 + JSON expected

curl -i 'https://api.agentry.com/internal/traffic-metrics'
# 403 expected (no token)
```

---

## 2. Netlify site (one-time)

The `netlify__pipedream` connector here only exposes deploy/file-management calls — it cannot create a new site. Easiest path:

1. In the Netlify UI, **Add new site → Import from Git** (or **Deploy manually**) and point it at this repo / project directory.
   - Build command: `npm run build`
   - Publish dir: `dist/public`
   - Functions dir: `netlify/functions`
   - These are also encoded in `netlify.toml`, so the UI will auto-fill.
2. **Site configuration → Environment variables** — add (flag `VPS_METRICS_TOKEN` as a secret):

   | Key                  | Value                                                      |
   | -------------------- | ---------------------------------------------------------- |
   | `VPS_METRICS_TOKEN`  | _the value from your password manager_                     |
   | `VPS_METRICS_URL`    | `https://api.agentry.com/internal/traffic-metrics` (optional override) |

3. **Domain management → Add custom domain** → `traffic.agentry.com`.
   Netlify will give you a CNAME target like `<site>.netlify.app`. Add a `CNAME` record on the agentry.com DNS:

   ```
   traffic   CNAME   <site>.netlify.app.
   ```

   Wait for DNS to propagate, let Netlify provision the Let's Encrypt cert.

Once the first deploy is live, share the **Site ID** with the agent and future updates can be pushed via the Netlify connector / CLI without touching the UI.

---

## 3. Verifying the live wiring

From your browser:

```
https://traffic.agentry.com/                  ← dashboard loads
https://traffic.agentry.com/api/metrics       ← raw JSON response
```

The dashboard auto-refetches every 5 minutes. The header shows `Updated <n>m ago` from `generatedAt` in the JSON.

---

## 4. Operations

| Task                                 | How                                                          |
| ------------------------------------ | ------------------------------------------------------------ |
| Force a parser run                   | `sudo /usr/local/bin/agentry_traffic_parser.py`              |
| Tail parser log                      | `sudo tail -f /var/log/agentry/traffic_parser.log`           |
| Inspect last snapshot                | `sudo jq . /var/lib/agentry/traffic_metrics.json | head`     |
| Rotate token                         | Update nginx snippet + Netlify env var, reload nginx + redeploy function |
| Add IPs/UAs to skip list             | Edit `SKIP_IPS` / `SKIP_UA_SUBSTRINGS` in the parser, redeploy |
| Change refresh frequency             | Edit cron entry (currently `*/10 * * * *`)                   |

---

## 5. Stop the legacy daily reports

The previous three daily reports (run from other Computer threads) are now redundant — the dashboard supersedes them. Delete them from the **Scheduled Tasks** UI:

1. Open Computer
2. Sidebar → **Scheduled tasks**
3. Find the three daily traffic reports → **Delete** each

Those crons live on threads we can't see from this conversation, so they have to be stopped from the UI.
