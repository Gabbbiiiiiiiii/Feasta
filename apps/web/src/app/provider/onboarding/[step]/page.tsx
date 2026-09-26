import {redirect} from "next/navigation";

import {ProviderOnboardingShell} from "@/components/provider/onboarding-shell";
import {providerAccessDestination} from "@/lib/auth/account-policy";
import {
  loadProviderOnboardingDraft,
  loadProviderOnboardingReview,
  requireProvider,
  requireVerifiedEmail,
} from "@/lib/auth/session";
import {
  firstIncompleteSetupStep,
  onboardingStepBySlug,
  providerOnboardingPath,
} from "@/lib/provider/onboarding";

import {
  getActiveServiceCategoryOptions,
} from "@/lib/service-categories/service-category-service";

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
  const requestedStep =
    onboardingStepBySlug(
      (await params).step,
    );

  const needsServiceCategories =
    requestedStep?.number === 3 ||
    requestedStep?.number === 5;

  const serviceCategories =
    needsServiceCategories
      ? await getActiveServiceCategoryOptions()
      : [];

  if (account.providerId) {
    const editableApplication =
      !account.provider ||
      account.provider.verificationStatus ===
        "draft" ||
      account.provider.verificationStatus ===
        "resubmission_required";

    if (!editableApplication) {
      redirect(
        providerAccessDestination(
          account,
        ),
      );
    }

    if (
      !requestedStep ||
      requestedStep.number > 6
    ) {
      redirect(
        "/provider/verification?stage=documents",
      );
    }

    const review =
      await loadProviderOnboardingReview(
        account,
      );

    return (
      <ProviderOnboardingShell
        currentStep={requestedStep}
        completedSteps={review.completedSteps}
      >
        <ProviderOnboardingStepForm
          step={requestedStep}
          draft={review}
          serviceCategories={
            serviceCategories
          }
          editingExistingApplication
        />
      </ProviderOnboardingShell>
    );
  }

  const draft =
    await loadProviderOnboardingDraft(
      account,
    );

  const firstIncomplete =
    firstIncompleteSetupStep(
      draft.completedSteps,
    );

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
      <ProviderOnboardingStepForm
        step={requestedStep}
        draft={draft}
        serviceCategories={serviceCategories}
      />
    </ProviderOnboardingShell>
  );
}
