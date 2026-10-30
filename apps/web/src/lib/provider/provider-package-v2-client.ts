"use client";
import {httpsCallable} from "firebase/functions";
import type {CreateProviderPackageV2Request, UpdateProviderPackageV2Request,
  CompletePackageEditorDraftRequest, CompletePackageEditorDraftResponse,
  PackageMutationV2Response} from "@feasta/shared-types/provider-package-v2";
import {auth, functions, initializeBrowserFirebase} from "@/lib/firebase/client";

export const packageV2Enabled = process.env.NEXT_PUBLIC_PROVIDER_PACKAGE_V2_DRAFTS_ENABLED === "true" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.startsWith("demo-") === true &&
  process.env.NODE_ENV !== "production";
export const packageV2PublicationEnabled = packageV2Enabled &&
  process.env.NEXT_PUBLIC_PROVIDER_PACKAGE_V2_PUBLICATION_DEMO_ENABLED === "true";

type Mutation = {name: "createProviderPackageV2"; input: CreateProviderPackageV2Request} |
  {name: "updateProviderPackageV2"; input: UpdateProviderPackageV2Request} |
  {name: "completeProviderPackageEditorDraft"; input: CompletePackageEditorDraftRequest};
const slot = () => `feasta-v2-pending:${auth.currentUser?.uid ?? "signed-out"}`;
export function hasPendingV2Draft(): boolean {
  return typeof window !== "undefined" && sessionStorage.getItem(slot()) !== null;
}
async function send<Output extends PackageMutationV2Response | CompletePackageEditorDraftResponse>(mutation: Mutation): Promise<Output> {
  initializeBrowserFirebase();
  await auth.authStateReady();
  if (!packageV2Enabled) throw new Error("FEATURE_DISABLED");
  if (!auth.currentUser) throw new Error("AUTHENTICATION_REQUIRED");
  // Persist the exact request before sending. Ambiguous network failures must
  // be resolved before another create, even after closing/reloading the editor.
  const existing = sessionStorage.getItem(slot());
  if (existing && existing !== JSON.stringify(mutation)) throw new Error("PENDING_V2_SAVE");
  sessionStorage.setItem(slot(), JSON.stringify(mutation));
  try {
    const result = (await httpsCallable<unknown, PackageMutationV2Response | CompletePackageEditorDraftResponse>(
      functions, mutation.name)(mutation.input)).data;
    if (result.status !== "draft" || !Number.isSafeInteger(result.packageRevision) || result.packageRevision < 1 || !result.packageId) {
      throw new Error("INVALID_DRAFT_RESPONSE");
    }
    sessionStorage.removeItem(slot());
    return result as Output;
  } catch (error) {
    const code = (error as {code?: string}).code?.replace("functions/", "");
    // Definitive server denials can be repaired. Uncertain outcomes retain the
    // immutable request/key; retries use that request rather than edited fields.
    if (["invalid-argument", "failed-precondition", "permission-denied", "unauthenticated",
      "aborted", "already-exists", "not-found", "resource-exhausted"].includes(code ?? "")) {
      sessionStorage.removeItem(slot());
    }
    throw error;
  }
}
export const createV2PackageDraft = (input: CreateProviderPackageV2Request) => send<PackageMutationV2Response>({name:"createProviderPackageV2",input});
export const updateV2PackageDraft = (input: UpdateProviderPackageV2Request) => send<PackageMutationV2Response>({name:"updateProviderPackageV2",input});
export const completeV2PackageProgress = (input: CompletePackageEditorDraftRequest) => send<CompletePackageEditorDraftResponse>({name:"completeProviderPackageEditorDraft",input});
export async function retryPendingV2Draft() {
  const raw = sessionStorage.getItem(slot());
  if (!raw) throw new Error("NO_PENDING_V2_SAVE");
  return send(JSON.parse(raw) as Mutation);
}
