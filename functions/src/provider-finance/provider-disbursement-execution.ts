import {writeAuditLogInTransaction} from "../shared/audit.js";
import {db} from "../shared/firestore.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {readTrustedProviderRequestPaymentSetInTransaction} from "../payments/provider-request-payment-reader.js";
import {
  aggregateReservationPlan, aggregateOutcomePlan, assertTransferEvidence, type TransferEvidence,
} from "./provider-disbursement-domain.js";
import {providerSettlementCapability} from "./provider-settlement-capability.js";
import {providerDisbursementTransport, type ProviderDisbursementTransport} from "./provider-disbursement-transport.js";
import {isProviderDisbursementTestAllowed} from "./provider-disbursement-transport.js";

type Data = Record<string, unknown>;
const ref = (collection: string, id: unknown) => {
  if (typeof id !== "string" || !/^[A-Za-z0-9:_-]{1,220}$/u.test(id)) throw new Error("Invalid payout identity.");
  return db.collection(collection).doc(id);
};
/** All constituent reservations and the sole external attempt commit together. */
export async function reserveProviderDisbursement(id: string,
  transport: ProviderDisbursementTransport = providerDisbursementTransport) {
  const now = new Date();
  return db.runTransaction(async transaction => {
    const reference = ref("providerDisbursements", id);
    const snapshot = await transaction.get(reference);
    const d = snapshot.data();
    if (!d || d.disbursementId !== id || d.schemaVersion !== 1 || d.status !== "ready") throw new Error("Disbursement not ready.");
    if (!d.payoutEligibleAt?.toDate || d.payoutEligibleAt.toDate().getTime() > now.getTime()) throw new Error("Banking-day hold active.");
    const [settingsSnapshot, accountSnapshot, requestSnapshot, eventSnapshot] = await Promise.all([
      transaction.get(ref("appSettings", "platform")), transaction.get(ref("providerPaymentAccounts", d.providerId)),
      transaction.get(ref("providerRequests", d.providerRequestId)), transaction.get(ref("mainEvents", d.mainEventId)),
    ]);
    const settings = settingsSnapshot.data() ?? {};
    if (settings.providerDisbursementsEnabled !== true) throw new Error("platform_disbursements_disabled");
    if (!isProviderDisbursementTestAllowed(settings, d.disbursementId)) {
      throw new Error("paymongo_test_disbursement_not_allowed");
    }
    const account = accountSnapshot.data() ?? {};
    const capability = providerSettlementCapability(account);
    if (account.providerId !== d.providerId || !capability.transportReady) throw new Error(`provider_${capability.reason}`);
    const verified = transport.capability(account, settings);
    if (!verified.ready) throw new Error(verified.reason);
    if (verified.transportMode !== capability.transportMode) throw new Error("Transport verification mismatch.");
    const request = requestSnapshot.data() ?? {};
    if (request.financialSnapshot?.providerDisbursementPolicyVersion !== 1 || !eventSnapshot.exists) throw new Error("Policy enrollment invalid.");
    if (d.trigger === "completed_booking") {
      if (request.status !== "completed" || request.completedAt?.toMillis() !== d.completedBookingAt?.toMillis()) throw new Error("Completion authority invalid.");
      const trusted = await readTrustedProviderRequestPaymentSetInTransaction({transaction,
        providerRequestId: String(d.providerRequestId), providerRequest: request, mainEventId: String(d.mainEventId),
        mainEvent: eventSnapshot.data() ?? {}, providerId: String(d.providerId), customerId: String(d.customerId),
        invalid: () => {throw new Error("Canonical payout payment authority invalid.");}});
      if (trusted.mode !== "p5" || !trusted.settlement.fullySettled ||
          JSON.stringify([...trusted.settlement.settledPaymentIds].sort()) !== JSON.stringify([...d.sourcePaymentIds].sort())) {
        throw new Error("Canonical customer obligation unresolved.");
      }
    } else if (d.trigger === "payment_default_compensation") {
      if (!Array.isArray(d.sourcePaymentIds) || d.sourcePaymentIds.length !== 1 ||
          d.sourcePaymentIds[0] !== request.initialPaymentId ||
          d.amountInCentavos !== request.providerReservationCompEarnedInCentavos ||
          request.paymentDefaultAccountingSchemaVersion !== 1 ||
          request.paymentDefaultAccountingFinalizedAt?.toMillis() !== d.financialFinalizedAt?.toMillis() ||
          request.status !== "cancelled" || request.cancellationReason !== "remaining_balance_unpaid_at_deadline") {
        throw new Error("Compensation authority invalid.");
      }
    } else throw new Error("Invalid payout trigger.");
    const settlementRefs = (d.sourceSettlementIds as unknown[]).map(value => ref("providerSettlements", value));
    const settlementSnapshots = await transaction.getAll(...settlementRefs);
    const settlements = settlementSnapshots.map(s => {if (!s.exists) throw new Error("Settlement missing."); return s.data() as Data;});
    const earningRefs = settlements.map(s => ref("providerEarnings", s.earningId));
    const paymentRefs = settlements.map(s => ref("payments", s.paymentId));
    const [earnings, payments] = await Promise.all([transaction.getAll(...earningRefs), transaction.getAll(...paymentRefs)]);
    const sources = settlements.map((settlement, index) => {
      if (!earnings[index].exists || !payments[index].exists || settlement.paymentId !== d.sourcePaymentIds[index]) throw new Error("Finance source missing.");
      const earning = earnings[index].data() as Data; const payment = payments[index].data() as Data;
      if (d.trigger === "payment_default_compensation" &&
          (earning.economicSource !== "payment_default_reservation_compensation" || payment.paymentDefaultAccountingSchemaVersion !== 1 ||
           (payment.paymentDefaultAccountingFinalizedAt as {toMillis?: () => number} | undefined)?.toMillis?.() !== d.financialFinalizedAt?.toMillis())) throw new Error("Compensation payment not finalized.");
      return {settlement, earning, payment};
    });
    const plan = aggregateReservationPlan({disbursement: d, sources, timestamp: serverTimestamp(),
      dispatchEnabled: true, destinationSnapshot: verified.destinationSnapshot, transportMode: verified.transportMode});
    const attemptRef = ref("providerDisbursementAttempts", plan.externalAttempt.externalAttemptId);
    const memberRefs = plan.reservations.map(r => ref("providerPayoutAttempts", r.payoutAttemptId));
    const existing = await transaction.getAll(attemptRef, ...memberRefs);
    if (existing.some(s => s.exists)) throw new Error("Attempt already exists.");
    // No writes until all sources, destination and identities have been validated.
    plan.reservations.forEach((r, index) => {
      transaction.update(settlementRefs[r.sourceIndex], r.settlementUpdate);
      transaction.update(earningRefs[r.sourceIndex], r.earningUpdate);
      transaction.create(memberRefs[index], r.payoutAttemptRecord);
    });
    transaction.create(attemptRef, plan.externalAttempt);
    transaction.update(reference, plan.disbursementUpdate);
    return plan.externalAttempt;
  });
}
/** Internal trusted gateway boundary, never exported as a client callable. */
export async function applyProviderDisbursementEvidence(attemptId: string, evidence?: TransferEvidence) {
  return db.runTransaction(async transaction => {
    const attemptRef = ref("providerDisbursementAttempts", attemptId);
    const attemptSnapshot = await transaction.get(attemptRef);
    const attempt = attemptSnapshot.data();
    if (!attempt || attempt.externalAttemptId !== attemptId) throw new Error("Unknown external payout attempt.");
    if (evidence) {
      assertTransferEvidence(attempt, evidence);
      // A webhook may omit optional identifiers learned from create/retrieve.
      // Preserve them, but never allow a conflicting identifier to replace one.
      evidence = {...evidence};
      for (const key of ["provider_reference_number", "batch_transfer_id"] as const) {
        if (evidence[key] === undefined && attempt.gatewayEvidence?.[key] != null) {
          evidence[key] = attempt.gatewayEvidence[key];
        }
      }
    }
    const dRef = ref("providerDisbursements", attempt.providerDisbursementId);
    const dSnapshot = await transaction.get(dRef);
    const d = dSnapshot.data();
    if (!d) throw new Error("Missing disbursement.");
    if (["succeeded", "failed"].includes(String(attempt.status))) {
      // Duplicate observations must match the persisted terminal evidence.
      const observed = evidence;
      if (!observed || !attempt.gatewayEvidence || observed.status !== attempt.status ||
          ["id", "status", "reference_number", "amount", "currency", "livemode"].some(
            key => (observed as unknown as Data)[key] !== attempt.gatewayEvidence[key]) ||
          ["number", "name", "bic"].some(key =>
            (observed.destination_account as unknown as Data)[key] !==
            attempt.gatewayEvidence.destination_account?.[key])) {
        throw new Error("Contradictory terminal evidence.");
      }
      if (["provider_reference_number", "batch_transfer_id"].some(
        key => attempt.gatewayEvidence[key] == null && (observed as unknown as Data)[key] != null)) {
        // Enrich trusted identifiers only; terminal accounting is never applied twice.
        transaction.update(attemptRef, {gatewayEvidence: observed});
      }
      return {duplicate: true, applied: false};
    }
    const settlementRefs = (attempt.sourceSettlementIds as unknown[]).map(id => ref("providerSettlements", id));
    const settlements = await transaction.getAll(...settlementRefs);
    const earningRefs = settlements.map(s => ref("providerEarnings", s.data()?.earningId));
    const memberRefs = (attempt.constituentPayoutAttemptIds as unknown[]).map(id => ref("providerPayoutAttempts", id));
    const [earnings, members] = await Promise.all([transaction.getAll(...earningRefs), transaction.getAll(...memberRefs)]);
    const plan = aggregateOutcomePlan({disbursement: d, attempt, evidence, timestamp: serverTimestamp(),
      sources: settlements.map((s, index) => {
        if (!s.exists || !earnings[index].exists || !members[index].exists) throw new Error("Missing reservation source.");
        return {settlement: s.data() as Data, earning: earnings[index].data() as Data,
          payment: {}, payoutAttempt: members[index].data() as Data};
      })});
    plan.plans.forEach((p, index) => {
      transaction.update(settlementRefs[index], p.settlementUpdate);
      transaction.update(earningRefs[index], p.earningUpdate);
      transaction.update(memberRefs[index], p.payoutAttemptUpdate);
    });
    transaction.update(attemptRef, plan.attemptUpdate);
    transaction.update(dRef, plan.disbursementUpdate);
    return {duplicate: false, applied: true};
  });
}
/** A transaction claims submission once. Crashes/unknown outcomes stay locked;
 * reconciliation retrieves evidence and never creates/resends an attempt. */
export async function dispatchProviderDisbursement(id: string,
  transport: ProviderDisbursementTransport = providerDisbursementTransport) {
  const attempt = await reserveProviderDisbursement(id, transport);
  try {
    const evidence = await transport.dispatch(attempt);
    return await applyProviderDisbursementEvidence(attempt.externalAttemptId, evidence ?? undefined);
  } catch {
    return applyProviderDisbursementEvidence(attempt.externalAttemptId);
  }
}
export async function reconcileProviderDisbursementAttempt(id: string,
  transport: ProviderDisbursementTransport = providerDisbursementTransport) {
  const snapshot = await ref("providerDisbursements", id).get();
  const d = snapshot.data();
  if (!d || !["reserved", "processing", "reconciliation_required"].includes(String(d.status)) || !d.activePayoutAttemptId) return;
  const attempt = (await ref("providerDisbursementAttempts", d.activePayoutAttemptId).get()).data();
  if (!attempt) throw new Error("External attempt missing.");
  const evidence = await transport.retrieve(attempt);
  if (evidence) await applyProviderDisbursementEvidence(String(attempt.externalAttemptId), evidence);
}

/** Controlled retry preparation is allowed only after recorded terminal failure.
 * The next reservation revalidates financial truth and generates a new sequence. */
export async function prepareFailedProviderDisbursementRetry(id: string, actorId?: string) {
  await db.runTransaction(async transaction => {
    const dRef = ref("providerDisbursements", id);
    const snapshot = await transaction.get(dRef);
    const d = snapshot.data();
    if (!d || d.status !== "failed" || d.activePayoutAttemptId != null) throw new Error("Only definitive failure may be retried.");
    const identity = (await import("./provider-disbursement-domain.js")).externalAttemptIdentity(id, d.attemptSequence);
    const attempt = (await transaction.get(ref("providerDisbursementAttempts", identity.externalAttemptId))).data();
    if (!attempt || attempt.status !== "failed" || attempt.gatewayEvidence?.status !== "failed" ||
        attempt.providerDisbursementId !== id) throw new Error("Authoritative failed attempt missing.");
    if (actorId) writeAuditLogInTransaction(transaction, {actorId, actorRole: "admin",
      action: "prepare_failed_provider_disbursement_retry", targetCollection: "providerDisbursements", targetId: id,
      before: {status: "failed", attemptSequence: d.attemptSequence}, after: {status: "held"},
      metadata: {externalAttemptId: identity.externalAttemptId}});
    transaction.update(dRef, {status: "held", holdReason: "retry_financial_revalidation_required",
      nextCheckAt: serverTimestamp(), updatedAt: serverTimestamp()});
  });
}
/** Operational dispatch check does not change financial readiness. */
export async function processReadyProviderDisbursement(id: string) {
  const [snapshot, settings] = await Promise.all([
    ref("providerDisbursements", id).get(), ref("appSettings", "platform").get(),
  ]);
  if (snapshot.data()?.status !== "ready" || settings.data()?.providerDisbursementsEnabled !== true) return;
  if (!isProviderDisbursementTestAllowed(settings.data() ?? {}, snapshot.data()?.disbursementId)) {
    return;
  }
  // Server-owned simulator capability remains separate from external dispatch permission.
  const account = (await ref("providerPaymentAccounts", snapshot.data()?.providerId).get()).data() ?? {};
  const capability = providerDisbursementTransport.capability(account, settings.data() ?? {});
  if (!capability.ready) return;
  await dispatchProviderDisbursement(id);
}
