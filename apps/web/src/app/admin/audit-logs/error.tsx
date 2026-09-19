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
      description="Audit logs could not be loaded. No records were changed."
      onRetry={reset}
    />
  );
}
