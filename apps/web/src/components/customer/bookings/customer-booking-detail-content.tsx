import {
  CalendarDays,
  PhilippinePeso,
  Users,
} from "lucide-react";

import {
  bookingStatusLabel,
  boundedText,
  formatBookingDate,
  formatBookingDateTime,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,
  formatPercentage,
  providerRequestOutcomeLabel,
  providerRequestResponseTimestamp,
  providerRequestServiceLabel,
} from "@/components/customer/bookings/booking-formatters";
import {StatusBadge} from "@/components/shared/status-badge";
import type {
  CustomerBookingDetails,
  CustomerBookingProviderRequest,
} from "@/lib/customer/bookings/customer-booking-types";

type CustomerBookingDetailContentProps = {
  details: CustomerBookingDetails;
};

function CustomerBookingDetailContent({
  details,
}: CustomerBookingDetailContentProps) {
  const {booking, providerRequests} = details;

  return (
    <div className="grid min-w-0 gap-6">
      <DetailSection title="Event details" icon={<CalendarDays />}>
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Event type" value={boundedText(booking.eventType, "Unspecified event", 120)} />
          <DetailField
            label="Schedule"
            value={formatBookingDate(booking.eventDate)}
            secondary={formatBookingTimeRange(booking.eventTime, booking.eventEndTime)}
          />
          <DetailField label="Guest count" value={`${formatCount(booking.guestCount)} guests`} />
          <DetailField
            label="Location"
            value={boundedText(booking.eventLocation, "Location not provided", 160)}
            secondary={boundedText(booking.eventAddress, "", 240) || undefined}
          />
        </dl>
      </DetailSection>

      <DetailSection title="Event estimate" icon={<PhilippinePeso />}>
        <dl className="grid gap-3">
          <FinancialField label="Estimated total" value={booking.estimatedEventTotal} />
        </dl>
        <p className="mt-3 text-sm text-muted-foreground">
          Payment status and balances are shown separately for each provider request.
        </p>
      </DetailSection>

      <DetailSection title="Provider requests" icon={<Users />}>
        <p className="text-sm text-muted-foreground">
          {formatCount(providerRequests.length)} provider {providerRequests.length === 1 ? "request" : "requests"}
        </p>
        {providerRequests.length > 0 ? (
          <div className="mt-4 grid gap-4">
            {providerRequests.map((request) => (
              <ProviderRequestSummary key={request.id} request={request} />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-card border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            No provider requests are attached to this booking.
          </p>
        )}
      </DetailSection>
    </div>
  );
}

function ProviderRequestSummary({
  request,
}: {
  request: CustomerBookingProviderRequest;
}) {
  const explanation = request.status === "rejected" ?
    boundedText(request.rejectionReason, "The provider did not include an explanation.", 500) :
    request.status === "cancelled" ?
      boundedText(request.cancellationReason, "No cancellation explanation was provided.", 500) :
      null;
  const responseTimestamp = providerRequestResponseTimestamp(request);
  const serviceLabel = providerRequestServiceLabel(request);

  return (
    <article className="grid gap-4 rounded-card border border-border p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words font-bold">
            {boundedText(request.providerName, "Provider unavailable", 120)}
          </h3>
          <p className="mt-1 break-words text-sm font-semibold text-foreground">
            {serviceLabel}
          </p>
          {request.packageName ? (
            <p className="mt-1 break-words text-sm text-muted-foreground">
              Package: {boundedText(request.packageName, "Package", 120)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={request.status} label={bookingStatusLabel(request.status)} />
          <StatusBadge status={request.paymentStatus} />
        </div>
      </div>

      <div className="rounded-card border border-primary/15 bg-primary-tint p-3">
        <p className="text-sm font-bold text-primary-strong">
          {providerRequestOutcomeLabel(request)}
        </p>
        {responseTimestamp ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Response received {formatBookingDateTime(responseTimestamp)}
          </p>
        ) : null}
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FinancialField label="Request amount" value={request.amount} />
        <FinancialField label="Down payment" value={request.downPaymentAmount} />
        <FinancialField label="Remaining balance" value={request.remainingBalance} />
        <div className="rounded-card border border-border p-3">
          <dt className="text-xs font-semibold text-muted-foreground">Down payment rate</dt>
          <dd className="mt-2 font-black">{formatPercentage(request.downPaymentPercentage)}</dd>
        </div>
      </dl>

      {request.services.length > 0 ? (
        <section aria-label={`Services from ${boundedText(request.providerName, "provider", 80)}`}>
          <h4 className="text-sm font-bold">Included services</h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {request.services.map((service) => (
              <li key={service.id} className="flex min-w-0 items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="min-w-0 break-words font-semibold">{boundedText(service.name, "Service", 120)}</span>
                <span className="shrink-0 font-bold">{formatCurrency(service.price)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {explanation ? (
        <div className="rounded-card border border-border bg-muted/30 p-4">
          <p className="text-sm font-bold">
            {request.status === "rejected" ? "Provider explanation" : "Cancellation explanation"}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {explanation}
          </p>
        </div>
      ) : null}

      {request.status === "rejected" && request.replacementStatus === "required" ? (
        <p className="rounded-card border border-warning/25 bg-warning-subtle p-3 text-sm font-bold text-warning">
          Replacement required
        </p>
      ) : null}
    </article>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const headingId = `customer-booking-${title.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <section aria-labelledby={headingId} className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-tint text-primary [&_svg]:size-5">
          {icon}
        </span>
        <h2 id={headingId} className="text-xl font-black">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DetailField({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="rounded-card border border-border bg-muted/30 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-2 break-words font-semibold">{value}</dd>
      {secondary ? <dd className="mt-1 break-words text-sm text-muted-foreground">{secondary}</dd> : null}
    </div>
  );
}

function FinancialField({label, value}: {label: string; value: number}) {
  return (
    <div className="rounded-card border border-border p-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-2 truncate font-black">{formatCurrency(value)}</dd>
    </div>
  );
}

export {CustomerBookingDetailContent, type CustomerBookingDetailContentProps};
