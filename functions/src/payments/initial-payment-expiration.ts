import {Timestamp} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {createNotificationWithIdInTransaction} from "../shared/notifications.js";
import {parseMainEventStatus, isMainEventStatusTransitionAllowed} from "../shared/constants.js";
import {requireProviderRequestDocuments, requireActiveProviderRequest} from "../provider-requests/provider-request-relationship-integrity.js";
import {calculateMainEventRequestSummary} from "../provider-requests/recalculate-main-event-status.js";
import {existingAcceptancePlan} from "../provider-requests/existing-acceptance-plan.js";
import {originalInitialPaymentDeadline} from "./initial-payment-reservation.js";
import {paymentIdForProviderRequest} from "./payment-lifecycle.js";
import {paymentIdForProviderRequestChoice} from "./payment-obligation.js";
import {readInitialPaymentRollout} from "./initial-payment-rollout.js";

type RecordData = Readonly<Record<string, unknown>>;
export const INITIAL_EXPIRATION_SWEEP_LIMIT = 25;
export const INITIAL_EXPIRATION_REASON = "no_attempt_original_deadline_elapsed";
export const INITIAL_EXPIRATION_WORK_MS = 5000;
export const INITIAL_EXPIRATION_CYCLE_PAUSE_MS = 5 * 60 * 1000;
type WorkBudget = {remaining: () => boolean; checkpoint?: () => boolean;
  pageLimit?: number; maxEventRequests?: number;
  onPage?: (result: {scanned: number; completed: number}) => void};

/** All identities supported by the payment write protocol, including legacy. */
export function initialExpirationPaymentIds(id: string): string[] {
  return [paymentIdForProviderRequest(id), ...(["minimum", "full", "remaining_balance"] as const)
    .map(choice => paymentIdForProviderRequestChoice(id, choice))];
}

function locked(data: RecordData): boolean {
  const state = data.refundEligibilityState as RecordData | null;
  return data.reconciliationRequired === true || data.lifecycleReconciliationRequired === true ||
    data.refundExecutionLock != null || data.activeCancellationRequestId != null ||
    data.approvedCancellationRequestId != null || state?.activeCancellationRequestId != null ||
    data.remainingBalanceEnforcement != null;
}

export function initialExpirationDecision(request: RecordData, now: Date):
  {kind: "skip"} | {kind: "waiting"} | {kind: "review"; reason: string} | {kind: "candidate"; deadline: Timestamp} {
  if (!Number.isFinite(now.getTime())) throw new Error("Expiration time is invalid.");
  if (!["accepted", "waiting_for_down_payment"].includes(String(request.status)) || locked(request) ||
    request.initialPaymentReview != null ||
    ["paid", "partially_paid", "partially_refunded", "refunded"].includes(String(request.paymentStatus))) return {kind: "skip"};
  let deadline: Timestamp;
  try {
    deadline = originalInitialPaymentDeadline(request);
    if ((request.acceptedAt as Timestamp).toMillis() > now.getTime()) throw new Error("Future acceptance.");
  } catch { return {kind: "review", reason: "initial_payment_deadline_invalid"}; }
  if (now.getTime() < deadline.toMillis()) return {kind: "waiting"};
  if (request.initialPaymentWriteProtocolVersion !== 1 || !(request.createdAt instanceof Timestamp) ||
    request.createdAt.toMillis() > (request.acceptedAt as Timestamp).toMillis()) {
    return {kind: "review", reason: "initial_payment_protocol_unproven"};
  }
  if (request.paymentStatus !== "unpaid" || ["initialPaymentDispatchReservedAt", "paymentId", "initialPaymentId",
    "initialPaymentChoice", "initialPaymentSelectedAt", "remainingBalancePaymentId", "settlementSchemaVersion",
    "settlementStatus", "grossSettledAmountInCentavos", "outstandingAmountInCentavos", "paidAt", "refundedAt",
    "paymongoCheckoutId", "paymongoPaymentId", "paymongoPaymentIntentId", "checkoutUrl"]
    .some(field => request[field] != null)) return {kind: "review", reason: "initial_payment_evidence_present"};
  if (["refundAmount", "refundedAmount", "refundedAmountInCentavos"].some(field =>
    request[field] != null && request[field] !== 0) ||
    ["paymongoResourceId", "paymongoPaymentIds", "paymongoPaymentIntentIds", "checkoutCreationStatus"]
      .some(field => request[field] != null)) return {kind: "review", reason: "initial_payment_evidence_present"};
  try {
    // Validate immutable financial, eligibility and refund evidence using the existing recovery contract.
    // Validation at original acceptance is not a recovery/write and cannot renew the hold.
    existingAcceptancePlan({...request, status: "accepted", expiresAt: deadline}, (request.acceptedAt as Timestamp).toDate());
    if (typeof request.amount !== "number" || !Number.isFinite(request.amount) ||
      typeof request.downPaymentAmount !== "number" || !Number.isFinite(request.downPaymentAmount) ||
      request.downPaymentAmount <= 0 || request.downPaymentAmount > request.amount) throw new Error("Invalid upfront obligation.");
  } catch { return {kind: "review", reason: "initial_payment_frozen_evidence_invalid"}; }
  return {kind: "candidate", deadline};
}

/** No HTTP, money movement or financial status changes. Every authority is read again here. */
export async function expireNeverAttemptedInitialPayment(providerRequestId: string, now: Date,
  budget: WorkBudget = {remaining: () => true}): Promise<string> {
  if (!budget.remaining()) return "budget";
  const reference = db.collection("providerRequests").doc(providerRequestId);
  return db.runTransaction(async transaction => {
    if (!budget.remaining()) return "budget";
    const rollout = await readInitialPaymentRollout(transaction);
    if (!rollout.expirationEnabled) return "disabled";
    const request = (await transaction.get(reference)).data();
    if (!request) return "skip";
    if (!budget.remaining()) return "budget";
    // Historical scanning is a separate, explicit operation, never implicit migration.
    if (request.initialPaymentWriteProtocolVersion !== 1 && !rollout.historicalReviewEnabled) return "historical_disabled";
    const decision = initialExpirationDecision(request, now);
    if (decision.kind === "skip" || decision.kind === "waiting") return decision.kind;
    const mainEventId = request.mainEventId;
    if (typeof mainEventId !== "string" || !mainEventId || mainEventId.includes("/") ||
      typeof request.providerId !== "string" || !request.providerId || request.providerId.includes("/")) return "invalid_relationship";
    const parentRef = db.collection("mainEvents").doc(mainEventId);
    const providerRef = db.collection("providers").doc(request.providerId);
    const [parent, siblings, provider] = await Promise.all([
      transaction.get(parentRef),
      transaction.get(budget.maxEventRequests
        ? db.collection("providerRequests").where("mainEventId", "==", mainEventId).limit(budget.maxEventRequests + 1)
        : db.collection("providerRequests").where("mainEventId", "==", mainEventId)),
      transaction.get(providerRef),
    ]);
    const mainEvent = parent.data();
    if (budget.maxEventRequests && siblings.size > budget.maxEventRequests) {
      logger.warn("Initial expiration requires membership reconciliation.", {providerRequestId, reason: "membership_limit"});
      return "membership_limit";
    }
    if (!mainEvent || locked(mainEvent) || !provider.exists ||
      typeof request.customerId !== "string" || !request.customerId ||
      typeof request.providerOwnerId !== "string" || !request.providerOwnerId ||
      provider.data()?.ownerId !== request.providerOwnerId) return "invalid_relationship";
    const parentStatus = parseMainEventStatus(mainEvent.status);
    if (!parentStatus || ["completed", "cancelled", "expired"].includes(parentStatus)) return "skip";
    const relations = requireProviderRequestDocuments({mainEventId, mainEvent, requests: siblings.docs});
    requireActiveProviderRequest(relations, providerRequestId);
    const review = (reason: string) => {
      transaction.update(reference, {initialPaymentReview: {schemaVersion: 1, reason, recordedAt: serverTimestamp()}});
      writeAuditLogInTransaction(transaction, {actorId: "feasta", actorRole: "system",
        action: "initial_payment.review_required", targetCollection: "providerRequests", targetId: providerRequestId,
        reason, metadata: {mainEventId}});
      return "review";
    };
    if (!budget.remaining()) return "budget";
    if (decision.kind === "review") return review(decision.reason);
    const paymentRefs = initialExpirationPaymentIds(providerRequestId).map(id => db.collection("payments").doc(id));
    const evidence = await Promise.all([
      ...paymentRefs.map(payment => transaction.get(payment)),
      ...paymentRefs.flatMap(payment => ["checkoutAttempts", "gatewayPayments", "refunds", "events"]
        .map(collection => transaction.get(payment.collection(collection).limit(1)))),
      transaction.get(db.collection("payments").where("providerRequestId", "==", providerRequestId).limit(1)),
      transaction.get(db.collection("providerRequestCancellationRequests").where("providerRequestId", "==", providerRequestId).limit(1)),
    ]);
    if (!budget.remaining()) return "budget";
    // Direct identities cover incorrectly linked and orphan resources. The protocol from birth supplies
    // completeness; a query returning no documents by itself is deliberately insufficient.
    if (evidence.some(snapshot => "exists" in snapshot ? snapshot.exists : !snapshot.empty)) {
      return review("initial_payment_or_dispatch_evidence_present");
    }
    const summary = calculateMainEventRequestSummary(relations.activeRequests, parentStatus,
      [{providerRequestId, status: "expired"}]);
    if (summary.status !== parentStatus && !isMainEventStatusTransitionAllowed(parentStatus, summary.status)) {
      return review("initial_payment_parent_transition_blocked");
    }
    const timestamp = serverTimestamp();
    transaction.update(reference, {status: "expired", expiredAt: decision.deadline,
      initialPaymentExpiredAt: decision.deadline, initialPaymentExpirationReason: INITIAL_EXPIRATION_REASON,
      initialPaymentExpirationRecordedAt: timestamp, lifecycleNextTransitionAt: null, remainingBalanceNextCheckAt: null,
      statusUpdatedAt: timestamp, updatedAt: timestamp});
    // Same provider serialization document used by acceptance and calendar updates.
    transaction.update(providerRef, {availabilityReservationUpdatedAt: timestamp});
    transaction.update(parentRef, {...summary, updatedAt: timestamp,
      ...(summary.status !== parentStatus ? {statusUpdatedAt: timestamp} : {})});
    const identity = `initial_expiration_${providerRequestId}`;
    transaction.create(parentRef.collection("timeline").doc(identity), {type: "initial_payment_expired",
      title: "Payment window expired", description: "The original initial-payment deadline passed without any recorded payment attempt.",
      providerRequestId, providerId: request.providerId, status: "expired", createdAt: timestamp, createdByRole: "system"});
    for (const [role, userId, title, message] of [
      ["customer", request.customerId, "Payment window expired",
        "Your payment window for this provider service has expired. You can submit a new booking request, subject to availability."],
      ["provider", request.providerOwnerId, "Unpaid booking request expired",
        "The initial-payment deadline passed without any recorded payment attempt. The temporary reservation has been released."],
    ]) createNotificationWithIdInTransaction(transaction, `${identity}_${role}`, {userId, title, message,
      type: "booking", relatedId: providerRequestId, relatedCollection: "providerRequests", metadata: {mainEventId, providerRequestId}});
    writeAuditLogInTransaction(transaction, {actorId: "feasta", actorRole: "system", action: "initial_payment.expired",
      targetCollection: "providerRequests", targetId: providerRequestId, reason: INITIAL_EXPIRATION_REASON,
      before: {status: request.status}, after: {status: "expired"},
      metadata: {mainEventId, originalDeadline: decision.deadline.toDate().toISOString(), protocolVersion: 1}});
    return "expired";
  }, {maxAttempts: 2});
}

/** One bounded page per invocation, including null expiresAt records. CAS cursor prevents stale
 * overlapping invocations from rewinding an advanced cursor. Individual request transactions arbitrate writes.
 */
export async function sweepInitialPaymentExpiration(now: Date,
  budget: WorkBudget = (() => {
    const deadline = performance.now() + INITIAL_EXPIRATION_WORK_MS;
    return {remaining: () => performance.now() < deadline - 1000, checkpoint: () => performance.now() < deadline};
  })()): Promise<void> {
  if (!budget.remaining()) return;
  const rollout = await readInitialPaymentRollout();
  if (!rollout.expirationEnabled || !budget.remaining()) return;
  const cursorRef = db.collection("bookingLifecycleCursors").doc("initial_payment_expiration_v1");
  const before = (await cursorRef.get()).data();
  if (!budget.remaining()) return;
  if (before?.nextSweepAt instanceof Timestamp && now.getTime() < before.nextSweepAt.toMillis()) return;
  const cursor = typeof before?.lastRequestId === "string" ? before.lastRequestId : null;
  const generation = before?.generation ?? 0;
  const pageLimit = Math.min(INITIAL_EXPIRATION_SWEEP_LIMIT, budget.pageLimit ?? INITIAL_EXPIRATION_SWEEP_LIMIT);
  let query = db.collection("providerRequests").where("status", "in", ["accepted", "waiting_for_down_payment"])
    .orderBy("__name__").limit(pageLimit);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  // Empty idle sweeps have no continuation to advance and must not create a write every minute.
  if (page.size === 0 && cursor === null) return;
  let lastProcessed: string | null = null;
  let completed = 0;
  for (const candidate of page.docs) {
    if (!budget.remaining()) break;
    try {
      const snapshot = candidate.data();
      // Snapshot checks only skip work; all writes still reread settings and evidence transactionally.
      const skip = snapshot.initialPaymentReview != null ||
        (snapshot.initialPaymentWriteProtocolVersion !== 1 && !rollout.historicalReviewEnabled);
      const result = skip ? "skip" : await expireNeverAttemptedInitialPayment(candidate.id, now, budget);
      if (result === "disabled") return;
      if (result === "budget") break;
    }
    catch (error) { logger.error("Initial payment expiration blocked.", {providerRequestId: candidate.id, error: String(error)}); }
    // Failed records remain eligible on wraparound; no partially attempted ID is lost forever.
    lastProcessed = candidate.id;
    completed++;
  }
  const checkpoint = budget.checkpoint ?? budget.remaining;
  budget.onPage?.({scanned: page.size, completed});
  if (!checkpoint() || (page.size > 0 && completed === 0)) return;
  const wrapped = completed === page.size && page.size < pageLimit;
  await db.runTransaction(async transaction => {
    if (!checkpoint() || !(await readInitialPaymentRollout(transaction)).expirationEnabled) return;
    const latest = (await transaction.get(cursorRef)).data();
    if ((latest?.generation ?? 0) !== generation) return;
    if (!checkpoint()) return;
    transaction.set(cursorRef, {lastRequestId: wrapped ? null : lastProcessed,
      nextSweepAt: wrapped ? Timestamp.fromMillis(now.getTime() + INITIAL_EXPIRATION_CYCLE_PAUSE_MS) : null,
      generation: generation + 1, updatedAt: serverTimestamp()});
  }, {maxAttempts: 2});
}
