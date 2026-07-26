"use client";

import { useId, type ReactNode } from "react";

import { LoadingSkeleton } from "@/components/feedback/loading";
import {
  EmptyState,
  ErrorState,
} from "@/components/feedback/states";
import { cn } from "@/lib/utils";

type ChartContainerProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  rangeControls?: ReactNode;
  fallbackSummary?: string;
  loading?: boolean;
  empty?: boolean;
  error?: string;
  onRetry?: () => void;
  className?: string;
  contentClassName?: string;
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
  contentClassName,
}: ChartContainerProps) {
  const id = useId();
  const titleId = `chart-${id}-title`;
  const descriptionId = `chart-${id}-description`;

  return (
    <figure
      className={cn(
        "grid min-w-0 gap-5 rounded-card border border-border bg-card p-6 shadow-card",
        className,
      )}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="break-words text-xl font-bold text-foreground"
          >
            {title}
          </h2>

          {description ? (
            <p
              id={descriptionId}
              className="mt-1 break-words text-sm text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
        </div>

        {rangeControls ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1 sm:shrink-0">
            {rangeControls}
          </div>
        ) : null}
      </header>

      {loading ? (
        <LoadingSkeleton
          className="h-64 w-full"
          label={`Loading ${title} chart`}
        />
      ) : error ? (
        <ErrorState
          title="Unable to load chart"
          description={error}
          onAction={onRetry}
          className="min-h-64"
        />
      ) : empty ? (
        <EmptyState
          title="No chart data"
          description="No data is available for this range."
          className="min-h-64"
        />
      ) : (
        <div
          className={cn(
            "min-h-64 min-w-0 max-w-full overflow-x-auto overscroll-x-contain",
            contentClassName,
          )}
        >
          {children}
        </div>
      )}

      {fallbackSummary ? (
        <figcaption className="sr-only">
          {fallbackSummary}
        </figcaption>
      ) : null}
    </figure>
  );
}

export {
  ChartContainer,
  type ChartContainerProps,
};