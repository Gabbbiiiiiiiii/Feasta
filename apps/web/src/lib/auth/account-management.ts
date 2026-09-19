import "server-only";

import type {UserRole} from "@feasta/shared-types";

import type {SessionUser} from "@/lib/auth/session";
import {adminAuth, adminDb} from "@/lib/firebase/admin";

export type AccountManagementProfile = {
  role: UserRole;
  email: string;
  firstName: string;
  lastName: string;
  supportsPasswordChanges: boolean;
  marketingConsent: boolean;
  pushNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  termsPolicyVersion: string;
  privacyPolicyVersion: string;
  customer: {
    phoneNumber: string;
    address: string;
    city: string;
    province: string;
  } | null;
  provider: {
    providerId: string;
    businessName: string;
    businessEmail: string;
    businessPhone: string;
    description: string;
    address: string;
    city: string;
    province: string;
    verificationStatus: string;
  } | null;
};

export async function loadAccountManagementProfile(
  account: SessionUser,
): Promise<AccountManagementProfile> {
  const userReference = adminDb.collection("users").doc(account.uid);
  const [authUser, userSnapshot] = await Promise.all([
    adminAuth.getUser(account.uid),
    userReference.get(),
  ]);
  if (!userSnapshot.exists || userSnapshot.data()?.role !== account.role) {
    throw new Error("Trusted account profile is unavailable.");
  }
  const user = userSnapshot.data() ?? {};
  const customerSnapshot = account.role === "customer"
    ? await adminDb.collection("customers").doc(account.uid).get()
    : null;
  const providerSnapshot =
    account.role === "provider" && account.providerId
      ? await adminDb.collection("providers").doc(account.providerId).get()
      : null;
  const customer = customerSnapshot?.exists
    ? customerSnapshot.data() ?? {}
    : null;
  const provider = providerSnapshot?.exists
    ? providerSnapshot.data() ?? {}
    : null;
  if (account.role === "customer" && !customer) {
    throw new Error("Trusted customer profile is unavailable.");
  }
  if (
    account.role === "provider" &&
    account.providerId &&
    (
      !provider ||
      provider.ownerId !== account.uid ||
      providerSnapshot?.id !== account.providerId
    )
  ) {
    throw new Error("Trusted provider profile is unavailable.");
  }

  return {
    role: account.role,
    email: authUser.email ?? "",
    firstName: stringValue(user.firstName) ||
      stringValue(provider?.ownerFirstName) ||
      stringValue(customer?.firstName),
    lastName: stringValue(user.lastName) ||
      stringValue(provider?.ownerLastName) ||
      stringValue(customer?.lastName),
    supportsPasswordChanges: authUser.providerData.some(
      (providerData) => providerData.providerId === "password",
    ),
    marketingConsent: user.marketingConsent === true,
    pushNotificationsEnabled: user.pushNotificationsEnabled !== false,
    emailNotificationsEnabled: user.emailNotificationsEnabled !== false,
    termsPolicyVersion: stringValue(user.termsPolicyVersion) || "unversioned",
    privacyPolicyVersion:
      stringValue(user.privacyPolicyVersion) || "unversioned",
    customer: customer
      ? {
          phoneNumber: stringValue(customer.phoneNumber),
          address: stringValue(customer.address),
          city: stringValue(customer.city),
          province: stringValue(customer.province),
        }
      : null,
    provider: provider && account.providerId
      ? {
          providerId: account.providerId,
          businessName: stringValue(provider.businessName),
          businessEmail: stringValue(provider.businessEmail),
          businessPhone: stringValue(provider.businessPhone),
          description: stringValue(provider.description),
          address: stringValue(provider.address),
          city: stringValue(provider.city),
          province: stringValue(provider.province),
          verificationStatus: stringValue(provider.verificationStatus),
        }
      : null,
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
