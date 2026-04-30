import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ChartCard({
  title,
  subtitle,
  children,
  className,
  testId,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cn(
        "rounded-lg border border-card-border bg-card p-5",
        className,
      )}
    >
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </header>
      <div className="h-64 w-full">{children}</div>
    </section>
  );
}
