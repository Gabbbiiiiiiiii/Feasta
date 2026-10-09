import type {AdminPaymentIssueFilter, AdminPaymentStatus} from "./admin-payment-types";

export function bookingPaymentStatusMismatch(
  bookingExists: boolean,
  status: AdminPaymentStatus,
  bookingPaymentStatus: string | null,
): boolean {
  return bookingExists && status === "paid" &&
    bookingPaymentStatus !== "partially_paid" && bookingPaymentStatus !== "paid";
}

export function matchesPaymentReview(issueCount: number, filter: AdminPaymentIssueFilter): boolean {
  if (filter === "with_issues") return issueCount > 0;
  if (filter === "without_issues") return issueCount === 0;
  return true;
}
