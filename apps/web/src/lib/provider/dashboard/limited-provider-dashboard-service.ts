import "server-only";

import {
  requireProvider,
  requireProviderIdentityAccess,
} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

import type {
  LimitedProviderDashboardData,
} from "./limited-provider-dashboard-types";

/**
 * Loads identity-only dashboard data. This contract intentionally does not
 * read requests, bookings, packages, payments, catalog, or other operational
 * provider collections.
 */
export async function getLimitedProviderDashboardData():
Promise<LimitedProviderDashboardData> {
  const account = requireProviderIdentityAccess(
    await requireProvider(),
  );

  if (account.emailVerified) {
    throw new Error(
      "The limited provider dashboard is only available before email verification.",
    );
  }

  const userSnapshot = await adminDb
    .collection("users")
    .doc(account.uid)
    .get();
  const user = userSnapshot.data();

  if (!userSnapshot.exists || user?.role !== "provider") {
    throw new Error("The trusted provider identity is unavailable.");
  }

  const firstName = safeName(user.firstName);
  const lastName = safeName(user.lastName);
  const displayName = [firstName, lastName]
    .filter(Boolean)
    .join(" ") || "Provider";

  return {
    mode: "identity-limited",
    displayName,
    email: account.email ?? "",
    phoneNumber: account.phoneNumber,
    emailVerified: false,
    phoneVerified: true,
    providerIdentityStatus:
      account.provider?.verificationStatus ?? "identity_created",
    nextAllowedAction: "verify_email",
  };
}

function safeName(value: unknown): string {
  return typeof value === "string"
    ? value.trim().slice(0, 80)
    : "";
}
