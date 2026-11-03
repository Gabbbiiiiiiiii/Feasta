"use client";

import {httpsCallable} from "firebase/functions";
import {auth, functions} from "@/lib/firebase/client";

export type ProviderOccasionChangeRequest = {
  providerId: string;
  approveOccasionIds: string[];
  revokeOccasionIds: string[];
  expectedProviderEligibilityRevision: number;
  expectedCatalogRevision: number;
  reason: string;
  idempotencyKey: string;
};

export type ProviderOccasionChangeResult = {
  operationId: string;
  providerId: string;
  state: string;
  providerEligibilityRevision: number;
  eventTypesSupported: string[];
  catalogRevision: number;
  revalidationJobId: string;
  affectedPackageCount: number | null;
  failureReason: string | null;
};

/**
 * Prepared transport only.
 *
 * Do not connect this function to a UI action until the backend export,
 * deployment, and public-reader compatibility have been approved.
 */
export async function submitProviderOccasionChange(
  input: ProviderOccasionChangeRequest,
): Promise<ProviderOccasionChangeResult> {
  if (!auth.currentUser) {
    throw new Error("Your administrator session expired. Sign in again.");
  }

  const callable = httpsCallable<
    ProviderOccasionChangeRequest,
    ProviderOccasionChangeResult
  >(functions, "updateProviderOccasionCapabilities");

  try {
    const response = await callable(input);
    return response.data;
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error
        ? String(error.code)
        : "";

    if (code.endsWith("permission-denied")) {
      throw new Error("You are not authorized to change provider occasions.");
    }

    if (code.endsWith("aborted")) {
      throw new Error("Provider eligibility changed. Refresh before retrying.");
    }

    if (code.endsWith("unavailable") ||
        code.endsWith("not-found")) {
      throw new Error("Provider occasion approval is not currently available.");
    }

    throw new Error(
      "Provider occasion change was not confirmed. Refresh the review before retrying.",
    );
  }
}