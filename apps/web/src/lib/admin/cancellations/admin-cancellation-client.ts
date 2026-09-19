"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";
import type {RefundReconciliationInspection} from "@feasta/shared-types";

import {WebAuthenticationError} from "@/lib/auth/client-session";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";
import type {
  AdminCancellationApprovalResult,
  AdminCancellationExecutionResult,
  AdminCancellationRejectionResult,
} from "./admin-cancellation-types";

const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/u;

export function createCancellationActionKey(action: string, cancellationRequestId: string): string {
  const suffix = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `admin-cancellation:${action}:${cancellationRequestId}:${suffix}`.slice(0, 200);
}

export function approveCancellation(
  cancellationRequestId: string,
  idempotencyKey: string,
): Promise<AdminCancellationApprovalResult> {
  return callAdminCancellation("approveProviderRequestCancellationRefund", {
    cancellationRequestId: normalizedId(cancellationRequestId),
    idempotencyKey,
  });
}

export function rejectCancellation(
  cancellationRequestId: string,
  reason: string,
  idempotencyKey: string,
): Promise<AdminCancellationRejectionResult> {
  const normalizedReason = reason.trim().replace(/\s+/gu, " ");
  if (normalizedReason.length < 5 || normalizedReason.length > 500) {
    throw new Error("Enter a rejection reason between 5 and 500 characters.");
  }
  return callAdminCancellation("rejectProviderRequestCancellation", {
    cancellationRequestId: normalizedId(cancellationRequestId),
    reason: normalizedReason,
    idempotencyKey,
  });
}

export function executeCancellationRefund(
  cancellationRequestId: string,
  idempotencyKey: string,
): Promise<AdminCancellationExecutionResult> {
  return callAdminCancellation("executeProviderRequestRefund", {
    cancellationRequestId: normalizedId(cancellationRequestId),
    idempotencyKey,
  });
}

export function inspectCancellationRefund(
  cancellationRequestId: string,
): Promise<RefundReconciliationInspection> {
  return callAdminCancellation("inspectProviderRequestRefundReconciliation", {
    cancellationRequestId: normalizedId(cancellationRequestId),
  });
}

async function callAdminCancellation<T>(
  functionName: string,
  payload: Record<string, string>,
): Promise<T> {
  if (!auth.currentUser) {
    throw new WebAuthenticationError("Your Admin session has expired. Sign in again.");
  }
  initializeBrowserAppCheck();
  try {
    const response = await httpsCallable<Record<string, string>, T>(
      functions,
      functionName,
      {timeout: 30_000},
    )(payload);
    return response.data;
  } catch (error) {
    throw normalizeAdminCancellationError(error);
  }
}

function normalizedId(value: string): string {
  const normalized = value.trim();
  if (!SAFE_ID.test(normalized)) throw new Error("This cancellation request is unavailable.");
  return normalized;
}

function normalizeAdminCancellationError(error: unknown): Error {
  if (error instanceof WebAuthenticationError) return error;
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error : new Error("The cancellation action could not be completed.");
  }
  switch (error.code) {
    case "functions/unauthenticated":
      return new WebAuthenticationError("Your Admin session has expired. Sign in again.");
    case "functions/permission-denied":
      return new Error("Only an authorized FEASTA Admin can perform this action.");
    case "functions/not-found":
      return new Error("This cancellation request is no longer available.");
    case "functions/invalid-argument":
      return new Error("The cancellation action input is invalid.");
    case "functions/resource-exhausted":
      return new Error("Too many cancellation actions were attempted. Wait a moment and try again.");
    case "functions/deadline-exceeded":
    case "functions/unavailable":
      return new Error("FEASTA could not reach the trusted refund service. Try again.");
    case "functions/failed-precondition":
      return new Error(safePreconditionMessage(error.message));
    default:
      return new Error("The cancellation action could not be completed safely.");
  }
}

function safePreconditionMessage(message: string): string {
  const normalized = message.replace(/^Firebase:\s*/u, "").trim();
  if (/reconciliation/iu.test(normalized)) return "Refund requires reconciliation review.";
  if (/manual review/iu.test(normalized)) return "Manual review required. Automatic approval is unavailable.";
  if (/already|not allowed|cannot|eligible/iu.test(normalized)) {
    return "The latest trusted state no longer permits this action. Refresh the queue.";
  }
  return "The trusted refund workflow could not perform this action in its current state.";
}
