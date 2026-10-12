"use client";
import {ApplicationErrorState} from "@/components/feedback/application-states";
export default function ProviderDashboardError({reset}: {reset: () => void}) {
  return <ApplicationErrorState kind="load" description="Your dashboard could not be loaded. Please try again." onRetry={reset} />;
}
