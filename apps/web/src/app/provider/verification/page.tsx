import {redirect} from "next/navigation";

import {ApplicationErrorState} from "@/components/feedback/application-states";
import {ProviderOnboardingShell} from "@/components/provider/onboarding-shell";
import {
  loadOwnedProviderVerification,
  requireProvider,
} from "@/lib/auth/session";
import {PROVIDER_ONBOARDING_STEPS} from "@/lib/provider/onboarding";

import {ProviderVerificationActions} from "./provider-verification-actions";

export default async function ProviderVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{stage?: string}>;
}) {
  const account = await requireProvider();
  if (!account.provider) redirect("/provider/onboarding");
  const status = account.provider.verificationStatus;
  if (["submitted", "under_review", "rejected", "suspended"].includes(status)) {
    redirect("/provider/status");
  }
  if (status === "approved") redirect("/provider");

  const verification = await loadOwnedProviderVerification(account);
  if (!verification) {
    return <ApplicationErrorState kind="load" description="The trusted provider verification record is missing. Contact FEASTA support." />;
  }
  const consentReady =
    verification.consent.termsAccepted &&
    verification.consent.privacyAccepted;
  const requiredDocumentsReady =
    verification.requiredDocumentsReady && consentReady;
  const requestedStage = (await searchParams).stage;
  const reviewing = requiredDocumentsReady && requestedStage !== "documents";
  const currentStep = PROVIDER_ONBOARDING_STEPS[reviewing ? 7 : 6];
  const completedSteps = [
    1, 2, 3, 4, 5, 6,
    ...(requiredDocumentsReady ? [7] : []),
  ];

  return (
    <ProviderOnboardingShell
      currentStep={currentStep}
      completedSteps={completedSteps}
      recoveryMessage={status === "resubmission_required"
        ? verification.resubmissionReason
        : null}
    >
      <ProviderVerificationActions
        providerId={account.provider.id}
        verificationId={verification.id}
        canSubmit={requiredDocumentsReady}
        editable={verification.editable}
        documents={verification.documents}
        policy={verification.policy}
        consent={verification.consent}
        reviewMode={reviewing}
      />
    </ProviderOnboardingShell>
  );
}
