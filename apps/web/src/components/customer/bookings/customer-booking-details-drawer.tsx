"use client";

import {
  CalendarDays,
  CreditCard,
  Info,
  MapPin,
  Users,
} from "lucide-react";
import Link from "next/link";
import {useCallback, useEffect, useRef, useState} from "react";

import {loadCustomerBookingDetailsAction} from "@/app/customer/bookings/actions";
import {
  bookingStatusLabel,
  boundedText,
  formatBookingDate,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,
} from "@/components/customer/bookings/booking-formatters";
import {CustomerBookingProviderRequestCard} from "@/components/customer/bookings/customer-booking-provider-request-card";
import {DetailDrawer} from "@/components/data/detail-drawer";
import {
  ApplicationErrorState,
  SectionLoading,
} from "@/components/feedback/application-states";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import type {
  CustomerBooking,
  CustomerBookingDetails,
  CustomerBookingProviderRequest,
} from "@/lib/customer/bookings/customer-booking-types";
import {
  createCustomerPaymentCheckout,
  redirectToCustomerPaymentCheckout,
} from "@/lib/customer/payments/customer-payment-client";

type CustomerBookingDetailsDrawerProps = {
  booking: CustomerBooking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MAX_PROVIDER_REQUESTS = 30;

function CustomerBookingDetailsDrawer({
  booking,
  open,
  onOpenChange,
}: CustomerBookingDetailsDrawerProps) {
  const [details, setDetails] = useState<CustomerBookingDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string>();
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string>();
  const detailsRequestRef = useRef(0);
  const checkoutInFlightRef = useRef(false);

  const loadDetails = useCallback(async () => {
    if (!booking) return;

    const requestId = detailsRequestRef.current + 1;
    detailsRequestRef.current = requestId;
    setDetails(null);
    setDetailsError(undefined);
    setDetailsLoading(true);

    try {
      const result = await loadCustomerBookingDetailsAction(booking.id);

      if (requestId !== detailsRequestRef.current) return;
      if (result.details.booking.id !== booking.id) {
        throw new Error("Unexpected booking details were returned.");
      }

      setDetails(result.details);
    } catch {
      if (requestId !== detailsRequestRef.current) return;
      setDetailsError(
        "Booking details could not be loaded. The booking may no longer be available.",
      );
    } finally {
      if (requestId === detailsRequestRef.current) setDetailsLoading(false);
    }
  }, [booking]);

  useEffect(() => {
    if (!open || !booking) return undefined;

    const timeoutId = window.setTimeout(() => {
      void loadDetails();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      detailsRequestRef.current += 1;
    };
  }, [booking, loadDetails, open]);

  const changeOpenState = (nextOpen: boolean) => {
    if (!nextOpen) {
      detailsRequestRef.current += 1;
      setDetails(null);
      setDetailsError(undefined);
      setPaymentError(undefined);
    }

    onOpenChange(nextOpen);
  };

  const startCheckout = async (providerRequestId: string) => {
    if (checkoutInFlightRef.current) return;

    checkoutInFlightRef.current = true;
    setPaymentRequestId(providerRequestId);
    setPaymentError(undefined);

    try {
      const checkout = await createCustomerPaymentCheckout(providerRequestId);
      redirectToCustomerPaymentCheckout(checkout);
    } catch (error: unknown) {
      setPaymentError(paymentErrorMessage(error));
    } finally {
      checkoutInFlightRef.current = false;
      setPaymentRequestId(null);
    }
  };

  if (!booking) return null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={changeOpenState}
      title={`Booking ${boundedText(booking.bookingCode, "details", 80)}`}
      description={boundedText(booking.eventType, "Event details", 120)}
      footer={
        <div className="grid w-full gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            size="compact"
            fullWidth
            onClick={() => changeOpenState(false)}
          >
            Close
          </Button>
          <Button asChild size="compact" fullWidth>
            <Link href={`/customer/bookings/${encodeURIComponent(booking.id)}`}>
              Open full booking details
            </Link>
          </Button>
        </div>
      }
    >
      {detailsLoading ? (
        <SectionLoading label="Loading booking details" className="border-0 shadow-none" />
      ) : detailsError ? (
        <ApplicationErrorState
          kind="load"
          description={detailsError}
          onRetry={() => void loadDetails()}
        />
      ) : details ? (
        <BookingDetailsContent
          details={details}
          paymentRequestId={paymentRequestId}
          paymentError={paymentError}
          onPay={(providerRequestId) => void startCheckout(providerRequestId)}
        />
      ) : null}
    </DetailDrawer>
  );
}

function BookingDetailsContent({
  details,
  paymentRequestId,
  paymentError,
  onPay,
}: {
  details: CustomerBookingDetails;
  paymentRequestId: string | null;
  paymentError?: string;
  onPay: (providerRequestId: string) => void;
}) {
  const {booking} = details;
  const providerRequests = details.providerRequests.slice(0, MAX_PROVIDER_REQUESTS);

  return (
    <div className="grid min-w-0 gap-5">
      <section className="grid gap-3" aria-labelledby="customer-booking-event-heading">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 id="customer-booking-event-heading" className="text-lg font-black tracking-tight">
            Event information
          </h2>
          <StatusBadge status={booking.status} label={bookingStatusLabel(booking.status)} />
        </div>
        <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border">
          <DetailItem
            icon={<CalendarDays />}
            label="Event"
            value={boundedText(booking.eventType, "Unspecified event", 120)}
            secondary={`${formatBookingDate(booking.eventDate)} · ${formatBookingTimeRange(booking.eventTime, booking.eventEndTime)}`}
          />
          <DetailItem
            icon={<Users />}
            label="Guests"
            value={`${formatCount(booking.guestCount)} guests`}
          />
          <DetailItem
            icon={<MapPin />}
            label="Location"
            value={boundedText(booking.eventLocation, "Location not provided", 160)}
            secondary={boundedText(booking.eventAddress, "", 240) || undefined}
          />
        </dl>
      </section>

      <section
        className="grid gap-3 rounded-xl border border-border bg-muted/25 p-4"
        aria-labelledby="customer-booking-totals-heading"
      >
        <div className="flex min-w-0 items-end justify-between gap-4">
          <h2 id="customer-booking-totals-heading" className="text-sm font-bold">
            Estimated event total
          </h2>
          <p className="break-words text-right text-xl font-black tabular-nums">
            {formatCurrency(booking.estimatedEventTotal)}
          </p>
        </div>
        <p className="flex min-w-0 items-start gap-2 text-xs leading-5 text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span>Payments, down payments, and remaining balances are handled per provider request.</span>
        </p>
      </section>

      <section className="grid gap-3" aria-labelledby="customer-provider-requests-heading">
        <div className="flex min-w-0 items-end justify-between gap-3">
          <div>
          <h2 id="customer-provider-requests-heading" className="text-lg font-black">
            Provider requests
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Each provider responds and handles payment independently.
          </p>
          </div>
          <span className="shrink-0 rounded-full bg-primary-tint px-2.5 py-1 text-xs font-bold text-primary">
            {formatCount(providerRequests.length)} {providerRequests.length === 1 ? "request" : "requests"}
          </span>
        </div>

        {paymentError ? (
          <p
            className="rounded-card border border-destructive bg-destructive-subtle p-4 text-sm font-semibold text-destructive"
            role="alert"
            aria-live="assertive"
          >
            {paymentError}
          </p>
        ) : null}

        {providerRequests.length > 0 ? (
          <div className="grid gap-3">
            {providerRequests.map((request) => (
              <CustomerBookingProviderRequestCard
                key={request.id}
                request={request}
                compact
                paymentAction={canStartCustomerPayment(request) ? (
                  <div className="grid gap-2 border-t border-border pt-4">
                    <Button
                      fullWidth
                      loading={paymentRequestId === request.providerRequestId}
                      loadingLabel="Creating secure checkout"
                      disabled={paymentRequestId !== null}
                      onClick={() => onPay(request.providerRequestId)}
                    >
                      <CreditCard aria-hidden="true" className="size-5" />
                      Pay securely
                    </Button>
                    <p className="text-xs leading-5 text-muted-foreground">
                      Payment is completed on PayMongo. Your booking updates only after FEASTA verifies the payment.
                    </p>
                  </div>
                ) : undefined}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-card border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            No provider requests are attached to this booking.
          </p>
        )}
      </section>
    </div>
  );
}

function DetailItem({
  icon,
  label,
  value,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 bg-card p-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 break-words text-sm font-semibold">{value}</dd>
        {secondary ? <dd className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">{secondary}</dd> : null}
      </div>
    </div>
  );
}

function paymentErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return boundedText(error.message, "The secure checkout could not be created.", 240);
  }

  return "The secure checkout could not be created. Please try again.";
}

function canStartCustomerPayment(
  request: CustomerBookingProviderRequest,
): boolean {
  if (request.status !== "waiting_for_down_payment") return false;

  return [
    "unpaid",
    "pending",
    "failed",
    "expired",
  ].includes(request.paymentStatus.trim().toLowerCase());
}

export {
  CustomerBookingDetailsDrawer,
  type CustomerBookingDetailsDrawerProps,
};
