"use client";

import {httpsCallable} from "firebase/functions";

import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";

export type AdminDefaultCancellationPolicyPayload = {
  defaultCutoffHoursBeforeEvent: number;
  minCutoffHoursBeforeEvent: number;
  maxCutoffHoursBeforeEvent: number;
  guidanceNote: string | null;
};

export type AdminDefaultCancellationPolicyResult = {
  success: boolean;
  policyVersion: number;
  defaultCutoffHoursBeforeEvent: number;
  minCutoffHoursBeforeEvent: number;
  maxCutoffHoursBeforeEvent: number;
  guidanceNote: string | null;
};

export async function updateAdminDefaultCancellationPolicy(
  policy: AdminDefaultCancellationPolicyPayload,
): Promise<AdminDefaultCancellationPolicyResult> {
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw new Error("Your administrator session has expired. Sign in again to continue.");
  }
  initializeBrowserAppCheck();

  const callable = httpsCallable<
    {policy: AdminDefaultCancellationPolicyPayload; idempotencyKey: string},
    AdminDefaultCancellationPolicyResult
  >(functions, "updateAdminDefaultCancellationPolicy", {timeout: 30_000});

  try {
    const response = await callable({
      policy: {
        defaultCutoffHoursBeforeEvent: policy.defaultCutoffHoursBeforeEvent,
        minCutoffHoursBeforeEvent: policy.minCutoffHoursBeforeEvent,
        maxCutoffHoursBeforeEvent: policy.maxCutoffHoursBeforeEvent,
        guidanceNote: policy.guidanceNote?.trim() || null,
      },
      idempotencyKey: crypto.randomUUID(),
    });
    return response.data;
  } catch (caught) {
    throw new Error(adminCancellationPolicyErrorMessage(caught));
  }
}

export function adminCancellationPolicyErrorMessage(caught: unknown): string {
  const code = typeof caught === "object" && caught && "code" in caught
    ? String((caught as {code?: unknown}).code).replace(/^functions\//u, "")
    : "";
  if (code === "permission-denied") {
    return "You do not have permission to update platform cancellation defaults.";
  }
  if (code === "invalid-argument") {
    return caught instanceof Error && caught.message
      ? caught.message
      : "Check the cancellation cutoff hours and try again.";
  }
  if (code === "unauthenticated") {
    return "Your administrator session has expired. Sign in again to continue.";
  }
  if (code === "resource-exhausted") {
    return "Too many policy updates. Please wait a few minutes and try again.";
  }
  return "We could not save the default cancellation policy. Please try again.";
}
