import type {
  AdminPaymentGateway,
  AdminPaymentType,
} from "@/lib/admin/payments/admin-payment-types";

const manilaDateTimeFormatter =
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });

const paymentTypeLabels: Record<
  AdminPaymentType,
  string
> = {
  provider_down_payment:
    "Down payment",
  provider_balance:
    "Remaining balance",
  refund:
    "Refund",
  adjustment:
    "Payment adjustment",
};

const paymentGatewayLabels: Record<
  AdminPaymentGateway,
  string
> = {
  paymongo: "Payment service",
};

export function formatPaymentDate(
  value: string | null,
): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return manilaDateTimeFormatter.format(date);
}

const manilaTableDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

const manilaTableTimeFormatter = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Manila",
});

export function formatPaymentTableDateParts(
  value: string | null,
): {date: string; time: string} | null {
  if (!value) return null;

  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) return null;

  return {
    date: manilaTableDateFormatter.format(parsed),
    time: manilaTableTimeFormatter.format(parsed),
  };
}
/** Use paymentChoice for new records; preserve legacy payment labels. */
export function formatAdminPaymentPurpose(
  payment: {
    paymentType: AdminPaymentType;
    paymentChoice?: "minimum" | "full" | "remaining_balance" | null;
  },
): string {
  return payment.paymentType === "provider_down_payment" && payment.paymentChoice === "full"
    ? "Full payment"
    : formatPaymentType(payment.paymentType);
}
export function formatPaymentType(
  type: AdminPaymentType,
): string {
  return paymentTypeLabels[type];
}

export function formatPaymentGateway(
  gateway: AdminPaymentGateway,
): string {
  return paymentGatewayLabels[gateway];
}

export function paymentBookingLabel(input: {
  bookingCode: string | null;
  mainEventId: string;
}): string {
  return (
    input.bookingCode?.trim() ||
    "Booking unavailable"
  );
}

/** Display a shortened existing reference; exact IDs remain in support details. */
export function paymentReferenceLabel(input: {paymentId: string}): string {
  const reference = input.paymentId;
  return reference.length > 20
    ? `${reference.slice(0, 12)}…${reference.slice(-6)}`
    : reference;
}
