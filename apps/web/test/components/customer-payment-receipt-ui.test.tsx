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
    screen.getAllByText("₱5,000.00")[0],
  ).toBeVisible();

  expect(
    screen.getByText("₱1,500.00"),
  ).toBeVisible();

  expect(
    screen.getAllByText("₱3,500.00")[0],
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

it("shows service charge breakdown without changing the customer total", () => {
  render(
    <CustomerPaymentReceiptView
      receipt={{
        ...receipt,
        chargeBreakdown: {
          status: "available",
          serviceAmountInCentavos: 500000,
          platformChargeInCentavos: 50000,
          notice:
            "Service charge is deducted from provider proceeds. It is not an additional customer charge.",
        },
      }}
    />,
  );

  const summary = screen.getByRole("table", {name: "Transaction summary"});
  expect(summary).toHaveTextContent("Service charge");
  expect(summary).toHaveTextContent("₱500.00");
  expect(summary).not.toHaveTextContent("Customer service fee");
  expect(summary).not.toHaveTextContent("FEASTA platform charge");
  expect(
    screen.getAllByText(/deducted from provider proceeds/i).length,
  ).toBeGreaterThan(0);
});

it("displays payment-specific included VAT and its refund reversal", () => {
  render(
    <CustomerPaymentReceiptView
      receipt={{
        ...receipt,
        serviceVat: {
          status: "available",
          taxType: "vat_registered",
          includedInPaymentInCentavos: 53571,
          reversedInCentavos: 16071,
          netIncludedInCentavos: 37500,
        },
      }}
    />,
  );

  const section = screen.getByRole("region", {
    name: "Service VAT breakdown",
  });

  expect(section).toHaveTextContent("Included service VAT");
  expect(section).toHaveTextContent("₱535.71");
  expect(section).toHaveTextContent("₱160.71");
  expect(section).toHaveTextContent("₱375.00");
  expect(section).toHaveTextContent("not an additional charge");
  expect(section).not.toHaveTextContent(/FEASTA VAT on commission/i);
});

it("shows Non-VAT without adding a VAT charge", () => {
  render(
    <CustomerPaymentReceiptView
      receipt={{
        ...receipt,
        serviceVat: {
          status: "available",
          taxType: "non_vat",
          includedInPaymentInCentavos: 0,
          reversedInCentavos: 0,
          netIncludedInCentavos: 0,
        },
      }}
    />,
  );

  expect(
    screen.getByText(/Non-VAT service. No provider VAT is included/i),
  ).toBeVisible();

  expect(screen.queryByText("Included service VAT")).not.toBeInTheDocument();
});

it("does not invent VAT when financial evidence is unavailable", () => {
  render(
    <CustomerPaymentReceiptView
      receipt={{
        ...receipt,
        serviceVat: {status: "unavailable"},
      }}
    />,
  );

  expect(
    screen.getByText("VAT breakdown unavailable for this payment."),
  ).toBeVisible();

  expect(screen.queryByText("Included service VAT")).not.toBeInTheDocument();
});