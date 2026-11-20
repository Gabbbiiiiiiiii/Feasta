import {
  redirect,
} from "next/navigation";

import {
  requireCustomer,
  requireVerifiedEmail,
  safeAccountReturnPath,
} from "@/lib/auth/session";

import CustomerPhoneVerificationForm
  from "./customer-phone-verification-form";

type CustomerVerifyPhonePageProps = {
  searchParams: Promise<{
    returnTo?: string | string[];
  }>;
};

export default async function CustomerVerifyPhonePage({
  searchParams,
}: CustomerVerifyPhonePageProps) {
  const account =
    requireVerifiedEmail(
      await requireCustomer(),
    );

  const parameters =
    await searchParams;

  const requestedReturnTo =
    typeof parameters.returnTo ===
      "string"
      ? parameters.returnTo
      : undefined;

  /*
   * Keep redirect validation on the server.
   *
   * For customers this permits safe /customer/... destinations
   * while rejecting external or cross-role redirect targets.
   */
  const returnTo =
    safeAccountReturnPath(
      requestedReturnTo,
      account,
    );

  /*
   * If another tab/session has already completed phone
   * verification, don't make the customer verify again.
   */
  if (account.isPhoneVerified) {
    redirect(returnTo);
  }

  return (
    <CustomerPhoneVerificationForm
      initialPhoneNumber={
        account.phoneNumber
      }
      returnTo={returnTo}
    />
  );
}