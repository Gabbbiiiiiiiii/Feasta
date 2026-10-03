import {redirect} from "next/navigation";

import {providerAccessDestination} from "@/lib/auth/account-policy";
import {
  loadProviderOnboardingDraft,
  requireProvider,
  requireVerifiedEmail,
} from "@/lib/auth/session";
import {
  firstIncompleteSetupStep,
  providerOnboardingPath,
} from "@/lib/provider/onboarding";

export default async function ProviderOnboardingPage() {
  const account = requireVerifiedEmail(
    await requireProvider(),
    "/provider-verify-email",
  );
  if (account.provider) redirect(providerAccessDestination(account));
  const draft = await loadProviderOnboardingDraft(account);
  redirect(providerOnboardingPath(
    firstIncompleteSetupStep(draft.completedSteps),
  ));
}
