import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

import {
  expect,
  it,
  vi,
} from "vitest";

import {
  CustomerPaymentReceiptView,
} from "@/components/customer/payments/customer-payment-receipt";

import type {
  CustomerPaymentReceipt,
} from "@/lib/customer/payments/customer-payment-types";

const receipt: CustomerPaymentReceipt = {
  documentKind: "payment_receipt",
  paymentId: "payment_receipt_12345678",
  bookingId: "booking_receipt_12345678",
  bookingCode: "FEASTA-2026-1001",
  providerRequestId: "request_receipt_12345678",
  providerId: "provider_receipt_12345678",
  providerName: "Ormoc Event Catering",
  serviceLabel: "Wedding Catering Package",
  paymentChoice: "minimum",
  paymentType: "provider_down_payment",
  gateway: "paymongo",
  status: "partially_refunded",
  currency: "PHP",
  amountPaidInCentavos: 500000,
  amountPaidFormatted: "₱5,000.00",
  refundedAmountInCentavos: 150000,
  refundedAmountFormatted: "₱1,500.00",
  netPaidInCentavos: 350000,
  netPaidFormatted: "₱3,500.00",
  paidAt: "2026-09-20T02:00:00.000Z",
  refundedAt: "2026-09-22T03:00:00.000Z",
  recordNotice:
    "This Payment Receipt is a FEASTA platform payment record for the transaction shown. It is not a statutory fiscal document.",
};

it("renders refund-aware Payment Receipt amounts", () => {
  render(
    <CustomerPaymentReceiptView
      receipt={receipt}
    />,
  );

  expect(
    screen.getByRole(
      "heading",
      {name: "Payment Receipt"},
    ),
  ).toBeVisible();

  expect(
    screen.getByText("₱5,000.00"),
  ).toBeVisible();

  expect(
    screen.getByText("₱1,500.00"),
  ).toBeVisible();

  expect(
    screen.getByText("₱3,500.00"),
  ).toBeVisible();
});

it("prints using the browser print workflow", () => {
  const print =
    vi
      .spyOn(
        window,
        "print",
      )
      .mockImplementation(
        () => undefined,
      );

  render(
    <CustomerPaymentReceiptView
      receipt={receipt}
    />,
  );

  fireEvent.click(
    screen.getByRole(
      "button",
      {name: "Print receipt"},
    ),
  );

  expect(print).toHaveBeenCalledOnce();

  print.mockRestore();
});