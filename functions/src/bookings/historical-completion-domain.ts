import {Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

type UnknownRecord = Readonly<Record<string, unknown>>;

/** Every `lifecycleReconciliationRequired: true` write carries one of these; absent/unknown reasons stay unresolved. */
export const LIFECYCLE_RECONCILIATION_REASONS = {
  providerDisbursementEnrollmentMissing: "provider_disbursement_enrollment_missing",
  unclassified: "unclassified",
} as const;

export type LifecycleReconciliationReason =
  typeof LIFECYCLE_RECONCILIATION_REASONS[keyof typeof LIFECYCLE_RECONCILIATION_REASONS];

export const HISTORICAL_COMPLETION_ACKNOWLEDGEMENT = "complete_without_provider_disbursement_enrollment";

/*
 * Original pre-enrollment V3 terms: canonical settlement and schema/policy v1
 * financial snapshot whose enrollment key was never written. Malformed
 * enrollment values (null, 0, 2, "1") are not historical evidence.
 */
export function isUnenrolledHistoricalV3Contract(request: UnknownRecord): boolean {
  const snapshot = request.financialSnapshot;
  return request.remainingBalanceTimingSchemaVersion === 3 &&
    request.settlementSchemaVersion === 1 &&
    request.financialSnapshotCapturedAt instanceof Timestamp &&
    snapshot !== null && typeof snapshot === "object" && !Array.isArray(snapshot) &&
    (snapshot as UnknownRecord).schemaVersion === 1 &&
    (snapshot as UnknownRecord).financialPolicyVersion === 1 &&
    (snapshot as UnknownRecord).currency === "PHP" &&
    !("providerDisbursementPolicyVersion" in snapshot);
}

export function isMissingEnrollmentLifecycleHold(request: UnknownRecord): boolean {
  return request.lifecycleReconciliationRequired === true &&
    request.lifecycleReconciliationReason === LIFECYCLE_RECONCILIATION_REASONS.providerDisbursementEnrollmentMissing;
}

export function lifecycleReconciliationReasonFor(error: unknown): LifecycleReconciliationReason {
  const details = error instanceof HttpsError ? error.details as {reason?: unknown} | undefined : undefined;
  return details?.reason === LIFECYCLE_RECONCILIATION_REASONS.providerDisbursementEnrollmentMissing
    ? LIFECYCLE_RECONCILIATION_REASONS.providerDisbursementEnrollmentMissing
    : LIFECYCLE_RECONCILIATION_REASONS.unclassified;
}
