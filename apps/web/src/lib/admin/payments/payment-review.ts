import type {AdminPaymentIssueFilter, AdminPaymentStatus, AdminPaymentTypeFilter} from "./admin-payment-types";

export function bookingPaymentStatusMismatch(
  bookingExists: boolean,
  status: AdminPaymentStatus,
  bookingPaymentStatus: string | null,
): boolean {
  return bookingExists && status === "paid" &&
    bookingPaymentStatus !== "partially_paid" && bookingPaymentStatus !== "paid";
}

/** The original paymentType is retained for compatibility; the trusted
 * paymentChoice distinguishes 100% upfront from a minimum deposit. */
export function matchesAdminPaymentChoice(
  payment: {paymentType?: unknown; paymentChoice?: unknown},
  filter: AdminPaymentTypeFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "full") {
    return payment.paymentType === "provider_down_payment" && payment.paymentChoice === "full";
  }
  if (filter === "provider_down_payment") {
    // Includes older minimum-deposit records without a paymentChoice field.
    return payment.paymentType === "provider_down_payment" && payment.paymentChoice !== "full";
  }
  return payment.paymentType === filter;
}
export function matchesPaymentReview(issueCount: number, filter: AdminPaymentIssueFilter): boolean {
  if (filter === "with_issues") return issueCount > 0;
  if (filter === "without_issues") return issueCount === 0;
  return true;
}
