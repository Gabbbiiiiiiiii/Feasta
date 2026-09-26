import "server-only";

import {createHash} from "node:crypto";
import {parseCustomerPaymentChoice, type CustomerPaymentChoice} from "@feasta/shared-types";
import type {CustomerBookingPaymentOption} from "./customer-booking-types";

type StoredRecord = Readonly<Record<string, unknown>>;
const RETRY_STATUSES = new Set(["unpaid", "pending", "failed", "expired"]);

/** Customer-safe projection only. The callable revalidates the payment set transactionally. */
export function customerBookingCheckoutOptions(
  providerRequestId: string,
  request: StoredRecord,
  mainEventStatus: unknown,
): CustomerBookingPaymentOption[] {
  const snapshot = record(request.financialSnapshot);
  const gross = snapshot?.grossAmountInCentavos;
  const upfront = snapshot?.requiredUpfrontAmountInCentavos;
  const balance = snapshot?.remainingBalanceInCentavos;
  if (snapshot?.schemaVersion !== 1 || snapshot.currency !== "PHP" ||
    !centavos(gross) || gross <= 0 || !centavos(upfront) || !centavos(balance) ||
    upfront + balance !== gross || request.activeCancellationRequestId != null ||
    request.reconciliationRequired === true) return [];

  const refundState = record(request.refundEligibilityState);
  if ((request.refundEligibilityState != null || request.refundPolicySnapshot != null ||
    request.refundPolicyAgreement != null) &&
    (!refundState || refundState.schemaVersion !== 1 ||
      refundState.activeCancellationRequestId !== null ||
      !request.refundPolicySnapshot || !request.refundPolicyAgreement)) return [];

  const choice = parseCustomerPaymentChoice(request.initialPaymentChoice);
  const option = (paymentChoice: CustomerPaymentChoice, amount: number) =>
    ({choice: paymentChoice, amount: amount / 100});
  const initialAbsent = request.initialPaymentChoice == null && request.initialPaymentId == null;
  const partial = upfront > 0 && upfront < gross;
  if (initialAbsent) {
    if (request.paymentId != null || request.remainingBalancePaymentId != null ||
      request.settlementSchemaVersion != null || request.settlementStatus != null ||
      !initialEligible(request, mainEventStatus)) return [];
    return partial ? [option("minimum", upfront), option("full", gross)] : [option("full", gross)];
  }

  if ((choice !== "minimum" && choice !== "full") ||
    (choice === "minimum" && !partial) || request.settlementSchemaVersion !== 1 ||
    request.initialPaymentId !== paymentId(providerRequestId, choice)) return [];
  const balanceId = request.remainingBalancePaymentId;
  if (balanceId != null && (choice !== "minimum" ||
    balanceId !== paymentId(providerRequestId, "remaining_balance"))) return [];
  if (request.paymentId !== request.initialPaymentId &&
    (balanceId == null || request.paymentId !== balanceId)) return [];

  if (request.status === "confirmed" && mainEventStatus === "confirmed" &&
    choice === "minimum" && request.settlementStatus === "deposit_settled" &&
    request.grossSettledAmountInCentavos === upfront &&
    request.outstandingAmountInCentavos === balance && balance > 0 &&
    (balanceId == null ? ["paid", "partially_refunded", "refunded"].includes(String(request.paymentStatus)) :
      request.paymentId === balanceId && RETRY_STATUSES.has(String(request.paymentStatus)))) {
    return [option("remaining_balance", balance)];
  }
  if (balanceId != null || !initialEligible(request, mainEventStatus) ||
    request.grossSettledAmountInCentavos !== 0 || request.outstandingAmountInCentavos !== gross ||
    !["unpaid", "initial_payment_processing"].includes(String(request.settlementStatus))) return [];
  return [option(choice, choice === "minimum" ? upfront : gross)];
}

function initialEligible(request: StoredRecord, mainEventStatus: unknown): boolean {
  return request.status === "waiting_for_down_payment" &&
    ["pending_provider_approval", "needs_provider_replacement", "waiting_for_down_payment"]
      .includes(String(mainEventStatus)) && RETRY_STATUSES.has(String(request.paymentStatus));
}

function paymentId(providerRequestId: string, choice: CustomerPaymentChoice): string {
  return `payment_${createHash("sha256").update(
    ["provider-request", providerRequestId, "payment-choice", choice, "v1"].join(":"),
  ).digest("hex").slice(0, 32)}`;
}

function centavos(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function record(value: unknown): StoredRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as StoredRecord : null;
}
