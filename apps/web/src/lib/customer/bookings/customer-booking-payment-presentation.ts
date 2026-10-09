import type {CustomerBookingProviderRequest} from "./customer-booking-types";

/** Labels and prospective amounts only; checkout eligibility comes from the saved options. */
export function customerBookingPaymentPresentation(request: CustomerBookingProviderRequest) {
  const minimum = request.checkoutOptions.find((option) => option.choice === "minimum");
  const full = request.checkoutOptions.find((option) => option.choice === "full");
  const balance = request.checkoutOptions.find((option) => option.choice === "remaining_balance");
  const current = balance ?? minimum ?? full;
  return {
    hasBothInitialOptions: Boolean(minimum && full),
    dueLabel: balance ? "Remaining balance due" : minimum ? "Minimum payment today" : "Amount due now",
    currentAmount: current?.amount ?? null,
    prospectiveBalance: minimum ? Math.max(0, request.amount - minimum.amount) : null,
    showRemainingBalance: ["deposit_settled", "balance_payment_processing"].includes(request.settlementStatus ?? "") &&
      (request.outstandingAmountInCentavos ?? 0) > 0,
  };
}

export function formatCustomerBalanceDeadline(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-PH", {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila"}).format(date)
    : "Date unavailable";
}
