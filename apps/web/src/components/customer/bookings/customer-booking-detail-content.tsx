import {
  CalendarDays,
  Info,
  PhilippinePeso,
  Users,
} from "lucide-react";

import {
  boundedText,
  formatBookingDate,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,
} from "@/components/customer/bookings/booking-formatters";
import {CustomerBookingProviderRequestCard} from "@/components/customer/bookings/customer-booking-provider-request-card";
import type {CustomerBookingDetails} from "@/lib/customer/bookings/customer-booking-types";

type CustomerBookingDetailContentProps = {
  details: CustomerBookingDetails;
};

function CustomerBookingDetailContent({
  details,
}: CustomerBookingDetailContentProps) {
  const {booking, providerRequests} = details;

  return (
    <div className="grid min-w-0 gap-5">
      <DetailSection title="Event details" icon={<CalendarDays />}>
        <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
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
        <div className="flex min-w-0 flex-col gap-1 rounded-xl bg-muted/30 p-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <p className="text-sm font-semibold text-muted-foreground">Estimated event total</p>
          <p className="break-words text-2xl font-black tabular-nums">
            {formatCurrency(booking.estimatedEventTotal)}
          </p>
        </div>
        <p className="mt-3 flex min-w-0 items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>Payments, down payments, and remaining balances are handled per provider request.</span>
        </p>
      </DetailSection>

      <DetailSection title="Provider requests" icon={<Users />}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <p className="text-sm leading-6 text-muted-foreground">
            Each provider responds and handles payment independently.
          </p>
          <span className="rounded-full bg-primary-tint px-2.5 py-1 text-xs font-bold text-primary">
            {formatCount(providerRequests.length)} {providerRequests.length === 1 ? "request" : "requests"}
          </span>
        </div>
        {providerRequests.length > 0 ? (
          <div className="mt-4 grid gap-4">
            {providerRequests.map((request) => (
              <CustomerBookingProviderRequestCard key={request.id} request={request} />
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
    <section aria-labelledby={headingId} className="rounded-card border border-border bg-card p-4 shadow-none sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary [&_svg]:size-4">
          {icon}
        </span>
        <h2 id={headingId} className="text-lg font-black tracking-tight sm:text-xl">{title}</h2>
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
    <div className="min-w-0 bg-card p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-2 break-words font-semibold">{value}</dd>
      {secondary ? <dd className="mt-1 break-words text-sm text-muted-foreground">{secondary}</dd> : null}
    </div>
  );
}

export {CustomerBookingDetailContent, type CustomerBookingDetailContentProps};
