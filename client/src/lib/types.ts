// Mirrors the server MetricsResponse shape. Keep in sync with server/sampleData.ts.
export type DailyRow = {
  date: string;
  dailyRequests: number;
  uniqueIps: number;
  mcpToolCalls: number;
  newUserAgents: number;
  discoveryMcp: number;
  discoveryAiPlugin: number;
  discoveryNostr: number;
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
  daily: DailyRow[];
  topUserAgents: UaRow[];
  topIps: IpRow[];
  recentDiscovery: DiscoveryHit[];
};
