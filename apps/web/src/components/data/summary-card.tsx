import type {ReactNode} from "react";

import {LoadingSkeleton} from "@/components/feedback/loading";
import {cn} from "@/lib/utils";

type SummaryCardProps = {
  label: string;
  value?: ReactNode;
  supportingMetric?: ReactNode;
  trend?: {label: string; direction: "up" | "down" | "neutral"};
  icon?: ReactNode;
  loading?: boolean;
  className?: string;
};

function SummaryCard({label, value, supportingMetric, trend, icon, loading = false, className}: SummaryCardProps) {
  return (
    <section className={cn("min-w-0 max-w-full overflow-hidden rounded-card border border-border bg-card p-4 shadow-card sm:p-5", className)} aria-label={label}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 break-words text-sm font-semibold text-muted-foreground">{label}</p>
        {icon ? <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary">{icon}</span> : null}
      </div>
      {loading ? (
        <LoadingSkeleton className="mt-4 h-10 w-2/3" label={`Loading ${label}`} />
      ) : (
        <p className="mt-3 min-w-0 break-words text-2xl font-black tracking-tight text-primary sm:text-3xl">{value ?? "—"}</p>
      )}
      {!loading && supportingMetric != null ? (
        <p className="mt-3 break-words text-sm text-muted-foreground">{supportingMetric}</p>
      ) : null}
      {!loading && trend ? (
        <p className={cn(
          "mt-3 text-sm font-semibold",
          trend.direction === "up" && "text-success",
          trend.direction === "down" && "text-destructive",
          trend.direction === "neutral" && "text-muted-foreground",
        )}>
          <span className="sr-only">Trend {trend.direction}: </span>
          {trend.label}
        </p>
      ) : null}
    </section>
  );
}

export {SummaryCard, type SummaryCardProps};
