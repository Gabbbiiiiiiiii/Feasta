"use client";

import type {PackageEditorProgressV2} from "@feasta/shared-types/provider-package-v2";
import {httpsCallable} from "firebase/functions";
import {auth, functions, initializeBrowserFirebase} from "@/lib/firebase/client";

// Default OFF. Require reviewed callable/App Check, origin and rules acceptance
// before setting the browser build flag and enabling the backend policy gate.
export const packageEditorProgressEnabled =
  process.env.NEXT_PUBLIC_PROVIDER_PACKAGE_EDITOR_PROGRESS_ENABLED === "true";

export type EditorProgress = PackageEditorProgressV2;
export type SavedEditorDraft = {
  editorSchemaVersion: 2;
  editorDraftId: string;
  providerId: string;
  packageId: null;
  basePackageRevision: null;
  state: "incomplete" | "completed";
  progress: EditorProgress;
  currentStep: 0 | 1 | 2 | 3 | 4;
  completedPackageId: string | null;
  completedPackageRevision: number | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

function requireCurrentUser(): void {
  initializeBrowserFirebase();
  if (!auth.currentUser) throw new Error("AUTHENTICATION_REQUIRED");
}

async function invoke<Input, Output>(name: string, input: Input): Promise<Output> {
  if (!packageEditorProgressEnabled) throw new Error("FEATURE_DISABLED");
  requireCurrentUser();
  const callable = httpsCallable<Input, Output>(functions, name);
  return (await callable(input)).data;
}

export async function listSavedPackageProgress(): Promise<SavedEditorDraft[]> {
  const value = await invoke<Record<string, never>, {drafts: SavedEditorDraft[]}>(
    "listProviderPackageEditorDrafts", {});
  return value.drafts;
}

export async function getSavedPackageProgress(editorDraftId: string): Promise<SavedEditorDraft> {
  const value = await invoke<{editorDraftId: string}, {draft: SavedEditorDraft}>(
    "getProviderPackageEditorDraft", {editorDraftId});
  return value.draft;
}

export async function savePackageProgress(input: {
  editorDraftId: string | null;
  expectedRevision: number;
  currentStep: 0 | 1 | 2 | 3 | 4;
  progress: EditorProgress;
  idempotencyKey: string;
}): Promise<SavedEditorDraft> {
  const value = await invoke<unknown, {draft: SavedEditorDraft}>(
    "saveProviderPackageEditorDraft", {
      editorSchemaVersion: 2, packageId: null, expectedPackageRevision: null,
      ...input,
    });
  return value.draft;
}

export async function discardSavedPackageProgress(draft: SavedEditorDraft): Promise<void> {
  await invoke("discardProviderPackageEditorDraft", {
    editorDraftId: draft.editorDraftId, expectedRevision: draft.revision,
    idempotencyKey: crypto.randomUUID(),
  });
}

export function packageProgressError(error: unknown): string {
  const e = error as {message?: string; code?: string; details?: {reason?: string}};
  const reason = e?.details?.reason ?? e?.message;
  if (reason === "FEATURE_DISABLED") return "Private progress saving is not enabled on this server.";
  if (reason === "CONFIG_UNAVAILABLE") return "Package progress configuration is unavailable.";
  if (reason === "MAINTENANCE_PAUSED") return "Progress cannot be saved during maintenance; reopening saved progress is still allowed.";
  if (reason === "REVISION_CONFLICT") return "Another change was saved. Reopen the saved progress before editing further.";
  if (reason === "EDITOR_DRAFT_QUOTA_REACHED") return "You have 20 saved drafts. Discard one before creating another.";
  if (reason === "RESOURCE_NOT_FOUND") return "This progress draft is unavailable or no longer belongs to your account.";
  if (reason === "DRAFT_QUOTA_RECONCILIATION_REQUIRED") return "Your saved-progress quota requires support review.";
  if (reason === "CLIENT_UPGRADE_REQUIRED") return "This progress includes unsupported media or package fields. Remove those fields before saving progress.";
  if (reason === "INVALID_EDITOR_PROGRESS" || reason === "EDITOR_DRAFT_TOO_LARGE") return "The progress is too large or contains unsupported values.";
  if (reason === "APP_CHECK_REQUIRED" || e?.code?.includes("unauthenticated")) return "Sign in again and verify your browser before saving progress.";
  return "Progress request failed. No save is confirmed. Retry or reopen the saved draft.";
}
