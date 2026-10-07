"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function AdminAuditLogsError({
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  return (
    <ApplicationErrorState
      kind="load"
      description="Activities could not be loaded. Please try again."
      onRetry={reset}
    />
  );
}
