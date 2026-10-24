import type {ReactNode} from "react";

import {PageHeading} from "@/components/layout/page-heading";
import {
  type ProviderOnboardingStep,
} from "@/lib/provider/onboarding";

import {OnboardingProgress} from "./onboarding-progress";

export function ProviderOnboardingShell({
  currentStep,
  completedSteps,
  children,
  recoveryMessage,
}: {
  currentStep: ProviderOnboardingStep;
  completedSteps: readonly number[];
  children: ReactNode;
  recoveryMessage?: string | null;
}) {
  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow={`Provider onboarding - Step ${currentStep.number} of 8`}
        title={currentStep.label}
        description="Your progress is saved to your provider account and can be resumed after signing in again."
      />
      {recoveryMessage ? (
        <section
          className="rounded-card border border-warning bg-warning-subtle p-4"
          aria-labelledby="onboarding-recovery-title"
        >
          <h2 id="onboarding-recovery-title" className="font-bold text-warning">
            Changes requested
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{recoveryMessage}</p>
        </section>
      ) : null}
      <div className="grid min-w-0 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <aside className="min-w-0 lg:sticky lg:top-6">
          <OnboardingProgress
            currentStep={currentStep}
            completedSteps={completedSteps}
          />
        </aside>
        <section
          className="min-w-0 rounded-card border border-border bg-card p-4 shadow-card sm:p-6"
          aria-label={`${currentStep.label} form`}
        >
          {children}
        </section>
      </div>
    </div>
  );
}
