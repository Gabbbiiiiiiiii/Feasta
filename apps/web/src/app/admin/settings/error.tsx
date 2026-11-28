"use client";

import {
  ApplicationErrorState,
} from "@/components/feedback/application-states";

export default function AdminSettingsError({
  error,
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  return (
    <ApplicationErrorState
      kind="load"
      description={
        error.message ||
        "Platform settings could not be loaded."
      }
      onRetry={reset}
    />
  );
}