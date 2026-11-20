import {redirect} from "next/navigation";

import ProviderPhoneVerificationForm from "./provider-phone-verification-form";
import {providerAccessDestination} from "@/lib/auth/account-policy";
import {requireProvider, requireVerifiedEmail} from "@/lib/auth/session";

export default async function ProviderVerifyPhonePage() {
  const account = requireVerifiedEmail(
    await requireProvider(),
    "/provider-verify-email",
  );
  if (account.isPhoneVerified) {
    redirect(providerAccessDestination(account));
  }
  return <ProviderPhoneVerificationForm initialPhoneNumber={account.phoneNumber} />;
}
