"use client";
import type {SubmitOccasionSuggestionRequest, SubmitOccasionSuggestionResponse, ListMyOccasionSuggestionsRequest, OccasionSuggestionPage} from "@feasta/shared-types/provider-package-v2";
// Local contract review does not verify deployment, App Check, policy or cursor-secret readiness.
// Keep both browser operations blocked until that integration is explicitly verified.
export function occasionRequestsAvailable(): boolean { return false; }
const unsafe = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
export function validateOccasionRequest(name: string, reason: string) {
  const collapsed = name.trim().replace(/\s+/gu, " ");
  const normalized = collapsed.normalize("NFKC");
  const valid = (s: string, min: number, max: number) => !unsafe.test(s) && [...s].length >= min && [...s].length <= max;
  return {name: unsafe.test(name) || !valid(collapsed, 2, 80) || !valid(normalized, 2, 80) ? "Use 2–80 characters without control or invisible characters." : null,
    reason: unsafe.test(reason) || !valid(reason.trim(), 0, 500) ? "Use at most 500 characters without control or invisible characters." : null,
    value: {name: normalized, ...(reason.trim() ? {reason: reason.trim()} : {})}};
}
async function call<I, O>(name: string, input: I): Promise<O> {
  if (!occasionRequestsAvailable()) throw {details: {reason: "BROWSER_INTEGRATION_UNVERIFIED"}};
  const [{httpsCallable}, client] = await Promise.all([import("firebase/functions"), import("@/lib/firebase/client")]);
  client.initializeBrowserFirebase();
  if (!client.auth.currentUser) throw {code: "unauthenticated"};
  return (await httpsCallable<I, O>(client.functions, name)(input)).data;
}
export const submitOccasionRequest = (input: SubmitOccasionSuggestionRequest) => call<SubmitOccasionSuggestionRequest, SubmitOccasionSuggestionResponse>("submitProviderOccasionSuggestion", input);
export const listOccasionRequests = (input: ListMyOccasionSuggestionsRequest) => call<ListMyOccasionSuggestionsRequest, OccasionSuggestionPage>("listMyOccasionSuggestions", input);
export function occasionRequestError(error: unknown) {
  const e = error as {code?: string; details?: {reason?: string}; message?: string};
  const reason = e?.details?.reason ?? e?.message;
  if (reason === "BROWSER_INTEGRATION_UNVERIFIED") return "Occasion requests are unavailable until backend integration is verified.";
  if (reason === "FEATURE_DISABLED") return "Occasion requests are disabled by the server.";
  if (reason === "CONFIG_UNAVAILABLE") return "The occasion request service is not configured. Please contact support.";
  if (e?.code?.endsWith("permission-denied") || reason === "PROVIDER_NOT_APPROVED") return "Your account does not have permission to submit or view occasion requests.";
  if (e?.code?.endsWith("unauthenticated")) return "Please sign in again to use occasion requests.";
  if (e?.code?.endsWith("resource-exhausted")) return "The request limit has been reached. Please try again later.";
  return "The occasion request service is unavailable. No submission is confirmed. You can retry safely.";
}
