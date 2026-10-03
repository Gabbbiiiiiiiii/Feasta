"use client";

import {
  ApplicationErrorState,
} from "@/components/feedback/application-states";

export default function AdminReportsError({
  error,
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      data-error-digest={error.digest}
      className="rounded-card border border-border bg-card"
    >
      <ApplicationErrorState
        kind="load"
        description="Reports and Insights could not be loaded securely. Please try again."
        onRetry={reset}
      />
    </div>
  );
}