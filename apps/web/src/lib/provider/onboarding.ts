import type {ProviderOnboardingInput} from "@feasta/shared-types";

export const PROVIDER_ONBOARDING_STEPS = [
  {number: 1, slug: "owner", label: "Owner information"},
  {number: 2, slug: "business", label: "Business information"},
  {number: 3, slug: "services", label: "Services and event capabilities"},
  {number: 4, slug: "location", label: "Location and coverage"},
  {number: 5, slug: "capacity", label: "Capacity and schedule"},
  {number: 6, slug: "consent", label: "Terms and consent"},
  {number: 7, slug: "documents", label: "Verification documents"},
  {number: 8, slug: "review", label: "Review and submit"},
] as const;

export type ProviderOnboardingStep =
  (typeof PROVIDER_ONBOARDING_STEPS)[number];
export type ProviderOnboardingStepSlug = ProviderOnboardingStep["slug"];

export interface ProviderOnboardingDraft
  extends Partial<ProviderOnboardingInput> {
  ownerFirstName: string;
  ownerLastName: string;
  ownerPhone: string;
  ownerEmail: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  termsPolicyVersion: string;
  privacyPolicyVersion: string;
  completedSteps: readonly number[];
}

export function onboardingStepBySlug(
  value: string,
): ProviderOnboardingStep | null {
  return PROVIDER_ONBOARDING_STEPS.find((step) => step.slug === value) ?? null;
}

export function firstIncompleteSetupStep(
  completedSteps: readonly number[],
): ProviderOnboardingStep {
  const completed = new Set(completedSteps);
  return PROVIDER_ONBOARDING_STEPS.find(
    (step) => step.number <= 6 && !completed.has(step.number),
  ) ?? PROVIDER_ONBOARDING_STEPS[6];
}

export function providerOnboardingPath(
  step: ProviderOnboardingStep,
): string {
  if (step.number === 7 || step.number === 8) {
    return `/provider/verification?stage=${step.slug}`;
  }
  return `/provider/onboarding/${step.slug}`;
}

export function onboardingStepState(
  target: ProviderOnboardingStep,
  currentStep: ProviderOnboardingStep,
  completedSteps: readonly number[],
): "completed" | "current" | "incomplete" {
  if (target.number === currentStep.number) return "current";
  return completedSteps.includes(target.number) ||
    target.number < currentStep.number
    ? "completed"
    : "incomplete";
}

