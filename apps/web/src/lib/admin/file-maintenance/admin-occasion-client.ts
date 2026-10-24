"use client";

import type {GlobalOccasion, NewInactiveOccasionInput,
  OccasionSuggestionPage, ReviewOccasionSuggestionRequest,
  ReviewOccasionSuggestionResponse} from "@feasta/shared-types/provider-package-v2";

export type AdminOccasion = Omit<GlobalOccasion, "createdBy" | "createdAt" | "updatedAt">;
export type AdminOccasionCatalog = {revision: number; items: AdminOccasion[]; lifecycleAvailable: false};
export type OccasionMutation = {occasion: NewInactiveOccasionInput; expectedCatalogRevision: number;
  expectedOccasionRevision?: number; reason: string; idempotencyKey: string};
export type OccasionImpact = {occasionId: string; occasionRevision: number; catalogRevision: number;
  operation: string; allowed: false; blockers: string[]; disclaimer: string;
  mappings: {code: string; valid: boolean}[];
  usage: {collection: string; scanned: number; potentialReferences: number; truncated: boolean}[]};

// Lazy loading also keeps unrelated File Maintenance tabs independent of Firebase initialization.
async function call<T>(name: string, input: unknown): Promise<T> {
  const [{httpsCallable}, {auth, functions, initializeBrowserAppCheck}] = await Promise.all([
    import("firebase/functions"), import("@/lib/firebase/client"),
  ]);
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Your admin session has expired. Please sign in again.");
  initializeBrowserAppCheck();
  try {
    return (await httpsCallable<unknown, T>(functions, name, {timeout: 30_000})(input)).data;
  } catch (error) {
    const reason = (error as {details?: {reason?: string}})?.details?.reason;
    const messages: Record<string, string> = {
      REVISION_CONFLICT: "The catalog changed. Close the editor and refresh before trying again.",
      CATALOG_NAME_CONFLICT: "This name or alias is already reserved. Choose another name.",
      OCCASION_ID_EXISTS: "This permanent ID already exists. Choose another ID.",
      INVALID_SERVICE_CATEGORY: "Select valid, active service categories.",
      OCCASION_LIFECYCLE_UNAVAILABLE: "Applicability changes are unavailable until release safeguards are verified.",
      CONFIG_UNAVAILABLE: "The catalog is not initialized or is not stable. No changes were made.",
      FEATURE_DISABLED: "Provider suggestion moderation is currently disabled by server policy.",
      IDEMPOTENCY_CONFLICT: "This retry differs from the original request. Reopen the editor.",
    };
    throw new Error(reason && messages[reason] ||
      "The request could not be completed. Check your administrator access and try again.");
  }
}
export const listAdminOccasions = () => call<AdminOccasionCatalog>("listAdminOccasions", {});
export const saveAdminOccasion = (input: OccasionMutation, create: boolean) =>
  call<{catalogRevision: number; occasionRevision: number}>(
    create ? "createAdminOccasion" : "updateAdminOccasion", input);
export const previewAdminOccasionImpact = (input: {occasionId: string;
  expectedOccasionRevision: number; expectedCatalogRevision: number;
  operation: "activate" | "deactivate" | "applicability"; applicableServiceCategoryCodes?: string[]}) =>
  call<OccasionImpact>("previewAdminOccasionImpact", input);
export const listOccasionSuggestions = (cursor?: string) => call<OccasionSuggestionPage>(
  "listOccasionSuggestionsForReview", {status: "pending", pageSize: 20, ...(cursor ? {cursor} : {})});
export const reviewOccasionSuggestion = (input: ReviewOccasionSuggestionRequest) =>
  call<ReviewOccasionSuggestionResponse>("reviewOccasionSuggestion", input);
