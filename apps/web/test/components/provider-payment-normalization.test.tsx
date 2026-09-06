import {describe, expect, it} from "vitest";

import {
  formatPhpCentavos,
  normalizeProviderPaymentRecord,
  type ProviderPaymentSourceDocument,
} from "@/lib/provider/payments/provider-payment-normalization";

const paymentId = "payment_request_12345678";
const providerRequestId = "request_12345678";
const mainEventId = "event_12345678";
const providerId = "provider_12345678";
const customerId = "customer_12345678";

function document(
  id: string,
  data: Record<string, unknown>,
): ProviderPaymentSourceDocument {
  return {id, data};
}

function records(overrides: {
  payment?: Record<string, unknown>;
  providerRequest?: Record<string, unknown>;
  mainEvent?: Record<string, unknown>;
  trustedProviderId?: string;
} = {}) {
  return {
    payment: document(paymentId, {
      paymentId,
      providerRequestId,
      mainEventId,
      bookingId: mainEventId,
      providerId,
      customerId,
      amount: 1250,
      amountInCentavos: 125000,
      currency: "PHP",
      paymentType: "provider_down_payment",
      status: "paid",
      refundStatus: null,
      createdAt: new Date("2026-08-20T01:00:00.000Z"),
      updatedAt: new Date("2026-08-20T02:00:00.000Z"),
      paidAt: new Date("2026-08-20T02:00:00.000Z"),
      failedAt: null,
      expiredAt: null,
      refundedAt: null,
      ...overrides.payment,
    }),
    providerRequest: document(providerRequestId, {
      providerId,
      customerId,
      mainEventId,
      status: "confirmed",
      type: "catering",
      packageName: "Celebration Package",
      customerFirstName: "Ana",
      customerLastName: "Reyes",
      eventType: "birthday",
      eventDate: new Date("2026-09-20T04:00:00.000Z"),
      eventTime: "12:00",
      ...overrides.providerRequest,
    }),
    mainEvent: document(mainEventId, {
      customerId,
      status: "confirmed",
      eventType: "birthday",
      eventDate: new Date("2026-09-20T04:00:00.000Z"),
      eventTime: "12:00",
      ...overrides.mainEvent,
    }),
    trustedProviderId: overrides.trustedProviderId ?? providerId,
  };
}

describe("provider payment normalization", () => {
  it("maps centavo-based provider-safe payment and joined event data", () => {
    const result = normalizeProviderPaymentRecord(records());

    expect(result).not.toBeNull();
    expect(result?.payment).toMatchObject({
      paymentId,
      providerRequestId,
      mainEventId,
      customerDisplayName: "Ana Reyes",
      eventType: "birthday",
      eventTime: "12:00",
      serviceSummary: "Celebration Package",
      amount: 1250,
      amountInCentavos: 125000,
      currency: "PHP",
      status: "paid",
      refundStatus: null,
    });
    expect(result?.providerRequestStatus).toBe("confirmed");
    expect(result?.mainEventStatus).toBe("confirmed");
    expect(result?.payment).not.toHaveProperty("customerId");
    expect(result?.payment).not.toHaveProperty("checkoutUrl");
    expect(formatPhpCentavos(123456)).toMatch(/1,234\.56/u);
  });

  it.each([
    "pending",
    "processing",
    "paid",
    "failed",
    "expired",
    "refunded",
  ] as const)("preserves canonical %s payment status", (status) => {
    const result = normalizeProviderPaymentRecord(records({
      payment: {status},
    }));

    expect(result?.payment.status).toBe(status);
  });

  it("keeps a requested refund separate from canonical paid status", () => {
    const result = normalizeProviderPaymentRecord(records({
      payment: {
        status: "paid",
        refundStatus: "requested",
      },
    }));

    expect(result?.payment.status).toBe("paid");
    expect(result?.payment.refundStatus).toBe("requested");
  });

  it.each([
    {
      name: "payment provider",
      changes: {payment: {providerId: "provider_other"}},
    },
    {
      name: "provider-request provider",
      changes: {providerRequest: {providerId: "provider_other"}},
    },
    {
      name: "provider-request event",
      changes: {providerRequest: {mainEventId: "event_other"}},
    },
    {
      name: "provider-request customer",
      changes: {providerRequest: {customerId: "customer_other"}},
    },
    {
      name: "main-event customer",
      changes: {mainEvent: {customerId: "customer_other"}},
    },
  ])("fails closed for inconsistent $name linkage", ({changes}) => {
    expect(normalizeProviderPaymentRecord(records(changes))).toBeNull();
  });

  it("fails closed for missing relations and malformed financial fields", () => {
    expect(normalizeProviderPaymentRecord({
      ...records(),
      providerRequest: null,
    })).toBeNull();
    expect(normalizeProviderPaymentRecord(records({
      payment: {amountInCentavos: 1250.5},
    }))).toBeNull();
    expect(normalizeProviderPaymentRecord(records({
      payment: {currency: "USD"},
    }))).toBeNull();
    expect(normalizeProviderPaymentRecord(records({
      payment: {status: "cancelled"},
    }))).toBeNull();
    expect(normalizeProviderPaymentRecord(records({
      payment: {refundStatus: "partially_refunded"},
    }))).toBeNull();
  });
});
