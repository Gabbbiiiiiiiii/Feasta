import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  Wallet,
  MapPin,
  PartyPopper,
  UsersRound,
} from "lucide-react";

import {
  formatCustomerEventDate,
  formatCustomerEventTime,
} from "@/lib/customer/planning/event-planning-context";
import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import type {ProviderDiscoveryFilters} from "@/lib/customer/providers/provider-types";
import {EditEventFinderButton} from "./edit-event-finder-button";

export function ProviderEventContextPanel({
  filters,
}: {
  filters: ProviderDiscoveryFilters;
}) {
  const availability = filters.eventContext;
  const planning = filters.planningContext;

  if (!availability && !planning) return null;

  const eventDate = availability?.eventDate ?? planning?.eventDate;
  const guestCount = availability?.guestCount ?? planning?.guestCount;
  const eventType = planning?.eventType;
  const eventVenue = planning?.eventVenue;

  const occasionLabel = eventType
    ? eventType.replaceAll("_", " ").replace(/\b\w/gu, (letter) =>
        letter.toUpperCase())
    : null;

  const budgetMin = planning?.budgetMin;
  const budgetMax = planning?.budgetMax;
  const peso = (value: number) =>
    `₱${value.toLocaleString("en-PH")}`;

  const budgetLabel =
    budgetMin !== undefined && budgetMax !== undefined
      ? `${peso(budgetMin)} – ${peso(budgetMax)}`
      : budgetMin !== undefined
        ? `${peso(budgetMin)} and above`
        : budgetMax !== undefined
          ? `Up to ${peso(budgetMax)}`
          : null;

  const clearHref = providerDiscoveryHref({
    ...filters,
    cursor: null,
    eventContext: null,
    planningContext: null,
  });

  return (
    <section
      aria-labelledby="marketplace-event-context-title"
      className="rounded-[22px] border border-primary/15 bg-secondary/70 p-4 shadow-[0_5px_20px_rgb(0_75_59/0.03)] sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-primary-strong">
            Planning services for
          </p>
          <h2
            id="marketplace-event-context-title"
            className="mt-1 text-lg font-extrabold tracking-[-0.02em] text-foreground"
          >
            Your Event
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EditEventFinderButton />
          <Link
            href={clearHref}
            className="inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-bold text-primary-strong hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Clear event details
          </Link>
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-primary/10 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {occasionLabel ? (
          <ContextItem icon={PartyPopper} label="Occasion">
            {occasionLabel}
          </ContextItem>
        ) : null}

        {eventDate ? (
          <ContextItem icon={CalendarDays} label="Event date">
            {formatCustomerEventDate(eventDate)}
          </ContextItem>
        ) : null}

        {availability ? (
          <ContextItem icon={Clock3} label="Event time">
            {formatCustomerEventTime(availability.eventTime)}
            {" – "}
            {formatCustomerEventTime(availability.eventEndTime)}
          </ContextItem>
        ) : null}

        {guestCount ? (
          <ContextItem icon={UsersRound} label="Guests">
            {guestCount.toLocaleString("en-PH")} guests
          </ContextItem>
        ) : null}

        {budgetLabel ? (
          <ContextItem icon={Wallet} label="Planning budget">
            {budgetLabel}
          </ContextItem>
        ) : null}

        {eventVenue ? (
          <ContextItem icon={MapPin} label="Event venue">
            <span className="break-words">
              {eventVenue.label}
              {eventVenue.city && eventVenue.city !== eventVenue.label
                ? `, ${eventVenue.city}`
                : ""}
              {eventVenue.province
                ? `, ${eventVenue.province}`
                : ""}
            </span>
          </ContextItem>
        ) : null}
      </dl>

      {!availability && (eventDate || guestCount) ? (
        <p className="mt-3 text-xs leading-5 text-feasta-text-secondary">
          Add a valid date, start and end time, and guest count
          in Event Finder to check provider availability.
        </p>
      ) : null}
    </section>
  );
}

function ContextItem({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CalendarDays;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold text-feasta-text-secondary">
          {label}
        </dt>
        <dd className="mt-0.5 text-sm font-bold text-foreground">
          {children}
        </dd>
      </div>
    </div>
  );
}