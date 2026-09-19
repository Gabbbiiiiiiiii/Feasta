"use client";

import {
  Building2,
  CalendarClock,
  ReceiptText,
  UserRound,
} from "lucide-react";

import {
  PaymentIssueBadges,
} from "@/components/admin/payments/payment-issue-badges";
import {
  formatPaymentDate,
  formatPaymentType,
  paymentBookingLabel,
} from "@/components/admin/payments/payment-formatters";
import {
  PaymentStatusBadge,
} from "@/components/admin/payments/payment-status-badge";
import {Button} from "@/components/ui/button";
import type {
  AdminPayment,
} from "@/lib/admin/payments/admin-payment-types";

type PaymentMobileCardProps = {
  payment: AdminPayment;
  onViewDetails: (payment: AdminPayment) => void;
};

function PaymentMobileCard({
  payment,
  onViewDetails,
}: PaymentMobileCardProps) {
  return (
    <article
      className={[
        "min-w-0 rounded-card border",
        "border-border bg-card p-4",
        "shadow-card",
      ].join(" ")}
      aria-label={`Payment ${payment.paymentId}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">
            {payment.paymentId}
          </p>

          <p className="mt-1 truncate text-sm text-muted-foreground">
            {paymentBookingLabel(payment)}
          </p>
        </div>

        <PaymentStatusBadge
            status={payment.status}
        />
      </div>

      <p className="mt-4 break-words text-2xl font-black tracking-tight">
        {payment.formattedAmount}
      </p>

      <p className="mt-1 text-sm font-medium text-muted-foreground">
        {formatPaymentType(
          payment.paymentType,
        )}
      </p>

      <dl className="mt-4 grid min-w-0 gap-3 text-sm">
        <div className="flex min-w-0 items-start gap-3">
          <UserRound
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />

          <div className="min-w-0">
            <dt className="font-semibold text-muted-foreground">
              Customer
            </dt>

            <dd className="break-words font-medium">
              {payment.customerName}
            </dd>
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-3">
          <Building2
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />

          <div className="min-w-0">
            <dt className="font-semibold text-muted-foreground">
              Provider
            </dt>

            <dd className="break-words font-medium">
              {payment.providerName}
            </dd>
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-3">
          <ReceiptText
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />

          <div className="min-w-0">
            <dt className="font-semibold text-muted-foreground">
              Gateway
            </dt>

            <dd className="break-words font-medium">
              PayMongo
            </dd>
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-3">
          <CalendarClock
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />

          <div className="min-w-0">
            <dt className="font-semibold text-muted-foreground">
              {payment.status === "paid"
                ? "Paid at"
                : "Created at"}
            </dt>

            <dd className="break-words font-medium">
              {formatPaymentDate(
                payment.status === "paid"
                  ? payment.paidAt
                  : payment.createdAt,
              )}
            </dd>
          </div>
        </div>
      </dl>

      {payment.issues.length > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <PaymentIssueBadges
            issues={payment.issues}
          />
        </div>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="compact"
        className="mt-4 w-full"
        onClick={() =>
          onViewDetails(payment)
        }
        aria-label={`View payment ${payment.paymentId} details`}
      >
        View details
      </Button>
    </article>
  );
}

export {
  PaymentMobileCard,
  type PaymentMobileCardProps,
};