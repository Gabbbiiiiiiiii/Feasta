"use client";

import {useState} from "react";

import {BookingLifecycleStatus, BookingLifecycleNotice} from "@/components/shared/booking-lifecycle-status";
import {ProviderBookingStatus, useProviderBookingPresentation} from "@/components/provider/provider-booking-status";

import {formatEventTime} from "@/lib/presentation/event-time";

import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  MapPin,
  PackageOpen,
  UserRound,
  Users,
} from "lucide-react";

import {DetailDrawer} from "@/components/data";
import {DetailReviewLoadingSkeleton} from "@/components/feedback/detail-review-loading-skeleton";
import {CopyTextButton} from "@/components/shared/copy-text-button";
import {PriceDisplay} from "@/components/shared/price-display";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import type {
  ProviderBooking,
  ProviderBookingTimeline,
} from "@/lib/provider/bookings/provider-booking-types";
import {printBookingSheet, type PrintableBookingSheet} from "@/lib/provider/print-booking-sheet";
import {describeCancellationCutoff} from "@/lib/provider/cancellation-cutoff-view";
import {requestCompanyAdvance} from "@/lib/provider/payments/company-advance-client";

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
  const [advancePending, setAdvancePending] = useState(false);
  const [advanceMessage, setAdvanceMessage] = useState<string | null>(null);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const advanceRejected =
    !!booking && booking.companyAdvanceRequestStatus === "rejected";
  const advanceAttemptsExhausted =
    !!booking &&
    booking.companyAdvanceRequestRemainingAttempts <= 0 &&
    (booking.companyAdvanceRequestStatus === "rejected" ||
      booking.companyAdvanceRequestStatus === "cancelled" ||
      booking.companyAdvanceRequestAttemptCount >=
        booking.companyAdvanceRequestMaxAttempts);

  const alreadyRequested =
    !!booking &&
    (booking.companyAdvanceRequestStatus === "pending" ||
      booking.companyAdvanceRequestStatus === "approved" ||
      booking.companyAdvanceStatus === "outstanding" ||
      booking.companyAdvanceStatus === "repaid" ||
      !!advanceMessage);

  const isDirectSplit = Boolean(
    booking?.isDirectProviderSplit || booking?.isCustomerPaidFee,
  );
  const hasLegacyAdvanceActivity = Boolean(
    booking &&
      (booking.companyAdvanceRequestStatus !== null ||
        booking.companyAdvanceStatus !== null),
  );

  const canRequestAdvance =
    !!booking &&
    !["cancelled", "rejected", "expired"].includes(booking.providerRequestStatus) &&
    (booking.paymentStatus === "paid" ||
      booking.paymentStatus === "partially_paid" ||
      booking.payment?.status === "paid");

  const submitAdvanceRequest = async () => {
    if (
      !booking ||
      advancePending ||
      alreadyRequested ||
      advanceAttemptsExhausted
    ) {
      return;
    }
    setAdvancePending(true);
    setAdvanceError(null);
    setAdvanceMessage(null);
    try {
      const result = await requestCompanyAdvance({
        providerRequestId: booking.providerRequestId,
      });
      setAdvanceMessage(
        `Immediate funding request sent (attempt ${result.attemptCount} of ${result.maxAttempts}). FEASTA admin will review and release your net amount from company float.`,
      );
    } catch (error) {
      setAdvanceError(
        error instanceof Error
          ? error.message
          : "Immediate funding could not be requested.",
      );
    } finally {
      setAdvancePending(false);
    }
  };

  const venue = booking ? booking.locationSummary || booking.venueAddress || "Not provided" : "Not provided";
  const hasVenue = venue !== "Not provided";
  const eventTimeLabel = booking ? formatEventTime(booking.eventTime) || "Not provided" : "Not provided";

  const handlePrintBooking = () => {
    if (!booking) return;
    const php = (value: number) =>
      new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: value % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(value);

    const paymentLines: PrintableBookingSheet["paymentSummary"]["lines"] = [
      ...(booking.specialOffer
        ? [{label: "Agreed package price", amount: php(booking.specialOffer.subtotalInCentavos / 100)}]
        : [{label: "Requested amount", amount: php(booking.requestedAmount)}]),
      ...(booking.acceptedAmount !== null && !booking.specialOffer
        ? [{label: "Accepted amount", amount: php(booking.acceptedAmount)}]
        : []),
      ...(booking.commissionAmount > 0
        ? [{label: "FEASTA commission", amount: `-${php(booking.commissionAmount)}`}]
        : []),
      {
        label: "Your net earning (after commission)",
        amount: php(booking.providerNetAmount),
        highlight: true,
        dividerAbove: true,
      },
      ...(booking.paymentAmount !== null
        ? [{label: "Customer payment recorded", amount: php(booking.paymentAmount), dividerAbove: true}]
        : []),
      {
        label: "Balance remaining",
        amount: booking.remainingBalance !== null ? php(booking.remainingBalance) : "Unavailable",
      },
    ];

    const paymentDetails: string[] = [
      `Payment status: ${booking.paymentStatus ? formatLabel(booking.paymentStatus) : "No payment recorded"}`,
    ];
    if (booking.paymentAttention) paymentDetails.push(`Notice: ${booking.paymentAttention}`);
    if (booking.balanceEnforcement) {
      paymentDetails.push(
        [booking.balanceEnforcement.label, booking.balanceEnforcement.explanation].filter(Boolean).join(" — "),
      );
    }
    if (booking.specialOffer) {
      if (booking.specialOffer.deliveryIncluded) paymentDetails.push("Delivery included in agreed package price.");
      if (booking.specialOfferVat?.status === "available") {
        paymentDetails.push(
          booking.specialOfferVat.taxType === "vat_registered"
            ? `Included provider VAT: ${php(booking.specialOfferVat.includedInPriceInCentavos / 100)}`
            : "Non-VAT service",
        );
      }
    }

    const notes: PrintableBookingSheet["notes"] = [];
    if (booking.refundEligibility.evidenceStatus === "policy_backed" && booking.refundEligibility.currentStage) {
      notes.push({
        title: "Event Preparation Status",
        body: formatLabel(booking.refundEligibility.currentStage),
      });
    }
    if (booking.rejectionReason) {
      notes.push({title: "Rejection Reason", body: booking.rejectionReason});
    }
    if (booking.cancellationReason) {
      notes.push({
        title: "Cancellation Details",
        body: [
          booking.cancellationReason,
          booking.cancelledAt ? `Cancelled: ${formatDateTime(booking.cancelledAt)}` : "",
          booking.cancellationActor ? `Cancelled by: ${formatLabel(booking.cancellationActor)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }

    const sheet: PrintableBookingSheet = {
      documentTitle: "Booking Order Sheet",
      fileTitle: `FEASTA - Booking ${booking.mainEventId}`,
      reference: booking.mainEventId,
      status: `${formatLabel(booking.providerRequestStatus)} · Event ${formatLabel(booking.mainEventStatus)}`,
      submittedAt: formatShortDate(booking.createdAt),
      eventDetails: [
        {
          label: "Date & Time",
          value: [formatShortDate(booking.eventDate), eventTimeLabel]
            .filter((part) => part && part !== "Not provided")
            .join(" · ") || "Not provided",
        },
        {label: "Occasion", value: formatLabel(booking.eventType)},
        {
          label: "Guests",
          value:
            booking.guestCount > 0
              ? `${booking.guestCount.toLocaleString("en-PH")} guests`
              : "Not provided",
        },
        {label: "Venue", value: venue},
        ...(booking.cancellationCutoff
          ? [{label: "Cancel Cutoff", value: describeCancellationCutoff(booking.cancellationCutoff)}]
          : []),
      ],
      customerDetails: [
        {label: "Name", value: booking.customerDisplayName},
        {label: "Request Status", value: formatLabel(booking.providerRequestStatus)},
        {label: "Event Status", value: formatLabel(booking.mainEventStatus)},
      ],
      packageSummary: booking.packageName || booking.serviceSummary
        ? {
            name: booking.serviceSummary,
            tier: booking.serviceCategory ? formatLabel(booking.serviceCategory) : undefined,
            meta:
              booking.guestCount > 0
                ? `${booking.guestCount.toLocaleString("en-PH")} guests`
                : undefined,
          }
        : undefined,
      services: booking.services.map((service) => ({
        name: service.name,
        detail: `Quantity ${service.quantity}`,
        amount: php(service.totalPrice),
      })),
      notes,
      paymentSummary: {
        heading: "Payment & Earnings Summary",
        lines: paymentLines,
        details: paymentDetails,
      },
      timeline: timeline?.entries
        ? [...timeline.entries]
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
            .map((entry) => ({
              title: entry.title,
              description: entry.description ?? undefined,
              timestamp: formatDateTime(entry.createdAt),
            }))
        : undefined,
      footerText: `FEASTA Provider Copy · Last updated ${formatDateTime(booking.updatedAt ?? booking.createdAt)}`,
    };

    printBookingSheet(sheet);
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      fullScreen
      backLabel="Back to Bookings"
      printable={Boolean(booking)}
      onPrint={booking ? handlePrintBooking : undefined}
      title="Booking details"
      description="Review the event, payment, and service activity for this booking."
      headerMeta={
        booking ? (
          <>
            <ProviderBookingStatus booking={booking} detailed />
            <BookingLifecycleStatus status={booking.mainEventStatus} evidence={booking.lifecycle} />
            <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
              <span>{booking.mainEventId}</span>
              <CopyTextButton value={booking.mainEventId} ariaLabel="Copy booking reference" className="p-0.5" />
            </span>
            {booking.createdAt ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden="true">·</span>
                Submitted {formatShortDate(booking.createdAt)}
              </span>
            ) : null}
          </>
        ) : undefined
      }
      footerMeta={
        booking ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
              Last updated {formatDateTime(booking.updatedAt ?? booking.createdAt)}
            </span>
          </div>
        ) : undefined
      }
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
        <DetailReviewLoadingSkeleton label="Loading booking details" />
      ) : error ? (
        <div className="grid gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-5" role="alert">
          <div>
            <p className="font-semibold">Booking details are unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button variant="secondary" size="compact" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : booking ? (
        <div className="grid gap-5">
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="grid gap-5">
              <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-card">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Event overview
                </h3>

                <div className="grid gap-4 border-b border-border/70 pb-5 sm:grid-cols-3 print:grid-cols-3">
                  <div data-print-card="" className="grid content-start gap-1.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                      Date &amp; time
                    </p>
                    <p className="text-base font-bold text-foreground">{formatShortDate(booking.eventDate)}</p>
                    <span className="inline-flex w-fit items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      <Clock3 aria-hidden="true" className="size-3 shrink-0" />
                      {eventTimeLabel}
                    </span>
                  </div>

                  <div data-print-card="" className="grid content-start gap-1.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <Users aria-hidden="true" className="size-3.5 shrink-0" />
                      Guests
                    </p>
                    <p className="text-base font-bold text-foreground">
                      {booking.guestCount > 0
                        ? `${booking.guestCount.toLocaleString("en-PH")} guests`
                        : "Not provided"}
                    </p>
                    {booking.serviceCategory ? (
                      <p className="text-xs text-muted-foreground">{formatLabel(booking.serviceCategory)}</p>
                    ) : null}
                  </div>

                  <div data-print-card="" className="grid content-start gap-1.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
                      Occasion
                    </p>
                    <p className="text-base font-bold text-foreground">{formatLabel(booking.eventType)}</p>
                    <p className="text-xs text-muted-foreground">
                      {booking.packageName ? "Package booking" : "Service booking"}
                    </p>
                  </div>
                </div>

                <div data-print-card="" className="grid gap-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                    Venue
                  </p>
                  <p className="break-words text-sm font-semibold text-foreground">{venue}</p>
                  {hasVenue ? (
                    <div data-print-hidden="" className="mt-1 flex flex-wrap items-center gap-2 text-xs print:hidden">
                      <CopyTextButton value={venue} ariaLabel="Copy address" label="Copy address" className="px-0 py-0 text-xs font-medium text-muted-foreground hover:text-foreground" />
                      <span aria-hidden="true" className="text-muted-foreground/60">·</span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-primary-strong transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Open in Maps
                        <ArrowUpRight aria-hidden="true" className="size-3.5" />
                      </a>
                    </div>
                  ) : null}
                </div>
              </section>

              <section data-print-card="" className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Customer
                </h3>
                <div className="flex items-center gap-3.5">
                  <div aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-accent text-sm font-bold text-primary-strong">
                    {bookingInitials(booking.customerDisplayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-base font-bold text-foreground">{booking.customerDisplayName}</p>
                    {booking.providerRequestStatus === "waiting_for_down_payment" ? (
                      <p className="text-xs font-semibold text-muted-foreground">Awaiting Payment — Not Yet Confirmed</p>
                    ) : null}
                  </div>
                </div>
              </section>

              <DrawerSection title="Booking Status">
                {booking.balanceEnforcement ? <div role="status" className="grid gap-1 rounded-xl border border-border bg-muted/25 p-3 text-sm">
                  <p className="font-bold">{booking.balanceEnforcement.label}</p>
                  {booking.balanceEnforcement.explanation ? <p>{booking.balanceEnforcement.explanation}</p> : null}
                </div> : null}
                <div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">Provider request</span><ProviderBookingStatus booking={booking} detailed /></div>
                <div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">Main event</span><BookingLifecycleStatus status={booking.mainEventStatus} evidence={booking.lifecycle} /></div>
                <BookingLifecycleNotice status={booking.mainEventStatus} evidence={booking.lifecycle} />
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
                      <Button variant="secondary" data-print-hidden="" className="rounded-xl print:hidden" disabled={actionPending} onClick={onPreparationStarted}>
                        Mark Preparation Started
                      </Button>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
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

            <aside className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-card">
              <div data-print-card="" className="grid gap-2 rounded-xl border border-border/80 bg-secondary/45 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Your net earning
                  </p>
                  <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {booking.isCustomerPaidFee ? "100% of your price" : "After commission"}
                  </span>
                </div>
                <div className="text-primary-strong [&_span]:text-2xl [&_span]:font-bold [&_span]:tracking-tight [&_span]:text-primary-strong sm:[&_span]:text-3xl">
                  <PriceDisplay amount={booking.providerNetAmount} />
                </div>
                <div className="grid gap-1 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span>Requested amount:</span>
                    <span className="shrink-0 whitespace-nowrap font-semibold text-foreground [&_span]:text-xs [&_span]:font-semibold">
                      <PriceDisplay amount={booking.requestedAmount} />
                    </span>
                  </div>
                  {booking.commissionAmount > 0 ? (
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span>
                        {booking.isCustomerPaidFee
                          ? "FEASTA service fee (paid by customer):"
                          : "FEASTA commission:"}
                      </span>
                      <span className="shrink-0 whitespace-nowrap font-medium text-foreground [&_span]:text-xs [&_span]:font-medium">
                        <PriceDisplay amount={booking.commissionAmount} />
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <section className="grid gap-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <PackageOpen aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <p className="min-w-0 break-words text-base font-bold text-foreground">
                      {booking.serviceSummary}
                    </p>
                  </div>
                  {booking.serviceCategory ? (
                    <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                      {formatLabel(booking.serviceCategory)}
                    </span>
                  ) : null}
                </div>
                {booking.services.length > 0 ? (
                  <ul className="grid gap-2" aria-label="Selected services">
                    {booking.services.map((service) => (
                      <li key={service.id} data-print-card="" className="flex items-start justify-between gap-3 rounded-xl border border-border/80 p-3 text-sm">
                        <span>
                          <span className="block font-semibold text-foreground">{service.name}</span>
                          <span className="text-xs text-muted-foreground">Quantity {service.quantity}</span>
                        </span>
                        <PriceDisplay amount={service.totalPrice} className="shrink-0 [&_span]:text-sm [&_span]:font-semibold" />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section data-print-card="" className="grid gap-2.5 border-t border-border pt-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment details
                </h3>
                {booking.specialOffer && <>
                  <AmountRow label="Agreed package price" amount={booking.specialOffer.subtotalInCentavos / 100} />
                  {booking.specialOffer.deliveryIncluded && <p className="text-xs text-muted-foreground">Delivery included</p>}
                  {booking.specialOfferVat?.status === "available" ? (
                    booking.specialOfferVat.taxType === "vat_registered"
                      ? <AmountRow label="Included provider VAT" amount={booking.specialOfferVat.includedInPriceInCentavos / 100} />
                      : <p className="text-xs text-muted-foreground">Non-VAT service</p>
                  ) : <p className="text-xs text-muted-foreground">Verified VAT breakdown unavailable</p>}
                  {booking.specialOffer.providerFeeInCentavos !== null && (
                    <AmountRow
                      label={
                        booking.specialOffer.isCustomerPaid
                          ? "FEASTA service fee (paid by customer)"
                          : "FEASTA provider commission"
                      }
                      amount={booking.specialOffer.providerFeeInCentavos / 100}
                    />
                  )}
                </>}
                {booking.paymentAttention ? <p role="status" className="text-xs font-medium text-foreground">{booking.paymentAttention}{booking.paymentAttention === "Payment Being Checked" ? " · Please wait for the payment result." : ""}</p> : null}
                {booking.acceptedAmount !== null ? (
                  <AmountRow label="Accepted amount" amount={booking.acceptedAmount} />
                ) : null}
                {booking.paymentAmount !== null ? (
                  <AmountRow label="Customer payment recorded" amount={booking.paymentAmount} />
                ) : null}
                {booking.remainingBalance !== null ? (
                  <AmountRow label="Balance remaining" amount={booking.remainingBalance} />
                ) : <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Balance remaining</span><span className="font-semibold">Unavailable</span></div>}
                <StatusRow
                  label="Payment status"
                  status={booking.paymentStatus}
                  emptyLabel="No payment recorded"
                />
                {booking.cancellationCutoff ? (
                  <div className="mt-1 grid gap-1 rounded-xl border border-border/70 bg-muted/25 p-3 text-xs">
                    <p className="font-semibold text-foreground">Cancellation cutoff</p>
                    <p className="text-muted-foreground">
                      {describeCancellationCutoff(booking.cancellationCutoff)}
                    </p>
                  </div>
                ) : null}
              </section>

              {canRequestAdvance && isDirectSplit && !hasLegacyAdvanceActivity ? (
                <section data-print-hidden="" className="grid gap-2 border-t border-border pt-4 print:hidden">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Direct payment routing
                  </h3>
                  <p className="text-xs leading-5 text-muted-foreground">
                    100% of your listed package price settles directly to your
                    linked payout account when the customer pays—no 3-day hold
                    or company advance needed.
                  </p>
                </section>
              ) : canRequestAdvance ? (
                <section data-print-hidden="" className="grid gap-3 border-t border-border pt-4 print:hidden">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Immediate funding
                  </h3>
                  <p className="text-xs leading-5 text-muted-foreground">
                    After the customer pays, you can ask FEASTA to advance your net
                    earnings (after commission) from company float. This is separate
                    from the ordinary 3-day payout hold.
                  </p>
                  {booking.companyAdvanceRequestAttemptCount > 0 ? (
                    <p className="text-xs text-muted-foreground" role="status">
                      {`Attempts used: ${booking.companyAdvanceRequestAttemptCount} of ${booking.companyAdvanceRequestMaxAttempts}. Remaining: ${booking.companyAdvanceRequestRemainingAttempts}.`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground" role="status">
                      {`You can request immediate funding up to ${booking.companyAdvanceRequestMaxAttempts} times for this booking.`}
                    </p>
                  )}
                  {advanceRejected && !alreadyRequested && !advanceMessage ? (
                    <p className="text-xs text-destructive" role="status">
                      {advanceAttemptsExhausted
                        ? "FEASTA admin rejected your immediate funding request. You have no remaining requests for this booking."
                        : `FEASTA admin rejected your immediate funding request. You have ${booking.companyAdvanceRequestRemainingAttempts} of ${booking.companyAdvanceRequestMaxAttempts} requests remaining.`}
                    </p>
                  ) : null}
                  {alreadyRequested && !advanceMessage ? (
                    <p className="text-xs text-muted-foreground" role="status">
                      {booking.companyAdvanceRequestStatus === "pending"
                        ? `Immediate funding already requested (attempt ${booking.companyAdvanceRequestAttemptCount} of ${booking.companyAdvanceRequestMaxAttempts}). Waiting for admin review.`
                        : booking.companyAdvanceStatus === "outstanding" ||
                            booking.companyAdvanceRequestStatus === "approved"
                          ? "Company advance already approved for this booking."
                          : "Immediate funding was already requested for this booking."}
                    </p>
                  ) : null}
                  {advanceMessage ? (
                    <p className="text-xs text-success" role="status">
                      {advanceMessage}
                    </p>
                  ) : null}
                  {advanceError ? (
                    <p className="text-xs text-destructive" role="alert">
                      {advanceError}
                    </p>
                  ) : null}
                  <Button
                    variant="secondary"
                    fullWidth
                    className="min-h-10 rounded-xl font-semibold"
                    disabled={
                      actionPending ||
                      advancePending ||
                      alreadyRequested ||
                      advanceAttemptsExhausted
                    }
                    onClick={() => {
                      void submitAdvanceRequest();
                    }}
                  >
                    {advancePending
                      ? "Requesting..."
                      : alreadyRequested
                        ? "Already requested"
                        : advanceAttemptsExhausted
                          ? "No requests remaining"
                          : advanceRejected
                            ? "Request immediate fund again"
                            : "Request immediate fund"}
                  </Button>
                </section>
              ) : null}
            </aside>
          </div>
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
    <section className="grid gap-3 rounded-2xl border border-border bg-card p-5 shadow-card">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
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
    <div data-print-card="" className="flex items-start gap-3 rounded-xl border border-border/70 bg-secondary/55 px-3.5 py-2.5">
      {icon ? <span className="mt-0.5 shrink-0 text-primary/80 [&_svg]:size-4">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold text-foreground">{value}</p>
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
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {status ? <StatusBadge status={status} /> : <span className="text-sm font-medium">{emptyLabel}</span>}
    </div>
  );
}

function AmountRow({label, amount}: {label: string; amount: number}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="shrink-0 whitespace-nowrap font-semibold text-foreground [&_span]:text-sm [&_span]:font-bold">
        <PriceDisplay amount={amount} />
      </span>
    </div>
  );
}

function bookingInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatShortDate(value: string): string {
  return formatDateValue(value, {dateStyle: "medium"});
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
