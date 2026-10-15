"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import type {
  AdminAgreementTemplate,
  AdminBusinessDocumentType,
  DocumentCatalogCodeInput,
  DocumentCatalogMutationResult,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";
import {WebAuthenticationError} from "@/lib/auth/client-session";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";

async function callCatalogMutation<TInput>(
  functionName: string,
  input: TInput,
  subject: string,
): Promise<DocumentCatalogMutationResult> {
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your admin session has expired. Please sign in again.",
      "session_expired",
    );
  }
  initializeBrowserAppCheck();
  const callable = httpsCallable<TInput, DocumentCatalogMutationResult>(
    functions,
    functionName,
    {timeout: 30_000},
  );
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: unknown) {
    throw new Error(catalogErrorMessage(error, subject));
  }
}

function catalogDetailMessage(error: FirebaseError): string | null {
  const details = (error as FirebaseError & {
    details?: {userMessage?: unknown};
  }).details;
  if (typeof details?.userMessage === "string" && details.userMessage.trim()) {
    return details.userMessage.trim();
  }
  return null;
}

function specificCallableMessage(message: string): string | null {
  const text = message.trim();
  if (!text || !text.includes(" ") || text.length < 12) return null;
  if (/^firebase\b/iu.test(text)) return null;
  return text;
}

function catalogErrorMessage(error: unknown, subject: string): string {
  if (error instanceof WebAuthenticationError) return error.message;
  if (error instanceof FirebaseError) {
    const code = error.code.replace(/^functions\//, "").replace(/^functions:/, "");
    if (subject === "agreement" || subject === "agreement type") {
      const detail = catalogDetailMessage(error);
      if (detail) return detail;
      if (code === "permission-denied") {
        return "You do not have permission to perform this action.";
      }
      if (code === "already-exists") {
        return "An agreement with this code already exists.";
      }
      const specific = specificCallableMessage(error.message);
      if (specific && (code === "invalid-argument" || code === "failed-precondition" || code === "not-found")) {
        return specific;
      }
    }
    switch (code) {
      case "unauthenticated":
        return "Your admin session has expired. Please sign in again.";
      case "permission-denied":
        return `You do not have permission to manage ${subject}.`;
      case "not-found":
        return `The ${subject} record could not be found.`;
      case "already-exists":
        return `A ${subject} record with this code already exists.`;
      case "invalid-argument":
        return `The ${subject} information is invalid.`;
      case "failed-precondition":
        return error.message ||
          `This ${subject} record cannot be changed in its current state.`;
      case "resource-exhausted":
        return "Too many file maintenance changes were attempted. Please wait and try again.";
      case "unavailable":
      case "deadline-exceeded":
        return "File maintenance is temporarily unavailable. Please try again.";
      default:
        return `The ${subject} change could not be completed.`;
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return `The ${subject} change could not be completed.`;
}

export type AgreementInput = Omit<AdminAgreementTemplate, "status" | "sortName">;

export function createAdminAgreementTemplate(input: AgreementInput) {
  return callCatalogMutation("createAgreementTemplate", input, "agreement");
}

export function updateAdminAgreementTemplate(input: AgreementInput) {
  return callCatalogMutation("updateAgreementTemplate", input, "agreement");
}

export function updateAdminAgreementType(input: {
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}) {
  return callCatalogMutation("updateAgreementType", input, "agreement type");
}

export type AgreementVersionInput = {
  summary?: string;
  code: string;
  version: string;
  effectiveDate: string;
  sections: AgreementInput["sections"];
};

export function createAdminAgreementVersion(
  input: AgreementVersionInput & {sourceVersion: string},
) {
  return callCatalogMutation("createAgreementVersion", input, "agreement");
}

export function updateAdminAgreementVersion(
  input: AgreementVersionInput & {draftVersion: string},
) {
  return callCatalogMutation("updateAgreementVersion", input, "agreement");
}

export function publishAdminAgreementVersion(input: {
  code: string;
  version: string;
}) {
  return callCatalogMutation("publishAgreementVersion", input, "agreement");
}

export function deleteAdminAgreementVersion(input: {
  code: string;
  version: string;
}) {
  return callCatalogMutation("deleteAgreementVersion", input, "agreement");
}

export function deleteAdminAgreementTemplate(code: string) {
  return callCatalogMutation<DocumentCatalogCodeInput>(
    "deleteAgreementTemplate",
    {code},
    "agreement",
  );
}

export type BusinessDocumentInput =
  Omit<AdminBusinessDocumentType, "status" | "sortName">;

export function createAdminBusinessDocumentType(input: BusinessDocumentInput) {
  return callCatalogMutation(
    "createBusinessDocumentType",
    input,
    "business document",
  );
}

export function updateAdminBusinessDocumentType(input: BusinessDocumentInput) {
  return callCatalogMutation(
    "updateBusinessDocumentType",
    input,
    "business document",
  );
}

export function discontinueAdminBusinessDocumentType(code: string) {
  return callCatalogMutation<DocumentCatalogCodeInput>(
    "discontinueBusinessDocumentType",
    {code},
    "business document",
  );
}

export function reactivateAdminBusinessDocumentType(code: string) {
  return callCatalogMutation<DocumentCatalogCodeInput>(
    "reactivateBusinessDocumentType",
    {code},
    "business document",
  );
}

export function deleteAdminBusinessDocumentType(code: string) {
  return callCatalogMutation<DocumentCatalogCodeInput>(
    "deleteBusinessDocumentType",
    {code},
    "business document",
  );
}

export type {
  AdminAgreementTemplate,
  AdminBusinessDocumentType,
};
