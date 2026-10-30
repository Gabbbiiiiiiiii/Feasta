"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  FileText,
  Printer,
  ReceiptText,
  RotateCcw,
  Store,
  Wallet,
} from "lucide-react";

import {StatusBadge, humanize} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import type {CustomerPaymentReceipt} from "@/lib/customer/payments/customer-payment-types";

/**
 * A printable FEASTA platform payment record for ONE verified payment.
 * All monetary values and identifying details come from the authorized
 * CustomerPaymentReceipt projection. This is not a statutory fiscal receipt.
 */
export function CustomerPaymentReceiptView({
  receipt,
}: {
  receipt: CustomerPaymentReceipt;
}) {
  const bookingReference = receipt.bookingCode || receipt.bookingId;
  const paymentDescription = paymentLabel(receipt);
  const hasRefund = receipt.refundedAmountInCentavos > 0;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-5">
      <div
        data-print-hidden
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <Button asChild variant="secondary">
          <Link href="/customer/payments">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to payments
          </Link>
        </Button>
        <Button type="button" onClick={() => window.print()}>
          <Printer aria-hidden="true" className="size-4" />
          Print receipt
        </Button>
      </div>

      <article
        data-payment-receipt
        className="min-w-0 overflow-hidden rounded-[22px] border border-feasta-border-soft bg-white shadow-card print:rounded-none print:border-0 print:shadow-none"
        aria-label="FEASTA payment receipt"
      >
        {/* Receipt heading. Do not invent a fiscal receipt number. */}
        <header className="relative overflow-hidden border-b border-feasta-border-soft px-5 py-6 sm:px-8 sm:py-8 print:px-0 print:py-3">
          <div className="pointer-events-none absolute -right-10 -top-16 size-52 rounded-full bg-primary-tint/45 blur-2xl print:hidden" aria-hidden="true" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-primary-strong">
                <ReceiptText aria-hidden="true" className="size-5" />
                <span className="text-xs font-black uppercase tracking-[0.18em]">FEASTA</span>
              </div>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                Payment Receipt
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-feasta-text-secondary">
                Platform record of a payment processed for a FEASTA booking.
              </p>
            </div>
            <div className="shrink-0 self-start">
              <StatusBadge status={receipt.status} />
            </div>
          </div>
        </header>

        {/* Facts about this specific payment, not the entire booking. */}
        <section
          aria-label="Transaction references"
          className="grid gap-4 border-b border-feasta-border-soft px-5 py-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 print:grid-cols-4 print:px-0 print:py-3"
        >
          <ReceiptFact label="Payment reference" value={receipt.paymentId} />
          <ReceiptFact label="Booking reference" value={bookingReference} />
          <ReceiptFact label="Paid date and time" value={formatReceiptDate(receipt.paidAt)} />
          <ReceiptFact label="Payment gateway" value={gatewayLabel(receipt)} />
        </section>

        {/* The customer-safe projection already includes any refunded amounts. */}
        <section
          aria-label="Payment amounts"
          className="m-4 grid gap-0 overflow-hidden rounded-xl border border-primary/10 bg-primary-tint/30 sm:m-6 sm:grid-cols-3 print:m-0 print:grid-cols-3 print:rounded-none print:border-0"
        >
          <ReceiptAmount
            icon={CreditCard}
            label="Amount paid"
            value={receipt.amountPaidFormatted}
          />
          <ReceiptAmount
            icon={RotateCcw}
            label="Refunded"
            value={receipt.refundedAmountFormatted}
          />
          <ReceiptAmount
            icon={Wallet}
            label="Net paid after refund"
            value={receipt.netPaidFormatted}
            strong
          />
        </section>

        <section className="grid gap-6 px-5 pb-6 pt-2 sm:grid-cols-2 sm:gap-8 sm:px-8 print:grid-cols-2 print:gap-5 print:px-0 print:pb-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
              <Store aria-hidden="true" className="size-[18px] text-primary-strong" />
              Booking &amp; service details
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <ReceiptDetail label="Provider" value={receipt.providerName} />
              <ReceiptDetail label="Service" value={receipt.serviceLabel} />
              <ReceiptDetail label="Booking" value={bookingReference} />
              <ReceiptDetail label="Payment type" value={paymentDescription} />
            </dl>
          </div>

          <div className="min-w-0 border-t border-feasta-border-soft pt-5 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0 print:border-l print:border-t-0 print:pl-5 print:pt-0">
            <h2 className="flex items-center gap-2 text-base font-black text-foreground sm:text-lg">
              <FileText aria-hidden="true" className="size-[18px] text-primary-strong" />
              Payment details
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <ReceiptDetail label="Payment gateway" value={gatewayLabel(receipt)} />
              <ReceiptDetail label="Payment status" value={humanize(receipt.status)} />
              <ReceiptDetail label="Currency" value={receipt.currency} />
              <ReceiptDetail label="Paid date & time" value={formatReceiptDate(receipt.paidAt)} />
              {hasRefund ? (
                <ReceiptDetail label="Refund recorded" value={formatReceiptDate(receipt.refundedAt)} />
              ) : null}
            </dl>
          </div>
        </section>

        <section className="border-t border-dashed border-feasta-border-strong px-5 py-6 sm:px-8 print:px-0 print:py-3" aria-labelledby="transaction-summary-heading">
          <h2 id="transaction-summary-heading" className="text-base font-black text-foreground sm:text-lg">
            Transaction summary
          </h2>
          <div className="mt-4 min-w-0 overflow-hidden rounded-xl border border-feasta-border-soft print:rounded-none">
            <table className="w-full table-fixed text-left text-sm" aria-label="Transaction summary">
              <thead className="bg-feasta-surface-soft text-xs uppercase tracking-wide text-feasta-text-secondary">
                <tr>
                  <th scope="col" className="w-[68%] px-4 py-3 font-bold">Description</th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody className="text-feasta-text-secondary">
                <tr className="border-t border-feasta-border-soft">
                  <td className="px-4 py-3 align-top">
                    <p className="font-bold text-foreground">{paymentDescription}</p>
                    <p className="mt-0.5 break-words text-xs">{receipt.serviceLabel}</p>
                  </td>
                  <td className="px-4 py-3 text-right align-top font-bold tabular-nums text-foreground">
                    {receipt.amountPaidFormatted}
                  </td>
                </tr>
                {hasRefund ? (
                  <tr className="border-t border-feasta-border-soft">
                    <td className="px-4 py-3">Refund recorded</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      -{receipt.refundedAmountFormatted}
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr className="border-t border-feasta-border-soft bg-primary-tint/30">
                  <th scope="row" className="px-4 py-3 text-left text-sm font-black text-foreground">
                    Net paid after refund
                  </th>
                  <td className="px-4 py-3 text-right text-base font-black tabular-nums text-primary-strong">
                    {receipt.netPaidFormatted}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-feasta-text-tertiary">
            <CalendarDays aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            This record covers the individual payment identified above, not all payments for the booking.
          </p>
        </section>

        <footer className="grid gap-3 border-t border-feasta-border-soft px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-8 print:grid-cols-[minmax(0,1fr)_auto] print:px-0 print:py-3">
          <p className="rounded-xl border border-feasta-border-soft bg-feasta-surface-soft px-4 py-3 text-xs leading-5 text-feasta-text-secondary print:border-0 print:bg-transparent print:p-0">
            {receipt.recordNotice}
          </p>
          <p className="text-xs leading-5 text-feasta-text-tertiary">
            FEASTA · Ormoc City, Philippines
            <span className="block">Currency: PHP</span>
          </p>
        </footer>
      </article>
    </div>
  );
}

type ReceiptIcon = typeof CreditCard;

function ReceiptAmount({
  icon: Icon,
  label,
  value,
  strong = false,
}: {
  icon: ReceiptIcon;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0 border-b border-primary/10 px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:px-5 sm:py-5 sm:last:border-r-0 print:border-b-0 print:border-r print:px-3 print:py-2 print:last:border-r-0">
      <div className="flex items-center gap-2 text-primary-strong">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-feasta-text-secondary">{label}</p>
      </div>
      <p className={`mt-2 break-words text-xl font-black tabular-nums ${strong ? "text-primary-strong" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function ReceiptFact({label, value}: {label: string; value: string}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-feasta-text-secondary">{label}</p>
      <p className="mt-1 break-all text-xs font-bold text-foreground sm:break-words sm:text-sm">{value}</p>
    </div>
  );
}

function ReceiptDetail({label, value}: {label: string; value: string}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-feasta-text-secondary">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-foreground">{value}</dd>
    </div>
  );
}

function gatewayLabel(receipt: CustomerPaymentReceipt): string {
  return receipt.gateway === "paymongo" ? "PayMongo" : humanize(receipt.gateway);
}

function paymentLabel(receipt: CustomerPaymentReceipt): string {
  if (receipt.paymentChoice === "full") return "Full payment";
  if (receipt.paymentChoice === "minimum") return "Minimum payment";
  if (receipt.paymentChoice === "remaining_balance") return "Remaining balance";
  return receipt.paymentType === "provider_balance"
    ? "Remaining booking balance"
    : "Booking down payment";
}

function formatReceiptDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}
