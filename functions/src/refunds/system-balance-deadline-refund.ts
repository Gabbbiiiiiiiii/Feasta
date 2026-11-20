import {db} from "../shared/firestore.js";
import {paymentDefaultAllocation} from "../bookings/booking-policy-v3.js";
import {paymentDefaultAccountingPlan} from "../payments/payment-default-accounting-domain.js";
import {buildSuccessfulRefundFinancialLedgerPlan} from "../payments/financial-ledger.js";
import {buildProviderEarningRefundPlan} from "../provider-finance/provider-earning-domain.js";
import {settlementIdForEarning} from "../provider-finance/provider-settlement-domain.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {readRefundAccounting, gatewayRefundIdempotencyKey} from "./refund-accounting-domain.js";
import {refundOperationKey} from "./refund-accounting.js";
import {createRefundOperationReservationPlan} from "./refund-operation-plan.js";
import type {TrustedProviderRequestPaymentSet} from "../payments/provider-request-payment-reader.js";
import {paymentIdForProviderRequestChoice} from "../payments/payment-obligation.js";
import {classifyProviderRequestRefundPolicyEvidence, requireRefundEligibilityState} from "../bookings/booking-refund-policy.js";

export const SYSTEM_BALANCE_REFUND_SOURCE = "system_balance_deadline_refund";

/** Special system policy. Never consult normal customer cancellation percentages. */
export function settledDepositRefundEvidence(input: {
  providerRequestId: string; providerRequest: Readonly<Record<string, unknown>>;
  paymentSet: TrustedProviderRequestPaymentSet;
}) {
  const {providerRequestId, providerRequest: request, paymentSet} = input;
  if (paymentSet.mode !== "p5" || request.initialPaymentChoice !== "minimum") throw invalid();
  const settlement = paymentSet.settlement;
  const paymentId = paymentIdForProviderRequestChoice(providerRequestId, "minimum");
  const initial = paymentSet.payments.find((payment) => payment.id === paymentId)?.data;
  const financial = request.financialSnapshot as Record<string, unknown> | undefined;
  const terms = financial?.packagePaymentTerms as Record<string, unknown> | undefined;
  const amount = financial?.requiredUpfrontAmountInCentavos;
  if (terms?.schemaVersion !== 2 || terms.paymentPolicy !== "deposit_then_balance" ||
    request.initialPaymentId !== paymentId || !initial || initial.status !== "paid" || initial.reconciliationRequired ||
    !Number.isSafeInteger(amount) || (amount as number) <= 0 || initial.amountInCentavos !== amount ||
    initial.currency !== "PHP" || !/^pay_[A-Za-z0-9_]+$/u.test(String(initial.paymongoResourceId)) ||
    settlement.grossSettledAmountInCentavos !== amount || settlement.settledPaymentIds.length !== 1 ||
    settlement.settledPaymentIds[0] !== paymentId || settlement.outstandingAmountInCentavos !== financial?.remainingBalanceInCentavos ||
    request.grossSettledAmountInCentavos !== amount || request.outstandingAmountInCentavos !== settlement.outstandingAmountInCentavos ||
    initial.refundExecutionLock != null) throw invalid();
  const accounting = readRefundAccounting(initial, amount as number);
  if (accounting.refundedAmountInCentavos !== 0 || accounting.refundReservedAmountInCentavos !== 0) throw invalid();
  return {paymentId, amountInCentavos: amount as number, gatewayPaymentId: initial.paymongoResourceId as string,
    payment: initial};
}

/** All reads and accounting checks precede cancellation and any gateway refund. */
export async function preflightPaymentDefaultAccounting(input: {
  transaction: FirebaseFirestore.Transaction; providerRequestId: string;
  providerRequest: Readonly<Record<string, unknown>>; evidence: ReturnType<typeof settledDepositRefundEvidence>;
}) {
  const {transaction, providerRequest: request, evidence} = input;
  if (request.remainingBalanceTimingSchemaVersion !== 3) return;
  const payment = evidence.payment;
  if (payment.providerEarningSchemaVersion !== 1 || typeof payment.providerEarningId !== "string" ||
    !/^[A-Za-z0-9_-]+$/u.test(payment.providerEarningId)) throw invalid();
  const [earningSnapshot, settlementSnapshot] = await transaction.getAll(
    db.collection("providerEarnings").doc(payment.providerEarningId),
    db.collection("providerSettlements").doc(settlementIdForEarning(payment.providerEarningId)));
  const earning = earningSnapshot.data();
  const settlement = settlementSnapshot.data();
  if (!earning || (settlement && (settlement.reconciliationRequired || settlement.activePayoutAttemptId != null ||
    settlement.reservedAmountInCentavos !== 0 || settlement.paidOutAmountInCentavos !== 0 ||
    !["awaiting_availability", "ready"].includes(String(settlement.status))))) throw invalid();
  const allocation = paymentDefaultAllocation(evidence.amountInCentavos);
  const ledger = buildSuccessfulRefundFinancialLedgerPlan({paymentId: evidence.paymentId,
    refundOperationId: "payment_default_preflight", mainEventId: String(request.mainEventId),
    providerRequestId: input.providerRequestId, providerId: String(request.providerId), customerId: String(request.customerId),
    refundAmountInCentavos: allocation.customerDefaultRefundAmountInCentavos, refundedBeforeInCentavos: 0,
    payment, providerRequest: request, source: "automatic_reconciliation", webhookEventId: null, timestamp: null});
  buildProviderEarningRefundPlan({paymentId: evidence.paymentId, earningId: payment.providerEarningId,
    earning, refundFinancialLedgerRecord: ledger.ledgerRecord, timestamp: null});
  paymentDefaultAccountingPlan({allocation, payment, request: {...request, status: "cancelled",
    cancellationReason: "remaining_balance_unpaid_at_deadline"}, earning,
    completedCustomerRefundInCentavos: allocation.customerDefaultRefundAmountInCentavos,
    proportionalCommissionReversedInCentavos: Number(ledger.paymentUpdate.commissionReversedInCentavos),
    timestamp: null, ledgerEntryId: "payment_default_preflight"});
}

/** Reserve the same operation-set contract consumed by executeRefund and refund webhooks. */
export async function reserveSystemDepositRefund(input: {
  transaction: FirebaseFirestore.Transaction; cancellationRequestId: string; providerRequestId: string;
  providerRequest: Readonly<Record<string, unknown>>; evidence: ReturnType<typeof settledDepositRefundEvidence>;
}) {
  const {transaction, cancellationRequestId, providerRequestId, providerRequest: request, evidence} = input;
  const paidDeposit = evidence.amountInCentavos;
  const allocation = request.remainingBalanceTimingSchemaVersion === 3 ? paymentDefaultAllocation(paidDeposit) : null;
  const amount = allocation?.customerDefaultRefundAmountInCentavos ?? paidDeposit;
  const operationKey = refundOperationKey({cancellationRequestId, logicalOperationKey: SYSTEM_BALANCE_REFUND_SOURCE});
  const plan = createRefundOperationReservationPlan({cancellationRequestId, operationKey, allocation: {
    requestedAmountInCentavos: amount, totalAllocatedAmountInCentavos: amount, allocations: [{
      paymentId: evidence.paymentId, originalPaidAmountInCentavos: paidDeposit, completedRefundAmountInCentavos: 0,
      reservedRefundAmountInCentavos: 0, availableRefundCapacityInCentavos: paidDeposit, allocatedRefundAmountInCentavos: amount,
    }],
  }});
  const operationId = plan.refundOperationIds[0];
  const paymentRef = db.collection("payments").doc(evidence.paymentId);
  const operationRef = paymentRef.collection("refunds").doc(operationId);
  const cancellationRef = db.collection("providerRequestCancellationRequests").doc(cancellationRequestId);
  const [operation, cancellation] = await transaction.getAll(operationRef, cancellationRef);
  if (operation.exists || cancellation.exists) throw invalid();
  const timestamp = serverTimestamp();
  const calculation = {
    schemaVersion: 1, calculationStatus: "calculated", policySource: SYSTEM_BALANCE_REFUND_SOURCE,
    frozenStage: null, refundBasisPoints: allocation ? 7000 : 10000, originalPaidAmountInCentavos: paidDeposit,
    targetTotalRefundAmountInCentavos: amount, completedRefundAmountInCentavos: 0,
    reservedRefundAmountInCentavos: 0, eligibleRefundAmountInCentavos: amount,
    remainingRefundableAmountInCentavos: paidDeposit - amount, currency: "PHP",
  };
  transaction.create(operationRef, {
    schemaVersion: 1, paymentId: evidence.paymentId, providerRequestId, mainEventId: request.mainEventId,
    cancellationRequestId, amountInCentavos: amount, currency: "PHP", status: "reserved",
    createdAt: timestamp, updatedAt: timestamp, completedAt: null, failureCode: null, operationKey, calculation,
    gateway: "paymongo", gatewayPaymentId: evidence.gatewayPaymentId, gatewayRefundId: null, gatewayStatus: null,
    gatewayExecutionKey: gatewayRefundIdempotencyKey(operationId), gatewayFailureCertainty: null,
    gatewayRequestedAt: null, gatewayAcceptedAt: null, gatewayReconciledAt: null,
    executionAttemptCount: 0, lastExecutionAt: null,
    refundOperationSetSchemaVersion: 1, refundOperationSetIndex: 0, refundOperationSetSize: 1,
    policySource: SYSTEM_BALANCE_REFUND_SOURCE,
    ...(allocation ? {paymentDefaultAllocation: allocation} : {}),
  });
  transaction.update(paymentRef, {refundAccountingSchemaVersion: 1, refundedAmountInCentavos: 0,
    refundReservedAmountInCentavos: amount, updatedAt: timestamp});
  transaction.create(cancellationRef, {
    schemaVersion: 1, providerRequestId, mainEventId: request.mainEventId, customerId: request.customerId,
    providerId: request.providerId, status: "approved", reason: "remaining_balance_unpaid_at_deadline",
    source: SYSTEM_BALANCE_REFUND_SOURCE, submittedByRole: "system", submittedAt: timestamp, updatedAt: timestamp,
    policyEvidenceStatus: classifyProviderRequestRefundPolicyEvidence(request).status === "policy_backed" ? "policy_backed" : "legacy",
    frozenEligibility: classifyProviderRequestRefundPolicyEvidence(request).status === "policy_backed" ? {
      stage: requireRefundEligibilityState(request).currentStage, stageSequence: requireRefundEligibilityState(request).stageSequence,
      frozenAt: timestamp,
    } : null,
    decision: {outcome: "approved", decidedAt: timestamp, reason: "remaining_balance_unpaid_at_deadline"},
    refundCalculation: calculation, refundOperationId: operationId, refundOperationIds: [operationId],
    ...(allocation ? {paymentDefaultAllocation: allocation} : {}),
    refundOperationPlanSchemaVersion: 1, refundOperationBindings: [{paymentId: evidence.paymentId,
      refundOperationId: operationId, amountInCentavos: amount}],
  });
  if (allocation) transaction.update(db.collection("providerRequests").doc(providerRequestId), {
    paymentDefaultAllocation: allocation, paymentDefaultAllocationFrozenAt: timestamp,
    remainingCollectibleAmountInCentavos: 0, remainingBalanceStatus: "cancelled",
  });
  return operationId;
}

function invalid(): Error { return new Error("System deposit refund requires consistent settled deposit evidence."); }
