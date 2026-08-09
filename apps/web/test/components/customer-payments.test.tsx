import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {CustomerPaymentsClient} from "@/components/customer/payments/customer-payments-client";
import type {CustomerPaymentPage} from "@/lib/customer/payments/customer-payment-types";

const mocks = vi.hoisted(() => ({
  loadPayments: vi.fn(),
  createCheckout: vi.fn(),
  redirectCheckout: vi.fn(),
}));

vi.mock("@/app/customer/payments/actions", () => ({
  loadCustomerPaymentsAction: mocks.loadPayments,
}));

vi.mock("@/lib/customer/payments/customer-payment-client", () => ({
  createCustomerPaymentCheckout: mocks.createCheckout,
  redirectToCustomerPaymentCheckout: mocks.redirectCheckout,
}));

const initialPage: CustomerPaymentPage = {
  payments: [
    {
      id: "payment_pending_12345678",
      paymentId: "payment_pending_12345678",
      bookingId: "booking_pending_12345678",
      bookingCode: "FEASTA-1001",
      providerRequestId: "request_pending_12345678",
      providerId: "provider_one_12345678",
      providerName: "Ana Events",
      amountInCentavos: 250000,
      formattedAmount: "₱2,500.00",
      currency: "PHP",
      paymentType: "provider_down_payment",
      gateway: "paymongo",
      status: "pending",
      canStartCheckout: true,
      createdAt: "2026-08-08T01:00:00.000Z",
      updatedAt: null,
      paidAt: null,
      failedAt: null,
      expiredAt: null,
      refundedAt: null,
    },
    {
      id: "payment_paid_123456789",
      paymentId: "payment_paid_123456789",
      bookingId: "booking_paid_123456789",
      bookingCode: "FEASTA-1002",
      providerRequestId: "request_paid_123456789",
      providerId: "provider_two_123456789",
      providerName: "Ormoc Catering",
      amountInCentavos: 500000,
      formattedAmount: "₱5,000.00",
      currency: "PHP",
      paymentType: "provider_down_payment",
      gateway: "paymongo",
      status: "paid",
      canStartCheckout: false,
      createdAt: "2026-08-07T01:00:00.000Z",
      updatedAt: null,
      paidAt: "2026-08-07T02:00:00.000Z",
      failedAt: null,
      expiredAt: null,
      refundedAt: null,
    },
  ],
  statistics: {
    totalPayments: 2,
    awaitingPayment: 1,
    processing: 0,
    paid: 1,
    failedOrExpired: 0,
    refunded: 0,
    totalPaidInCentavos: 500000,
    totalPaidFormatted: "₱5,000.00",
  },
  nextCursor: null,
  hasMore: false,
};

describe("customer payments", () => {
  it("renders owned payment facts and checkout only for eligible records", () => {
    render(<CustomerPaymentsClient initialPage={initialPage} />);

    expect(screen.getByRole("heading", {name: "Payments"})).toBeVisible();
    expect(screen.getByText("Ana Events")).toBeVisible();
    expect(screen.getByText("Ormoc Catering")).toBeVisible();
    expect(screen.getAllByText("₱5,000.00").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", {name: /pay now/iu})).toHaveLength(1);
  });

  it("sends exact search and canonical status filters through the action", async () => {
    mocks.loadPayments.mockResolvedValue({...initialPage, payments: []});
    render(<CustomerPaymentsClient initialPage={initialPage} />);

    fireEvent.change(screen.getByRole("searchbox", {name: /search payments/iu}), {
      target: {value: "FEASTA-1001"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Search"}));

    await waitFor(() => expect(mocks.loadPayments).toHaveBeenCalledWith({
      search: "FEASTA-1001",
      status: "all",
      pageSize: 10,
      cursor: null,
    }));

    fireEvent.change(screen.getByRole("combobox", {name: "Payment status"}), {
      target: {value: "paid"},
    });
    await waitFor(() => expect(mocks.loadPayments).toHaveBeenLastCalledWith({
      search: "FEASTA-1001",
      status: "paid",
      pageSize: 10,
      cursor: null,
    }));
  });

  it("requires confirmation before creating and redirecting to checkout", async () => {
    const checkout = {
      paymentId: "payment_pending_12345678",
      providerRequestId: "request_pending_12345678",
      bookingId: "booking_pending_12345678",
      checkoutUrl: "https://checkout.paymongo.com/example",
      created: true,
    };
    mocks.createCheckout.mockResolvedValue(checkout);
    render(<CustomerPaymentsClient initialPage={initialPage} />);

    fireEvent.click(screen.getByRole("button", {name: /pay now/iu}));
    expect(screen.getByRole("heading", {name: /continue to secure checkout/iu})).toBeVisible();
    expect(mocks.createCheckout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", {name: /continue to paymongo/iu}));
    await waitFor(() => expect(mocks.createCheckout).toHaveBeenCalledWith("request_pending_12345678"));
    expect(mocks.redirectCheckout).toHaveBeenCalledWith(checkout);
  });
});
