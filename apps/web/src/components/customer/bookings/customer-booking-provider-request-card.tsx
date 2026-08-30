import {TriangleAlert} from "lucide-react";
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
import {cn} from "@/lib/utils";

type CustomerBookingProviderRequestCardProps = {
  request: CustomerBookingProviderRequest;
  compact?: boolean;
  durableConfirmation?: boolean;
  paymentAction?: ReactNode;
  messageAction?: ReactNode;
  providerAction?: ReactNode;
  reviewAction?: ReactNode;
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
}: CustomerBookingProviderRequestCardProps) {
  const services = request.services.slice(0, MAX_SERVICES_PER_REQUEST);
  const explanation = request.status === "rejected" ?
    boundedText(request.rejectionReason, "The provider did not include an explanation.", 500) :
    request.status === "cancelled" ?
      boundedText(request.cancellationReason, "No cancellation explanation was provided.", 500) :
      null;
  const responseTimestamp = providerRequestResponseTimestamp(request);
  const paymentPresentation = providerPaymentPresentation(request);

  return (
    <article className={cn(
      "grid min-w-0 gap-4 rounded-card border border-border bg-card p-4 shadow-none",
      !compact && "sm:p-5",
    )}>
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
          {providerRequestOutcomeLabel(request)}
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

      <dl className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border",
        !compact && "xl:grid-cols-4",
      )}>
        <FinancialMetric label="Service amount" value={formatCurrency(request.amount)} />
        <FinancialMetric label="Required down payment" value={formatCurrency(request.downPaymentAmount)} />
        <FinancialMetric label="Remaining balance" value={formatCurrency(request.remainingBalance)} />
        <FinancialMetric label="Down payment rate" value={formatPercentage(request.downPaymentPercentage)} />
      </dl>

      {durableConfirmation ? (
        <section
          aria-label={`Payment summary for ${boundedText(request.providerName, "provider", 80)}`}
          className="grid min-w-0 gap-3 rounded-xl border border-border bg-muted/25 p-3.5"
        >
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h4 className="text-sm font-black">Provider payment</h4>
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

          {request.remainingBalance > 0 ? (
            <p className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
              The remaining balance is informational. FEASTA does not currently collect provider balances online.
            </p>
          ) : null}
        </section>
      ) : null}

      {paymentAction}
      {messageAction || providerAction ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {messageAction}
          {providerAction}
        </div>
      ) : null}
      {reviewAction}

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
