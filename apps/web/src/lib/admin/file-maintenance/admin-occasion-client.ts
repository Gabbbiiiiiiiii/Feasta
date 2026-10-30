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
export type OccasionReadiness = {occasionId: string; status: "BLOCKED" | "ELIGIBLE_FOR_TRANSACTION"; lifecycleAvailable: boolean;
  occasionRevision: number | null; catalogRevision: number | null;
  checks: {code: string; status: "SATISFIED" | "BLOCKED"; message: string}[]; blockers: string[];
  packageCount?: number | null; galleryCount?: number | null;
  affectedPackages?: number | null; affectedGallerySetups?: number | null; disclaimer?: string};

// Lazy loading also keeps unrelated File Maintenance tabs independent of Firebase initialization.
async function call<T>(name: string, input: unknown): Promise<T> {
  try {
    const [{httpsCallable}, {auth, functions, initializeBrowserAppCheck}] = await Promise.all([
      import("firebase/functions"), import("@/lib/firebase/client"),
    ]);
    await auth.authStateReady();
    if (!auth.currentUser) throw {code: "functions/unauthenticated"};
    try {initializeBrowserAppCheck();} catch {throw {code: "app-check/initialization-failed"};}
      return (await httpsCallable<unknown, T>(functions, name, {timeout: 30_000})(input)).data;
  } catch (error) {
    throw new Error(adminOccasionErrorMessage(error));
  }
}

export function adminOccasionErrorMessage(error: unknown): string {
  const code = (error as {code?: string} | null)?.code;
  const reason = (error as {details?: {reason?: string}})?.details?.reason;
  if (code?.startsWith("app-check/")) return "Browser verification failed. Reload the page and try again. If it continues, contact support.";
  if (code === "functions/unauthenticated" || code === "auth/user-token-expired" || code === "auth/invalid-user-token") {
    return "Your administrator session could not be verified. Sign in again and retry. If you are already signed in, reload the page to retry browser verification.";
  }
  if (code === "functions/permission-denied") return "This account does not have permission to manage occasions. Contact your administrator.";
  const messages: Record<string, string> = {
    REVISION_CONFLICT: "The catalog changed. Close the editor and refresh before trying again.",
    CATALOG_NAME_CONFLICT: "This name or alias is already reserved. Choose another name.",
    OCCASION_ID_EXISTS: "This permanent ID already exists. Choose another ID.",
    INVALID_SERVICE_CATEGORY: "Select valid, active service categories.",
    OCCASION_LIFECYCLE_UNAVAILABLE: "Applicability changes are unavailable until release safeguards are verified.",
    OCCASION_LIFECYCLE_RELEASE_UNVERIFIED: "Occasion activation/deactivation remains disabled until required release safeguards are verified. No changes were made.",
    CONFIG_UNAVAILABLE: "The catalog is not initialized or is not stable, or contains invalid records. Contact support to verify the catalog before retrying. No changes were made.",
    CATALOG_CAPACITY_EXCEEDED: "The catalog exceeds the supported size and cannot be loaded completely. Contact support.",
    OCCASION_NOT_FOUND: "This occasion is no longer available. Close the editor and refresh the catalog.",
    FEATURE_DISABLED: "Provider suggestion moderation is currently disabled by server policy.",
    IDEMPOTENCY_CONFLICT: "This retry differs from the original request. Reopen the editor.",
    OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT: "This occasion or catalog changed. Refresh and check readiness again.",
    PACKAGE_INVENTORY_TOO_LARGE: "The package inventory exceeds the safe atomic limit. Administrative reconciliation is required.",
    GALLERY_INVENTORY_TOO_LARGE: "The Setup Gallery inventory exceeds the safe atomic limit. Administrative reconciliation is required.",
    GALLERY_INVENTORY_REQUIRES_REVIEW: "A Setup Gallery record needs correction before changing occasion availability.",
    PACKAGE_INVENTORY_REQUIRES_REVIEW: "Package inventory needs correction before changing occasion availability.",
    OCCASION_LIFECYCLE_CATEGORY_INACTIVE: "An applicable service category is inactive. Refresh and review the occasion.",
    OCCASION_LIFECYCLE_AUDIT_MISSING: "Lifecycle audit records require administrative reconciliation. No new change was applied.",

  };
  if (reason && Object.hasOwn(messages, reason)) return messages[reason];
  if (code === "functions/not-found" || code === "functions/unavailable") return "The occasion service is currently unavailable. Retry shortly; if it continues, contact support.";
  if (code === "functions/deadline-exceeded" || code === "auth/network-request-failed" || code === "functions/cancelled" || error instanceof TypeError) return "The request was interrupted. Check your connection and retry. If you were saving, retry the same changes.";
  if (code === "functions/resource-exhausted") return "Too many requests. Wait a few minutes and retry.";
  return "The occasion service could not complete the request. Retry shortly; if it continues, contact support.";
}
export const listAdminOccasions = () => call<AdminOccasionCatalog>("listAdminOccasions", {});
export const checkAdminOccasionActivationReadiness = (input: {occasionId: string;
  expectedOccasionRevision: number; expectedCatalogRevision: number}) =>
  call<OccasionReadiness>("checkAdminOccasionActivationReadiness", input);
export const checkAdminOccasionDeactivationReadiness = (input: {occasionId: string;
  expectedOccasionRevision: number; expectedCatalogRevision: number}) =>
  call<OccasionReadiness>("checkAdminOccasionDeactivationReadiness", input);
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

export const inspectAdminOccasionAtomicReadiness = (input: {occasionId: string;
  action: "activate" | "deactivate"; expectedOccasionRevision: number;
  expectedCatalogRevision: number}) => call<OccasionReadiness>(
  "inspectAdminOccasionAtomicReadiness", input);
export type OccasionLifecycleMutation = {occasionId: string;
  expectedOccasionRevision: number; expectedCatalogRevision: number;
  idempotencyKey: string; reason: string};
export type OccasionLifecycleResult = {operationId: string; occasionId: string;
  action: "activate" | "deactivate"; state: "completed"; active: boolean;
  occasionRevision: number; catalogRevision: number; withdrawnPackageIds: string[];
  withdrawnGallerySetupIds: string[]; idempotentReplay: boolean};
export const changeAdminOccasionState = (action: "activate" | "deactivate",
  input: OccasionLifecycleMutation) => call<OccasionLifecycleResult>(
  action === "activate" ? "activateAdminOccasion" : "deactivateAdminOccasion", input);
