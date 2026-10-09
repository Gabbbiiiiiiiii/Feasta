import {
  MAIN_EVENT_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PROVIDER_REQUEST_STATUSES,
  type MainEventStatus,
  type PaymentStatus,
  type PaymentType,
  type ProviderRequestStatus,
} from "@feasta/shared-types";

import type {
  ProviderPayment,
  ProviderPaymentDetail,
  ProviderPaymentRefundStatus,
} from "./provider-payment-types";

export type ProviderPaymentSourceDocument = {
  id: string;
  data: Readonly<Record<string, unknown>>;
};

export function normalizeProviderPaymentRecord(input: {
  payment: ProviderPaymentSourceDocument;
  providerRequest: ProviderPaymentSourceDocument | null;
  mainEvent: ProviderPaymentSourceDocument | null;
  trustedProviderId: string;
}): ProviderPaymentDetail | null {
  const payment = input.payment.data;
  const providerRequest = input.providerRequest?.data;
  const mainEvent = input.mainEvent?.data;
  const paymentId = documentId(input.payment.id);
  const storedPaymentId = optionalDocumentId(payment.paymentId);
  const providerRequestId = optionalDocumentId(payment.providerRequestId);
  const mainEventId = optionalDocumentId(
    payment.mainEventId ?? payment.bookingId,
  );
  const providerId = optionalDocumentId(payment.providerId);
  const customerId = optionalDocumentId(payment.customerId);
  const providerRequestStatus = canonicalProviderRequestStatus(
    providerRequest?.status,
  );
  const mainEventStatus = canonicalMainEventStatus(mainEvent?.status);
  const status = canonicalPaymentStatus(payment.status);
  const paymentType = canonicalPaymentType(payment.paymentType);
  const refundStatus = canonicalRefundStatus(payment.refundStatus);
  const amountInCentavos = canonicalCentavos(payment.amountInCentavos);
  const createdAt = timestampIso(payment.createdAt);
  const eventDate = timestampIso(
    providerRequest?.eventDate ?? mainEvent?.eventDate,
  );

  if (
    !paymentId ||
    storedPaymentId !== paymentId ||
    providerId !== input.trustedProviderId ||
    !providerRequestId ||
    !mainEventId ||
    !customerId ||
    !input.providerRequest ||
    !providerRequest ||
    !input.mainEvent ||
    !mainEvent ||
    input.providerRequest.id !== providerRequestId ||
    input.mainEvent.id !== mainEventId ||
    providerRequest.providerId !== input.trustedProviderId ||
    (providerRequest.mainEventId ?? providerRequest.bookingId) !== mainEventId ||
    providerRequest.customerId !== customerId ||
    mainEvent.customerId !== customerId ||
    !providerRequestStatus ||
    !mainEventStatus ||
    !status ||
    !paymentType ||
    refundStatus === undefined ||
    !amountInCentavos ||
    payment.currency !== "PHP" ||
    !createdAt ||
    !eventDate
  ) {
    return null;
  }

  const normalizedPayment: ProviderPayment = {
    paymentId,
    providerRequestId,
    mainEventId,
    customerDisplayName: customerDisplayName(providerRequest, mainEvent),
    eventType: optionalText(
      providerRequest.eventType ?? mainEvent.eventType,
      100,
    ) ?? "Event",
    eventDate,
    eventTime: optionalText(
      providerRequest.eventTime ?? mainEvent.eventTime,
      40,
    ),
    serviceSummary: serviceSummary(providerRequest),
    amount: amountInCentavos / 100,
    amountInCentavos,
    formattedAmount: formatPhpCentavos(amountInCentavos),
    currency: "PHP",
    paymentType,
    status,
    refundStatus,
    createdAt,
    updatedAt: timestampIso(payment.updatedAt),
    paidAt: timestampIso(payment.paidAt),
    failedAt: timestampIso(payment.failedAt),
    expiredAt: timestampIso(payment.expiredAt),
    refundedAt: timestampIso(payment.refundedAt),
  };

  return {
    payment: normalizedPayment,
    providerRequestStatus,
    mainEventStatus,
  };
}

export function formatPhpCentavos(amountInCentavos: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountInCentavos / 100);
}

function canonicalPaymentStatus(value: unknown): PaymentStatus | null {
  return typeof value === "string" &&
    (PAYMENT_STATUSES as readonly string[]).includes(value)
    ? value as PaymentStatus
    : null;
}

function canonicalPaymentType(value: unknown): PaymentType | null {
  return typeof value === "string" &&
    (PAYMENT_TYPES as readonly string[]).includes(value)
    ? value as PaymentType
    : null;
}

function canonicalProviderRequestStatus(
  value: unknown,
): ProviderRequestStatus | null {
  return typeof value === "string" &&
    (PROVIDER_REQUEST_STATUSES as readonly string[]).includes(value)
    ? value as ProviderRequestStatus
    : null;
}

function canonicalMainEventStatus(value: unknown): MainEventStatus | null {
  return typeof value === "string" &&
    (MAIN_EVENT_STATUSES as readonly string[]).includes(value)
    ? value as MainEventStatus
    : null;
}

function canonicalRefundStatus(
  value: unknown,
): ProviderPaymentRefundStatus | undefined {
  if (value === null || value === undefined || value === "none") return null;

  return value === "requested" ||
    value === "processing" ||
    value === "completed"
    ? value
    : undefined;
}

function canonicalCentavos(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function customerDisplayName(
  providerRequest: Readonly<Record<string, unknown>>,
  mainEvent: Readonly<Record<string, unknown>>,
): string {
  const name = [
    optionalText(
      providerRequest.customerFirstName ?? mainEvent.customerFirstName,
      120,
    ),
    optionalText(
      providerRequest.customerLastName ?? mainEvent.customerLastName,
      120,
    ),
  ].filter(Boolean).join(" ");

  return name || "FEASTA customer";
}

function serviceSummary(
  providerRequest: Readonly<Record<string, unknown>>,
): string {
  const packageName = optionalText(providerRequest.packageName, 160);
  if (packageName) return packageName;

  const serviceName = optionalText(providerRequest.serviceName, 160);
  if (serviceName) return serviceName;

  if (Array.isArray(providerRequest.services)) {
    const names = providerRequest.services
      .slice(0, 20)
      .flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
          return [];
        }

        const name = optionalText(
          (candidate as Record<string, unknown>).name,
          160,
        );

        return name ? [name] : [];
      });

    if (names.length > 0) return names.join(", ");
  }

  return providerRequest.type === "catering"
    ? "Catering service"
    : "Event service";
}

function documentId(value: unknown): string | null {
  return optionalDocumentId(value);
}

function optionalDocumentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();

  return /^[A-Za-z0-9_-]{1,160}$/u.test(normalized)
    ? normalized
    : null;
}

function optionalText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ");

  return normalized ? normalized.slice(0, maximumLength) : null;
}

function timestampIso(value: unknown): string | null {
  const date = dateValue(value);
  return date ? date.toISOString() : null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date
      : null;
  }

  return null;
}
