"use client";

import {
  ApplicationErrorState,
} from "@/components/feedback/application-states";

type AdminBookingsErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function AdminBookingsError({
  error,
  reset,
}: AdminBookingsErrorProps) {
  return (
    <section
      className="rounded-card border border-border bg-card"
      aria-label="Booking monitoring error"
    >
      <ApplicationErrorState
        kind="load"
        description={
          error.message ||
          "Booking Monitoring could not be loaded."
        }
        onRetry={reset}
      />
    </section>
  );
}