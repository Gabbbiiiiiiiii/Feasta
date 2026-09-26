"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function AdminProvidersError({
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  return (
    <ApplicationErrorState
      kind="server"
      description="We could not load provider verification applications. Try again safely."
      onRetry={reset}
    />
  );
}
