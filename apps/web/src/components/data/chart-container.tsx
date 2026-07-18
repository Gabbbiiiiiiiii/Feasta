import {useId, type ReactNode} from "react";

import {LoadingSkeleton} from "@/components/feedback/loading";
import {EmptyState, ErrorState} from "@/components/feedback/states";
import {cn} from "@/lib/utils";

type ChartContainerProps = {
  title: string;
  description: string;
  children?: ReactNode;
  rangeControls?: ReactNode;
  fallbackSummary: string;
  loading?: boolean;
  empty?: boolean;
  error?: string;
  onRetry?: () => void;
  className?: string;
};

function ChartContainer({
  title,
  description,
  children,
  rangeControls,
  fallbackSummary,
  loading = false,
  empty = false,
  error,
  onRetry,
  className,
}: ChartContainerProps) {
  const id = useId();
  const titleId = `chart-${id}-title`;
  const descriptionId = `chart-${id}-description`;
  return (
    <figure className={cn("grid min-w-0 gap-5 rounded-card border border-border bg-card p-5 shadow-card", className)} aria-labelledby={titleId} aria-describedby={descriptionId}>
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id={titleId} className="break-words text-xl font-bold">{title}</h2>
          <p id={descriptionId} className="mt-1 break-words text-sm text-muted-foreground">{description}</p>
        </div>
        {rangeControls ? <div className="flex min-w-0 flex-wrap gap-2 [&>*]:max-w-full sm:shrink-0">{rangeControls}</div> : null}
      </header>
      {loading ? (
        <LoadingSkeleton className="h-64 w-full" label={`Loading ${title} chart`} />
      ) : error ? (
        <ErrorState title="Unable to load chart" description={error} onAction={onRetry} className="min-h-64" />
      ) : empty ? (
        <EmptyState title="No chart data" description="No data is available for this range." className="min-h-64" />
      ) : (
        <div className="min-h-64 min-w-0 max-w-full overflow-x-auto overscroll-x-contain">{children}</div>
      )}
      <figcaption className="text-sm text-muted-foreground">{fallbackSummary}</figcaption>
    </figure>
  );
}

export {ChartContainer, type ChartContainerProps};
