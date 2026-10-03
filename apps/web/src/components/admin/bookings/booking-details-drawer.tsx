"use client";

import {
  CalendarDays,
  CreditCard,
  MapPin,
  PackageOpen,
  UserRound,
  Users,
} from "lucide-react";

import {
  BookingStatusBadge,
} from "@/components/admin/bookings/booking-status-badge";
import {
  DetailDrawer,
} from "@/components/data/detail-drawer";
import { Button } from "@/components/ui/button";
import type {
  AdminBooking,
  AdminBookingPayment,
  AdminBookingProviderRequest,
} from "@/lib/admin/bookings/admin-booking-types";

type BookingDetailsDrawerProps = {
  booking: AdminBooking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const dateFormatter =
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });

const dateOnlyFormatter =
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "long",
    timeZone: "Asia/Manila",
  });

const currencyFormatter =
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  });

function BookingDetailsDrawer({
  booking,
  open,
  onOpenChange,
}: BookingDetailsDrawerProps) {
  if (!booking) {
    return null;
  }

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Booking ${booking.reference}`}
      description="Review the event, providers, and payment activity."
      footer={
        <Button
          variant="secondary"
          size="compact"
          fullWidth
          onClick={() => onOpenChange(false)}
        >
          Close
        </Button>
      }
    >
      <div className="grid min-w-0 gap-6">
        <section
          className="grid gap-4"
          aria-labelledby="booking-overview-heading"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <BookingStatusBadge
              status={booking.status}
            />

            <BookingStatusBadge
              status={booking.paymentStatus}
            />
          </div>

          <h2
            id="booking-overview-heading"
            className="text-lg font-black"
          >
            Event overview
          </h2>

          <dl className="grid gap-3 rounded-card border border-border bg-muted/30 p-4">
            <DetailItem
              icon={<CalendarDays />}
              label="Event"
              value={booking.eventType}
              secondary={[
                formatDateOnly(
                  booking.eventDate,
                ),
                booking.eventTime,
              ]
                .filter(Boolean)
                .join(" · ")}
            />

            <DetailItem
              icon={<Users />}
              label="Guest count"
              value={`${booking.guestCount.toLocaleString(
                "en-PH",
              )} guests`}
            />

            <DetailItem
              icon={<MapPin />}
              label="Venue"
              value={
                booking.venueName ||
                "Venue not specified"
              }
              secondary={
                booking.venueAddress ||
                booking.city ||
                undefined
              }
            />
          </dl>
        </section>

        <section
          className="grid gap-4"
          aria-labelledby="booking-customer-heading"
        >
          <h2
            id="booking-customer-heading"
            className="text-lg font-black"
          >
            Customer
          </h2>

          <div className="rounded-card border border-border p-4">
            <DetailItem
              icon={<UserRound />}
              label={booking.customer.fullName}
              value={
                booking.customer.email ||
                "No email provided"
              }
              secondary={
                booking.customer.phoneNumber ||
                undefined
              }
            />
          </div>
        </section>

        <section
          className="grid gap-4"
          aria-labelledby="booking-financial-heading"
        >
          <h2
            id="booking-financial-heading"
            className="text-lg font-black"
          >
            Financial summary
          </h2>

          <dl className="grid grid-cols-2 gap-3">
            <FinancialItem
              label="Estimated total"
              value={booking.totalAmount}
            />

            <FinancialItem
              label="Paid"
              value={booking.totalPaidAmount}
              tone="success"
            />

            <FinancialItem
              label="Refunded"
              value={booking.totalRefundedAmount}
              tone="warning"
            />

            <FinancialItem
              label="Outstanding"
              value={booking.outstandingAmount}
              tone="primary"
            />
          </dl>
        </section>

        <section
          className="grid gap-4"
          aria-labelledby="provider-requests-heading"
        >
          <div>
            <h2
              id="provider-requests-heading"
              className="text-lg font-black"
            >
              Provider requests
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              {booking.providerRequests.length.toLocaleString(
                "en-PH",
              )}{" "}
              linked provider requests
            </p>
          </div>

          {booking.providerRequests.length > 0 ? (
            <div className="grid gap-3">
              {booking.providerRequests.map(
                (request) => (
                  <ProviderRequestCard
                    key={request.id}
                    request={request}
                  />
                ),
              )}
            </div>
          ) : (
            <EmptyDetailMessage>
              No provider requests were found.
            </EmptyDetailMessage>
          )}
        </section>

        <section
          className="grid gap-4"
          aria-labelledby="booking-payments-heading"
        >
          <div>
            <h2
              id="booking-payments-heading"
              className="text-lg font-black"
            >
              Payments
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Verified PayMongo payment records
            </p>
          </div>

          {booking.payments.length > 0 ? (
            <div className="grid gap-3">
              {booking.payments.map(
                (payment) => (
                  <PaymentCard
                    key={payment.id}
                    payment={payment}
                  />
                ),
              )}
            </div>
          ) : (
            <EmptyDetailMessage>
              No payment records were found.
            </EmptyDetailMessage>
          )}
        </section>

        {booking.notes ? (
          <section
            className="grid gap-3"
            aria-labelledby="booking-notes-heading"
          >
            <h2
              id="booking-notes-heading"
              className="text-lg font-black"
            >
              Special request
            </h2>

            <p className="whitespace-pre-wrap break-words rounded-card border border-border bg-muted/30 p-4 text-sm leading-6">
              {booking.notes}
            </p>
          </section>
        ) : null}

        <section
          className="grid gap-3 border-t border-border pt-5"
          aria-labelledby="booking-record-heading"
        >
          <h2
            id="booking-record-heading"
            className="text-lg font-black"
          >
            Record information
          </h2>

          <dl className="grid gap-2 text-sm">
            <RecordItem
              label="Booking ID"
              value={booking.id}
            />

            <RecordItem
              label="Created"
              value={formatDateTime(
                booking.createdAt,
              )}
            />

            <RecordItem
              label="Last updated"
              value={formatDateTime(
                booking.updatedAt,
              )}
            />
          </dl>
        </section>
      </div>
    </DetailDrawer>
  );
}

function ProviderRequestCard({
  request,
}: {
  request: AdminBookingProviderRequest;
}) {
  return (
    <article className="grid min-w-0 gap-3 rounded-card border border-border p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-tint text-primary-strong">
            <PackageOpen
              aria-hidden="true"
              className="size-5"
            />
          </span>

          <div className="min-w-0">
            <h3 className="truncate font-bold">
              {request.providerName}
            </h3>

            <p className="mt-1 text-sm capitalize text-muted-foreground">
              {request.requestType} request
            </p>
          </div>
        </div>

        <BookingStatusBadge
          status={request.status}
          className="shrink-0"
        />
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
        <div className="min-w-0">
          <dt className="text-muted-foreground">
            Service
          </dt>

          <dd className="mt-1 truncate font-semibold">
            {request.packageName ||
              (request.requestType === "addon"
                ? "Add-on services"
                : "Catering service")}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-muted-foreground">
            Amount
          </dt>

          <dd className="mt-1 truncate font-semibold">
            {currencyFormatter.format(
              request.subtotal,
            )}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-muted-foreground">
            Down payment
          </dt>

          <dd className="mt-1 truncate font-semibold">
            {currencyFormatter.format(
              request.downPaymentAmount,
            )}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-muted-foreground">
            Payment
          </dt>

          <dd className="mt-1">
            {request.paymentStatus ? (
              <BookingStatusBadge
                status={request.paymentStatus}
              />
            ) : (
              <span className="font-semibold">
                Unpaid
              </span>
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function PaymentCard({
  payment,
}: {
  payment: AdminBookingPayment;
}) {
  return (
    <article className="grid min-w-0 gap-3 rounded-card border border-border p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-success-subtle text-success">
            <CreditCard
              aria-hidden="true"
              className="size-5"
            />
          </span>

          <div className="min-w-0">
            <h3 className="truncate font-bold">
              {currencyFormatter.format(
                payment.amount,
              )}
            </h3>

            <p className="mt-1 truncate text-sm text-muted-foreground">
              {payment.gateway} ·{" "}
              {payment.currency}
            </p>
          </div>
        </div>

        <BookingStatusBadge
          status={payment.status}
          className="shrink-0"
        />
      </div>

      <dl className="grid gap-2 border-t border-border pt-3 text-sm">
        <RecordItem
          label="Payment ID"
          value={payment.id}
        />

        <RecordItem
          label="Created"
          value={formatDateTime(
            payment.createdAt,
          )}
        />

        <RecordItem
          label="Paid"
          value={formatDateTime(
            payment.paidAt,
          )}
        />

        {payment.refundStatus ? (
          <RecordItem
            label="Refund"
            value={payment.refundStatus}
          />
        ) : null}
      </dl>
    </article>
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
      <span className="mt-0.5 shrink-0 text-muted-foreground [&_svg]:size-5">
        {icon}
      </span>

      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>

        <dd className="mt-1 break-words font-semibold">
          {value}
        </dd>

        {secondary ? (
          <dd className="mt-1 break-words text-sm text-muted-foreground">
            {secondary}
          </dd>
        ) : null}
      </div>
    </div>
  );
}

function FinancialItem({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "primary";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    primary: "text-primary-strong",
  }[tone];

  return (
    <div className="min-w-0 rounded-card border border-border p-3">
      <dt className="text-xs font-semibold text-muted-foreground">
        {label}
      </dt>

      <dd
        className={`mt-2 truncate text-lg font-black ${toneClass}`}
      >
        {currencyFormatter.format(value)}
      </dd>
    </div>
  );
}

function RecordItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <dt className="font-semibold text-muted-foreground">
        {label}
      </dt>

      <dd className="break-all">
        {value}
      </dd>
    </div>
  );
}

function EmptyDetailMessage({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="rounded-card border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function formatDateOnly(
  value: string | null,
): string {
  if (!value) {
    return "Date not provided";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date not provided"
    : dateOnlyFormatter.format(date);
}

function formatDateTime(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : dateFormatter.format(date);
}

export {
  BookingDetailsDrawer,
  type BookingDetailsDrawerProps,
};
