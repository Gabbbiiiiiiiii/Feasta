"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {WebAuthenticationError} from "@/lib/auth/client-session";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";

export async function requestCompanyAdvance(input: {
  providerRequestId: string;
  providerNote?: string;
}): Promise<{
  advanceRequestId: string;
  providerRequestId: string;
  status: "pending";
}> {
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your provider session has expired. Please sign in again.",
      "session_expired",
    );
  }

  if (!/^[A-Za-z0-9_-]{1,220}$/u.test(input.providerRequestId)) {
    throw new Error("The booking reference is invalid.");
  }

  initializeBrowserAppCheck();
  const callable = httpsCallable<
    {providerRequestId: string; providerNote?: string},
    {
      advanceRequestId: string;
      providerRequestId: string;
      status: "pending";
    }
  >(functions, "requestCompanyAdvance", {timeout: 30_000});

  try {
    const payload: {providerRequestId: string; providerNote?: string} = {
      providerRequestId: input.providerRequestId,
    };
    if (input.providerNote && input.providerNote.trim().length > 0) {
      payload.providerNote = input.providerNote.trim();
    }
    return (await callable(payload)).data;
  } catch (error: unknown) {
    if (error instanceof FirebaseError) {
      const code = error.code
        .replace(/^functions\//, "")
        .replace(/^functions:/, "");
      if (code === "failed-precondition" || code === "invalid-argument") {
        throw new Error(
          error.message
            .replace(/^Firebase:\s*/u, "")
            .replace(/\s*\([^)]*\)\.?$/u, "")
            .trim() || "Immediate funding could not be requested.",
        );
      }
      if (code === "unauthenticated") {
        throw new WebAuthenticationError(
          "Your provider session has expired. Please sign in again.",
          "session_expired",
        );
      }
      if (code === "permission-denied") {
        throw new Error("Only the booking provider can request immediate funding.");
      }
    }
    throw new Error("Immediate funding could not be requested.");
  }
}
