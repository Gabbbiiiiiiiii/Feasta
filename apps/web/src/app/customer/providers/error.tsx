"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";
import {ProviderDirectoryShell} from "@/components/customer/providers/provider-directory-shell";

export default function CustomerProvidersError({reset}: {reset: () => void}) {
  return (
    <ProviderDirectoryShell>
      <ApplicationErrorState
        kind="load"
        description="The Event Services directory could not be loaded. Please try again."
        onRetry={reset}
        className="border-feasta-border-strong bg-white shadow-[0_4px_18px_rgba(0,75,59,0.06)]"
      />
    </ProviderDirectoryShell>
  );
}
