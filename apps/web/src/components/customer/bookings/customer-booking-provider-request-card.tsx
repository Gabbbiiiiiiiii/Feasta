import {TriangleAlert} from "lucide-react";
import {BookingPolicySummary} from "@/components/shared/booking-policy-summary";
import type {ReactNode} from "react";

import {
  bookingStatusLabel,
  boundedText,
  formatBookingDateTime,
  formatCurrency,
  formatPercentage,
  providerRequestOutcomeLabel,
  providerRequestResponseTimestamp,
  providerRequestServiceLabel,
} from "@/components/customer/bookings/booking-formatters";
import {
  providerPaymentPresentation,
} from "@/components/customer/bookings/customer-booking-confirmation";
import {StatusBadge} from "@/components/shared/status-badge";
import type {
  CustomerBookingProviderRequest,
  CustomerBookingService,
} from "@/lib/customer/bookings/customer-booking-types";
import {customerBookingPaymentPresentation, formatCustomerBalanceDeadline} from "@/lib/customer/bookings/customer-booking-payment-presentation";
import {hasPartialUpfrontPayment} from "@/lib/payments/customer-payment-presentation";
import {cn} from "@/lib/utils";

type CustomerBookingProviderRequestCardProps = {
  request: CustomerBookingProviderRequest;
  compact?: boolean;
  durableConfirmation?: boolean;
  paymentAction?: ReactNode;
  messageAction?: ReactNode;
  providerAction?: ReactNode;
  reviewAction?: ReactNode;
  cancellationStatus?: ReactNode;
  cancellationAction?: ReactNode;
};

const MAX_SERVICES_PER_REQUEST = 30;

function CustomerBookingProviderRequestCard({
  request,
  compact = false,
  durableConfirmation = false,
  paymentAction,
  messageAction,
  providerAction,
  reviewAction,
  cancellationStatus,
  cancellationAction,
}: CustomerBookingProviderRequestCardProps) {
  const services = request.services.slice(0, MAX_SERVICES_PER_REQUEST);
  const explanation = request.status === "rejected" ?
    boundedText(request.rejectionReason, "The provider did not include an explanation.", 500) :
    request.status === "cancelled" ?
      boundedText(request.cancellationReason, "No cancellation explanation was provided.", 500) :
      null;
  const responseTimestamp = providerRequestResponseTimestamp(request);
  const paymentPresentation = providerPaymentPresentation(request);
  const checkoutPresentation = customerBookingPaymentPresentation(request);
  const partialUpfront = hasPartialUpfrontPayment({
    amount: request.amount,
    upfrontAmount: request.downPaymentAmount,
  });

  return (
    <article className={cn(
      "grid min-w-0 gap-4 rounded-card border border-border bg-card p-4 shadow-none",
      !compact && "sm:p-5",
    )}>
      <BookingPolicySummary policy={request.bookingPolicy} />
      {!request.bookingPolicy && request.balanceEnforcement ? <div role="status" className="grid gap-1 text-sm">
        <p className="font-bold">{request.balanceEnforcement.label}</p>
        {request.balanceEnforcement.explanation ? <p>{request.balanceEnforcement.explanation}</p> : null}
      </div> : null}
      <header className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <h3 className="break-words text-base font-black tracking-tight sm:text-lg">
            {boundedText(request.providerName, "Provider unavailable", 120)}
          </h3>
          <p className="mt-1 break-words text-sm font-bold text-primary">
            {providerRequestServiceLabel(request)}
          </p>
          {request.packageName ? (
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
              Package: {boundedText(request.packageName, "Package", 120)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5 sm:max-w-[13rem] sm:justify-end">
          <StatusBadge status={request.status} label={bookingStatusLabel(request.status)} />
          {!durableConfirmation ? (
            <StatusBadge status={request.paymentStatus} />
          ) : null}
        </div>
      </header>

      <div className={cn(
        "rounded-xl border p-3",
        outcomeClassName(request.status),
      )}>
        <p className="text-sm font-bold">
          {request.status === "waiting_for_down_payment" ? "Accepted - payment required" : providerRequestOutcomeLabel(request)}
        </p>
        {request.status === "completed" && request.completedAt ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Completed {formatBookingDateTime(request.completedAt)}
          </p>
        ) : responseTimestamp ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Response received {formatBookingDateTime(responseTimestamp)}
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
        <FinancialMetric label="Total service price" value={formatCurrency(request.amount)} />
        {checkoutPresentation.currentAmount !== null ? <FinancialMetric label={checkoutPresentation.dueLabel} value={formatCurrency(checkoutPresentation.currentAmount)} /> : null}
      </dl>
      {paymentAction}
      {checkoutPresentation.showRemainingBalance ? (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
          <FinancialMetric label="Deposit paid" value={formatCurrency((request.grossSettledAmountInCentavos ?? 0) / 100)} />
          <FinancialMetric label="Remaining balance" value={formatCurrency((request.outstandingAmountInCentavos ?? 0) / 100)} />
          {request.remainingBalanceDueAt ? <FinancialMetric label="Balance due" value={formatCustomerBalanceDeadline(request.remainingBalanceDueAt)} /> : null}
        </dl>
      ) : null}
      {partialUpfront ? (
        <details className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer font-semibold">Original payment terms</summary>
          <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
            <FinancialMetric label="Payment terms" value={partialUpfront ? "Deposit + remaining balance" : "Full payment"} />
            <FinancialMetric label="Deposit amount" value={formatCurrency(request.downPaymentAmount)} />
            <FinancialMetric label="Remaining amount" value={formatCurrency(request.remainingBalance)} />
            <FinancialMetric label="Deposit rate" value={formatPercentage(request.downPaymentPercentage)} />
            {request.remainingBalanceDueAt && partialUpfront ? <FinancialMetric label="Balance deadline" value={formatCustomerBalanceDeadline(request.remainingBalanceDueAt)} /> : null}
          </dl>
        </details>
      ) : null}
      {checkoutPresentation.showRemainingBalance && request.remainingBalanceStatus && request.remainingBalanceStatus !== "not_applicable" ? (
        <RemainingBalanceLifecycle request={request} />
      ) : null}

      {durableConfirmation ? (
        <section
          aria-label={`Payment summary for ${boundedText(request.providerName, "provider", 80)}`}
          className="grid min-w-0 gap-3 rounded-xl border border-border bg-muted/25 p-3.5"
        >
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h4 className="text-sm font-black">Payment</h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {paymentPresentation.description}
              </p>
            </div>
            <div className="shrink-0">
              <StatusBadge
                status={paymentPresentation.status}
                label={paymentPresentation.label}
              />
            </div>
          </div>

          {paymentPresentation.showPaidAt && request.paidAt ? (
            <PaymentDate label="Paid" value={request.paidAt} />
          ) : null}
          {paymentPresentation.showRefundedAt && request.refundedAt ? (
            <PaymentDate label="Refunded" value={request.refundedAt} />
          ) : null}

          {checkoutPresentation.showRemainingBalance ? (
            <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
              Payment options will appear when they are available.
            </p>
          ) : null}
        </section>
      ) : null}

      {messageAction || providerAction ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {messageAction}
          {providerAction}
        </div>
      ) : null}
      {reviewAction}
      {cancellationStatus}
      {cancellationAction}

      <section
        className="grid min-w-0 gap-2.5"
        aria-label={`Services from ${boundedText(request.providerName, "provider", 80)}`}
      >
        <h4 className="text-sm font-bold">Included services</h4>
        {services.length > 0 ? (
          <ul className={cn(
            "grid gap-px overflow-hidden rounded-xl border border-border bg-border",
            !compact && "sm:grid-cols-2",
          )}>
            {services.map((service) => (
              <ServiceItem key={service.id} service={service} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-muted/35 px-3 py-2.5 text-sm text-muted-foreground">
            No itemized services were provided.
          </p>
        )}
      </section>

      {explanation ? (
        <aside className={cn(
          "rounded-xl border p-3.5",
          request.status === "rejected" ?
            "border-destructive/20 bg-destructive-subtle" :
            "border-border bg-muted/30",
        )}>
          <p className="text-sm font-bold">
            {request.status === "rejected" ? "Provider explanation" : "Cancellation explanation"}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
            {explanation}
          </p>
        </aside>
      ) : null}

      {request.status === "rejected" && request.replacementStatus === "required" ? (
        <p className="flex min-w-0 items-start gap-2 rounded-xl border border-warning/25 bg-warning-subtle p-3 text-sm font-bold text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">Replacement required</span>
        </p>
      ) : null}
    </article>
  );
}

function RemainingBalanceLifecycle({
  request,
}: {
  request: CustomerBookingProviderRequest;
}) {
  const status =
    request.remainingBalanceStatus;

  if (!status) {
    return null;
  }

  const showOutstanding =
    request.settlementStatus ===
      "deposit_settled" ||
    request.settlementStatus ===
      "balance_payment_processing" ||
    request.settlementStatus ===
      "fully_settled";

  return (
    <section
      aria-label={`Remaining balance for ${boundedText(
        request.providerName,
        "provider",
        80,
      )}`}
      className="grid gap-3 rounded-xl border border-border bg-muted/25 p-3.5"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-black">
            Remaining balance
          </h4>

        </div>

        <span className="inline-flex shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-bold">
          {remainingBalanceStatusLabel(status)}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        <FinancialMetric
          label="Balance status"
          value={remainingBalanceStatusLabel(
            status,
          )}
        />

        {request.grossSettledAmountInCentavos !== null ? (
          <FinancialMetric
            label="Customer paid so far"
            value={formatCurrency(
              request.grossSettledAmountInCentavos /
                100,
            )}
          />
        ) : null}

        {showOutstanding &&
        request.outstandingAmountInCentavos !== null ? (
          <FinancialMetric
            label="Remaining to pay"
            value={formatCurrency(
              request.outstandingAmountInCentavos /
                100,
            )}
          />
        ) : null}

        {request.remainingBalanceDueAt ? (
          <FinancialMetric
            label="Due"
            value={formatCustomerBalanceDeadline(
              request.remainingBalanceDueAt,
            )}
          />
        ) : null}

        {request.remainingBalanceGraceEndsAt &&
        (
          status === "grace_period" ||
          status === "overdue"
        ) ? (
          <FinancialMetric
            label="Overdue from"
            value={formatCustomerBalanceDeadline(
              request.remainingBalanceGraceEndsAt,
            )}
          />
        ) : null}
      </dl>

      <p className="text-xs leading-5 text-muted-foreground">
        Payment options will appear when they are available.
      </p>
    </section>
  );
}

function remainingBalanceStatusLabel(
  status:
    CustomerBookingProviderRequest[
      "remainingBalanceStatus"
    ],
): string {
  switch (status) {
    case "not_applicable":
      return "No balance due";

    case "not_due":
      return "Not due";

    case "due_soon":
      return "Due soon";

    case "due":
      return "Due today";

    case "grace_period":
      return "Grace period";

    case "overdue":
      return "Overdue";

    case "paid":
      return "Paid";

    case "cancelled":
      return "Cancelled";

    default:
      return "Unavailable";
  }
}

function FinancialMetric({label, value}: {label: string; value: string}) {
  return (
    <div className="min-w-0 bg-card p-3">
      <dt className="text-[0.6875rem] font-semibold leading-4 text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1.5 break-words text-sm font-black tabular-nums sm:text-base">
        {value}
      </dd>
    </div>
  );
}

function PaymentDate({label, value}: {label: string; value: string}) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 text-sm">
      <dt className="font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-bold">
        {formatBookingDateTime(value)}
      </dd>
    </dl>
  );
}

function ServiceItem({service}: {service: CustomerBookingService}) {
  return (
    <li className="flex min-w-0 items-start justify-between gap-3 bg-card px-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="break-words font-semibold">
          {boundedText(service.name, "Service", 120)}
        </p>
        {service.category ? (
          <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">
            {boundedText(service.category, "", 80)}
          </p>
        ) : null}
      </div>
      <span className="shrink-0 text-xs font-bold tabular-nums sm:text-sm">
        {formatCurrency(service.price)}
      </span>
    </li>
  );
}

function outcomeClassName(status: CustomerBookingProviderRequest["status"]): string {
  switch (status) {
    case "rejected":
    case "cancelled":
      return "border-destructive/20 bg-destructive-subtle text-destructive";
    case "expired":
      return "border-border bg-muted/40 text-foreground";
    case "pending":
    case "waiting_for_down_payment":
      return "border-warning/25 bg-warning-subtle text-warning";
    case "accepted":
    case "payment_processing":
      return "border-info/20 bg-info-subtle text-info";
    case "confirmed":
    case "in_progress":
    case "completed":
      return "border-success/20 bg-success-subtle text-success";
  }
}

export {
  CustomerBookingProviderRequestCard,
  type CustomerBookingProviderRequestCardProps,
};
