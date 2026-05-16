// Mirrors the server MetricsResponse shape.
// Numeric fields are `number | null`. `null` means "this day is outside log
// coverage" (the rotated log file for that day no longer exists on the VPS)
// and should render as a gap in charts, not a zero. Days inside coverage with
// no events are `0`.
export type DailyRow = {
  date: string;
  dailyRequests: number | null;
  uniqueIps: number | null;
  mcpToolCalls: number | null;
  newUserAgents: number | null;
  discoveryMcp: number | null;
  discoveryAiPlugin: number | null;
  discoveryNostr: number | null;
};

export type Coverage = {
  from: string | null;
  to: string;
  totalDays: number;
  coveredDays: number;
};

export type UaRow = { ua: string; count: number; firstSeen: string };
export type IpRow = { ip: string; count: number; org: string };
export type DiscoveryHit = {
  ts: string;
  path: string;
  ip: string;
  ua: string;
  status: number;
};

export type MetricsResponse = {
  generatedAt: string;
  rangeDays: number;
  coverage?: Coverage; // optional for backward-compat with old snapshots
  daily: DailyRow[];
  topUserAgents: UaRow[];
  topIps: IpRow[];
  recentDiscovery: DiscoveryHit[];
};
