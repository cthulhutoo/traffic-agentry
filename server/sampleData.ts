// Deterministic 30-day sample dataset for the Agentry traffic dashboard.
// Replace this module with a real adapter to your VPS access logs.
//
// Ingest contract — the GET /api/metrics endpoint returns this MetricsResponse shape.
// To wire to production, implement the same shape from your nginx/Caddy access logs:
//   - dailyRequests:   count of all 2xx/3xx/4xx/5xx requests per day
//   - uniqueIps:       distinct client IPs per day (after stripping internal/health-check IPs)
//   - mcpToolCalls:    count of `POST /mcp` requests with status 202 per day
//   - newUserAgents:   count of UA strings first seen on that day
//   - discoveryHits:   count of GETs to /.well-known/{mcp.json,ai-plugin.json,nostr.json} per day
//   - topUserAgents:   top N UA strings (last 30d) with counts
//   - topIps:          top N client IPs (last 30d) with counts and rough ASN/org if available
//   - recentDiscovery: last 50 hits to any /.well-known file with timestamp + UA + IP

export type DailyRow = {
  date: string;            // ISO YYYY-MM-DD
  dailyRequests: number;
  uniqueIps: number;
  mcpToolCalls: number;
  newUserAgents: number;
  discoveryMcp: number;        // /.well-known/mcp.json
  discoveryAiPlugin: number;   // /.well-known/ai-plugin.json
  discoveryNostr: number;      // /.well-known/nostr.json
};

export type UaRow = { ua: string; count: number; firstSeen: string };
export type IpRow = { ip: string; count: number; org: string };
export type DiscoveryHit = {
  ts: string;        // ISO timestamp
  path: string;      // /.well-known/...
  ip: string;
  ua: string;
  status: number;
};

export type MetricsResponse = {
  generatedAt: string;
  rangeDays: number;
  daily: DailyRow[];
  topUserAgents: UaRow[];
  topIps: IpRow[];
  recentDiscovery: DiscoveryHit[];
};

// ---------- deterministic PRNG so the dashboard is stable across reloads ----------
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 8649226;
const rand = mulberry32(SEED);

function gauss(mean: number, stdev: number): number {
  // Box–Muller
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return mean + stdev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

const KNOWN_AGENTS = [
  { ua: "Claude-Web/1.0 (+https://claude.ai)", org: "Anthropic" },
  { ua: "ChatGPT-User/2.0 (+https://openai.com/bot)", org: "OpenAI" },
  { ua: "PerplexityBot/1.1 (+https://perplexity.ai/bot)", org: "Perplexity" },
  { ua: "GPTBot/1.2 (+https://openai.com/gptbot)", org: "OpenAI" },
  { ua: "Anthropic-MCP-Client/0.4", org: "Anthropic" },
  { ua: "cursor-agent/0.42 mcp-client", org: "Cursor" },
  { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/124", org: "Browser" },
  { ua: "curl/8.4.0", org: "CLI" },
  { ua: "node-fetch/3.3.2", org: "Node" },
  { ua: "agentry-mcp-cli/0.3.1", org: "Agentry" },
  { ua: "Goose/1.4 (+https://block.github.io/goose)", org: "Block" },
  { ua: "Continue.dev/0.9.123", org: "Continue" },
];

const ASNS = [
  { ip: "104.244.42.", org: "Cloudflare" },
  { ip: "34.74.218.", org: "Google Cloud" },
  { ip: "52.119.231.", org: "AWS" },
  { ip: "20.171.207.", org: "Azure" },
  { ip: "104.18.32.", org: "Cloudflare" },
  { ip: "172.225.10.", org: "Apple Private Relay" },
  { ip: "3.224.18.", org: "AWS" },
  { ip: "162.247.74.", org: "Tor exit" },
  { ip: "65.108.46.", org: "Hetzner" },
  { ip: "134.122.18.", org: "DigitalOcean" },
];

function ipFromAsn(): { ip: string; org: string } {
  const a = pick(ASNS);
  return { ip: a.ip + Math.floor(rand() * 254 + 1), org: a.org };
}

// ---------- dataset builder ----------
export function buildSampleData(rangeDays = 30): MetricsResponse {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Anomaly days: pick three spikes in the recent two weeks
  const anomalyOffsets = new Set([3, 9, 17]); // days ago

  const daily: DailyRow[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const dow = d.getUTCDay();
    const weekendFactor = dow === 0 || dow === 6 ? 0.72 : 1.0;

    // Trend up over 30 days
    const trend = 1 + (rangeDays - i) * 0.012;

    let requests = Math.max(40, Math.round(gauss(180, 22) * weekendFactor * trend));
    let unique = Math.max(10, Math.round(gauss(46, 6) * weekendFactor * trend));
    let mcp = Math.max(5, Math.round(gauss(34, 7) * weekendFactor * trend));
    let newUa = Math.max(0, Math.round(gauss(3.2, 1.6)));
    let dMcp = Math.max(0, Math.round(gauss(7, 2)));
    let dPlug = Math.max(0, Math.round(gauss(4, 1.5)));
    let dNostr = Math.max(0, Math.round(gauss(2.4, 1.2)));

    if (anomalyOffsets.has(i)) {
      // Spike well above the >20 threshold for at least one metric
      requests += 110 + Math.round(rand() * 60);
      unique += 38 + Math.round(rand() * 14);
      mcp += 55 + Math.round(rand() * 25);
      newUa += 6;
      dMcp += 24 + Math.round(rand() * 8);
    }

    daily.push({
      date: d.toISOString().slice(0, 10),
      dailyRequests: requests,
      uniqueIps: unique,
      mcpToolCalls: mcp,
      newUserAgents: newUa,
      discoveryMcp: dMcp,
      discoveryAiPlugin: dPlug,
      discoveryNostr: dNostr,
    });
  }

  // Top user agents — counts loosely correlated with mcp totals
  const totalMcp = daily.reduce((s, r) => s + r.mcpToolCalls, 0);
  const uaShares = [0.27, 0.19, 0.14, 0.10, 0.08, 0.06, 0.05, 0.04, 0.03, 0.02, 0.01, 0.01];
  const topUserAgents: UaRow[] = KNOWN_AGENTS.map((a, idx) => {
    const share = uaShares[idx] ?? 0.005;
    return {
      ua: a.ua,
      count: Math.max(1, Math.round(totalMcp * share + gauss(0, 4))),
      firstSeen: daily[Math.max(0, daily.length - 1 - Math.floor(rand() * 30))].date,
    };
  })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top IPs
  const totalReq = daily.reduce((s, r) => s + r.dailyRequests, 0);
  const ipShares = [0.09, 0.07, 0.06, 0.05, 0.045, 0.04, 0.035, 0.03, 0.025, 0.02];
  const topIps: IpRow[] = ipShares.map((s) => {
    const a = ipFromAsn();
    return { ip: a.ip, org: a.org, count: Math.max(2, Math.round(totalReq * s + gauss(0, 8))) };
  }).sort((a, b) => b.count - a.count);

  // Recent discovery hits — last 50 across the well-known files
  const wellKnown = ["/.well-known/mcp.json", "/.well-known/ai-plugin.json", "/.well-known/nostr.json"];
  const recentDiscovery: DiscoveryHit[] = [];
  for (let n = 0; n < 50; n++) {
    const minutesAgo = Math.floor(rand() * 60 * 24 * 6); // last 6 days
    const ts = new Date(Date.now() - minutesAgo * 60_000).toISOString();
    const a = pick(KNOWN_AGENTS);
    const ip = ipFromAsn();
    recentDiscovery.push({
      ts,
      path: pick(wellKnown),
      ip: ip.ip,
      ua: a.ua,
      status: rand() < 0.97 ? 200 : 404,
    });
  }
  recentDiscovery.sort((a, b) => (a.ts < b.ts ? 1 : -1));

  return {
    generatedAt: new Date().toISOString(),
    rangeDays,
    daily,
    topUserAgents,
    topIps,
    recentDiscovery,
  };
}
