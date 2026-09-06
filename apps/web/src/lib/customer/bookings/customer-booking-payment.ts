import type {
  CustomerBookingProviderRequest,
} from "@/lib/customer/bookings/customer-booking-types";

const PAYABLE_REQUEST_PAYMENT_STATUSES = new Set([
  "unpaid",
  "pending",
  "failed",
  "expired",
]);

export function canStartCustomerBookingPayment(
  request: CustomerBookingProviderRequest,
  bookingId: string,
): boolean {
  return request.mainEventId === bookingId &&
    request.status === "waiting_for_down_payment" &&
    Number.isFinite(request.downPaymentAmount) &&
    request.downPaymentAmount > 0 &&
    PAYABLE_REQUEST_PAYMENT_STATUSES.has(
      request.paymentStatus.trim().toLowerCase(),
    );
}

export function isCustomerBookingPaymentProcessing(
  request: CustomerBookingProviderRequest,
): boolean {
  return request.status === "payment_processing" ||
    request.paymentStatus.trim().toLowerCase() === "processing";
}
