import type {
  CustomerBooking,
  CustomerBookingProviderRequest,
} from "@/lib/customer/bookings/customer-booking-types";
import {isHistoricalDepositTerms} from "@/lib/payments/full-payment-presentation";

type CustomerBookingConfirmationTone =
  | "success"
  | "info"
  | "warning"
  | "neutral";

type CustomerBookingConfirmationPresentation = {
  eyebrow: string;
  title: string;
  description: string;
  tone: CustomerBookingConfirmationTone;
};

type CustomerProviderPaymentPresentation = {
  label: string;
  status: string;
  description: string;
  showPaidAt: boolean;
  showRefundedAt: boolean;
};

export function bookingConfirmationPresentation(
  booking: CustomerBooking,
  providerRequests: readonly CustomerBookingProviderRequest[],
): CustomerBookingConfirmationPresentation {
  const statuses = providerRequests.map((request) => request.status);
  const allCompleted = statuses.length > 0 &&
    statuses.every((status) => status === "completed");
  const hasReplacementIssue = statuses.some((status) =>
    ["rejected", "cancelled", "expired"].includes(status),
  );
  const hasInProgress = statuses.some((status) => status === "in_progress");
  const hasProcessing = providerRequests.some((request) =>
    request.status === "payment_processing" ||
    request.paymentStatus === "processing",
  );
  const confirmedCount = statuses.filter((status) =>
    ["confirmed", "in_progress", "completed"].includes(status),
  ).length;
  const allConfirmed = statuses.length > 0 &&
    statuses.every((status) => status === "confirmed");
  const hasWaitingPayment = statuses.some((status) =>
    status === "waiting_for_down_payment",
  );
  const hasAwaitingProvider = statuses.some((status) =>
    status === "pending" || status === "accepted",
  );

  if (allCompleted && booking.status === "completed") {
    return {
      eyebrow: "Booking completed",
      title: "All provider services are completed",
      description:
        "Your provider services have been marked completed. Review each completed service separately and keep this booking timeline for your records.",
      tone: "success",
    };
  }

  if (booking.status === "cancelled" || booking.status === "expired") {
    return {
      eyebrow: "Booking record",
      title: booking.status === "cancelled"
        ? "This booking was cancelled"
        : "This booking expired",
      description:
        "Review the provider service records and timeline for the latest authoritative details.",
      tone: "neutral",
    };
  }

  if (hasReplacementIssue || booking.status === "needs_provider_replacement") {
    return {
      eyebrow: "Action needed",
      title: "A provider service needs attention",
      description:
        "Review the affected provider request. Other provider services continue to keep their own confirmation and payment states.",
      tone: "warning",
    };
  }

  if (hasInProgress || booking.status === "in_progress") {
    return {
      eyebrow: "Event underway",
      title: "Provider services are in progress",
      description:
        "At least one provider has started service. Review each provider card for its current state and use messaging when available.",
      tone: "info",
    };
  }

  if (hasProcessing) {
    return {
      eyebrow: "Verification in progress",
      title: "A provider payment is still processing",
      description:
        "FEASTA is waiting for authoritative payment confirmation. The affected provider service is not confirmed yet.",
      tone: "info",
    };
  }

  if (allConfirmed && booking.status === "confirmed") {
    return {
      eyebrow: "Booking confirmed",
      title: providerRequests.length === 1
        ? "Your provider service is confirmed"
        : "All provider services are confirmed",
      description:
        "Review the event schedule below and use Message Provider when you need to coordinate event details.",
      tone: "success",
    };
  }

  if (confirmedCount > 0) {
    return {
      eyebrow: "Booking progress",
      title: "Some provider services are confirmed",
      description:
        "Provider services progress independently. Review each request for outstanding responses, payment verification, or payment steps.",
      tone: "info",
    };
  }

  if (hasWaitingPayment || booking.status === "waiting_for_down_payment") {
    const historicalDeposit = providerRequests.some((request) =>
      request.status === "waiting_for_down_payment" &&
      isHistoricalDepositTerms({
        amount: request.amount,
        upfrontAmount: request.downPaymentAmount,
      }),
    ) || (
      providerRequests.length === 0 &&
      isHistoricalDepositTerms({
        amount: booking.estimatedEventTotal,
        upfrontAmount: booking.downPaymentAmount,
      })
    );

    return historicalDeposit ? {
      eyebrow: "Payment needed",
      title: "A provider service requires a down payment",
      description:
        "Review each provider request and complete only the eligible required down payments shown below.",
      tone: "warning",
    } : {
      eyebrow: "Payment needed",
      title: "A provider service requires full payment",
      description:
        "Review each provider request and pay the full amount shown for that request.",
      tone: "warning",
    };
  }

  if (hasAwaitingProvider || booking.status === "pending_provider_approval") {
    return {
      eyebrow: "Awaiting providers",
      title: "Provider responses are still pending",
      description:
        "Providers respond independently. Return here to review each response and its next available action.",
      tone: "neutral",
    };
  }

  if (booking.status === "completed") {
    return {
      eyebrow: "Booking record",
      title: "Completion is being reconciled",
      description:
        "Review the provider service states and timeline for the latest authoritative booking activity.",
      tone: "neutral",
    };
  }

  return {
    eyebrow: "Booking status",
    title: "Review your current booking state",
    description:
      "Review the event, provider services, and timeline for the latest authoritative information.",
    tone: "neutral",
  };
}

export function providerPaymentPresentation(
  request: CustomerBookingProviderRequest,
): CustomerProviderPaymentPresentation {
  const historicalDeposit = isHistoricalDepositTerms({
    amount: request.amount,
    upfrontAmount: request.downPaymentAmount,
  });

  if (request.paymentStatus === "refunded") {
    return {
      label: historicalDeposit ? "Down payment refunded" : "Payment refunded",
      status: "refunded",
      description: historicalDeposit
        ? "The recorded provider down payment was refunded. No cancellation is implied by this payment state."
        : "The recorded provider payment was refunded. No cancellation is implied by this payment state.",
      showPaidAt: false,
      showRefundedAt: true,
    };
  }

  if (
    request.status === "payment_processing" ||
    request.paymentStatus === "processing"
  ) {
    return {
      label: "Payment processing",
      status: "processing",
      description:
        "FEASTA is waiting for authoritative payment confirmation before confirming this provider service.",
      showPaidAt: false,
      showRefundedAt: false,
    };
  }

  if (
    request.downPaymentAmount === 0 &&
    ["confirmed", "in_progress", "completed"].includes(request.status)
  ) {
    return {
      label: "No down payment required",
      status: request.status,
      description:
        "This provider service was confirmed without an online down payment.",
      showPaidAt: false,
      showRefundedAt: false,
    };
  }

  if (request.paymentStatus === "paid") {
    return {
      label: historicalDeposit ? "Down payment confirmed" : "Full payment confirmed",
      status: "paid",
      description: historicalDeposit
        ? "FEASTA has authoritative confirmation of this provider down payment."
        : "FEASTA has authoritative confirmation of this full payment.",
      showPaidAt: true,
      showRefundedAt: false,
    };
  }

  if (request.paymentStatus === "failed") {
    return {
      label: "Payment failed",
      status: "failed",
      description: historicalDeposit
        ? "The provider down payment was not confirmed. Use the available secure action when you are ready to retry."
        : "The full payment was not confirmed. Use the available secure action when you are ready to retry.",
      showPaidAt: false,
      showRefundedAt: false,
    };
  }

  if (request.paymentStatus === "expired") {
    return {
      label: "Payment session expired",
      status: "expired",
      description:
        "The previous payment session expired without confirming this provider service.",
      showPaidAt: false,
      showRefundedAt: false,
    };
  }

  if (request.status === "waiting_for_down_payment") {
    return historicalDeposit ? {
      label: "Down payment required",
      status: "waiting_for_down_payment",
      description:
        "Complete the required down payment using the secure action for this provider request.",
      showPaidAt: false,
      showRefundedAt: false,
    } : {
      label: "Full payment required",
      status: "waiting_for_down_payment",
      description:
        "Complete the full payment using the secure action for this provider request.",
      showPaidAt: false,
      showRefundedAt: false,
    };
  }

  if (["rejected", "cancelled", "expired"].includes(request.status)) {
    return {
      label: "No active payment",
      status: request.status,
      description: historicalDeposit
        ? "No provider down-payment action is available for this request."
        : "No payment action is available for this request.",
      showPaidAt: false,
      showRefundedAt: false,
    };
  }

  return {
    label: "Payment not yet required",
    status: request.status,
    description: historicalDeposit
      ? "No confirmed provider down payment is recorded for this request."
      : "No confirmed provider payment is recorded for this request.",
    showPaidAt: false,
    showRefundedAt: false,
  };
}

export type {
  CustomerBookingConfirmationPresentation,
  CustomerBookingConfirmationTone,
  CustomerProviderPaymentPresentation,
};
