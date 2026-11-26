"use client";
import {useState} from "react";
import {ProviderRequestPackageDetails, SavedPackageLink} from "./provider-request-package-details";
import {ProviderArrangedPayment} from "./provider-arranged-payment";

import {unavailableProviderInitialPayment} from "@/lib/provider/requests/provider-request-payment-presentation";
import {formatEventTime} from "@/lib/presentation/event-time";
import {requestStatusLabel} from "@/lib/provider/requests/provider-request-presentation";

import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Mail,
  MapPin,
  PackageOpen,
  Phone,
  UserRound,
  Users,
} from "lucide-react";

import {DetailDrawer} from "@/components/data";
import {CopyTextButton} from "@/components/shared/copy-text-button";
import {Button} from "@/components/ui/button";
import {PriceDisplay} from "@/components/shared/price-display";
import {StatusBadge} from "@/components/shared/status-badge";
import {printBookingSheet, type PrintableBookingSheet} from "@/lib/provider/print-booking-sheet";
import {describeCancellationCutoff} from "@/lib/provider/cancellation-cutoff-view";

import type {ProviderRequestListItem} from "@/lib/provider/requests/provider-request-types";

type ProviderRequestDetailDrawerProps = {
  request: ProviderRequestListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept?: () => void;
  onArrangementUpdated?: () => void;
  onReject?: () => void;
  actionPending?: boolean;
};

export function ProviderRequestDetailDrawer({
  request,
  open,
  onOpenChange,
  onAccept,
  onArrangementUpdated,
  onReject,
  actionPending = false,
}: ProviderRequestDetailDrawerProps) {
  const [renderedAt] = useState(() => Date.now());

  if (!request) {
    return null;
  }

  const originalTermsSubject = request.type === "addon" ? "service" : "package";
  const payment = request.initialPaymentPresentation ?? unavailableProviderInitialPayment;
  const expectingOfferResponse =
    request.arrangedPayment?.status === "offered" &&
    Date.parse(request.arrangedPayment.initialDueAt) > renderedAt;
  const bookingRef = request.bookingReference ?? request.mainEventId;
  const venue = formatVenue(request);
  const hasVenue = venue !== "Not provided";
  const eventTimeLabel = formatEventTime(request.event.eventTime) || "Not provided";
  const remainingBalance =
    payment.kind === "minimum" && payment.amount !== null
      ? Math.max(0, Math.round((request.amount - payment.amount) * 100) / 100)
      : null;

  const handlePrintRequest = () => {
    const snapshot = request.packageSnapshot;
    const php = (value: number) =>
      new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: value % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(value);

    const paymentLines: PrintableBookingSheet["paymentSummary"]["lines"] = [
      {label: "Request total (your share)", amount: php(request.amount)},
      ...(request.commissionAmount > 0
        ? [{label: "FEASTA commission", amount: `-${php(request.commissionAmount)}`}]
        : []),
      {
        label: "Your net earning (after commission)",
        amount: php(request.providerNetAmount),
        highlight: true,
        dividerAbove: true,
      },
      ...(payment.amount !== null
        ? [
            {
              label:
                payment.kind === "full"
                  ? "Required customer payment"
                  : request.downPaymentPercentage !== null
                    ? `Minimum customer down payment (${request.downPaymentPercentage}%)`
                    : "Minimum customer down payment",
              amount: php(payment.amount),
              dividerAbove: true,
            },
          ]
        : []),
      ...(remainingBalance !== null && remainingBalance > 0
        ? [{label: "Remaining balance", amount: php(remainingBalance)}]
        : []),
    ];

    const eligibilityLabel =
      payment.kind === "full"
        ? "Full payment required"
        : payment.kind === "minimum"
          ? "Down payment or full payment"
          : "Payment eligibility unavailable";

    const paymentDetails: string[] = [
      `Eligibility: ${eligibilityLabel} — ${payment.explanation}`,
    ];

    if (
      request.arrangedPayment &&
      (request.arrangedPayment.status === "accepted" || expectingOfferResponse)
    ) {
      const upfront = request.arrangedPayment.upfrontInCentavos / 100;
      const balance = Math.max(0, (request.arrangedPayment.grossInCentavos - request.arrangedPayment.upfrontInCentavos) / 100);
      paymentDetails.push(
        `Arranged payment (${request.arrangedPayment.status === "accepted" ? "Accepted" : "Offer awaiting customer response"}): ` +
          `First payment ${php(upfront)} due ${formatDateTime(request.arrangedPayment.initialDueAt)}; ` +
          `remaining balance ${php(balance)} due ${formatDateTime(request.arrangedPayment.balanceDueAt)}.`,
      );
    }

    const originalTermsParts = [
      `Original ${originalTermsSubject} terms: ${php(request.downPaymentAmount)} upfront`,
      request.downPaymentPercentage !== null ? `(${request.downPaymentPercentage}%)` : "",
      "— reference only; does not indicate the current amount due.",
    ].filter(Boolean);

    const packageMetaParts = [
      snapshot?.price != null ? php(snapshot.price) : "",
      snapshot?.pricingModel ?? "",
      request.event.guestCount !== null
        ? `${request.event.guestCount.toLocaleString("en-PH")} guests`
        : "",
    ].filter(Boolean);

    const sheet: PrintableBookingSheet = {
      documentTitle: "Booking Request Sheet",
      fileTitle: `FEASTA - ${bookingRef}`,
      reference: bookingRef,
      status: requestStatusLabel(request.status),
      submittedAt: request.createdAt ? formatShortDate(request.createdAt) : undefined,
      eventDetails: [
        {
          label: "Date & Time",
          value: [formatShortDate(request.event.eventDate), eventTimeLabel]
            .filter((part) => part && part !== "Not provided")
            .join(" · ") || "Not provided",
        },
        {
          label: "Occasion",
          value: `${formatLabel(request.event.eventType)} (${request.type === "catering" ? "Catering" : "Event services"})`,
        },
        {
          label: "Guests",
          value:
            request.event.guestCount !== null
              ? `${request.event.guestCount.toLocaleString("en-PH")} guests`
              : "Not provided",
        },
        {label: "Venue", value: venue},
        ...(request.cancellationCutoff
          ? [{label: "Cancel Cutoff", value: describeCancellationCutoff(request.cancellationCutoff)}]
          : []),
      ],
      customerDetails: [
        {label: "Name", value: request.customer.name},
        {label: "Email", value: request.customer.email ?? "Not provided"},
        {label: "Mobile", value: request.customer.phoneNumber ?? "Not provided"},
      ],
      packageSummary:
        request.type === "catering" && (request.package || snapshot)
          ? {
              name: request.package?.name ?? "Selected package",
              tier: snapshot?.tier ?? undefined,
              meta: packageMetaParts.join(" · ") || undefined,
              themeName: snapshot?.theme?.name,
              themeDescription: snapshot?.theme?.description || undefined,
              packageReference: request.package?.id ?? undefined,
              selectedDishes: snapshot?.foodChoices.map((group) => ({
                groupTitle: group.title,
                dishes: group.dishes,
              })),
              inclusionGroups: snapshot?.inclusions.map((group) => ({
                title: group.title,
                items: group.items,
              })),
            }
          : undefined,
      services: request.services.map((service) => ({
        name: service.name,
        detail: `${service.quantity} × ${php(service.unitPrice)}`,
        amount: php(service.totalPrice),
      })),
      notes: [
        ...(request.event.notes ? [{title: "Special Instructions", body: request.event.notes}] : []),
        ...(request.rejectionReason ? [{title: "Decline Reason", body: request.rejectionReason}] : []),
      ],
      paymentSummary: {
        heading: "Payment & Earnings Summary",
        lines: paymentLines,
        details: paymentDetails,
        footnote: originalTermsParts.join(" "),
      },
      footerText: [
        "FEASTA Provider Copy",
        `Last updated ${formatDateTime(request.updatedAt)}`,
        request.respondedAt ? `Responded ${formatDateTime(request.respondedAt)}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    };

    printBookingSheet(sheet);
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      fullScreen
      backLabel="Back to Requests"
      printable
      onPrint={handlePrintRequest}
      title="Request details"
      description="Review the customer's event requirements before responding."
      headerMeta={
        <>
          <StatusBadge
            status={request.status}
            label={requestStatusLabel(request.status)}
          />
          <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
            <span>{bookingRef}</span>
            <CopyTextButton
              value={bookingRef}
              ariaLabel="Copy booking reference"
              className="p-0.5"
            />
          </span>
          {request.createdAt ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden="true">·</span>
              Submitted {formatShortDate(request.createdAt)}
            </span>
          ) : null}
        </>
      }
      footerMeta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
            Last updated {formatDateTime(request.updatedAt)}
          </span>
          {request.respondedAt ? (
            <span>· Provider response {formatDateTime(request.respondedAt)}</span>
          ) : null}
        </div>
      }
      footer={
        request.status === "pending" && !request.responseUnavailableReason ? (
          <div className="grid w-full gap-2 sm:w-auto">
            {expectingOfferResponse ? (
              <p role="status" className="text-xs text-muted-foreground sm:text-right">
                Withdraw the arranged payment offer above to accept with standard package terms.
              </p>
            ) : null}
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                className="min-h-10 rounded-xl px-5 font-semibold"
                disabled={actionPending}
                onClick={onReject}
              >
                Decline Request
              </Button>

              <Button
                type="button"
                className="min-h-10 rounded-xl px-5 font-semibold"
                disabled={actionPending || expectingOfferResponse}
                onClick={onAccept}
              >
                <Check aria-hidden="true" className="size-4" />
                Accept Request
              </Button>
            </div>
          </div>
        ) : null
      }
    >
      <div className="grid gap-5">
        {request.responseUnavailableReason ? (
          <p role="status" className="rounded-2xl border border-border bg-card p-4 text-sm">
            {request.responseUnavailableReason}
          </p>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* Left column: Event Overview, Customer, and optional notes */}
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
                  <p className="text-base font-bold text-foreground">
                    {formatShortDate(request.event.eventDate)}
                  </p>
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
                    {request.event.guestCount !== null
                      ? `${request.event.guestCount.toLocaleString("en-PH")} guests`
                      : "Not provided"}
                  </p>
                </div>

                <div data-print-card="" className="grid content-start gap-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <UserRound aria-hidden="true" className="size-3.5 shrink-0" />
                    Occasion
                  </p>
                  <p className="text-base font-bold text-foreground">
                    {formatLabel(request.event.eventType)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {request.type === "catering" ? "Catering request" : "Event services"}
                  </p>
                </div>
              </div>

              <div data-print-card="" className="grid gap-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                  Venue
                </p>
                <p className="break-words text-sm font-semibold text-foreground">
                  {venue}
                </p>
                {hasVenue ? (
                  <div
                    data-print-hidden=""
                    className="mt-1 flex flex-wrap items-center gap-2 text-xs print:hidden"
                  >
                    <CopyTextButton
                      value={venue}
                      ariaLabel="Copy address"
                      label="Copy address"
                      className="px-0 py-0 text-xs font-medium text-muted-foreground hover:text-foreground"
                    />
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
              <div className="flex items-start gap-3.5 sm:items-center">
                <div
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-accent text-sm font-bold text-primary-strong"
                >
                  {customerInitials(request.customer.name)}
                </div>
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <p className="break-words text-base font-bold text-foreground">
                    {request.customer.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Mail aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="break-all">
                        {request.customer.email ?? "Not provided"}
                      </span>
                      {request.customer.email ? (
                        <CopyTextButton
                          value={request.customer.email}
                          ariaLabel="Copy customer email"
                        />
                      ) : null}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Phone aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="break-all">
                        {request.customer.phoneNumber ?? "Not provided"}
                      </span>
                      {request.customer.phoneNumber ? (
                        <CopyTextButton
                          value={request.customer.phoneNumber}
                          ariaLabel="Copy customer mobile number"
                        />
                      ) : null}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {request.event.notes ? (
              <section data-print-card="" className="grid gap-2.5 rounded-2xl border border-border bg-card p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Special instructions
                </h3>
                <p className="whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-muted/25 p-3.5 text-sm leading-6 text-foreground">
                  {request.event.notes}
                </p>
              </section>
            ) : null}

            {request.rejectionReason ? (
              <section data-print-card="" className="grid gap-2.5 rounded-2xl border border-border bg-card p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Decline reason
                </h3>
                <p className="whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-muted/25 p-3.5 text-sm leading-6 text-foreground">
                  {request.rejectionReason}
                </p>
              </section>
            ) : null}
          </div>

          {/* Right column: Unified Earnings, Package, Payment Terms & Arranged Payment card */}
          <aside className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-card">
            {/* Net Earning highlight box */}
            <div data-print-card="" className="grid gap-2 rounded-xl border border-border/80 bg-secondary/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Your net earning
                </p>
                <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {request.isCustomerPaidFee ? "100% of your price" : "After commission"}
                </span>
              </div>
              <div className="text-primary-strong [&_span]:text-2xl [&_span]:font-bold [&_span]:tracking-tight [&_span]:text-primary-strong sm:[&_span]:text-3xl">
                <PriceDisplay amount={request.providerNetAmount} />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span>Request total (your share):</span>
                  <span className="shrink-0 whitespace-nowrap font-semibold text-foreground [&_span]:break-normal [&_span]:whitespace-nowrap [&_span]:text-xs [&_span]:font-semibold">
                    <PriceDisplay amount={request.amount} />
                  </span>
                </div>
                {request.commissionAmount > 0 ? (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <span>
                      {request.isCustomerPaidFee
                        ? "FEASTA service fee (paid by customer):"
                        : "FEASTA commission:"}
                    </span>
                    <span className="shrink-0 whitespace-nowrap font-medium text-foreground [&_span]:break-normal [&_span]:whitespace-nowrap [&_span]:text-xs [&_span]:font-medium">
                      <PriceDisplay amount={request.commissionAmount} />
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Package & Customization or Event Services */}
            {request.type === "catering" && request.packageSnapshot?.v2 ? (
              <ProviderRequestPackageDetails request={request} />
            ) : (
              <section className="grid gap-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {request.type === "catering" ? "Package" : "Event services"}
                </h3>
                {request.package ? (
                  <div data-print-card="" className="flex items-start gap-2.5 rounded-xl border border-border/70 bg-muted/25 px-3.5 py-3 text-sm">
                    <PackageOpen aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1 font-semibold">
                      <SavedPackageLink request={request} />
                    </div>
                  </div>
                ) : null}
                {request.services.length > 0 ? (
                  <div className="grid gap-2">
                    {request.services.map((service) => (
                      <div
                        key={service.id}
                        data-print-card=""
                        className="rounded-xl border border-border/80 p-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground">
                              {service.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {service.quantity}
                              {" × "}
                              <PriceDisplay amount={service.unitPrice} className="[&_span]:text-xs [&_span]:font-normal" />
                            </p>
                          </div>
                          <PriceDisplay amount={service.totalPrice} className="shrink-0 [&_span]:text-sm [&_span]:font-semibold" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : request.package ? null : (
                  <p className="text-xs text-muted-foreground">
                    No individual service selections were recorded.
                  </p>
                )}
              </section>
            )}

            {/* Payment Terms */}
            <section data-print-card="" className="grid gap-3 border-t border-border pt-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Payment terms
              </h3>

              <div className="grid gap-2">
                {payment.amount !== null ? (
                  <AmountRow
                    label={payment.kind === "full" ? "Required customer payment" : "Minimum customer down payment"}
                    amount={payment.amount}
                  />
                ) : null}
                {remainingBalance !== null && remainingBalance > 0 ? (
                  <AmountRow label="Remaining balance" amount={remainingBalance} />
                ) : null}
              </div>

              <div className="grid gap-1">
                <p className="text-xs font-semibold text-foreground">
                  {payment.kind === "full"
                    ? "Full payment required"
                    : payment.kind === "minimum"
                      ? "Down payment or full payment"
                      : "Payment eligibility unavailable"}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">{payment.explanation}</p>
              </div>

              <div className="grid gap-1.5 rounded-xl border border-border/70 bg-muted/25 p-3 text-xs">
                <p className="font-semibold text-foreground">
                  Original {originalTermsSubject} payment terms
                </p>
                <AmountRow
                  label={`Original ${originalTermsSubject} upfront amount`}
                  amount={request.downPaymentAmount}
                  compact
                />
                {request.downPaymentPercentage !== null ? (
                  <p className="text-muted-foreground">
                    Original {originalTermsSubject} upfront rate: {request.downPaymentPercentage}%
                  </p>
                ) : null}
                <p className="text-[11px] leading-4 text-muted-foreground">
                  These original terms do not indicate the current amount due.
                </p>
              </div>

              {request.cancellationCutoff ? (
                <div className="grid gap-1 rounded-xl border border-border/70 bg-muted/25 p-3 text-xs">
                  <p className="font-semibold text-foreground">Cancellation cutoff</p>
                  <p className="text-muted-foreground">
                    {describeCancellationCutoff(request.cancellationCutoff)}
                  </p>
                </div>
              ) : null}
            </section>

            {/* Arranged Payment */}
            <ProviderArrangedPayment
              key={request.id}
              request={request}
              onSaved={onArrangementUpdated}
              disabled={actionPending || Boolean(request.responseUnavailableReason)}
              embedded
            />
          </aside>
        </div>

        {/* Print-only timestamp footer since the sticky interactive footer is hidden in print */}
        <div className="hidden flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground print:flex">
          <span>Submitted {formatDateTime(request.createdAt)}</span>
          <span>Last updated {formatDateTime(request.updatedAt)}</span>
          {request.respondedAt ? (
            <span>Provider response {formatDateTime(request.respondedAt)}</span>
          ) : null}
        </div>
      </div>
    </DetailDrawer>
  );
}

function AmountRow({
  label,
  amount,
  compact = false,
}: {
  label: string;
  amount: number;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
        {label}
      </span>

      <span
        className={`shrink-0 whitespace-nowrap font-semibold text-foreground [&_span]:break-normal [&_span]:whitespace-nowrap ${
          compact ? "[&_span]:text-xs [&_span]:font-semibold" : "[&_span]:text-sm [&_span]:font-bold"
        }`}
      >
        <PriceDisplay amount={amount} />
      </span>
    </div>
  );
}

function customerInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatVenue(
  request: ProviderRequestListItem,
): string {
  const parts = [request.event.venueAddress, request.event.city]
    .filter((value): value is string => Boolean(value?.trim()))
    .flatMap((value) => value.split(","))
    .map((segment) => segment.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(part);
    }
  }
  return unique.join(", ") || "Not provided";
}

function formatLabel(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function formatShortDate(
  value: string | null,
): string {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not provided";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(date);
}

function formatDateTime(
  value: string | null,
): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}
