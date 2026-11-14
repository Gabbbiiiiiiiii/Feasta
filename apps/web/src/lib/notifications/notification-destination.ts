import type {FeastaNotification} from "./notification-types";
import {resolveCustomerNotificationDestination} from "@/lib/customer/notifications/customer-notification-destination";

const SAFE_RELATED_ID = /^[A-Za-z0-9_-]{1,160}$/u;

export function resolveNotificationDestination(
  role: "customer" | "provider" | "admin",
  notification: Pick<
    FeastaNotification,
    "type" | "relatedCollection" | "relatedId"
  >,
): string | null {
  if (role === "customer") {
    return resolveCustomerNotificationDestination(notification);
  }

  const type = notification.type.toLowerCase();
  const collection =
    notification.relatedCollection?.toLowerCase() ?? "";
  const relatedId =
    notification.relatedId &&
    SAFE_RELATED_ID.test(notification.relatedId)
      ? notification.relatedId
      : null;

  const knownCollections = [
    "chatrooms",
    "providerverifications",
    "payments",
    "reviews",
    "mainevents",
    "bookings",
    "providerrequests",
    "bookingproviderrequests",
  ];

  if (
    collection &&
    !knownCollections.includes(collection)
  ) {
    return role === "admin"
      ? "/admin/notifications"
      : null;
  }

  if (
    collection === "chatrooms" &&
    type === "new_message" &&
    relatedId
  ) {
    if (role === "provider") {
      return `/provider/messages?room=${encodeURIComponent(
        relatedId,
      )}`;
    }

    return null;
  }

  if (
    collection === "providerverifications" ||
    type.includes("verification")
  ) {
    return role === "admin"
      ? "/admin/providers"
      : "/provider/verification";
  }

  if (
    collection === "payments" ||
    type.includes("payment") ||
    type.includes("refund")
  ) {
    return role === "admin"
      ? "/admin/payments"
      : "/provider/payments";
  }

  if (
    collection === "reviews" ||
    type.includes("review")
  ) {
    return role === "admin"
      ? "/admin/reviews"
      : "/provider/reviews";
  }

  /*
   * A provider request represents work that still belongs in the
   * Booking Requests workflow. Keep this check before the broader
   * booking/type fallback below.
   */
  if (
    collection === "providerrequests" ||
    collection === "bookingproviderrequests" ||
    type.includes("booking_request") ||
    type.includes("new_booking_request") ||
    (
      type.includes("request") &&
      !type.includes("cancellation") &&
      !type.includes("refund")
    )
  ) {
    return role === "admin"
      ? "/admin/bookings"
      : "/provider/requests";
  }

  /*
   * Main events and canonical bookings belong to the provider's
   * Booking Management area rather than Booking Requests.
   */
  if (
    collection === "mainevents" ||
    collection === "bookings" ||
    type.includes("booking")
  ) {
    return role === "admin"
      ? "/admin/bookings"
      : "/provider/bookings";
  }

  return null;
}