import "server-only";

import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

import {normalizeProviderBusinessProfile} from "./provider-business-profile-normalization";
import type {ProviderBusinessProfile} from "./provider-business-profile-types";

export async function getProviderBusinessProfile(): Promise<ProviderBusinessProfile> {
  const account = await requireApprovedProvider();
  const providerId = requireDocumentId(account.providerId);
  const providerSnapshot = await adminDb
    .collection("providers")
    .doc(providerId)
    .get();
  const profile = providerSnapshot.exists
    ? normalizeProviderBusinessProfile({
        providerId: providerSnapshot.id,
        trustedOwnerId: account.uid,
        data: providerSnapshot.data() ?? {},
      })
    : null;

  if (!profile) {
    throw new Error("The provider business profile is unavailable.");
  }

  return profile;
}

function requireDocumentId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("The provider business profile is unavailable.");
  }
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(normalized)) {
    throw new Error("The provider business profile is unavailable.");
  }
  return normalized;
}
