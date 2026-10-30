"use client";
import {ApplicationErrorState} from "@/components/feedback/application-states";
export default function ProviderPageError({reset}: {reset: () => void}) {
  return <ApplicationErrorState kind="load" description="This provider page could not be loaded. Please try again." onRetry={reset} />;
}
