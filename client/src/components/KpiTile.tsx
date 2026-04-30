import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { compactNum } from "@/lib/format";

type Props = {
  label: string;
  value: number;
  delta: number;             // pct change vs prior 7-day window
  spark: { date: string; value: number }[];
  anomalous?: boolean;
  testId: string;
};

export function KpiTile({ label, value, delta, spark, anomalous, testId }: Props) {
  const dir = delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
  const Icon = dir === "up" ? ArrowUp : dir === "down" ? ArrowDown : Minus;

  return (
    <div
      data-testid={testId}
      className={cn(
        "relative rounded-lg border bg-card p-5 transition-colors",
        anomalous
          ? "border-destructive/70 ring-1 ring-destructive/40"
          : "border-border",
      )}
    >
      {anomalous && (
        <span
          className="absolute right-3 top-3 inline-flex h-2 w-2 rounded-full bg-destructive shadow-[0_0_0_3px_hsl(var(--destructive)/0.18)]"
          aria-label="Anomaly detected"
        />
      )}
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <div
          data-testid={`${testId}-value`}
          className="tabular text-3xl font-semibold leading-none"
        >
          {compactNum(value)}
        </div>
        <div
          className={cn(
            "tabular flex items-center gap-0.5 text-xs font-medium",
            dir === "up" && "text-emerald-600 dark:text-emerald-400",
            dir === "down" && "text-destructive",
            dir === "flat" && "text-muted-foreground",
          )}
        >
          <Icon className="h-3 w-3" strokeWidth={2.5} />
          {Math.abs(delta).toFixed(1)}%
        </div>
      </div>
      <div className="mt-3 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={1.75}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
