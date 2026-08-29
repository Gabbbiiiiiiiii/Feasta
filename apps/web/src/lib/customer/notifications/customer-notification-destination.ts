import type {FeastaNotification} from "@/lib/notifications/notification-types";

type CustomerNotificationDestinationInput = Pick<
  FeastaNotification,
  "type" | "relatedCollection" | "relatedId"
>;

const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;

export function resolveCustomerNotificationDestination(
  notification: CustomerNotificationDestinationInput,
): string | null {
  const type = notification.type.trim().toLowerCase();
  const collection = notification.relatedCollection?.trim().toLowerCase() ?? "";
  const relatedId = safeDocumentId(notification.relatedId);

  if (type === "new_message") {
    return collection === "chatrooms" && relatedId
      ? `/customer/messages?room=${encodeURIComponent(relatedId)}`
      : null;
  }

  if (type === "booking") {
    if (collection === "mainevents" && relatedId) {
      return `/customer/bookings/${encodeURIComponent(relatedId)}`;
    }

    if (collection === "providerrequests" && relatedId) {
      return "/customer/bookings";
    }

    return null;
  }

  if (type === "payment") {
    return collection === "payments" && relatedId
      ? "/customer/payments"
      : null;
  }

  if (type === "review") {
    return collection === "reviews" && relatedId
      ? "/customer/bookings"
      : null;
  }

  if (type === "account") {
    return collection === "users" && relatedId
      ? "/customer/account"
      : null;
  }

  if (
    ["announcement", "general", "information", "system"].includes(type) &&
    collection.length === 0
  ) {
    return "/customer/notifications";
  }

  return null;
}

function safeDocumentId(value: string | null): string | null {
  return value && SAFE_DOCUMENT_ID.test(value) ? value : null;
}
