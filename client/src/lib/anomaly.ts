// Anomaly detection: a day is anomalous when its value exceeds the trailing
// 7-day rolling baseline by more than `threshold` (default 20 — per the user's spec).

export type SeriesPoint = { date: string; value: number };

export type Anomaly = {
  date: string;
  metric: string;
  value: number;
  baseline: number;
  delta: number;       // value - baseline
};

export function detectAnomalies(
  series: SeriesPoint[],
  metric: string,
  threshold = 20,
  windowSize = 7,
): Anomaly[] {
  const out: Anomaly[] = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - windowSize);
    const window = series.slice(start, i);
    if (window.length < 3) continue;
    const baseline =
      window.reduce((s, p) => s + p.value, 0) / window.length;
    const delta = series[i].value - baseline;
    if (delta > threshold) {
      out.push({
        date: series[i].date,
        metric,
        value: series[i].value,
        baseline: Math.round(baseline * 10) / 10,
        delta: Math.round(delta * 10) / 10,
      });
    }
  }
  return out;
}

export function pctDelta(current: number, prior: number): number {
  if (prior === 0) return current === 0 ? 0 : 100;
  return ((current - prior) / prior) * 100;
}
