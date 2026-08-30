"use client";

import {
  Building2,
  CalendarDays,
  CircleCheckBig,
  CreditCard,
  Info,
  MessageSquareText,
  PhilippinePeso,
  Star,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState} from "react";

import {
  boundedText,
  formatBookingDate,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,
} from "@/components/customer/bookings/booking-formatters";
import {CustomerBookingProviderRequestCard} from "@/components/customer/bookings/customer-booking-provider-request-card";
import {CustomerBookingReviewDialog} from "@/components/customer/bookings/customer-booking-review-dialog";
import {feastaToast} from "@/components/feedback/toast";
import {Button} from "@/components/ui/button";
import {
  canStartCustomerBookingPayment,
  isCustomerBookingPaymentProcessing,
} from "@/lib/customer/bookings/customer-booking-payment";
import {canCustomerReviewProviderRequest} from "@/lib/customer/bookings/customer-booking-review";
import type {CustomerBookingDetails} from "@/lib/customer/bookings/customer-booking-types";
import {openCustomerProviderRequestChat} from "@/lib/customer/messages/customer-chat-client";
import {
  createCustomerPaymentCheckout,
  redirectToCustomerPaymentCheckout,
} from "@/lib/customer/payments/customer-payment-client";
import {isChatLifecycleEligible} from "@/lib/messaging/chat-lifecycle";

type CustomerBookingDetailContentProps = {
  details: CustomerBookingDetails;
};

const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;

function CustomerBookingDetailContent({
  details,
}: CustomerBookingDetailContentProps) {
  const {booking, providerRequests} = details;
  const router = useRouter();
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null);
  const [messageRequestId, setMessageRequestId] = useState<string | null>(null);
  const [selectedReviewRequestId, setSelectedReviewRequestId] =
    useState<string | null>(null);
  const [reviewedRequestIds, setReviewedRequestIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const selectedReviewRequest = providerRequests.find(
    (request) => request.providerRequestId === selectedReviewRequestId,
  ) ?? null;

  async function startCheckout(providerRequestId: string) {
    if (paymentRequestId !== null) return;

    const request = providerRequests.find(
      (candidate) => candidate.providerRequestId === providerRequestId,
    );

    if (!request || !canStartCustomerBookingPayment(request, booking.id)) {
      feastaToast.error(
        "This payment is no longer available. Refresh the booking to see its latest status.",
      );
      return;
    }

    setPaymentRequestId(providerRequestId);

    try {
      const checkout = await createCustomerPaymentCheckout(providerRequestId);
      redirectToCustomerPaymentCheckout(checkout);
    } catch (error: unknown) {
      feastaToast.error(
        error instanceof Error && error.message.trim()
          ? error.message
          : "We couldn't start the payment checkout. Please try again.",
      );
    } finally {
      setPaymentRequestId(null);
    }
  }

  async function openMessaging(providerRequestId: string) {
    if (messageRequestId !== null) return;
    const request = providerRequests.find(
      (candidate) => candidate.providerRequestId === providerRequestId,
    );

    if (!request || !canMessageProviderRequest(request, booking)) {
      feastaToast.error(
        "Messaging is unavailable for this provider request.",
      );
      return;
    }

    setMessageRequestId(providerRequestId);
    try {
      const room = await openCustomerProviderRequestChat(providerRequestId);
      router.push(
        `/customer/messages?room=${encodeURIComponent(room.chatRoomId)}`,
      );
    } catch (error: unknown) {
      feastaToast.error(
        error instanceof Error && error.message.trim()
          ? error.message
          : "The conversation could not be opened. Please try again.",
      );
    } finally {
      setMessageRequestId(null);
    }
  }

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
              <CustomerBookingProviderRequestCard
                key={request.id}
                request={request}
                durableConfirmation
                paymentAction={paymentActionForRequest({
                  request,
                  bookingId: booking.id,
                  paymentRequestId,
                  onPay: startCheckout,
                })}
                messageAction={messageActionForRequest({
                  request,
                  booking,
                  messageRequestId,
                  onMessage: openMessaging,
                })}
                providerAction={providerActionForRequest(request, booking.id)}
                reviewAction={reviewActionForRequest({
                  request,
                  booking,
                  reviewed: reviewedRequestIds.has(request.providerRequestId),
                  onReview: setSelectedReviewRequestId,
                })}
              />
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-card border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
            No provider requests are attached to this booking.
          </p>
        )}
      </DetailSection>

      <DetailSection title="Next actions" icon={<WalletCards />}>
        <p className="text-sm leading-6 text-muted-foreground">
          Review all Customer-safe payment records for this booking. Provider communication and profile actions remain available on each eligible service above.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button asChild variant="secondary" size="compact">
            <Link href="/customer/payments">
              <WalletCards aria-hidden="true" className="size-4" />
              View Payments
            </Link>
          </Button>
        </div>
      </DetailSection>

      {selectedReviewRequest ? (
        <CustomerBookingReviewDialog
          key={selectedReviewRequest.providerRequestId}
          request={selectedReviewRequest}
          onClose={() => setSelectedReviewRequestId(null)}
          onSubmitted={(providerRequestId) => {
            setReviewedRequestIds((current) =>
              new Set([...current, providerRequestId]));
            setSelectedReviewRequestId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function reviewActionForRequest({
  request,
  booking,
  reviewed,
  onReview,
}: {
  request: CustomerBookingDetails["providerRequests"][number];
  booking: CustomerBookingDetails["booking"];
  reviewed: boolean;
  onReview: (providerRequestId: string) => void;
}) {
  if (
    !SAFE_DOCUMENT_ID.test(request.providerRequestId) ||
    request.id !== request.providerRequestId ||
    request.mainEventId !== booking.id ||
    !SAFE_DOCUMENT_ID.test(request.providerId)
  ) {
    return undefined;
  }

  if (request.reviewStatus === "submitted" || reviewed) {
    return (
      <div
        className="flex min-w-0 items-start gap-3 rounded-xl border border-success/20 bg-success-subtle p-3.5"
        role="status"
        aria-label={`Review submitted for ${boundedText(request.providerName, "provider", 80)}`}
      >
        <CircleCheckBig aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="font-bold text-success">Review submitted</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Your feedback for this provider service is recorded.
          </p>
        </div>
      </div>
    );
  }

  if (!canCustomerReviewProviderRequest(booking, request)) {
    return undefined;
  }

  const providerName = boundedText(request.providerName, "provider", 80);
  return (
    <div className="grid gap-2 rounded-xl border border-primary/15 bg-primary-tint p-3.5">
      <div>
        <p className="text-sm font-bold">Share your experience</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Reviews are submitted separately for each completed provider service.
        </p>
      </div>
      <Button
        fullWidth
        aria-label={`Leave a review for ${providerName}`}
        onClick={() => onReview(request.providerRequestId)}
      >
        <Star aria-hidden="true" className="size-5" />
        Leave a review
      </Button>
    </div>
  );
}

function providerActionForRequest(
  request: CustomerBookingDetails["providerRequests"][number],
  bookingId: string,
) {
  if (
    !SAFE_DOCUMENT_ID.test(request.providerId) ||
    request.id !== request.providerRequestId ||
    request.mainEventId !== bookingId
  ) {
    return undefined;
  }

  const providerName = boundedText(
    request.providerName,
    "provider",
    80,
  );

  return (
    <Button asChild variant="secondary" fullWidth>
      <Link
        href={`/customer/providers/${encodeURIComponent(request.providerId)}`}
        aria-label={`View ${providerName} provider profile`}
      >
        <Building2 aria-hidden="true" className="size-5" />
        View Provider
      </Link>
    </Button>
  );
}

function messageActionForRequest({
  request,
  booking,
  messageRequestId,
  onMessage,
}: {
  request: CustomerBookingDetails["providerRequests"][number];
  booking: CustomerBookingDetails["booking"];
  messageRequestId: string | null;
  onMessage: (providerRequestId: string) => Promise<void>;
}) {
  if (!canMessageProviderRequest(request, booking)) return undefined;
  const loading = messageRequestId === request.providerRequestId;

  return (
    <Button
      variant="secondary"
      fullWidth
      loading={loading}
      loadingLabel="Opening messages…"
      disabled={messageRequestId !== null}
      onClick={() => void onMessage(request.providerRequestId)}
    >
      <MessageSquareText aria-hidden="true" className="size-5" />
      Message Provider
    </Button>
  );
}

function canMessageProviderRequest(
  request: CustomerBookingDetails["providerRequests"][number],
  booking: CustomerBookingDetails["booking"],
): boolean {
  return SAFE_DOCUMENT_ID.test(request.providerRequestId) &&
    request.id === request.providerRequestId &&
    request.mainEventId === booking.id &&
    SAFE_DOCUMENT_ID.test(request.providerId) &&
    isChatLifecycleEligible(request.status, booking.status);
}

function paymentActionForRequest({
  request,
  bookingId,
  paymentRequestId,
  onPay,
}: {
  request: CustomerBookingDetails["providerRequests"][number];
  bookingId: string;
  paymentRequestId: string | null;
  onPay: (providerRequestId: string) => Promise<void>;
}) {
  if (isCustomerBookingPaymentProcessing(request)) {
    return (
      <div
        className="rounded-xl border border-info/20 bg-info-subtle p-3.5"
        role="status"
      >
        <p className="text-sm font-bold text-info">Payment processing</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          FEASTA is waiting for trusted payment confirmation. Another checkout cannot be started yet.
        </p>
      </div>
    );
  }

  if (!canStartCustomerBookingPayment(request, bookingId)) return undefined;

  const loading = paymentRequestId === request.providerRequestId;

  return (
    <div className="grid gap-2 border-t border-border pt-4">
      <Button
        fullWidth
        loading={loading}
        loadingLabel="Preparing secure checkout…"
        disabled={paymentRequestId !== null}
        onClick={() => void onPay(request.providerRequestId)}
      >
        <CreditCard aria-hidden="true" className="size-5" />
        Pay {formatCurrency(request.downPaymentAmount)} down payment
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        You’ll continue to PayMongo. FEASTA updates this request only after trusted payment confirmation.
      </p>
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
