import {Check} from "lucide-react";

import {
  onboardingStepState,
  PROVIDER_ONBOARDING_STEPS,
  type ProviderOnboardingStep,
} from "@/lib/provider/onboarding";
import {cn} from "@/lib/utils";

export function OnboardingProgress({
  currentStep,
  completedSteps,
}: {
  currentStep: ProviderOnboardingStep;
  completedSteps: readonly number[];
}) {
  return (
    <nav aria-label="Provider onboarding progress" className="min-w-0">
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {PROVIDER_ONBOARDING_STEPS.map((step) => {
          const state = onboardingStepState(
            step,
            currentStep,
            completedSteps,
          );
          return (
            <li
              key={step.slug}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "grid min-h-12 min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 rounded-lg border px-3 py-2",
                state === "current" && "border-primary bg-primary/10",
                state === "completed" && "border-success bg-success-subtle",
                state === "incomplete" && "border-border bg-card",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-8 place-items-center rounded-full text-sm font-bold",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "completed" && "bg-success text-success-foreground",
                  state === "incomplete" && "bg-muted text-muted-foreground",
                )}
              >
                {state === "completed"
                  ? <Check className="size-4" />
                  : step.number}
              </span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-bold">
                  {step.label}
                </span>
                <span className="block text-xs capitalize text-muted-foreground">
                  {state}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

