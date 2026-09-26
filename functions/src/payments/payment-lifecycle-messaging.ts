import type {
  PaymentStatus,
} from "../shared/constants.js";

import {
  parseCustomerPaymentChoice,
  type CustomerPaymentChoice,
} from "./payment-obligation.js";

export function paymentLifecycleChoice(
  value: unknown,
): CustomerPaymentChoice | null {
  return parseCustomerPaymentChoice(
    value,
  );
}

export function timelineMessageForPaymentLifecycle(
  status: PaymentStatus,
  paymentChoice: unknown,
): string {
  const choice =
    paymentLifecycleChoice(
      paymentChoice,
    );

  if (!choice) {
    return legacyTimelineMessage(
      status,
    );
  }

  const label =
    paymentLifecycleLabel(choice);

  switch (status) {
    case "paid":
      return (
        `The ${label} was ` +
        "successfully confirmed."
      );

    case "failed":
      return (
        `The ${label} failed ` +
        "and may be retried."
      );

    case "expired":
      return (
        `The ${label} session expired ` +
        "and a new session may be created."
      );

    case "refunded":
    case "partially_refunded":
      return (
        `The ${label} was ` +
        "successfully refunded."
      );

    default:
      return (
        `The ${label} was updated.`
      );
  }
}

export function customerNotificationTitleForPaymentLifecycle(
  status: PaymentStatus,
  paymentChoice: unknown,
): string {
  const choice =
    paymentLifecycleChoice(
      paymentChoice,
    );

  if (!choice) {
    return status === "paid"
      ? "Payment confirmed"
      : `Payment ${status}`;
  }

  const title =
    paymentLifecycleTitle(choice);

  switch (status) {
    case "paid":
      return choice ===
        "remaining_balance"
        ? "Remaining balance paid"
        : `${title} confirmed`;

    case "failed":
      return `${title} failed`;

    case "expired":
      return `${title} expired`;

    case "refunded":
    case "partially_refunded":
      return `${title} refunded`;

    default:
      return `${title} updated`;
  }
}

export function customerNotificationMessageForPaymentLifecycle(
  status: PaymentStatus,
  paymentChoice: unknown,
): string {
  const choice =
    paymentLifecycleChoice(
      paymentChoice,
    );

  if (!choice) {
    return legacyCustomerMessage(
      status,
    );
  }

  const label =
    paymentLifecycleLabel(choice);

  switch (status) {
    case "paid":
      return (
        `Your ${label} was ` +
        "securely confirmed."
      );

    case "failed":
      return (
        `Your ${label} failed. ` +
        "You may try again."
      );

    case "expired":
      return (
        `Your ${label} session expired. ` +
        "You may create a new session."
      );

    case "refunded":
    case "partially_refunded":
      return (
        `Your ${label} was ` +
        "successfully refunded."
      );

    default:
      return (
        `Your ${label} is now ${status}.`
      );
  }
}

export function providerNotificationTitleForPaymentLifecycle(
  status: PaymentStatus,
  paymentChoice: unknown,
): string {
  const choice =
    paymentLifecycleChoice(
      paymentChoice,
    );

  if (!choice) {
    return status === "paid"
      ? "Payment received"
      : `Payment ${status}`;
  }

  const title =
    paymentLifecycleTitle(choice);

  switch (status) {
    case "paid":
      return choice ===
        "remaining_balance"
        ? "Remaining balance received"
        : `${title} received`;

    case "failed":
      return `${title} failed`;

    case "expired":
      return `${title} expired`;

    case "refunded":
    case "partially_refunded":
      return `${title} refunded`;

    default:
      return `${title} updated`;
  }
}

export function providerNotificationMessageForPaymentLifecycle(
  status: PaymentStatus,
  paymentChoice: unknown,
): string {
  const choice =
    paymentLifecycleChoice(
      paymentChoice,
    );

  if (!choice) {
    return legacyProviderMessage(
      status,
    );
  }

  const label =
    paymentLifecycleLabel(choice);

  switch (status) {
    case "paid":
      return (
        `The customer's ${label} ` +
        "was confirmed."
      );

    case "failed":
      return (
        `The customer's ${label} failed.`
      );

    case "expired":
      return (
        `The customer's ${label} ` +
        "session expired."
      );

    case "refunded":
    case "partially_refunded":
      return (
        `The customer's ${label} ` +
        "was refunded."
      );

    default:
      return (
        `The customer's ${label} ` +
        `is now ${status}.`
      );
  }
}

function paymentLifecycleLabel(
  choice: CustomerPaymentChoice,
): string {
  switch (choice) {
    case "minimum":
      return "minimum payment";

    case "full":
      return "full payment";

    case "remaining_balance":
      return "remaining balance payment";
  }
}

function paymentLifecycleTitle(
  choice: CustomerPaymentChoice,
): string {
  switch (choice) {
    case "minimum":
      return "Minimum payment";

    case "full":
      return "Full payment";

    case "remaining_balance":
      return "Remaining balance";
  }
}

function legacyTimelineMessage(
  status: PaymentStatus,
): string {
  switch (status) {
    case "paid":
      return (
        "The provider down payment " +
        "was successfully confirmed."
      );

    case "failed":
      return (
        "The provider down payment " +
        "failed and may be retried."
      );

    case "expired":
      return (
        "The payment session expired " +
        "and a new session may be created."
      );

    case "refunded":
    case "partially_refunded":
      return (
        "The provider payment was " +
        "successfully refunded."
      );

    default:
      return (
        "The provider payment was updated."
      );
  }
}

function legacyCustomerMessage(
  status: PaymentStatus,
): string {
  switch (status) {
    case "paid":
      return (
        "Your provider payment was " +
        "securely confirmed."
      );

    case "failed":
      return (
        "Your provider payment failed. " +
        "You may try again."
      );

    case "expired":
      return (
        "Your payment session expired. " +
        "You may create a new session."
      );

    case "refunded":
    case "partially_refunded":
      return (
        "Your provider payment was " +
        "successfully refunded."
      );

    default:
      return (
        `Your payment is now ${status}.`
      );
  }
}

function legacyProviderMessage(
  status: PaymentStatus,
): string {
  switch (status) {
    case "paid":
      return (
        "A payment for your provider " +
        "request was confirmed."
      );

    case "failed":
      return (
        "A payment for your provider " +
        "request failed."
      );

    case "expired":
      return (
        "A payment session for your " +
        "provider request expired."
      );

    case "refunded":
    case "partially_refunded":
      return (
        "A payment for your provider " +
        "request was refunded."
      );

    default:
      return (
        "A provider request payment " +
        `is now ${status}.`
      );
  }
}