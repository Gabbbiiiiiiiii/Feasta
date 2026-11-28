import {Timestamp} from "firebase-admin/firestore";
import {onDocumentUpdated} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {db} from "../shared/firestore.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {INITIAL_EXPIRATION_REASON} from "../payments/initial-payment-expiration.js";
import {activeStrikes, OBSERVATION_MS, readViolationState, reverseStrike} from "./customer-violation-policy.js";
import {adjudicateCustomerExpiration, endCustomerRestriction, validViolationId,
  violationNotification, writeViolationState} from "./customer-violation-service.js";

export const adjudicateExpiredCustomerBooking = onDocumentUpdated({
  document: "providerRequests/{providerRequestId}", region: "asia-southeast1",
  retry: true, timeoutSeconds: 120, memory: "256MiB", maxInstances: 10,
}, async event => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after || before.status === "expired" || after.status !== "expired" ||
    after.initialPaymentExpirationReason !== INITIAL_EXPIRATION_REASON) return;
  let result;
  try { result = await adjudicateCustomerExpiration(String(after.mainEventId)); }
  catch (error) {
    logger.error("Customer expiration adjudication failed; delivery will retry.", {
      providerRequestId: event.params.providerRequestId, mainEventId: after.mainEventId,
      eventId: event.id, code: (error as {code?: unknown}).code ?? "unknown",
    });
    throw error;
  }
  if (!["issued", "duplicate"].includes(result)) logger.info("Customer expiration not adjudicated as a strike.",
    {mainEventId: after.mainEventId, result});
});

/** Independent, bounded expiry notification work; booking access expires exactly
 * at untilMs regardless of when this notification is delivered. */
export const notifyEndedCustomerBookingRestrictions = onSchedule({
  schedule: "every 15 minutes", timeZone: "Asia/Manila", region: "asia-southeast1",
  maxInstances: 1, concurrency: 1, timeoutSeconds: 120,
}, async () => {
  const page = await db.collection("customerViolationStates")
    .where("nextReviewAt", "<=", Timestamp.now()).orderBy("nextReviewAt").limit(25).get();
  for (const doc of page.docs) {
    try { await endCustomerRestriction(doc.id); }
    catch (error) { logger.error("Customer restriction expiry notification failed.", {customerId: doc.id, error: String(error)}); }
  }
});

function inputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpsError("invalid-argument", "Input is required.");
  return value as Record<string, unknown>;
}

/** Customer-safe summary only. Identity is never taken from caller-supplied data. */
export const getCustomerBookingStanding = onCall(appCheckCallableOptions, async request => {
  const actor = requireAuth(request);
  await requireRole(actor.uid, ["customer"]);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(db.collection("customerViolationStates").doc(actor.uid));
    let state;
    try { state = readViolationState(snapshot.data()); }
    catch {
      throw new HttpsError("failed-precondition",
        "Booking standing is unavailable. Contact support.");
    }
    const now = Date.now();
    const restricted = !!state.restriction && state.restriction.untilMs > now;
    return {
      activeCount: activeStrikes(state, now).length,
      status: restricted ? "restricted" : activeStrikes(state, now).length === 2 ? "final_warning" :
        activeStrikes(state, now).length === 1 ? "warning" : "clear",
      restrictionExpiresAt: restricted ? new Date(state.restriction!.untilMs).toISOString() : null,
      serverTime: new Date(now).toISOString(),
    };
  });
});

export const getAdminCustomerViolations = onCall(appCheckCallableOptions, async request => {
  const actor = requireAuth(request);
  await requireRole(actor.uid, ["admin"]);
  const input = inputRecord(request.data);
  if (!validViolationId(input.customerId) || (input.cursor != null && !validViolationId(input.cursor))) {
    throw new HttpsError("invalid-argument", "Invalid customer or history cursor.");
  }
  const customerId = input.customerId;
  // A transaction makes the displayed revision/count/history one consistent snapshot.
  return db.runTransaction(async transaction => {
    const ref = db.collection("customerViolationStates").doc(customerId);
    // Both fields are immutable; single-field issuedAt index includes __name__
    // in the same direction. Reversal cannot move a record between pages.
    let query = ref.collection("violations").orderBy("issuedAt", "desc").orderBy("__name__", "desc").limit(26);
    if (input.cursor) {
      const cursor = await transaction.get(ref.collection("violations").doc(String(input.cursor)));
      if (!(cursor.data()?.issuedAt instanceof Timestamp)) throw new HttpsError("invalid-argument", "History cursor was not found.");
      query = query.startAfter(cursor.data()!.issuedAt, cursor.id);
    }
    const [snapshot, history, customer] = await Promise.all([
      transaction.get(ref), transaction.get(query), transaction.get(db.collection("users").doc(customerId)),
    ]);
    if (customer.data()?.role !== "customer") throw new HttpsError("failed-precondition", "A customer is required.");
    const state = readViolationState(snapshot.data());
    const now = Date.now();
    const restricted = !!state.restriction && state.restriction.untilMs > now;
    return {revision: state.revision, activeCount: activeStrikes(state, now).length,
      status: restricted ? "restricted" : activeStrikes(state, now).length === 2 ? "final_warning" :
        activeStrikes(state, now).length === 1 ? "warning" : "clear",
      observationStart: new Date(now - OBSERVATION_MS).toISOString(), observationEnd: new Date(now).toISOString(),
      restrictionExpiresAt: restricted ? new Date(state.restriction!.untilMs).toISOString() : null,
      nextCursor: history.size > 25 ? history.docs[24].id : null,
      records: history.docs.slice(0, 25).map(doc => {
        const data = doc.data();
        const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : null;
        return {id: doc.id, mainEventId: data.mainEventId, providerRequestIds: data.providerRequestIds,
          reason: data.reason, occurredAt: iso(data.occurredAt), issuedAt: iso(data.issuedAt),
          reversedAt: iso(data.reversedAt), reversalReason: data.reversalReason ?? null,
          restrictionStartedAt: iso(data.restrictionStartedAt), restrictionExpiresAt: iso(data.restrictionExpiresAt),
          reversedBy: data.reversedBy ?? null, consumedCycleId: data.consumedCycleId ?? null};
      })};
  });
});

export async function reverseCustomerViolation(actorId: string, input: Record<string, unknown>) {
  if (!validViolationId(input.customerId) || !validViolationId(input.strikeId) ||
    typeof input.reason !== "string" || input.reason.trim().length < 5 || input.reason.trim().length > 1000 ||
    !Number.isSafeInteger(input.expectedRevision)) throw new HttpsError("invalid-argument", "A strike, revision and audit reason (5–1000 characters) are required.");
  const {customerId, strikeId} = input;
  const reason = input.reason.trim();
  return db.runTransaction(async transaction => {
    const stateRef = db.collection("customerViolationStates").doc(customerId);
    const recordRef = stateRef.collection("violations").doc(strikeId);
    const [actor, customer, snapshot, record] = await Promise.all([
      transaction.get(db.collection("users").doc(actorId)), transaction.get(db.collection("users").doc(customerId)),
      transaction.get(stateRef), transaction.get(recordRef),
    ]);
    const admin = actor.data();
    if (admin?.role !== "admin" || admin.accountStatus !== "active" || admin.isActive !== true || admin.isBlocked === true) {
      throw new HttpsError("permission-denied", "An active administrator is required.");
    }
    if (customer.data()?.role !== "customer" || !record.exists) throw new HttpsError("not-found", "Customer violation was not found.");
    // A lost-response retry is safe even if its original expected revision is old.
    if (record.data()?.reversedAt != null) return {changed: false};
    const state = readViolationState(snapshot.data());
    if (state.revision !== input.expectedRevision) throw new HttpsError("aborted", "Violation state changed. Refresh before reversing.", {reason: "REVISION_CONFLICT"});
    const next = reverseStrike(state, strikeId);
    transaction.update(recordRef, {reversedAt: serverTimestamp(), reversedBy: actorId, reversalReason: reason,
      revision: (record.data()?.revision ?? 1) + 1});
    writeViolationState(transaction, customerId, next);
    const lifted = !!state.restriction && !next.restriction && state.restriction.untilMs > Date.now();
    // Private reason is deliberately absent from notification and metadata.
    violationNotification(transaction, customerId, `${strikeId}_corrected`, "Booking violation corrected",
      lifted ? "An administrator corrected a booking violation. Your booking restriction has been lifted." :
        "An administrator corrected a booking violation. Your violation status has been updated.");
    writeAuditLogInTransaction(transaction, {actorId, actorRole: "admin", action: "customer_violation.reversed",
      targetCollection: "customerViolationStates", targetId: customerId, reason,
      before: {revision: state.revision}, after: {revision: next.revision}, metadata: {mainEventId: strikeId, restrictionLifted: lifted}});
    return {changed: true};
  });
}

export const reverseAdminCustomerViolation = onCall(appCheckCallableOptions, async request => {
  const actor = requireAuth(request);
  await requireRole(actor.uid, ["admin"]);
  return reverseCustomerViolation(actor.uid, inputRecord(request.data));
});

/** Explicit event-level recovery only: no scan, backfill or expiration mutation. */
export const retryAdminCustomerViolationAdjudication = onCall(appCheckCallableOptions, async request => {
  const actor = requireAuth(request);
  await requireRole(actor.uid, ["admin"]);
  const input = inputRecord(request.data);
  if (!validViolationId(input.mainEventId) || typeof input.reason !== "string" ||
    input.reason.trim().length < 5 || input.reason.trim().length > 1000) {
    throw new HttpsError("invalid-argument", "An event and private recovery reason are required.");
  }
  const mainEventId = input.mainEventId;
  await db.runTransaction(async transaction => {
    const admin = (await transaction.get(db.collection("users").doc(actor.uid))).data();
    if (admin?.role !== "admin" || admin.accountStatus !== "active" || admin.isActive !== true || admin.isBlocked === true) {
      throw new HttpsError("permission-denied", "An active administrator is required.");
    }
    writeAuditLogInTransaction(transaction, {actorId: actor.uid, actorRole: "admin",
      action: "customer_violation.recovery_requested", targetCollection: "mainEvents", targetId: mainEventId,
      reason: String(input.reason).trim()});
  });
  const result = await adjudicateCustomerExpiration(mainEventId);
  logger.info("Customer violation recovery completed.", {mainEventId, actorId: actor.uid, result});
  return {result};
});
