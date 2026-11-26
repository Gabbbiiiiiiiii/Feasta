"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";

type Response =
  | {action: "offerArrangement"; upfrontInCentavos: number; initialDueAt: string; balanceDueAt: string}
  | {action: "acceptArrangement" | "declineArrangement" | "withdrawArrangement"; offerId: string};

export async function respondToArrangedPayment(providerRequestId: string, response: Response) {
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Sign in to respond to this booking request.");
  initializeBrowserAppCheck();
  try {
    await httpsCallable<Response & {providerRequestId: string}, unknown>(
      functions,
      "acceptProviderRequest",
      {timeout: 30_000},
    )({
      providerRequestId,
      ...response,
    });
  } catch (error) {
    throw normalizeArrangedPaymentError(error);
  }
}

function normalizeArrangedPaymentError(error: unknown): Error {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "functions/unauthenticated":
        return new Error("Your session has expired. Sign in again and retry.");
      case "functions/permission-denied":
        return new Error("You do not have permission to respond to this booking request.");
      case "functions/not-found":
        return new Error("This booking request could not be found. Refresh the page to check its latest status.");
      case "functions/invalid-argument":
      case "functions/failed-precondition":
      case "functions/resource-exhausted":
        return new Error(error.message || "This payment offer could not be updated. Reload the request and try again.");
      case "functions/deadline-exceeded":
      case "functions/unavailable":
        return new Error("FEASTA could not reach the server. Check your connection and try again.");
      default:
        return new Error(error.message || "Unable to save the arranged payment response.");
    }
  }
  return error instanceof Error ? error : new Error("Unable to save the arranged payment response.");
}
