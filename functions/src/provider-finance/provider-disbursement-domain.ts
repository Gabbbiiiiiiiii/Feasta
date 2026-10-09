import {createHash} from "node:crypto";
import {buildProviderSettlementPlan, reserveProviderSettlementPayout, completeProviderSettlementPayout,
  failProviderSettlementPayout, assertProviderSettlementPayoutOutcomeState} from "./provider-settlement-domain.js";

type Data = Record<string, unknown>;
export type DisbursementSource = {settlement: Data; earning: Data; payment: Data; payoutAttempt?: Data};
export function externalAttemptIdentity(disbursementId: string, sequence: number) {
  if (!/^[A-Za-z0-9_-]{1,220}$/u.test(disbursementId) || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Invalid external attempt identity.");
  }
  const id = `pd_${createHash("sha256").update(`${disbursementId}:${sequence}`).digest("hex").slice(0, 40)}`;
  return {externalAttemptId: id, referenceNumber: id, idempotencyKey: id};
}
export function aggregateReservationPlan(input: {
  disbursement: Data; sources: DisbursementSource[]; destinationSnapshot: Data;
  transportMode: string; timestamp: unknown; dispatchEnabled: boolean;
}) {
  const {disbursement: d, sources} = input;
  if (!input.dispatchEnabled) throw new Error("platform_disbursements_disabled");
  if (d.status !== "ready" || d.activePayoutAttemptId != null || d.currency !== "PHP" || d.policyVersion !== 1) {
    throw new Error("Disbursement is not ready for reservation.");
  }
  const ids = d.sourceSettlementIds as string[];
  if (!Array.isArray(ids) || !ids.length || ids.length !== sources.length || new Set(ids).size !== ids.length) {
    throw new Error("Invalid aggregate sources.");
  }
  if (!["wallet_transfer", "workflow"].includes(input.transportMode) || input.destinationSnapshot.livemode !== false) {
    throw new Error("Verified test-mode destination required.");
  }
  const sequence = Number(d.attemptSequence) + 1;
  const identity = externalAttemptIdentity(String(d.disbursementId), sequence);
  // Build every plan before writing anything. Constituent attempts are linkage
  // records only; exactly one external attempt owns dispatch for the aggregate.
  const reservations = sources.map((source, index) => {
    const {settlement: s, earning: e, payment: p} = source;
    if (s.settlementId !== ids[index] || s.providerId !== d.providerId ||
        s.providerRequestId !== d.providerRequestId || s.mainEventId !== d.mainEventId ||
        s.customerId !== d.customerId || e.providerRequestId !== d.providerRequestId ||
        e.mainEventId !== d.mainEventId || e.customerId !== d.customerId ||
        p.providerEarningSchemaVersion !== 1 || p.providerEarningId !== e.earningId ||
        p.paymentId !== s.paymentId || p.providerRequestId !== d.providerRequestId ||
        p.providerId !== d.providerId || p.mainEventId !== d.mainEventId || p.customerId !== d.customerId || p.currency !== "PHP" ||
        !Number.isSafeInteger(p.refundReservedAmountInCentavos ?? 0) ||
        Number(p.refundReservedAmountInCentavos ?? 0) !== 0 || p.refundExecutionLock != null ||
        p.reconciliationRequired === true || p.refundReconciliationRequired === true ||
        Number(s.paidOutAmountInCentavos) !== 0) throw new Error("Source money movement conflict.");
    // A fully reversed source is canonical evidence, but contains no payable
    // money to reserve. Keep it in the aggregate source snapshot, exclude it
    // from the external transfer's constituent monetary reservations.
    if (s.status === "cancelled" && s.netSettlementAmountInCentavos === 0) {
      const zero = buildProviderSettlementPlan({earningId: String(e.earningId), earning: e, timestamp: input.timestamp});
      if (zero.settlementRecord.netSettlementAmountInCentavos !== 0 || s.activePayoutAttemptId != null ||
          s.reservedAmountInCentavos !== 0 || s.reconciliationRequired === true || s.currency !== "PHP") {
        throw new Error("Invalid fully reversed settlement.");
      }
      return null;
    }
    const plan = reserveProviderSettlementPayout({settlement: s, earning: e, attemptSequence: sequence, timestamp: input.timestamp});
    return {...plan, sourceIndex: index, settlementUpdate: {...plan.settlementUpdate,
      externalAttemptId: identity.externalAttemptId, providerDisbursementId: d.disbursementId, externalDispatchAllowed: false},
      payoutAttemptRecord: {...plan.payoutAttemptRecord,
      externalAttemptId: identity.externalAttemptId, providerDisbursementId: d.disbursementId,
      externalDispatchAllowed: false}};
  }).filter(reservation => reservation !== null);
  const total = reservations.reduce((sum, r) => sum + r.payoutAttemptRecord.amountInCentavos, 0);
  if (!Number.isSafeInteger(total) || total <= 0 || total !== d.amountInCentavos) throw new Error("Aggregate amount changed.");
  const destination = structuredClone(input.destinationSnapshot);
  return {reservations, externalAttempt: {
    schemaVersion: 1, ...identity, providerDisbursementId: d.disbursementId,
    providerRequestId: d.providerRequestId, providerId: d.providerId,
    canonicalSourceSettlementIds: [...ids],
    sourceSettlementIds: reservations.map(r => ids[r.sourceIndex]), constituentPayoutAttemptIds: reservations.map(r => r.payoutAttemptId),
    attemptSequence: sequence, amountInCentavos: total, currency: "PHP",
    transportMode: input.transportMode, destinationSnapshot: destination,
    livemode: false, status: "reserved", gatewayResourceId: null,
    createdAt: input.timestamp, updatedAt: input.timestamp,
  }, disbursementUpdate: {status: "reserved", activePayoutAttemptId: identity.externalAttemptId,
    attemptSequence: sequence, destinationSnapshot: destination, transportMode: input.transportMode,
    livemode: false, updatedAt: input.timestamp}};
}
export type TransferEvidence = {
  id: string; reference_number: string; amount: number; currency: string;
  livemode: boolean; status: "pending" | "succeeded" | "failed";
  destination_account: {number: string; name: string; bic: string};
};
export function assertTransferEvidence(attempt: Data, evidence: TransferEvidence) {
  const destination = attempt.destinationSnapshot as Data;
  const expected = destination?.destinationAccount as Data;
  if (!evidence || !/^tr_[A-Za-z0-9_-]+$/u.test(evidence.id) ||
      !["pending", "succeeded", "failed"].includes(evidence.status) ||
      evidence.reference_number !== attempt.referenceNumber || evidence.amount !== attempt.amountInCentavos ||
      evidence.currency !== "PHP" || evidence.livemode !== false || attempt.livemode !== false ||
      (attempt.gatewayResourceId != null && evidence.id !== attempt.gatewayResourceId) ||
      !expected || !evidence.destination_account ||
      ["number", "name", "bic"].some(key => expected[key] !== (evidence.destination_account as unknown as Data)[key])) {
    throw new Error("Gateway payout evidence mismatch.");
  }
}
export function aggregateOutcomePlan(input: {
  disbursement: Data; attempt: Data; sources: DisbursementSource[];
  evidence?: TransferEvidence; timestamp: unknown;
}) {
  const {disbursement: d, attempt: a, evidence} = input;
  if (d.disbursementId !== a.providerDisbursementId || d.activePayoutAttemptId !== a.externalAttemptId ||
      !["reserved/reserved", "processing/processing", "reconciliation_required/ambiguous"].includes(`${d.status}/${a.status}`)) throw new Error("Inactive aggregate attempt.");
  if (evidence) assertTransferEvidence(a, evidence);
  if (!evidence && a.status === "ambiguous") throw new Error("Ambiguous attempt requires gateway evidence.");
  const ids = a.constituentPayoutAttemptIds as string[];
  const sourceIds = a.sourceSettlementIds as string[];
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.length !== input.sources.length ||
      !Array.isArray(sourceIds) || sourceIds.length !== ids.length || new Set(sourceIds).size !== sourceIds.length ||
      !Array.isArray(a.canonicalSourceSettlementIds) ||
      sourceIds.some(id => !(a.canonicalSourceSettlementIds as string[]).includes(id)) ||
      JSON.stringify(d.sourceSettlementIds) !== JSON.stringify(a.canonicalSourceSettlementIds) ||
      a.amountInCentavos !== d.amountInCentavos) throw new Error("Aggregate outcome linkage mismatch.");
  const plans = input.sources.map((source, index) => {
    const member = source.payoutAttempt;
    if (!member || member.payoutAttemptId !== ids[index] || member.externalAttemptId !== a.externalAttemptId ||
        member.providerDisbursementId !== d.disbursementId || member.externalDispatchAllowed !== false ||
        source.settlement.externalAttemptId !== a.externalAttemptId ||
        source.settlement.providerDisbursementId !== d.disbursementId || source.settlement.externalDispatchAllowed !== false ||
        source.settlement.settlementId !== (a.sourceSettlementIds as string[])[index] ||
        source.settlement.activePayoutAttemptId !== ids[index] ||
        member.amountInCentavos !== source.settlement.reservedAmountInCentavos) throw new Error("Constituent attempt mismatch.");
    const expectedSettlementStatus = a.status === "ambiguous" ? "reconciliation_required" : a.status;
    if (source.settlement.status !== expectedSettlementStatus || member.status !== a.status) {
      throw new Error("Constituent persisted state mismatch.");
    }
    assertProviderSettlementPayoutOutcomeState({...source, payoutAttempt: member});
    if (!evidence || evidence.status === "failed") return failProviderSettlementPayout({
      ...source, payoutAttempt: member, certainty: evidence ? "failed" : "ambiguous",
      failureCode: evidence ? "gateway_terminal_failure" : "gateway_outcome_unknown",
      failureMessage: null, timestamp: input.timestamp});
    if (evidence.status === "succeeded") return completeProviderSettlementPayout({
      settlement: source.settlement, earning: source.earning,
      payoutAttempt: member, timestamp: input.timestamp});
    return {settlementUpdate: {status: "processing", reconciliationRequired: false, reconciliationReason: null, updatedAt: input.timestamp},
      earningUpdate: {updatedAt: input.timestamp}, payoutAttemptUpdate: {status: "processing", updatedAt: input.timestamp}};
  });
  const total = input.sources.reduce((sum, s) => sum + Number(s.payoutAttempt?.amountInCentavos), 0);
  if (!Number.isSafeInteger(total) || total !== a.amountInCentavos) throw new Error("Constituent total mismatch.");
  const status = !evidence ? "reconciliation_required" : evidence.status === "succeeded" ? "paid" : evidence.status === "failed" ? "failed" : "processing";
  return {plans, disbursementUpdate: {status, updatedAt: input.timestamp,
    ...(status === "paid" ? {paidAt: input.timestamp} : {}),
    ...(["paid", "failed"].includes(status) ? {activePayoutAttemptId: null, lastPayoutAttemptId: a.externalAttemptId} : {}),
    gatewayResourceId: evidence?.id ?? a.gatewayResourceId},
  attemptUpdate: {status: !evidence ? "ambiguous" : evidence.status === "pending" ? "processing" : evidence.status,
    gatewayResourceId: evidence?.id ?? a.gatewayResourceId, updatedAt: input.timestamp,
    ...(evidence ? {gatewayEvidence: evidence,
      ...(evidence.status === "pending" ? {submittedAt: input.timestamp} : {completedAt: input.timestamp}),
      ...(evidence.status === "failed" ? {failureCode: "gateway_terminal_failure"} : {})
    } : {reconciliationReason: "gateway_outcome_unknown"})}};
}
