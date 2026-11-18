import type {PaymentStatus} from "@feasta/shared-types";
import {bookingStatusLabels} from "@/lib/presentation/booking-status-labels";
import type {AdminBookingOverallPaymentStatus} from "./admin-booking-types";

export {bookingStatusLabels as adminBookingStatusLabels};

export const adminBookingPaymentLabels: Record<AdminBookingOverallPaymentStatus | PaymentStatus, string> = {
  unavailable: "Unavailable",
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
  return (bookingStatusLabels as Record<string, string>)[status] ??
    (status === "waiting_payment" ? bookingStatusLabels.waiting_for_down_payment : "Unknown status");
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
