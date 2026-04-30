// Netlify Function: proxies the VPS traffic metrics JSON behind a server-side token.
//
// Public route:  /api/metrics  ->  /.netlify/functions/traffic-metrics  ->  https://api.agentry.com/internal/traffic-metrics?token=$VPS_METRICS_TOKEN
//
// Required env vars (set in Netlify UI -> Site settings -> Environment variables):
//   VPS_METRICS_TOKEN  - shared secret matching the nginx token check on the VPS
//   VPS_METRICS_URL    - optional override; defaults to https://api.agentry.com/internal/traffic-metrics

function fingerprint(s: string): string {
  // Tiny non-reversible signature so we can check at runtime that the token
  // we received matches what we expect, without ever logging the value.
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `len=${s.length} fp=${(h >>> 0).toString(16)} head=${s.slice(0, 2)}…${s.slice(-2)}`;
}

export default async (req: Request) => {
  const token = process.env.VPS_METRICS_TOKEN;
  const upstream =
    process.env.VPS_METRICS_URL ||
    "https://api.agentry.com/internal/traffic-metrics";

  // Diagnostic mode: /api/metrics?debug=1 returns a safe summary of what the
  // function sees in its environment, so we can verify the token actually
  // reached the runtime without exposing its value.
  const url = new URL(req.url);
  if (url.searchParams.get("debug") === "1") {
    return new Response(
      JSON.stringify({
        ok: true,
        upstream,
        tokenPresent: Boolean(token),
        tokenSig: token ? fingerprint(token) : null,
        nodeVersion: process.version,
        envKeysSeen: Object.keys(process.env)
          .filter((k) => /VPS_/.test(k))
          .sort(),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  if (!token) {
    return new Response(
      JSON.stringify({ error: "VPS_METRICS_TOKEN not configured" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const upstreamUrl = `${upstream}?token=${encodeURIComponent(token)}`;

  try {
    const r = await fetch(upstreamUrl, {
      headers: { accept: "application/json" },
      // Netlify Functions run on a node 18+ runtime; fetch is built-in.
    });

    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Failed to reach VPS metrics endpoint",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
};

// Routing is handled by netlify.toml redirects (/api/metrics ->
// /.netlify/functions/traffic-metrics). Keeping a minimal config here.
export const config = {};
