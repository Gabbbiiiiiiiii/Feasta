"use client";

import {
  ApplicationErrorState,
} from "@/components/feedback/application-states";

export default function AdminComplaintsError({
  error,
  reset,
}: {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}) {
  return (
    <ApplicationErrorState
      kind="load"
      description={
        error.message ||
        "Complaints could not be loaded."
      }
      onRetry={reset}
    />
  );
}