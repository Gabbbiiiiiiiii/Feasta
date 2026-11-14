import {fireEvent, render, screen, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {CustomerPaymentReceiptView} from "@/components/customer/payments/customer-payment-receipt";
import type {CustomerPaymentReceipt} from "@/lib/customer/payments/customer-payment-types";

const baseReceipt: CustomerPaymentReceipt = {
  documentKind: "payment_receipt",
  paymentId: "payment_receipt_12345678",
  bookingId: "booking_receipt_12345678",
  bookingCode: "BK-2026-1001",
  providerRequestId: "request_receipt_12345678",
  providerId: "provider_receipt_12345678",
  providerName: "Ormoc Event Catering",
  serviceLabel: "Wedding Catering Package",
  paymentChoice: "remaining_balance",
  paymentType: "provider_balance",
  gateway: "paymongo",
  status: "paid",
  currency: "PHP",
  amountPaidInCentavos: 100000,
  amountPaidFormatted: "₱1,000.00",
  refundedAmountInCentavos: 0,
  refundedAmountFormatted: "₱0.00",
  netPaidInCentavos: 100000,
  netPaidFormatted: "₱1,000.00",
  paidAt: "2026-10-13T03:27:00.000Z",
  refundedAt: null,
  recordNotice: "This Payment Receipt is a FEASTA platform payment record for the transaction shown. It is not a statutory fiscal document.",
};

it("shows a genuine single-payment transaction summary without inventing tax or receipt data", () => {
  render(<CustomerPaymentReceiptView receipt={baseReceipt} />);
  expect(screen.getByRole("heading", {name: "Payment Receipt"})).toBeVisible();
  expect(screen.getByText("payment_receipt_12345678")).toBeVisible();
  expect(screen.getAllByText("BK-2026-1001").length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", {name: "Booking & service details"})).toBeVisible();
  expect(screen.getByRole("heading", {name: "Payment details"})).toBeVisible();
  const summary = screen.getByRole("table", {name: "Transaction summary"});
  expect(within(summary).getByText("Remaining balance")).toBeVisible();
  expect(within(summary).getAllByText("₱1,000.00").length).toBeGreaterThan(0);
  expect(within(summary).queryByText("Refund recorded")).not.toBeInTheDocument();
  expect(screen.getByText(/not a statutory fiscal document/i)).toBeVisible();
  expect(screen.queryByText(/receipt no\.|tax invoice|vat amount/i)).not.toBeInTheDocument();
});

it("retains authoritative refund and net-paid values for partially refunded payments", () => {
  render(<CustomerPaymentReceiptView receipt={{
    ...baseReceipt,
    status: "partially_refunded",
    amountPaidInCentavos: 500000,
    amountPaidFormatted: "₱5,000.00",
    refundedAmountInCentavos: 150000,
    refundedAmountFormatted: "₱1,500.00",
    netPaidInCentavos: 350000,
    netPaidFormatted: "₱3,500.00",
    refundedAt: "2026-10-15T03:27:00.000Z",
  }} />);
  const summary = screen.getByRole("table", {name: "Transaction summary"});
  expect(within(summary).getByText("-₱1,500.00")).toBeVisible();
  expect(within(summary).getByText("₱3,500.00")).toBeVisible();
  expect(screen.getByText("Refund recorded", {selector: "dt"})).toBeVisible();
});

it("retains existing navigation and browser-print action", () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
  render(<CustomerPaymentReceiptView receipt={baseReceipt} />);
  expect(screen.getByRole("link", {name: /Back to payments/})).toHaveAttribute("href", "/customer/payments");
  fireEvent.click(screen.getByRole("button", {name: "Print receipt"}));
  expect(print).toHaveBeenCalledOnce();
  print.mockRestore();
});
