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
    "Provider down payment",
  provider_balance:
    "Provider balance",
  refund:
    "Refund",
  adjustment:
    "Adjustment",
};

const paymentGatewayLabels: Record<
  AdminPaymentGateway,
  string
> = {
  paymongo: "PayMongo",
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
    input.bookingCode ??
    input.mainEventId ??
    "Unavailable"
  );
}