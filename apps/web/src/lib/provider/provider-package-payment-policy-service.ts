import "server-only";

import {
  adminDb,
} from "@/lib/firebase/admin";
import {
  providerPackagePaymentPolicyBoundsFromData,
  type ProviderPackagePaymentPolicyBounds,
} from "@/lib/provider/provider-package-payment-policy";

export async function getProviderPackagePaymentPolicyBounds(): Promise<
  ProviderPackagePaymentPolicyBounds
> {
  const snapshot =
    await adminDb
      .collection("appSettings")
      .doc("platform")
      .get();

  return providerPackagePaymentPolicyBoundsFromData(
    snapshot.exists
      ? snapshot.data()
      : null,
  );
}