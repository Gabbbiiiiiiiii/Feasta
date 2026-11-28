"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function AdminAnnouncementsError({
  error,
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  return (
    <div className="rounded-card border border-border bg-card" role="alert">
      <ApplicationErrorState
        kind="load"
        description={error.message || "Announcements could not be loaded."}
        onRetry={reset}
      />
    </div>
  );
}
