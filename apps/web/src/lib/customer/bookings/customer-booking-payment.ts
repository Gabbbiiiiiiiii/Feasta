import type {
  CustomerBookingProviderRequest,
} from "@/lib/customer/bookings/customer-booking-types";

export function canStartCustomerBookingPayment(
  request: CustomerBookingProviderRequest,
  bookingId: string,
): boolean {
  return request.mainEventId === bookingId &&
    request.checkoutOptions.length > 0;
}

export function isCustomerBookingPaymentProcessing(
  request: CustomerBookingProviderRequest,
): boolean {
  return request.status === "payment_processing" ||
    request.paymentStatus.trim().toLowerCase() === "processing";
}
