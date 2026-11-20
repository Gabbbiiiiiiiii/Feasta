import {paymentDefaultAllocation} from "../bookings/booking-policy-v3.js";

type Data = Readonly<Record<string, unknown>>;

/** Validate the server-frozen allocation against the deposit actually settled. */
export function requirePaymentDefaultAllocation(value: unknown, paidDepositInCentavos: number) {
  const expected = paymentDefaultAllocation(paidDepositInCentavos);
  const data = value as Data | null;
  if (!data || Object.entries(expected).some(([key, amount]) => data[key] !== amount)) {
    throw new Error("Payment-default allocation requires reconciliation.");
  }
  return expected;
}

/** Finalize only after a trusted completed refund; this never moves gateway money. */
export function paymentDefaultAccountingPlan(input: {
  allocation: unknown; payment: Data; request: Data; earning: Data;
  completedCustomerRefundInCentavos: number; timestamp: unknown; ledgerEntryId: string;
  proportionalCommissionReversedInCentavos?: number;
  proportionalProviderEarningReversedInCentavos?: number;
}) {
  const {payment, request, earning} = input;
  const integer = (value: unknown) => {
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("Payment-default accounting evidence is invalid.");
    return value as number;
  };
  const allocation = requirePaymentDefaultAllocation(input.allocation, integer(payment.amountInCentavos));
  if (input.completedCustomerRefundInCentavos !== allocation.customerDefaultRefundAmountInCentavos ||
    payment.financialLedgerSchemaVersion !== 1 || request.financialLedgerSchemaVersion !== 1 ||
    earning.schemaVersion !== 1 || earning.paymentId !== payment.paymentId ||
    earning.providerRequestId !== request.providerRequestId || earning.currency !== "PHP" ||
    payment.currency !== "PHP" || request.status !== "cancelled" ||
    request.cancellationReason !== "remaining_balance_unpaid_at_deadline") {
    throw new Error("Payment-default financial authority is invalid.");
  }
  const accruedCommission = integer(payment.commissionAccruedInCentavos);
  const requestAccruedCommission = integer(request.commissionAccruedInCentavos);
  const proportionalCommissionReversed = integer(input.proportionalCommissionReversedInCentavos ??
    payment.commissionReversedInCentavos ?? 0);
  if (proportionalCommissionReversed > accruedCommission) throw new Error("Payment-default commission requires reconciliation.");
  if (requestAccruedCommission !== accruedCommission || integer(payment.withholdingInCentavos) !== 0 ||
    integer(request.withholdingAccruedInCentavos ?? 0) !== 0) {
    throw new Error("Payment-default statutory accounting requires review.");
  }
  const earningAmount = integer(earning.earningAmountInCentavos);
  const pending = integer(earning.pendingAmountInCentavos);
  const available = integer(earning.availableAmountInCentavos);
  const paid = integer(earning.paidAmountInCentavos);
  const reversed = integer(earning.reversedAmountInCentavos);
  const target = allocation.providerReservationCompAmountInCentavos;
  const proportionalProviderReversed = integer(input.proportionalProviderEarningReversedInCentavos ?? reversed);
  if (pending + available + paid + reversed !== earningAmount || paid !== 0 ||
    earning.status === "paid" || earningAmount < target || reversed > earningAmount - target) {
    throw new Error("Payment-default Provider payout requires reconciliation.");
  }
  // Compensation becomes available when trusted refund completion finalizes the default.
  const earningUpdate = {pendingAmountInCentavos: 0, availableAmountInCentavos: target,
    paidAmountInCentavos: paid, reversedAmountInCentavos: earningAmount - target,
    netEarningAmountInCentavos: target, status: target === 0 ? "reversed" : "available",
    economicSource: "payment_default_reservation_compensation", paymentDefaultAllocation: allocation,
    lastReversalFinancialLedgerEntryId: input.ledgerEntryId, updatedAt: input.timestamp};
  const paymentUpdate = {commissionReversedInCentavos: accruedCommission,
    providerEarningReversedInCentavos: earningAmount - target, providerEarningNetAmountInCentavos: target,
    providerEarningStatus: earningUpdate.status, paymentDefaultAccountingSchemaVersion: 1,
    feastaCancellationFeeEarnedInCentavos: allocation.feastaCancellationFeeAmountInCentavos,
    paymentDefaultAllocation: allocation, paymentDefaultAccountingFinalizedAt: input.timestamp};
  const providerRequestUpdate = {commissionReversedInCentavos: requestAccruedCommission,
    commissionEarnedInCentavos: 0, feastaCancellationFeeEarnedInCentavos: allocation.feastaCancellationFeeAmountInCentavos,
    providerReservationCompEarnedInCentavos: target, paymentDefaultAccountingSchemaVersion: 1,
    paymentDefaultAccountingFinalizedAt: input.timestamp, financialLedgerUpdatedAt: input.timestamp};
  const ledgerRecord = {schemaVersion: 1, entryType: "payment_default_allocation_completed",
    ledgerEntryId: input.ledgerEntryId, paymentId: payment.paymentId, providerRequestId: request.providerRequestId,
    mainEventId: request.mainEventId, providerId: request.providerId, customerId: request.customerId,
    currency: "PHP", paymentDefaultAllocation: allocation,
    ordinaryCommissionAdjustmentInCentavos: accruedCommission - proportionalCommissionReversed,
    ordinaryCommissionReversedAfterInCentavos: accruedCommission,
    providerEarningAdjustmentInCentavos: earningAmount - target - proportionalProviderReversed,
    providerEarningReversedAfterInCentavos: earningAmount - target,
    commissionEarnedAfterInCentavos: 0, providerEconomicEntitlementInCentavos: target,
    feastaCancellationFeeEarnedInCentavos: allocation.feastaCancellationFeeAmountInCentavos,
    customerRefundCompletedInCentavos: allocation.customerDefaultRefundAmountInCentavos,
    gatewayCostTreatment: "separate_observable_cost", createdAt: input.timestamp};
  return {paymentUpdate, providerRequestUpdate, earningUpdate, ledgerRecord};
}
