import {Timestamp} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {createNotificationWithIdInTransaction} from "../shared/notifications.js";
import {parseMainEventStatus, isMainEventStatusTransitionAllowed, isApprovedProviderForOperations} from "../shared/constants.js";
import {requireActiveProviderRequest, requireProviderRequestDocuments} from "../provider-requests/provider-request-relationship-integrity.js";
import {calculateMainEventRequestSummary, areAllAssignedProvidersAccepted} from "../provider-requests/recalculate-main-event-status.js";
import {readTrustedProviderRequestPaymentSetInTransaction} from "../payments/provider-request-payment-reader.js";
import {enforceRemainingBalanceDeadline} from "../payments/remaining-balance-enforcement.js";
import {remainingBalanceLifecyclePlan} from "../payments/remaining-balance-lifecycle-domain.js";
import {reconcileCheckoutAttempts} from "../payments/checkout-attempt-reconciliation.js";
import {paymentIdForProviderRequestChoice} from "../payments/payment-obligation.js";
import {classifyProviderRequestRefundPolicyEvidence, requireRefundEligibilityState} from "./booking-refund-policy.js";
import {effectiveBookingStageV3, frozenBookingPolicyTimingV3} from "./booking-policy-v3.js";

const secret = defineSecret("PAYMONGO_SECRET_KEY");
export const V3_SWEEP_LIMIT = 100;
const POLL_MS = 60_000;

/** Frozen event time defines truth; this transaction only materializes it. */
export async function materializeBookingLifecycleV3(providerRequestId: string, now: Date) {
  if (!Number.isFinite(now.getTime())) throw new Error("Lifecycle time is invalid.");
  const reference = db.collection("providerRequests").doc(providerRequestId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const request = snapshot.data();
    if (!request || request.remainingBalanceTimingSchemaVersion !== 3) return false;
    const timing = frozenBookingPolicyTimingV3(request);
    const retryAt = Timestamp.fromMillis(now.getTime() + POLL_MS);
    if (["cancelled", "completed", "in_progress"].includes(String(request.status))) {
      if (request.lifecycleNextTransitionAt != null) transaction.update(reference, {lifecycleNextTransitionAt: null});
      return false;
    }
    const classification = classifyProviderRequestRefundPolicyEvidence(request);
    if (classification.status === "invalid") throw new Error("Refund policy evidence is invalid.");
    const stage = effectiveBookingStageV3({request, now});
    if (stage === "blocked") {
      transaction.update(reference, {lifecycleNextTransitionAt: retryAt});
      return false;
    }
    if (stage === "upcoming") {
      transaction.update(reference, {lifecycleNextTransitionAt: Timestamp.fromDate(timing.preparationStartsAt)});
      return false;
    }
    const parentRef = db.collection("mainEvents").doc(String(request.mainEventId));
    const [parent, requests, provider] = await Promise.all([
      transaction.get(parentRef),
      transaction.get(db.collection("providerRequests").where("mainEventId", "==", request.mainEventId)),
      transaction.get(db.collection("providers").doc(String(request.providerId))),
    ]);
    if (!parent.exists || !provider.exists || provider.data()?.ownerId !== request.providerOwnerId) {
      throw new Error("Lifecycle ownership is invalid.");
    }
    if (!isApprovedProviderForOperations(provider.data()!)) {
      throw new Error("Lifecycle provider is not operationally eligible.");
    }
    const mainEvent = parent.data()!;
    const relations = requireProviderRequestDocuments({mainEventId: String(request.mainEventId), mainEvent, requests: requests.docs});
    requireActiveProviderRequest(relations, providerRequestId);
    const paymentSet = await readTrustedProviderRequestPaymentSetInTransaction({transaction, providerRequestId,
      providerRequest: request, mainEventId: String(request.mainEventId), customerId: String(request.customerId),
      providerId: String(request.providerId), mainEvent, invalid: () => {throw new Error("Lifecycle payment authority is invalid.");}});
    if (paymentSet.mode !== "p5" || !paymentSet.settlement.fullySettled || paymentSet.settlement.outstandingAmountInCentavos !== 0) {
      throw new Error("Lifecycle settlement requires reconciliation.");
    }
    const parentStatus = parseMainEventStatus(mainEvent.status);
    if (!parentStatus || !["confirmed", "in_progress"].includes(parentStatus)) {
      transaction.update(reference, {lifecycleNextTransitionAt: retryAt});
      return false;
    }
    const state = classification.status === "policy_backed" ? requireRefundEligibilityState(request, now) : null;
    const timestamp = serverTimestamp();
    if (stage === "preparation_started") {
      const oldStage = (request.refundEligibilityState as {currentStage?: unknown} | null)?.currentStage;
      transaction.update(reference, {preparationPeriodStartedAt: request.preparationPeriodStartedAt ?? Timestamp.fromDate(now),
        lifecycleReconciliationRequired: false,
        ...(state ? {refundEligibilityState: state} : {}), lifecycleNextTransitionAt: Timestamp.fromDate(timing.eventStartAt),
        updatedAt: timestamp});
      if (oldStage !== "preparation_started" && request.preparationPeriodStartedAt == null) {
        transaction.create(parentRef.collection("timeline").doc(`v3_preparation_${providerRequestId}`), {
          type: "preparation_started", title: "Preparation Period", description: "Your booking entered its Preparation Period.",
          createdAt: timestamp, createdByRole: "system", providerRequestId, providerId: request.providerId, status: "confirmed",
        });
        for (const userId of [String(request.customerId), String(request.providerOwnerId)]) {
          createNotificationWithIdInTransaction(transaction, `v3_preparation_${providerRequestId}_${userId}`,
            {userId, title: "Preparation Period started", message: "Your booking has entered its Preparation Period.",
              type: "booking", relatedId: providerRequestId, relatedCollection: "providerRequests"});
        }
        writeAuditLogInTransaction(transaction, {actorId: "feasta", actorRole: "system", action: "booking.preparation_automatic",
          targetCollection: "providerRequests", targetId: providerRequestId,
          after: {stage}, metadata: {scheduledBoundary: timing.preparationStartsAt.toISOString()}});
      }
      return true;
    }
    const currentSummary = calculateMainEventRequestSummary(relations.activeRequests, parentStatus);
    if (!areAllAssignedProvidersAccepted(currentSummary)) {
      transaction.update(reference, {lifecycleNextTransitionAt: retryAt});
      return false;
    }
    const summary = calculateMainEventRequestSummary(relations.activeRequests, parentStatus,
      [{providerRequestId, status: "in_progress"}]);
    if (summary.status !== parentStatus && !isMainEventStatusTransitionAllowed(parentStatus, summary.status)) {
      throw new Error("Automatic lifecycle transition is invalid.");
    }
    transaction.update(reference, {status: "in_progress", startedAt: Timestamp.fromDate(timing.eventStartAt),
      lifecycleReconciliationRequired: false,
      lifecycleMaterializedAt: timestamp, lifecycleNextTransitionAt: null, statusUpdatedAt: timestamp,
      ...(state ? {refundEligibilityState: state} : {}), updatedAt: timestamp});
    transaction.update(parentRef, {...summary, updatedAt: timestamp,
      ...(summary.status !== parentStatus ? {statusUpdatedAt: timestamp} : {}),
      ...(parentStatus !== "in_progress" ? {startedAt: Timestamp.fromDate(timing.eventStartAt)} : {})});
    for (const userId of [String(request.customerId), String(request.providerOwnerId)]) {
      createNotificationWithIdInTransaction(transaction, `v3_event_start_${providerRequestId}_${userId}`,
        {userId, title: "Event is now In Progress", message: "Your event is now In Progress.",
          type: "booking", relatedId: providerRequestId, relatedCollection: "providerRequests"});
    }
    transaction.create(parentRef.collection("timeline").doc(`v3_event_start_${providerRequestId}`), {
      type: "in_progress", title: "Event In Progress", description: "The scheduled event start was reached with the booking clear.",
      createdAt: timestamp, createdByRole: "system", providerRequestId, providerId: request.providerId, status: "in_progress",
    });
    writeAuditLogInTransaction(transaction, {actorId: "feasta", actorRole: "system", action: "booking.service_start_automatic",
      targetCollection: "providerRequests", targetId: providerRequestId, before: {status: request.status},
      after: {status: "in_progress"}, metadata: {eventStartAt: timing.eventStartAt.toISOString()}});
    return true;
  });
}

export async function materializeBalanceLifecycleV3(providerRequestId: string, now: Date) {
  const reference = db.collection("providerRequests").doc(providerRequestId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const request = snapshot.data();
    if (!request || request.remainingBalanceTimingSchemaVersion !== 3) return;
    const timing = frozenBookingPolicyTimingV3(request);
    const classification = classifyProviderRequestRefundPolicyEvidence(request);
    const locked = classification.status === "invalid" || request.activeCancellationRequestId != null ||
      request.approvedCancellationRequestId != null || (request.refundEligibilityState as {activeCancellationRequestId?: unknown} | null)?.activeCancellationRequestId != null;
    const finished = request.remainingBalanceEnforcement?.status === "refunded" || request.remainingBalanceStatus === "paid" ||
      request.initialPaymentChoice === "full" || request.remainingBalanceStatus === "not_applicable";
    const plan = !locked && request.status === "confirmed" ? remainingBalanceLifecyclePlan({providerRequestId, providerRequest: request, now}) : null;
    const next = finished ? null : now < timing.remainingBalanceDueAt ? timing.remainingBalanceDueAt :
      now < timing.hardPaymentDeadlineAt ? timing.hardPaymentDeadlineAt : new Date(now.getTime() + POLL_MS);
    const notifyDue = !locked && request.status === "confirmed" && request.initialPaymentChoice === "minimum" &&
      Number(request.outstandingAmountInCentavos) > 0 && now >= timing.remainingBalanceDueAt &&
      now < timing.hardPaymentDeadlineAt && request.remainingBalanceDueNotifiedAt == null;
    transaction.update(reference, {remainingBalanceNextCheckAt: next ? Timestamp.fromDate(next) : null,
      ...(notifyDue ? {remainingBalanceDueNotifiedAt: serverTimestamp()} : {}),
      ...(plan ? {remainingBalanceStatus: plan.nextStatus} : {})});
    if (notifyDue) transaction.create(db.collection("mainEvents").doc(String(request.mainEventId)).collection("timeline").doc(`v3_balance_due_${providerRequestId}`), {
      type: "remaining_balance_due", title: "Remaining balance due", description: "Your remaining balance is due. The final payment deadline is 24 hours before the event.",
      createdAt: serverTimestamp(), createdByRole: "system", providerRequestId, providerId: request.providerId, status: "confirmed",
    });
    if (notifyDue) createNotificationWithIdInTransaction(transaction, `v3_balance_due_${providerRequestId}`,
      {userId: String(request.customerId), title: "Remaining balance due",
        message: `Your remaining balance of ${new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(Number(request.outstandingAmountInCentavos) / 100)} is now due. Pay by ${timing.hardPaymentDeadlineAt.toLocaleString("en-PH", {timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true})} to keep your booking confirmed.`, type: "payment",
        relatedId: providerRequestId, relatedCollection: "providerRequests", metadata: {hardPaymentDeadlineAt: timing.hardPaymentDeadlineAt.toISOString()}});
  });
}

/** Two single-field range queries, each bounded; no full-collection scan. */
export const reconcileBookingPolicyV3 = onSchedule({schedule: "every 1 minutes", timeZone: "Asia/Manila",
  region: "asia-southeast1", retryCount: 2, secrets: [secret]}, async () => {
  const now = new Date(Date.now());
  for (const field of ["remainingBalanceNextCheckAt", "lifecycleNextTransitionAt"] as const) {
    const candidates = await db.collection("providerRequests").where(field, "<=", Timestamp.fromDate(now))
      .orderBy(field).limit(V3_SWEEP_LIMIT).get();
    for (const candidate of candidates.docs) {
      try {
        if (candidate.data().remainingBalanceTimingSchemaVersion !== 3) continue;
        if (field === "remainingBalanceNextCheckAt") {
          if (["on_hold", "reconciliation_required"].includes(String(candidate.data().remainingBalanceEnforcement?.status))) {
            await reconcileCheckoutAttempts({paymentId: paymentIdForProviderRequestChoice(candidate.id, "remaining_balance"), secretKey: secret.value()});
          }
          await enforceRemainingBalanceDeadline(candidate.id, now);
          await materializeBalanceLifecycleV3(candidate.id, now);
        } else await materializeBookingLifecycleV3(candidate.id, now);
      } catch (error) {
        logger.error("V3 lifecycle reconciliation failed.", {providerRequestId: candidate.id, error: String(error)});
        // Rotate failed records behind other due candidates without authorizing any financial transition.
        await db.runTransaction(async (transaction) => {
          const latest = await transaction.get(candidate.ref);
          if (latest.data()?.remainingBalanceTimingSchemaVersion === 3) transaction.update(candidate.ref,
            {[field]: Timestamp.fromMillis(now.getTime() + POLL_MS), lifecycleReconciliationRequired: true});
        });
      }
    }
  }
});
