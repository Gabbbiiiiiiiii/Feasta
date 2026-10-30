import type {MainEventStatus} from "@feasta/shared-types";

import type {
  CustomerBooking,
  CustomerBookingProviderRequest,
} from "@/lib/customer/bookings/customer-booking-types";

const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;

export function canCustomerReviewProviderRequest(
  booking: CustomerBooking,
  request: CustomerBookingProviderRequest,
): boolean {
  return booking.status === "completed" &&
    request.status === "completed" &&
    request.reviewStatus === "not_submitted" &&
    SAFE_DOCUMENT_ID.test(request.providerRequestId) &&
    request.id === request.providerRequestId &&
    request.mainEventId === booking.id &&
    SAFE_DOCUMENT_ID.test(request.providerId);
}

export function normalizeCustomerBookingReviewStatus({
  reviewExists,
  reviewData,
  request,
  bookingId,
  customerId,
  mainEventStatus,
}: {
  reviewExists: boolean;
  reviewData: Readonly<Record<string, unknown>>;
  request: CustomerBookingProviderRequest;
  bookingId: string;
  customerId: string;
  mainEventStatus: MainEventStatus;
}): CustomerBookingProviderRequest["reviewStatus"] {
  if (!reviewExists) return "not_submitted";

  return reviewData.schemaVersion === 2 &&
    reviewData.relationshipVersion === "provider_request_v1" &&
    reviewData.providerRequestId === request.providerRequestId &&
    reviewData.mainEventId === bookingId &&
    reviewData.providerId === request.providerId &&
    reviewData.customerId === customerId &&
    request.id === request.providerRequestId &&
    request.mainEventId === bookingId &&
    request.status === "completed" &&
    mainEventStatus === "completed"
    ? "submitted"
    : "unavailable";
}
