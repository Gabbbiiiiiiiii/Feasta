"use client";

import {
  Building2,
  CalendarClock,
  UserRound,
} from "lucide-react";

import {
  PaymentIssueBadges,
} from "@/components/admin/payments/payment-issue-badges";
import {
  formatPaymentDate,
  formatAdminPaymentPurpose,
  paymentBookingLabel,
  paymentReferenceLabel,
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
      className="min-w-0 rounded-card border border-border bg-card p-4 shadow-xs"
      aria-label={`Payment ${paymentReferenceLabel(payment)}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">
            {paymentReferenceLabel(payment)}
          </p>

          <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
            {paymentBookingLabel(payment)}
          </p>
        </div>

        <PaymentStatusBadge status={payment.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-border/70 pb-3">
        <div className="min-w-0">
          <p className="break-words text-2xl font-black tracking-tight tabular-nums text-primary">
            {payment.formattedAmount}
          </p>
          {payment.formattedCommissionAmount ? (
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
              FEASTA fee {payment.formattedCommissionAmount}
            </p>
          ) : null}
          {payment.refundedAmountFormatted ? (
            <p className="mt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
              Refunded {payment.refundedAmountFormatted}
            </p>
          ) : null}
        </div>
        <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">
          {formatAdminPaymentPurpose(payment)}
        </span>
      </div>

      <dl className="mt-3 grid min-w-0 grid-cols-2 gap-3 text-sm">
        <div className="flex min-w-0 items-start gap-2">
          <UserRound
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />

          <div className="min-w-0">
            <dt className="text-xs font-semibold text-muted-foreground">
              Customer
            </dt>

            <dd className="mt-0.5 break-words text-sm font-medium">
              {payment.customerName}
            </dd>
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-2">
          <Building2
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />

          <div className="min-w-0">
            <dt className="text-xs font-semibold text-muted-foreground">
              Provider
            </dt>

            <dd className="mt-0.5 break-words text-sm font-medium">
              {payment.providerName}
            </dd>
          </div>
        </div>

        <div className="col-span-2 flex min-w-0 items-start gap-2">
          <CalendarClock
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />

          <div className="min-w-0">
            <dt className="text-xs font-semibold text-muted-foreground">
              Date
            </dt>

            <dd className="mt-0.5 break-words text-sm font-medium">
              {formatPaymentDate(
                payment.paidAt ?? payment.createdAt,
              )}
            </dd>
          </div>
        </div>
      </dl>

      {payment.issues.length > 0 ? (
        <div className="mt-3 border-t border-border/70 pt-3">
          <PaymentIssueBadges issues={payment.issues} />
        </div>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="compact"
        className="mt-4 w-full"
        onClick={() => onViewDetails(payment)}
        aria-label={`View payment ${paymentReferenceLabel(payment)} details`}
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
