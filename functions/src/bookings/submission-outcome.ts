import {createHash} from "node:crypto";
import {Timestamp, type DocumentReference, type Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {serverTimestamp} from "../shared/timestamps.js";

export function bookingOutcomeId(uid: string, requestId: string): string {
  return createHash("sha256").update(`${uid}:${requestId}`).digest("hex").slice(0, 40);
}

type Identity = {customerId: string; clientRequestId: string; submissionFingerprint: string};
const acknowledgementReasons = new Set([
  "REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED", "REFUND_POLICY_ACKNOWLEDGEMENT_INVALID",
  "REFUND_POLICY_CHANGED", "BOOKING_PAYMENT_AGREEMENT_REQUIRED", "BOOKING_PAYMENT_AGREEMENT_CHANGED",
]);

// Only call at the two acknowledgement gates, after reading booking + receipt,
// and before ANY write. Returning the error lets the transaction COMMIT evidence.
export function rejectAcknowledgementInTransaction(tx: Transaction, ref: DocumentReference,
  identity: Identity, validate: () => void): HttpsError | null {
  try {
    validate();
    return null;
  } catch (error) {
    if (!(error instanceof HttpsError) || error.code !== "failed-precondition" ||
        !acknowledgementReasons.has((error.details as {reason?: string} | undefined)?.reason ?? "")) throw error;
    tx.create(ref, {...identity, schemaVersion: 1, outcome: "confirmed_rejected",
      reason: "acknowledgement_rejected", rejectedAt: serverTimestamp()});
    return error;
  }
}

export function validRejection(data: Record<string, unknown> | undefined, uid: string, requestId: string): boolean {
  return data?.schemaVersion === 1 && data.outcome === "confirmed_rejected" &&
    data.customerId === uid && data.clientRequestId === requestId &&
    data.reason === "acknowledgement_rejected" &&
    typeof data.submissionFingerprint === "string" && /^[a-f0-9]{64}$/.test(data.submissionFingerprint) &&
    data.rejectedAt instanceof Timestamp;
}

export function assertNoRejectedSubmission(data: Record<string, unknown> | undefined,
  uid: string, requestId: string, fingerprint: string): void {
  if (!data) return;
  if (!validRejection(data, uid, requestId)) {
    throw new HttpsError("failed-precondition", "Submission outcome requires administrative reconciliation.");
  }
  if (data.submissionFingerprint !== fingerprint) {
    throw new HttpsError("already-exists", "This request identifier was already used for another selection.");
  }
  throw new HttpsError("failed-precondition", "This request was terminally rejected. Check previous request.",
    {reason: "SUBMISSION_TERMINALLY_REJECTED"});
}

export function reconcileSubmissionOutcome(uid: string, requestId: string, bookingId: string,
  booking: Record<string, unknown> | undefined, receipt: Record<string, unknown> | undefined) {
  // Contradictory evidence fails closed; never expose foreign booking information.
  if (booking) {
    if (receipt || booking.customerId !== uid || booking.clientRequestId !== requestId ||
        booking.mainEventId !== bookingId || !Array.isArray(booking.providerRequestIds) ||
        !booking.providerRequestIds.length ||
        !booking.providerRequestIds.every(id => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id))) {
      return {outcome: "unresolved"};
    }
    return {outcome: "confirmed_created", booking: {bookingId, mainEventId: bookingId,
      providerRequestIds: booking.providerRequestIds, created: false}};
  }
  return {outcome: validRejection(receipt, uid, requestId) ? "confirmed_rejected" : "unresolved"};
}
