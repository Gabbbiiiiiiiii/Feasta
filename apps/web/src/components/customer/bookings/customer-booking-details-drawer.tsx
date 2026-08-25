"use client";

import {
  CalendarDays,
  CreditCard,
  MapPin,
  PackageOpen,
  Users,
} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";

import {loadCustomerBookingDetailsAction} from "@/app/customer/bookings/actions";
import {
  bookingStatusLabel,
  boundedText,
  formatBookingDate,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,
  formatPercentage,
} from "@/components/customer/bookings/booking-formatters";
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
  CustomerBookingService,
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
const MAX_SERVICES_PER_REQUEST = 30;

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
      description="Review your event, provider requests, and payment amounts."
      footer={
        <Button
          variant="secondary"
          size="compact"
          fullWidth
          onClick={() => changeOpenState(false)}
        >
          Close
        </Button>
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
    <div className="grid min-w-0 gap-6">
      <section className="grid gap-4" aria-labelledby="customer-booking-event-heading">
        <div className="flex min-w-0 flex-wrap gap-2">
          <StatusBadge status={booking.status} label={bookingStatusLabel(booking.status)} />
          <StatusBadge status={booking.paymentStatus} />
        </div>

        <h2 id="customer-booking-event-heading" className="text-lg font-black">
          Event information
        </h2>
        <dl className="grid gap-4 rounded-card border border-border bg-muted/30 p-4">
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
          <DetailItem
            icon={<PackageOpen />}
            label="Primary provider"
            value={boundedText(booking.providerName, "Provider unavailable", 120)}
            secondary={boundedText(booking.packageName, "Custom services", 120)}
          />
        </dl>
      </section>

      <section className="grid gap-4" aria-labelledby="customer-booking-totals-heading">
        <h2 id="customer-booking-totals-heading" className="text-lg font-black">
          Booking totals
        </h2>
        <dl className="grid grid-cols-2 gap-3">
          <FinancialItem label="Estimated total" value={booking.estimatedEventTotal} />
          <FinancialItem label="Down payment" value={booking.downPaymentAmount} />
          <FinancialItem
            label="Remaining balance"
            value={booking.remainingBalance}
            className="col-span-2"
          />
        </dl>
      </section>

      <section className="grid gap-4" aria-labelledby="customer-provider-requests-heading">
        <div>
          <h2 id="customer-provider-requests-heading" className="text-lg font-black">
            Provider requests
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatCount(providerRequests.length)} provider {providerRequests.length === 1 ? "request" : "requests"}
          </p>
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
          <div className="grid gap-4">
            {providerRequests.map((request) => (
              <ProviderRequestCard
                key={request.id}
                request={request}
                checkoutInProgress={paymentRequestId !== null}
                isCurrentCheckout={paymentRequestId === request.providerRequestId}
                onPay={onPay}
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

function ProviderRequestCard({
  request,
  checkoutInProgress,
  isCurrentCheckout,
  onPay,
}: {
  request: CustomerBookingProviderRequest;
  checkoutInProgress: boolean;
  isCurrentCheckout: boolean;
  onPay: (providerRequestId: string) => void;
}) {
  const services = request.services.slice(0, MAX_SERVICES_PER_REQUEST);
  const explanation = request.status === "rejected"
    ? boundedText(request.rejectionReason, "The provider did not include an explanation.", 500)
    : request.status === "cancelled"
      ? boundedText(request.cancellationReason, "No cancellation explanation was provided.", 500)
      : null;

  return (
    <article className="grid min-w-0 gap-4 rounded-card border border-border p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="break-words font-bold">
            {boundedText(request.providerName, "Provider unavailable", 120)}
          </h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {boundedText(request.packageName, request.type === "catering" ? "Catering request" : "Add-on services", 120)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={request.status} label={bookingStatusLabel(request.status)} />
          <StatusBadge status={request.paymentStatus} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4">
        <FinancialItem label="Request amount" value={request.amount} />
        <FinancialItem label="Down payment" value={request.downPaymentAmount} />
        <FinancialItem label="Remaining balance" value={request.remainingBalance} />
        <div className="min-w-0 rounded-card border border-border p-3">
          <dt className="text-xs font-semibold text-muted-foreground">Down payment rate</dt>
          <dd className="mt-2 text-lg font-black">{formatPercentage(request.downPaymentPercentage)}</dd>
        </div>
      </dl>

      <section className="grid gap-3" aria-label={`Services from ${boundedText(request.providerName, "provider", 80)}`}>
        <h4 className="text-sm font-bold">Included services</h4>
        {services.length > 0 ? (
          <ul className="grid gap-2">
            {services.map((service) => (
              <ServiceItem key={service.id} service={service} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No itemized services were provided.</p>
        )}
      </section>

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

      {canStartCustomerPayment(request) ? (
        <div className="grid gap-2 border-t border-border pt-4">
          <Button
            fullWidth
            loading={isCurrentCheckout}
            loadingLabel="Creating secure checkout"
            disabled={checkoutInProgress}
            onClick={() => onPay(request.providerRequestId)}
          >
            <CreditCard aria-hidden="true" className="size-5" />
            Pay securely
          </Button>
          <p className="text-xs text-muted-foreground">
            Payment is completed on PayMongo. Your booking updates only after FEASTA verifies the payment.
          </p>
        </div>
      ) : null}
    </article>
  );
}

function ServiceItem({service}: {service: CustomerBookingService}) {
  return (
    <li className="flex min-w-0 items-start justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="break-words font-semibold">{boundedText(service.name, "Service", 120)}</p>
        {service.category ? (
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {boundedText(service.category, "", 80)}
          </p>
        ) : null}
      </div>
      <span className="shrink-0 font-bold">{formatCurrency(service.price)}</span>
    </li>
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
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-5">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words font-semibold">{value}</dd>
        {secondary ? <dd className="mt-1 break-words text-sm text-muted-foreground">{secondary}</dd> : null}
      </div>
    </div>
  );
}

function FinancialItem({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-card border border-border p-3 ${className ?? ""}`}>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-2 truncate text-lg font-black">{formatCurrency(value)}</dd>
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
