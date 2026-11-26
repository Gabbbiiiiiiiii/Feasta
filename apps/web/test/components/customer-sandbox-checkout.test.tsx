import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  completeSandboxCheckout: vi.fn(),
}));

vi.mock("@/lib/customer/payments/customer-payment-client", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/customer/payments/customer-payment-client")
  >();
  return {
    ...actual,
    completeCustomerSandboxCheckout: mocks.completeSandboxCheckout,
  };
});

import {SandboxCheckoutClient} from "@/components/customer/payments/sandbox-checkout-client";

const baseProps = {
  paymentId: "payment_0378199916d5d0718e38879dc1580f7b",
  checkoutSessionId: "cs_sandbox_1234567890abcdef12345678",
  bookingId: "c979810d47890f6fb0f87b2a931108771eb3a725",
  bookingCode: "FEASTA-2026",
  providerName: "Gourmet Catering Co.",
  serviceLabel: "Lechon Belly Package",
  paymentChoiceLabel: "Full payment",
  amountFormatted: "₱5,110.20",
  paymentStatus: "processing",
  providerShareFormatted: "₱5,100.00",
  platformFeeFormatted: "₱10.20",
};

describe("SandboxCheckoutClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders direct-to-provider split summary and authorizes test payment with selected method", async () => {
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: {...window.location, assign: assignSpy},
      writable: true,
    });

    mocks.completeSandboxCheckout.mockResolvedValue({
      paymentId: baseProps.paymentId,
      bookingId: baseProps.bookingId,
      providerRequestId: "ce5c572baa7ab951d396ac37968d9ac8ac89e30c",
      outcome: "paid",
      applied: true,
      duplicate: false,
    });

    render(<SandboxCheckoutClient {...baseProps} />);

    expect(screen.getByText("Sandbox Test Mode · No Real Charge")).toBeVisible();
    expect(screen.getByText("₱5,100.00")).toBeVisible();
    expect(screen.getByText("₱10.20")).toBeVisible();
    expect(screen.getByText("₱5,110.20")).toBeVisible();

    fireEvent.click(screen.getByRole("radio", {name: /maya \(sandbox\)/iu}));
    fireEvent.click(
      screen.getByRole("button", {name: /authorize test payment \(₱5,110\.20\)/iu}),
    );

    await waitFor(() =>
      expect(mocks.completeSandboxCheckout).toHaveBeenCalledWith({
        paymentId: baseProps.paymentId,
        outcome: "paid",
        paymentMethod: "paymaya",
      }),
    );

    expect(assignSpy).toHaveBeenCalledWith(
      `/customer/payments?payment=success&ref=${encodeURIComponent(baseProps.paymentId)}`,
    );
  });

  it("simulates failed payment inline and still allows authorizing a retry", async () => {
    mocks.completeSandboxCheckout.mockResolvedValue({
      paymentId: baseProps.paymentId,
      bookingId: baseProps.bookingId,
      providerRequestId: "ce5c572baa7ab951d396ac37968d9ac8ac89e30c",
      outcome: "failed",
      applied: true,
      duplicate: false,
    });

    render(<SandboxCheckoutClient {...baseProps} />);

    fireEvent.click(
      screen.getByRole("button", {name: /simulate failed payment/iu}),
    );

    expect(
      await screen.findByText(/simulated payment declined/iu),
    ).toBeVisible();
    expect(mocks.completeSandboxCheckout).toHaveBeenCalledWith({
      paymentId: baseProps.paymentId,
      outcome: "failed",
      paymentMethod: "gcash",
    });
    expect(
      screen.getByRole("button", {name: /authorize test payment/iu}),
    ).not.toBeDisabled();
  });

  it("renders settled confirmation when payment is already paid", () => {
    render(<SandboxCheckoutClient {...baseProps} paymentStatus="paid" />);

    expect(screen.getByText(/this payment is already settled/iu)).toBeVisible();
    expect(
      screen.queryByRole("button", {name: /authorize test payment/iu}),
    ).not.toBeInTheDocument();
  });
});
