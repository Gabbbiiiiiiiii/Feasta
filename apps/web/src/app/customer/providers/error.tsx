"use client";

import {ApplicationErrorState} from "@/components/feedback/application-states";

export default function CustomerProvidersError({reset}: {reset: () => void}) {
  return <ApplicationErrorState kind="load" description="The provider directory could not be loaded. Please try again." onRetry={reset} />;
}
