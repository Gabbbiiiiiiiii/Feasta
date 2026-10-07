import type {MainEventStatus, PaymentStatus} from "@feasta/shared-types";
import type {AdminBookingOverallPaymentStatus} from "./admin-booking-types";

export const adminBookingStatusLabels: Record<MainEventStatus, string> = {
  draft: "Draft",
  pending_provider_approval: "Waiting for provider response",
  needs_provider_replacement: "Provider replacement needed",
  waiting_for_down_payment: "Waiting for payment",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

export const adminBookingPaymentLabels: Record<AdminBookingOverallPaymentStatus | PaymentStatus, string> = {
  unpaid: "Unpaid",
  pending: "Preparing payment checkout",
  processing: "Awaiting payment confirmation",
  partially_paid: "Partially paid",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  failed: "Failed",
  expired: "Expired",
  refunded: "Refunded",
};

export function adminBookingStatusLabel(status: string): string {
  return (adminBookingStatusLabels as Record<string, string>)[status] ??
    (status === "waiting_payment" ? "Waiting for payment" : "Unknown status");
}

export function adminBookingPaymentLabel(status: string): string {
  return (adminBookingPaymentLabels as Record<string, string>)[status] ?? "Unknown payment status";
}

export function adminProviderRequestLabel(status: string): string {
  if (status === "pending") return "Waiting for provider response";
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "payment_processing") return "Awaiting payment confirmation";
  return adminBookingStatusLabel(status);
}
