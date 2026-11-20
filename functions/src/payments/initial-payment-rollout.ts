import {type Transaction} from "firebase-admin/firestore";
import {db} from "../shared/firestore.js";

export const INITIAL_PAYMENT_ROLLOUT_DOCUMENT = "initialPaymentExpirationPhaseA";
export type InitialPaymentRollout = Readonly<{
  enrollmentEnabled: boolean;
  expirationEnabled: boolean;
  historicalReviewEnabled: boolean;
}>;
const DISABLED: InitialPaymentRollout = Object.freeze({
  enrollmentEnabled: false, expirationEnabled: false, historicalReviewEnabled: false,
});

/** Only a complete, private, versioned server configuration can activate work. */
export function parseInitialPaymentRollout(data: Readonly<Record<string, unknown>> | undefined): InitialPaymentRollout {
  if (!data || data.schemaVersion !== 1 || data.isPublic !== false ||
    typeof data.enrollmentEnabled !== "boolean" || typeof data.expirationEnabled !== "boolean" ||
    typeof data.historicalReviewEnabled !== "boolean") return DISABLED;
  return {enrollmentEnabled: data.enrollmentEnabled, expirationEnabled: data.expirationEnabled,
    historicalReviewEnabled: data.historicalReviewEnabled};
}

/** No cache: transactional readers conflict with a concurrent activation change. */
export async function readInitialPaymentRollout(transaction?: Transaction): Promise<InitialPaymentRollout> {
  try {
    const reference = db.collection("appSettings").doc(INITIAL_PAYMENT_ROLLOUT_DOCUMENT);
    const snapshot = transaction ? await transaction.get(reference) : await reference.get();
    return parseInitialPaymentRollout(snapshot.data());
  } catch {
    // Unavailable/unauthorized configuration must never enable writes or block legacy submission.
    return DISABLED;
  }
}

/** Spread only into new documents; never enroll an idempotent replay or a historical recovery. */
export function initialPaymentEnrollment(rollout: InitialPaymentRollout): Record<string, number> {
  return rollout.enrollmentEnabled ? {initialPaymentWriteProtocolVersion: 1} : {};
}
