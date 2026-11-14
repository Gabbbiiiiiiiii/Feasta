"use client";

import {BookingLifecycleStatus, BookingLifecycleNotice} from "@/components/shared/booking-lifecycle-status";
import {ProviderBookingStatus, useProviderBookingPresentation} from "@/components/provider/provider-booking-status";

import {formatEventTime} from "@/lib/presentation/event-time";

import {
  CalendarDays,
  Clock3,
  MapPin,
  PackageOpen,
  Users,
} from "lucide-react";

import {DetailDrawer} from "@/components/data";
import {SectionLoading} from "@/components/feedback/application-states";
import {PriceDisplay} from "@/components/shared/price-display";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import type {
  ProviderBooking,
  ProviderBookingTimeline,
} from "@/lib/provider/bookings/provider-booking-types";

type ProviderBookingDetailDrawerProps = {
  booking: ProviderBooking | null;
  timeline: ProviderBookingTimeline | null;
  open: boolean;
  loading: boolean;
  error: string | null;
  actionPending: boolean;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onStart: () => void;
  onComplete: () => void;
  onPreparationStarted: () => void;
};

export function ProviderBookingDetailDrawer({
  booking: canonicalBooking,
  timeline,
  open,
  loading,
  error,
  actionPending,
  onOpenChange,
  onRetry,
  onStart,
  onComplete,
  onPreparationStarted,
}: ProviderBookingDetailDrawerProps) {
  const booking = useProviderBookingPresentation(canonicalBooking);
  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Booking details"
      description="Review the event, payment, and service activity for this booking."
      footer={booking ? (
        <LifecycleFooter
          booking={booking}
          pending={actionPending}
          onStart={onStart}
          onComplete={onComplete}
        />
      ) : undefined}
    >
      {loading ? (
        <SectionLoading label="Loading booking details" />
      ) : error ? (
        <div className="grid gap-4 rounded-card border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <div>
            <p className="font-semibold">Booking details are unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="secondary" size="compact" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : booking ? (
        <div className="grid gap-6">
          <DrawerSection title="Booking Status">
            {booking.balanceEnforcement ? <div role="status" className="grid gap-1 text-sm">
              <p className="font-bold">{booking.balanceEnforcement.label}</p>
              {booking.balanceEnforcement.explanation ? <p>{booking.balanceEnforcement.explanation}</p> : null}
            </div> : null}
            <div className="flex items-center justify-between gap-3 text-sm"><span>Provider request</span><ProviderBookingStatus booking={booking} detailed /></div>
            <div className="flex items-center justify-between gap-3 text-sm"><span>Main event</span><BookingLifecycleStatus status={booking.mainEventStatus} evidence={booking.lifecycle} /></div>
            <BookingLifecycleNotice status={booking.mainEventStatus} evidence={booking.lifecycle} />
          </DrawerSection>

          <DrawerSection title="Event Details">
            <DetailRow
              icon={<CalendarDays className="size-4" />}
              label="Event"
              value={formatLabel(booking.eventType)}
            />
            <DetailRow
              icon={<CalendarDays className="size-4" />}
              label="Date"
              value={formatDate(booking.eventDate)}
            />
            <DetailRow
              icon={<Clock3 className="size-4" />}
              label="Time"
              value={formatEventTime(booking.eventTime) || "Not provided"}
            />
            <DetailRow
              icon={<Users className="size-4" />}
              label="Guests"
              value={booking.guestCount > 0
                ? booking.guestCount.toLocaleString("en-PH")
                : "Not provided"}
            />
            <DetailRow
              icon={<MapPin className="size-4" />}
              label="Venue"
              value={booking.locationSummary || booking.venueAddress || "Not provided"}
            />
          </DrawerSection>

          <DrawerSection title="Customer Information">
            <DetailRow label="Customer" value={booking.customerDisplayName} />
          </DrawerSection>

          <DrawerSection title="Package & Services">
            <DetailRow
              icon={<PackageOpen className="size-4" />}
              label={booking.packageName ? "Package" : "Service"}
              value={booking.serviceSummary}
            />
            {booking.serviceCategory ? (
              <DetailRow label="Category" value={formatLabel(booking.serviceCategory)} />
            ) : null}
            {booking.services.length > 0 ? (
              <ul className="grid gap-2" aria-label="Selected services">
                {booking.services.map((service) => (
                  <li key={service.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                    <span>
                      <span className="block font-medium">{service.name}</span>
                      <span className="text-muted-foreground">Quantity {service.quantity}</span>
                    </span>
                    <PriceDisplay amount={service.totalPrice} className="shrink-0" />
                  </li>
                ))}
              </ul>
            ) : null}
          </DrawerSection>

          <DrawerSection title="Payment Details">
            {booking.paymentAttention ? <p role="status">{booking.paymentAttention}{booking.paymentAttention === "Payment Being Checked" ? " ? Please wait for the payment result." : ""}</p> : null}
            {booking.remainingBalance !== null ? (
              <AmountRow label="Balance remaining" amount={booking.remainingBalance} />
            ) : <DetailRow label="Balance remaining" value="Unavailable" />}
            <AmountRow label="Requested amount" amount={booking.requestedAmount} />
            {booking.acceptedAmount !== null ? (
              <AmountRow label="Accepted amount" amount={booking.acceptedAmount} />
            ) : null}
            {booking.paymentAmount !== null ? (
              <AmountRow label="Recorded payment" amount={booking.paymentAmount} />
            ) : null}
            <StatusRow
              label="Payment status"
              status={booking.paymentStatus}
              emptyLabel="No payment recorded"
            />
          </DrawerSection>

          {booking.refundEligibility.evidenceStatus !== "legacy" ? <DrawerSection title="Event Preparation">
            {booking.refundEligibility.evidenceStatus === "policy_backed" ? (
              <>
                <DetailRow
                  label="Preparation Status"
                  value={booking.refundEligibility.currentStage
                    ? formatLabel(booking.refundEligibility.currentStage)
                    : "Unavailable"}
                />
                {booking.refundEligibility.reconciliationLocked ? <div role="status" className="rounded-lg border border-warning p-3 text-sm">Preparation updates are paused while FEASTA resolves a booking reconciliation issue.</div> : null}
                {booking.refundEligibility.activeCancellationLocked ? (
                  <div className="rounded-lg border border-warning bg-warning-subtle p-3 text-sm" role="status">
                    Preparation updates are paused while a cancellation request is being reviewed.
                  </div>
                ) : null}
                {!booking.automaticLifecycle && !booking.lifecycle?.reconciliation && !booking.lifecycle?.cancellation && booking.refundEligibility.canMarkPreparationStarted ? (
                  <Button variant="secondary" disabled={actionPending} onClick={onPreparationStarted}>
                    Mark Preparation Started
                  </Button>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  This records factual preparation progress only. It does not approve a cancellation or choose any refund amount or percentage.
                </p>
              </>
            ) : (
              <p className="text-sm text-warning">Preparation information is unavailable and requires FEASTA review.</p>
            )}
          </DrawerSection> : null}

          <DrawerSection title="Booking Updates">
            {timeline && timeline.entries.length > 0 ? (
              <ol className="relative grid gap-4 border-l border-border pl-5">
                {[...timeline.entries]
                  .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
                  .map((entry) => (
                    <li key={entry.id} className="relative">
                      <span aria-hidden="true" className="absolute -left-[1.46rem] top-1.5 size-2 rounded-full bg-primary" />
                      <p className="font-medium">{entry.title}</p>
                      {entry.description ? (
                        <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </p>
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No booking updates are available yet.</p>
            )}
          </DrawerSection>

          {booking.rejectionReason || booking.cancellationReason ? (
            <DrawerSection title="Cancellation Details">
              {booking.rejectionReason ? (
                <DetailRow label="Rejection reason" value={booking.rejectionReason} />
              ) : null}
              {booking.cancellationReason ? (
                <DetailRow label="Cancellation reason" value={booking.cancellationReason} />
              ) : null}
              {booking.cancelledAt ? (
                <DetailRow label="Cancelled" value={formatDateTime(booking.cancelledAt)} />
              ) : null}
              {booking.cancellationActor ? (
                <DetailRow label="Cancelled by" value={formatLabel(booking.cancellationActor)} />
              ) : null}
            </DrawerSection>
          ) : null}
        </div>
      ) : null}
    </DetailDrawer>
  );
}

function LifecycleFooter({
  booking,
  pending,
  onStart,
  onComplete,
}: {
  booking: ProviderBooking;
  pending: boolean;
  onStart: () => void;
  onComplete: () => void;
}) {
  if (booking.automaticLifecycle) {
    return <><BookingPolicySummary policy={booking.bookingPolicy} audience="provider" />
      {booking.bookingPolicy?.readyToComplete && <Button loading={pending} loadingLabel="Completing booking" onClick={onComplete}>Mark Completed</Button>}</>;
  }
  if (booking.providerRequestStatus === "confirmed" && booking.canStartEvent && !booking.balanceEnforcement) {
    return (
      <Button loading={pending} loadingLabel="Starting event" onClick={onStart}>
        Start Event
      </Button>
    );
  }

  if (booking.providerRequestStatus === "in_progress" && booking.canCompleteEvent !== false && booking.mainEventStatus === "in_progress" && booking.refundEligibility.evidenceStatus !== "invalid" && !booking.refundEligibility.activeCancellationLocked && !booking.balanceEnforcement) {
    return (
      <Button loading={pending} loadingLabel="Completing booking" onClick={onComplete}>
        Mark Completed
      </Button>
    );
  }

  return null;
}

function DrawerSection({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      {icon ? <span className="mt-0.5 text-muted-foreground">{icon}</span> : null}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  status,
  emptyLabel = "Not available",
}: {
  label: string;
  status: string | null;
  emptyLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {status ? <StatusBadge status={status} /> : <span className="text-sm font-medium">{emptyLabel}</span>}
    </div>
  );
}

function AmountRow({label, amount}: {label: string; amount: number}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <PriceDisplay amount={amount} />
    </div>
  );
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatDate(value: string): string {
  return formatDateValue(value, {dateStyle: "long"});
}

function formatDateTime(value: string): string {
  return formatDateValue(value, {dateStyle: "medium", timeStyle: "short"});
}

function formatDateValue(
  value: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-PH", {
    ...options,
    timeZone: "Asia/Manila",
  }).format(date);
}
import {BookingPolicySummary} from "@/components/shared/booking-policy-summary";
