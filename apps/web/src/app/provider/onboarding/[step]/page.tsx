import {redirect} from "next/navigation";

import {ProviderOnboardingShell} from "@/components/provider/onboarding-shell";
import {providerAccessDestination} from "@/lib/auth/account-policy";
import {
  loadProviderOnboardingDraft,
  requireProvider,
  requireVerifiedEmail,
} from "@/lib/auth/session";
import {
  firstIncompleteSetupStep,
  onboardingStepBySlug,
  providerOnboardingPath,
} from "@/lib/provider/onboarding";

import {ProviderOnboardingStepForm} from "./provider-onboarding-step-form";

export default async function ProviderOnboardingStepPage({
  params,
}: {
  params: Promise<{step: string}>;
}) {
  const account = requireVerifiedEmail(
    await requireProvider(),
    "/provider-verify-email",
  );
  if (account.provider) redirect(providerAccessDestination(account));

  const requestedStep = onboardingStepBySlug((await params).step);
  const draft = await loadProviderOnboardingDraft(account);
  const firstIncomplete = firstIncompleteSetupStep(draft.completedSteps);

  if (
    !requestedStep ||
    requestedStep.number > 6 ||
    requestedStep.number > firstIncomplete.number
  ) {
    redirect(providerOnboardingPath(firstIncomplete));
  }

  return (
    <ProviderOnboardingShell
      currentStep={requestedStep}
      completedSteps={draft.completedSteps}
    >
      <ProviderOnboardingStepForm step={requestedStep} draft={draft} />
    </ProviderOnboardingShell>
  );
}
