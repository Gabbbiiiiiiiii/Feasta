"use client";

import {
  ApplicationErrorState,
} from "@/components/feedback/application-states";

type AdminPaymentsErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function AdminPaymentsError({
  error,
  reset,
}: AdminPaymentsErrorProps) {
  return (
    <div
      className="rounded-card border border-border bg-card"
      role="alert"
    >
      <ApplicationErrorState
        kind="load"
        description={
          error.message ||
          "Payment Monitoring could not be loaded."
        }
        onRetry={reset}
      />
    </div>
  );
}