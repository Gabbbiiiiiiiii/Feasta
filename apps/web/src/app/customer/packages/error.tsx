"use client";

import {PackageDirectoryShell} from "@/components/customer/packages/package-directory-shell";
import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function CustomerPackagesError({reset}: {reset: () => void}) {
  return (
    <PackageDirectoryShell>
      <ApplicationErrorState
        kind="load"
        description="The package marketplace could not be loaded. Please try again."
        onRetry={reset}
        className="border-[#E8C9BE] bg-white shadow-card"
      />
    </PackageDirectoryShell>
  );
}
