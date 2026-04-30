import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { AlertTriangle, Cpu, Globe, Network, Radar, RefreshCw, UsersRound } from "lucide-react";

import type { MetricsResponse } from "@/lib/types";
import { compactNum, fmtDate, fmtInt, fmtTimeAgo } from "@/lib/format";
import { detectAnomalies, pctDelta, type Anomaly } from "@/lib/anomaly";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiTile } from "@/components/KpiTile";
import { ChartCard } from "@/components/ChartCard";
import { AgentryLogo } from "@/components/AgentryLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

const ANOMALY_THRESHOLD = 20; // user spec: spikes above 20 over 7-day baseline

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--popover-border))",
  borderRadius: 8,
  fontSize: 12,
  padding: "6px 10px",
  color: "hsl(var(--popover-foreground))",
};

export default function Dashboard() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<MetricsResponse>({
    queryKey: ["/api/metrics"],
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  const computed = useMemo(() => {
    if (!data) return null;
    const daily = data.daily;
    const last7 = daily.slice(-7);
    const prior7 = daily.slice(-14, -7);

    const sum = (rows: typeof daily, k: keyof (typeof daily)[number]) =>
      rows.reduce((s, r) => s + Number(r[k]), 0);

    const totals = {
      requests: sum(daily, "dailyRequests"),
      uniqueIps: sum(daily, "uniqueIps"),
      mcp: sum(daily, "mcpToolCalls"),
      newUa: sum(daily, "newUserAgents"),
      discovery:
        sum(daily, "discoveryMcp") +
        sum(daily, "discoveryAiPlugin") +
        sum(daily, "discoveryNostr"),
    };

    const last7Vals = {
      requests: sum(last7, "dailyRequests"),
      uniqueIps: sum(last7, "uniqueIps"),
      mcp: sum(last7, "mcpToolCalls"),
      newUa: sum(last7, "newUserAgents"),
      discovery:
        sum(last7, "discoveryMcp") +
        sum(last7, "discoveryAiPlugin") +
        sum(last7, "discoveryNostr"),
    };
    const prior7Vals = {
      requests: sum(prior7, "dailyRequests"),
      uniqueIps: sum(prior7, "uniqueIps"),
      mcp: sum(prior7, "mcpToolCalls"),
      newUa: sum(prior7, "newUserAgents"),
      discovery:
        sum(prior7, "discoveryMcp") +
        sum(prior7, "discoveryAiPlugin") +
        sum(prior7, "discoveryNostr"),
    };

    const deltas = {
      requests: pctDelta(last7Vals.requests, prior7Vals.requests),
      uniqueIps: pctDelta(last7Vals.uniqueIps, prior7Vals.uniqueIps),
      mcp: pctDelta(last7Vals.mcp, prior7Vals.mcp),
      newUa: pctDelta(last7Vals.newUa, prior7Vals.newUa),
      discovery: pctDelta(last7Vals.discovery, prior7Vals.discovery),
    };

    // Anomaly detection per metric (>20 above 7-day baseline)
    const anomalies: Anomaly[] = [
      ...detectAnomalies(
        daily.map((r) => ({ date: r.date, value: r.dailyRequests })),
        "Daily requests",
        ANOMALY_THRESHOLD,
      ),
      ...detectAnomalies(
        daily.map((r) => ({ date: r.date, value: r.uniqueIps })),
        "Unique IPs",
        ANOMALY_THRESHOLD,
      ),
      ...detectAnomalies(
        daily.map((r) => ({ date: r.date, value: r.mcpToolCalls })),
        "MCP tool calls",
        ANOMALY_THRESHOLD,
      ),
      ...detectAnomalies(
        daily.map((r) => ({ date: r.date, value: r.newUserAgents })),
        "New user agents",
        ANOMALY_THRESHOLD,
      ),
      ...detectAnomalies(
        daily.map((r) => ({
          date: r.date,
          value: r.discoveryMcp + r.discoveryAiPlugin + r.discoveryNostr,
        })),
        "Discovery hits",
        ANOMALY_THRESHOLD,
      ),
    ];

    // Per-metric anomaly date lookups for chart markers
    const anomDates = (m: string) =>
      new Set(anomalies.filter((a) => a.metric === m).map((a) => a.date));

    return { daily, totals, deltas, anomalies, anomDates };
  }, [data]);

  if (isLoading || !data || !computed) {
    return <DashboardSkeleton />;
  }

  const { daily, totals, deltas, anomalies, anomDates } = computed;
  const anomalyCount = anomalies.length;
  const reqAnom = anomDates("Daily requests");
  const ipAnom = anomDates("Unique IPs");
  const mcpAnom = anomDates("MCP tool calls");
  const uaAnom = anomDates("New user agents");
  const discAnom = anomDates("Discovery hits");

  const sparkOf = (key: keyof (typeof daily)[number]) =>
    daily.map((r) => ({ date: r.date, value: Number(r[key]) }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-primary">
              <AgentryLogo />
            </span>
            <div>
              <div className="text-sm font-semibold leading-none">
                Agentry · Traffic Trends
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                agentry.com · last 30 days
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Updated {fmtTimeAgo(new Date(dataUpdatedAt).toISOString())}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 pb-16 pt-6">
        {/* Anomaly banner */}
        {anomalyCount > 0 && (
          <div
            data-testid="anomaly-banner"
            className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/8 p-4"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-destructive">
                {anomalyCount} spike{anomalyCount === 1 ? "" : "s"} detected
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  values exceeded their 7-day rolling baseline by more than {ANOMALY_THRESHOLD} events
                </span>
              </div>
              <ul className="mt-3 grid gap-1.5 text-xs text-foreground/85">
                {anomalies
                  .slice()
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .slice(0, 8)
                  .map((a, i) => (
                    <li
                      key={i}
                      className="tabular grid grid-cols-[auto_120px_1fr_auto] items-center gap-x-3"
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive" />
                      <span className="font-medium">{fmtDate(a.date)}</span>
                      <span className="truncate">{a.metric}</span>
                      <span className="text-right">
                        <span className="font-medium">{fmtInt(a.value)}</span>{" "}
                        <span className="text-muted-foreground">
                          (+{fmtInt(a.delta)} over {fmtInt(a.baseline)})
                        </span>
                      </span>
                    </li>
                  ))}
                {anomalies.length > 8 && (
                  <li className="pl-3.5 pt-1 text-muted-foreground">
                    +{anomalies.length - 8} more spike{anomalies.length - 8 === 1 ? "" : "s"}
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* KPI tiles */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          <KpiTile
            testId="kpi-requests"
            label="Daily requests · 30d"
            value={totals.requests}
            delta={deltas.requests}
            spark={sparkOf("dailyRequests")}
            anomalous={reqAnom.size > 0}
          />
          <KpiTile
            testId="kpi-unique-ips"
            label="Unique IPs · 30d"
            value={totals.uniqueIps}
            delta={deltas.uniqueIps}
            spark={sparkOf("uniqueIps")}
            anomalous={ipAnom.size > 0}
          />
          <KpiTile
            testId="kpi-mcp"
            label="MCP tool calls · 30d"
            value={totals.mcp}
            delta={deltas.mcp}
            spark={sparkOf("mcpToolCalls")}
            anomalous={mcpAnom.size > 0}
          />
          <KpiTile
            testId="kpi-new-ua"
            label="New user agents · 30d"
            value={totals.newUa}
            delta={deltas.newUa}
            spark={sparkOf("newUserAgents")}
            anomalous={uaAnom.size > 0}
          />
          <KpiTile
            testId="kpi-discovery"
            label="Discovery hits · 30d"
            value={totals.discovery}
            delta={deltas.discovery}
            spark={daily.map((r) => ({
              date: r.date,
              value: r.discoveryMcp + r.discoveryAiPlugin + r.discoveryNostr,
            }))}
            anomalous={discAnom.size > 0}
          />
        </div>

        {/* Charts */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            testId="chart-requests"
            title="Daily requests"
            subtitle="All HTTP requests · 30d trend with anomaly markers"
          >
            <ResponsiveContainer>
              <AreaChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gReq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                  tickFormatter={fmtDate}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => compactNum(v as number)}
                  width={40}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(l) => fmtDate(l as string)}
                  formatter={(v) => [fmtInt(v as number), "Requests"]}
                />
                <Area
                  type="monotone"
                  dataKey="dailyRequests"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  fill="url(#gReq)"
                />
                {daily
                  .filter((r) => reqAnom.has(r.date))
                  .map((r) => (
                    <ReferenceDot
                      key={r.date}
                      x={r.date}
                      y={r.dailyRequests}
                      r={5}
                      fill="hsl(var(--destructive))"
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            testId="chart-ips"
            title="Unique IPs"
            subtitle="Distinct client addresses per day"
          >
            <ResponsiveContainer>
              <AreaChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gIp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                  tickFormatter={fmtDate}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(l) => fmtDate(l as string)}
                  formatter={(v) => [fmtInt(v as number), "Unique IPs"]}
                />
                <Area
                  type="monotone"
                  dataKey="uniqueIps"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  fill="url(#gIp)"
                />
                {daily
                  .filter((r) => ipAnom.has(r.date))
                  .map((r) => (
                    <ReferenceDot
                      key={r.date}
                      x={r.date}
                      y={r.uniqueIps}
                      r={5}
                      fill="hsl(var(--destructive))"
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            testId="chart-mcp"
            title="MCP tool calls"
            subtitle="POST /mcp returning 202 · per day"
          >
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                  tickFormatter={fmtDate}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={tooltipStyle}
                  labelFormatter={(l) => fmtDate(l as string)}
                  formatter={(v) => [fmtInt(v as number), "MCP calls"]}
                />
                <Bar dataKey="mcpToolCalls" radius={[3, 3, 0, 0]}>
                  {daily.map((r, i) => (
                    <Cell
                      key={i}
                      fill={
                        mcpAnom.has(r.date)
                          ? "hsl(var(--destructive))"
                          : "hsl(var(--chart-3))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            testId="chart-new-ua"
            title="New user agents"
            subtitle="UA strings first seen per day"
          >
            <ResponsiveContainer>
              <LineChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={4}
                  tickFormatter={fmtDate}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(l) => fmtDate(l as string)}
                  formatter={(v) => [fmtInt(v as number), "New UAs"]}
                />
                <Line
                  type="monotone"
                  dataKey="newUserAgents"
                  stroke="hsl(var(--chart-4))"
                  strokeWidth={2.25}
                  dot={{ r: 2.5, fill: "hsl(var(--chart-4))", strokeWidth: 0 }}
                />
                {daily
                  .filter((r) => uaAnom.has(r.date))
                  .map((r) => (
                    <ReferenceDot
                      key={r.date}
                      x={r.date}
                      y={r.newUserAgents}
                      r={5}
                      fill="hsl(var(--destructive))"
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            testId="chart-discovery"
            title="Discovery hits — /.well-known"
            subtitle="mcp.json · ai-plugin.json · nostr.json"
            className="lg:col-span-2"
          >
            <ResponsiveContainer>
              <BarChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                  tickFormatter={fmtDate}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  contentStyle={tooltipStyle}
                  labelFormatter={(l) => fmtDate(l as string)}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="square"
                  iconSize={8}
                />
                <Bar dataKey="discoveryMcp" stackId="d" name="mcp.json" fill="hsl(var(--chart-1))" />
                <Bar dataKey="discoveryAiPlugin" stackId="d" name="ai-plugin.json" fill="hsl(var(--chart-2))" />
                <Bar
                  dataKey="discoveryNostr"
                  stackId="d"
                  name="nostr.json"
                  fill="hsl(var(--chart-4))"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Tables */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section
            data-testid="table-user-agents"
            className="rounded-lg border border-card-border bg-card p-5"
          >
            <header className="mb-4 flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Top user agents · 30d</h3>
            </header>
            <ul className="divide-y divide-border">
              {data.topUserAgents.map((u, i) => {
                const max = data.topUserAgents[0].count;
                const pct = (u.count / max) * 100;
                return (
                  <li key={i} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm" title={u.ua}>
                        {u.ua}
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="tabular text-sm text-muted-foreground">
                      {fmtInt(u.count)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section
            data-testid="table-ips"
            className="rounded-lg border border-card-border bg-card p-5"
          >
            <header className="mb-4 flex items-center gap-2">
              <Network className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Top source IPs · 30d</h3>
            </header>
            <ul className="divide-y divide-border">
              {data.topIps.map((ip, i) => {
                const max = data.topIps[0].count;
                const pct = (ip.count / max) * 100;
                return (
                  <li
                    key={i}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2"
                  >
                    <span className="tabular text-xs text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="tabular truncate text-sm">{ip.ip}</div>
                      <div className="text-xs text-muted-foreground">{ip.org}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="tabular w-12 text-right text-sm text-muted-foreground">
                        {fmtInt(ip.count)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Recent discovery */}
        <section
          data-testid="table-discovery"
          className="mt-6 rounded-lg border border-card-border bg-card p-5"
        >
          <header className="mb-3 flex items-center gap-2">
            <Radar className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recent /.well-known hits</h3>
            <Badge variant="secondary" className="ml-auto text-[10px] uppercase">
              live
            </Badge>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">When</th>
                  <th className="pb-2 font-medium">Path</th>
                  <th className="pb-2 font-medium">IP</th>
                  <th className="pb-2 font-medium">User agent</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.recentDiscovery.slice(0, 18).map((h, i) => (
                  <tr key={i}>
                    <td className="tabular py-2 pr-4 text-muted-foreground">
                      {fmtTimeAgo(h.ts)}
                    </td>
                    <td className="py-2 pr-4">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {h.path}
                      </code>
                    </td>
                    <td className="tabular py-2 pr-4">{h.ip}</td>
                    <td className="max-w-[420px] truncate py-2 pr-4" title={h.ua}>
                      {h.ua}
                    </td>
                    <td className="tabular py-2 pr-4">
                      <span
                        className={
                          h.status >= 400
                            ? "text-destructive"
                            : "text-emerald-600 dark:text-emerald-400"
                        }
                      >
                        {h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Footer ingest hint */}
        <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Cpu className="h-3.5 w-3.5" />
          Data feed: <code className="rounded bg-muted px-1.5 py-0.5">GET /api/metrics</code>
          <Globe className="ml-3 h-3.5 w-3.5" />
          Replace the sample adapter in <code className="rounded bg-muted px-1.5 py-0.5">server/sampleData.ts</code> with a real ingest from your VPS access logs to go live.
        </p>
      </main>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 h-10 w-72 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-72 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
