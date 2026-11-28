import {Timestamp, type Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {trustedScheduledEventEnd} from "./booking-completion-policy.js";

const LIMIT = 100;
const TERMINAL_COMPLAINTS = new Set(["resolved", "dismissed", "closed"]);
const blocked = () => { throw new HttpsError("failed-precondition", "Completion requires complaint, refund, or payment reconciliation."); };

export function assertCompletionEvidenceClear(data: Readonly<Record<string, unknown>>): void {
  for (const key of ["activeCancellationRequestId", "approvedCancellationRequestId", "refundExecutionLock",
    "activeRefundRequestId", "activeDisputeId", "activeComplaintId"]) if (data[key] != null) blocked();
  for (const key of ["reconciliationRequired", "lifecycleReconciliationRequired", "hasUnresolvedComplaint", "hasUnresolvedDispute"]) {
    if (data[key] != null && data[key] !== false) blocked();
  }
  for (const key of ["disputeStatus", "complaintStatus", "refundStatus"]) {
    if (data[key] != null && !["none", "resolved", "dismissed", "closed", "not_requested"].includes(String(data[key]))) blocked();
  }
  for (const key of ["refundedAmountInCentavos", "refundReservedAmountInCentavos"]) {
    if (data[key] != null && data[key] !== 0) blocked();
  }
  const eligibility = data.refundEligibilityState as {activeCancellationRequestId?: unknown} | null;
  if (eligibility?.activeCancellationRequestId != null) blocked();
}

/** Complaints are the authoritative dispute intake. Scoped reports affect their service/event;
 * Legacy unscoped provider/customer reports remain conservatively blocking.
 * Unknown states fail closed. Query reads participate in transaction conflict detection.
 * Never interpret query errors/overflow as clearance.
 */
export async function assertCompletionSafetyInTransaction(transaction: Transaction,
  request: Readonly<Record<string, unknown>>, parent: Readonly<Record<string, unknown>>,
  identity: {providerRequestId: string; mainEventId: string}): Promise<void> {
  try { trustedScheduledEventEnd(request, parent); } catch {
    throw new HttpsError("failed-precondition", "The scheduled event evidence requires reconciliation.");
  }
  assertCompletionEvidenceClear(request);
  assertCompletionEvidenceClear(parent);
  const queries = [
    db.collection("complaints").where("providerRequestId", "==", identity.providerRequestId)
      .limit(LIMIT + 1),
    db.collection("complaints").where("bookingId", "==", identity.mainEventId).limit(LIMIT + 1),
    db.collection("complaints").where("mainEventId", "==", identity.mainEventId).limit(LIMIT + 1),
    db.collection("complaints").where("providerId", "==", request.providerId).limit(LIMIT + 1),
    db.collection("complaints").where("userId", "==", request.customerId).limit(LIMIT + 1)];
  const snapshots = await Promise.all(queries.map(query => transaction.get(query)));
  for (const snapshot of snapshots) {
    if (snapshot.size > LIMIT) blocked();
    for (const document of snapshot.docs) {
      const complaint = document.data();
      if (!complaintAffectsBooking(complaint, {...identity, providerId: request.providerId})) {
        continue;
      }
      if (!TERMINAL_COMPLAINTS.has(String(complaint.status))) blocked();
      if (!(complaint.resolvedAt instanceof Timestamp) ||
        typeof complaint.resolvedBy !== "string" || !complaint.resolvedBy.trim()) blocked();
    }
  }
}

export function complaintAffectsBooking(complaint: Readonly<Record<string, unknown>>,
  identity: {providerRequestId: string; mainEventId: string; providerId: unknown}): boolean {
  const safeId = (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9_-]{8,160}$/u.test(value);
  // Malformed scope must never accidentally turn a legacy hold into clearance.
  for (const field of ["providerRequestId", "bookingId", "mainEventId"]) {
    if (complaint[field] != null && !safeId(complaint[field])) return true;
  }
  if (complaint.providerRequestId != null) {
    return complaint.providerRequestId === identity.providerRequestId;
  }
  if (complaint.bookingId != null || complaint.mainEventId != null) {
    if (complaint.bookingId != null && complaint.mainEventId != null &&
      complaint.bookingId !== complaint.mainEventId) return true;
    return (complaint.bookingId ?? complaint.mainEventId) === identity.mainEventId &&
      (complaint.providerId == null || complaint.providerId === identity.providerId);
  }
  return complaint.providerId == null || complaint.providerId === identity.providerId;
}
