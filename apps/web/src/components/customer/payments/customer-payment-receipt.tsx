"use client";

import {
  ArrowLeft,
  Printer,
  ReceiptText,
} from "lucide-react";

import Link from "next/link";

import {
  StatusBadge,
  humanize,
} from "@/components/shared/status-badge";

import {
  Button,
} from "@/components/ui/button";

import type {
  CustomerPaymentReceipt,
} from "@/lib/customer/payments/customer-payment-types";

export function CustomerPaymentReceiptView({
  receipt,
}: {
  receipt: CustomerPaymentReceipt;
}) {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <div
        data-print-hidden
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <Button
          asChild
          variant="secondary"
        >
          <Link href="/customer/payments">
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
            />
            Back to payments
          </Link>
        </Button>

        <Button
          type="button"
          onClick={() =>
            window.print()
          }
        >
          <Printer
            aria-hidden="true"
            className="size-4"
          />
          Print receipt
        </Button>
      </div>

      <article
        data-payment-receipt
        className="overflow-hidden rounded-card border border-border bg-card shadow-card"
      >
        <header className="border-b border-border px-5 py-6 sm:px-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-primary-strong">
                <ReceiptText
                  aria-hidden="true"
                  className="size-5"
                />

                <p className="text-xs font-black uppercase tracking-[0.16em]">
                  FEASTA
                </p>
              </div>

              <h1 className="mt-2 text-2xl font-black sm:text-3xl">
                Payment Receipt
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Platform record of a payment processed for a FEASTA booking.
              </p>
            </div>

            <StatusBadge
              status={receipt.status}
            />
          </div>
        </header>

        <section
          className="grid gap-4 border-b border-border bg-muted/30 px-5 py-5 sm:grid-cols-3 sm:px-8"
          aria-label="Payment amounts"
        >
          <ReceiptAmount
            label="Amount paid"
            value={receipt.amountPaidFormatted}
          />

          <ReceiptAmount
            label="Refunded"
            value={receipt.refundedAmountFormatted}
          />

          <ReceiptAmount
            label="Net paid after refund"
            value={receipt.netPaidFormatted}
            strong
          />
        </section>

        <section
          className="grid gap-6 px-5 py-6 sm:px-8"
          aria-labelledby="receipt-details-heading"
        >
          <div>
            <h2
              id="receipt-details-heading"
              className="text-lg font-black"
            >
              Payment details
            </h2>

            <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <ReceiptDetail
                label="Provider"
                value={receipt.providerName}
              />

              <ReceiptDetail
                label="Service"
                value={receipt.serviceLabel}
              />

              <ReceiptDetail
                label="Booking"
                value={
                  receipt.bookingCode ||
                  receipt.bookingId
                }
              />

              <ReceiptDetail
                label="Payment type"
                value={paymentLabel(receipt)}
              />

              <ReceiptDetail
                label="Payment method"
                value="PayMongo"
              />

              <ReceiptDetail
                label="Payment status"
                value={humanize(receipt.status)}
              />

              <ReceiptDetail
                label="Payment ID"
                value={receipt.paymentId}
              />

              <ReceiptDetail
                label="Currency"
                value={receipt.currency}
              />

              <ReceiptDetail
                label="Paid"
                value={formatReceiptDate(receipt.paidAt)}
              />

              {receipt.refundedAmountInCentavos > 0 ? (
                <ReceiptDetail
                  label="Refund recorded"
                  value={formatReceiptDate(receipt.refundedAt)}
                />
              ) : null}
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-background p-4">
            <p className="text-sm leading-6 text-muted-foreground">
              {receipt.recordNotice}
            </p>
          </div>
        </section>

        <footer className="border-t border-border px-5 py-4 text-xs leading-5 text-muted-foreground sm:px-8">
          FEASTA · Ormoc City, Philippines · Currency: PHP
        </footer>
      </article>
    </div>
  );
}

function ReceiptAmount({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      <p
        className={
          `mt-1 ${
            strong
              ? "text-xl font-black text-primary-strong"
              : "text-lg font-black"
          }`
        }
      >
        {value}
      </p>
    </div>
  );
}

function ReceiptDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">
        {label}
      </dt>

      <dd className="mt-1 break-words text-sm font-bold">
        {value}
      </dd>
    </div>
  );
}

function paymentLabel(
  receipt: CustomerPaymentReceipt,
): string {
  if (
    receipt.paymentChoice === "full"
  ) {
    return "Full payment";
  }

  if (
    receipt.paymentChoice === "minimum"
  ) {
    return "Minimum payment";
  }

  if (
    receipt.paymentChoice === "remaining_balance"
  ) {
    return "Remaining balance";
  }

  return receipt.paymentType === "provider_balance"
    ? "Remaining booking balance"
    : "Booking down payment";
}

function formatReceiptDate(
  value: string | null,
): string {
  if (!value) {
    return "Not available";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    },
  ).format(date);
}