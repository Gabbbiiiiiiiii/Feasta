"use client";

import {
  ApplicationErrorState,
} from "@/components/feedback/application-states";

type AdminReviewsErrorProps = {
  error: Error & {digest?: string};
  reset: () => void;
};

export default function AdminReviewsError({
  error,
  reset,
}: AdminReviewsErrorProps) {
  return (
    <div className="rounded-card border border-border bg-card" role="alert">
      <ApplicationErrorState
        kind="load"
        description={error.message || "Review Management could not be loaded."}
        onRetry={reset}
      />
    </div>
  );
}