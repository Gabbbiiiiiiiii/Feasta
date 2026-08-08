import {
  ArrowRight,
  CalendarDays,
  Clock3,
} from "lucide-react";
import Link from "next/link";

import {getCustomerBookingPage} from "@/lib/customer/bookings/customer-booking-service";
import type {
  CustomerBooking,
} from "@/lib/customer/bookings/customer-booking-types";

const ACTIVE_BOOKING_STATUSES = new Set([
  "draft",
  "pending_provider_approval",
  "needs_provider_replacement",
  "waiting_for_down_payment",
  "confirmed",
  "in_progress",
]);

export async function MarketplaceActiveEventStrip() {
  const page = await getCustomerBookingPage({
    search: "",
    status: "all",
    pageSize: 10,
    cursor: null,
  }).catch(() => null);

  const activeBooking =
    page?.bookings.find(
      (booking) =>
        ACTIVE_BOOKING_STATUSES.has(booking.status),
    ) ?? null;

  if (!activeBooking) {
    return null;
  }

  return (
    <ActiveEventStrip booking={activeBooking} />
  );
}

function ActiveEventStrip({
  booking,
}: {
  booking: CustomerBooking;
}) {
  const action = bookingAction(booking.status);

  return (
    <section
      className="
        flex min-w-0
        flex-col gap-4
        rounded-2xl
        border border-[#E2BFB5]
        bg-white
        px-4 py-4
        shadow-[0_5px_16px_rgba(38,24,20,0.06)]
        sm:flex-row
        sm:items-center
        sm:justify-between
        sm:px-5
      "
      aria-labelledby="active-event-title"
    >
      <div
        className="
          flex min-w-0
          items-start gap-3
        "
      >
        <span
          className="
            grid size-11 shrink-0
            place-items-center
            rounded-full
            bg-[#FEE2DB]
            text-[#B02F00]
          "
        >
          <CalendarDays
            aria-hidden="true"
            className="size-5"
          />
        </span>

        <div className="min-w-0">
          <p
            className="
              text-xs font-black
              uppercase tracking-[0.14em]
              text-[#B02F00]
            "
          >
            Your active event
          </p>

          <h2
            id="active-event-title"
            className="
              mt-0.5 truncate
              text-base font-black
              text-[#261814]
              sm:text-lg
            "
          >
            {humanizeValue(booking.eventType)}
          </h2>

          <div
            className="
              mt-1 flex min-w-0
              flex-wrap items-center
              gap-x-4 gap-y-1
              text-sm text-[#695C56]
            "
          >
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays
                aria-hidden="true"
                className="size-4 text-[#B02F00]"
              />

              {formatEventDate(booking.eventDate)}
            </span>

            {booking.eventTime ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock3
                  aria-hidden="true"
                  className="size-4 text-[#B02F00]"
                />

                {booking.eventTime}
              </span>
            ) : null}

            <span
              className="
                rounded-full
                bg-[#FFF1ED]
                px-2 py-0.5
                text-xs font-bold
                text-[#862200]
              "
            >
              {humanizeValue(booking.status)}
            </span>
          </div>
        </div>
      </div>

      <Link
        href="/customer/bookings"
        className="
          inline-flex min-h-10
          shrink-0 items-center
          justify-center gap-2
          rounded-xl
          border border-[#E2BFB5]
          bg-[#FFF8F6]
          px-4
          text-sm font-bold
          text-[#B02F00]
          transition-colors
          hover:bg-[#FFF1ED]
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-[#B02F00]/30
        "
      >
        {action}

        <ArrowRight
          aria-hidden="true"
          className="size-4"
        />
      </Link>
    </section>
  );
}

function bookingAction(
  status: CustomerBooking["status"],
): string {
  switch (status) {
    case "needs_provider_replacement":
      return "Find a replacement";

    case "waiting_for_down_payment":
      return "Continue payment";

    case "pending_provider_approval":
      return "View provider responses";

    case "confirmed":
    case "in_progress":
      return "View event";

    case "draft":
      return "Continue planning";

    default:
      return "View booking";
  }
}

function humanizeValue(value: string): string {
  return value
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (character) =>
      character.toLocaleUpperCase("en-PH"),
    );
}

function formatEventDate(
  value: string | null,
): string {
  if (!value) {
    return "Date pending";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date pending";
  }

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}