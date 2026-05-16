// Anomaly detection: a day is anomalous when its value exceeds the trailing
// 7-day rolling baseline by more than `threshold` (default 20 — per the user's spec).

// Null values represent uncovered days (log file no longer on disk). They
// must be excluded from both the baseline window and the anomaly check, or
// the rolling mean would be artificially pulled toward zero and produce
// false spikes the day data resumes.
export type SeriesPoint = { date: string; value: number | null };

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
    const v = series[i].value;
    if (v == null) continue; // uncovered day - cannot be anomalous
    const start = Math.max(0, i - windowSize);
    const window = series
      .slice(start, i)
      .filter((p): p is { date: string; value: number } => p.value != null);
    if (window.length < 3) continue;
    const baseline = window.reduce((s, p) => s + p.value, 0) / window.length;
    const delta = v - baseline;
    if (delta > threshold) {
      out.push({
        date: series[i].date,
        metric,
        value: v,
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
