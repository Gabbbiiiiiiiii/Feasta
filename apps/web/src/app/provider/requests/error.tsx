"use client";
import {ApplicationErrorState} from "@/components/feedback/application-states";
export default function ProviderRequestsError({reset}: {reset: () => void}) {
  return <ApplicationErrorState kind="load" description="Your booking requests could not be loaded. Please try again." onRetry={reset} />;
}
