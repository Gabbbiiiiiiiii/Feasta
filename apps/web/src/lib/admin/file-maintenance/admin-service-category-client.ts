"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import type {
  AdminServiceCategoryMutationResult,
  CreateAdminServiceCategoryInput,
  ServiceCategoryCodeInput,
  UpdateAdminServiceCategoryInput,
} from "@/lib/admin/file-maintenance/admin-service-category-types";
import {
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

async function callCategoryMutation<TInput>(
  functionName: string,
  input: TInput,
): Promise<AdminServiceCategoryMutationResult> {
  await auth.authStateReady();

  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your admin session has expired. Please sign in again.",
      "session_expired",
    );
  }

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    TInput,
    AdminServiceCategoryMutationResult
  >(
    functions,
    functionName,
    {timeout: 30_000},
  );

  try {
    const result = await callable(input);
    return result.data;
  } catch (error: unknown) {
    throw new Error(
      serviceCategoryErrorMessage(error),
    );
  }
}

export function createAdminServiceCategory(
  input: CreateAdminServiceCategoryInput,
) {
  return callCategoryMutation(
    "createServiceCategory",
    input,
  );
}

export function updateAdminServiceCategory(
  input: UpdateAdminServiceCategoryInput,
) {
  return callCategoryMutation(
    "updateServiceCategory",
    input,
  );
}

export function discontinueAdminServiceCategory(
  code: string,
) {
  return callCategoryMutation<ServiceCategoryCodeInput>(
    "discontinueServiceCategory",
    {code},
  );
}

export function reactivateAdminServiceCategory(
  code: string,
) {
  return callCategoryMutation<ServiceCategoryCodeInput>(
    "reactivateServiceCategory",
    {code},
  );
}

export function deleteAdminServiceCategory(
  code: string,
) {
  return callCategoryMutation<ServiceCategoryCodeInput>(
    "deleteServiceCategory",
    {code},
  );
}

function serviceCategoryErrorMessage(
  error: unknown,
): string {
  if (error instanceof WebAuthenticationError) {
    return error.message;
  }

  if (error instanceof FirebaseError) {
    switch (normalizeCallableCode(error.code)) {
      case "unauthenticated":
        return "Your admin session has expired. Please sign in again.";

      case "permission-denied":
        return "You do not have permission to manage service categories.";

      case "not-found":
        return "The service category could not be found.";

      case "already-exists":
        return "A service category with this code already exists.";

      case "invalid-argument":
        return "The service category information is invalid.";

      case "failed-precondition":
        return error.message ||
          "This service category cannot be changed in its current state.";

      case "resource-exhausted":
        return "Too many service category changes were attempted. Please wait and try again.";

      case "unavailable":
      case "deadline-exceeded":
        return "Service category management is temporarily unavailable. Please try again.";

      default:
        return "The service category change could not be completed.";
    }
  }

  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "The service category change could not be completed.";
}

function normalizeCallableCode(
  code: string,
): string {
  return code
    .replace(/^functions\//, "")
    .replace(/^functions:/, "");
}
