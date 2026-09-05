import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  MapPin,
  PartyPopper,
  UsersRound,
} from "lucide-react";

import {EventVenueInput} from "@/components/landing/event-venue-input";
import {
  CUSTOMER_PLANNING_EVENT_TYPES,
  formatCustomerEventDate,
  formatCustomerEventTime,
  manilaDateValue,
  MAX_EVENT_GUESTS,
} from "@/lib/customer/planning/event-planning-context";
import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import type {ProviderDiscoveryFilters} from "@/lib/customer/providers/provider-types";

const EVENT_TYPE_LABELS = {
  birthday: "Birthday",
  wedding: "Wedding",
  debut: "Debut",
  corporate: "Corporate",
  anniversary: "Anniversary",
  other: "Other",
} satisfies Record<(typeof CUSTOMER_PLANNING_EVENT_TYPES)[number], string>;

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
  const clearHref = providerDiscoveryHref({
    ...filters,
    cursor: null,
    eventContext: null,
    planningContext: null,
  });

  return (
    <section
      aria-labelledby="marketplace-event-context-title"
      className="rounded-[22px] border border-primary/15 bg-secondary/70 p-4 shadow-[0_5px_20px_rgb(43_33_29/0.03)] sm:p-5"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-primary-strong">
              Planning services for
            </p>
            <h2
              id="marketplace-event-context-title"
              className="mt-1 text-lg font-extrabold tracking-[-0.02em] text-foreground"
            >
              Your event
            </h2>
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-foreground">
              {eventType ? (
                <ContextItem icon={PartyPopper} label="Event type">
                  {EVENT_TYPE_LABELS[eventType]}
                </ContextItem>
              ) : null}
              {eventDate ? (
                <ContextItem icon={CalendarDays} label="Date">
                  {formatCustomerEventDate(eventDate)}
                </ContextItem>
              ) : null}
              {availability ? (
                <ContextItem icon={Clock3} label="Time">
                  {formatCustomerEventTime(availability.eventTime)}–{formatCustomerEventTime(availability.eventEndTime)}
                </ContextItem>
              ) : null}
              {guestCount ? (
                <ContextItem icon={UsersRound} label="Guests">
                  {guestCount.toLocaleString("en-PH")} guests
                </ContextItem>
              ) : null}
              {eventVenue ? (
                <ContextItem icon={MapPin} label="Event venue">
                  <span className="break-words">
                    {eventVenue.label}
                    {eventVenue.city ? `, ${eventVenue.city}` : ""}
                    {eventVenue.province ? `, ${eventVenue.province}` : ""}
                  </span>
                </ContextItem>
              ) : null}
            </dl>
            {!availability && (eventDate || guestCount) ? (
              <p className="mt-2 text-xs leading-5 text-feasta-text-secondary">
                Add a date, start and end time, and guests to check Provider availability after signing in.
              </p>
            ) : null}
          </div>

          <Link
            href={clearHref}
            className="inline-flex min-h-10 shrink-0 items-center justify-center self-start rounded-full px-3 text-xs font-bold text-primary-strong transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Clear event details
          </Link>
        </div>

        <form
          action="/customer/providers"
          method="get"
          className="grid gap-3 border-t border-primary/10 pt-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_0.72fr_0.72fr_0.75fr_1.55fr_auto] xl:items-start"
        >
          {filters.search ? <input type="hidden" name="q" value={filters.search} /> : null}
          {filters.serviceType !== "all" ? <input type="hidden" name="service" value={filters.serviceType} /> : null}
          {filters.category !== "all" ? <input type="hidden" name="category" value={filters.category} /> : null}

          <EventControl label="Event type">
            <select name="eventType" defaultValue={eventType ?? ""} className={controlClass}>
              <option value="">Any occasion</option>
              {CUSTOMER_PLANNING_EVENT_TYPES.map((value) => (
                <option key={value} value={value}>{EVENT_TYPE_LABELS[value]}</option>
              ))}
            </select>
          </EventControl>
          <EventControl label="Date">
            <input
              name="eventDate"
              type="date"
              min={manilaDateValue()}
              defaultValue={eventDate ?? ""}
              className={controlClass}
            />
          </EventControl>
          <EventControl label="Start">
            <input name="eventTime" type="time" defaultValue={availability?.eventTime ?? ""} className={controlClass} />
          </EventControl>
          <EventControl label="End">
            <input name="eventEndTime" type="time" defaultValue={availability?.eventEndTime ?? ""} className={controlClass} />
          </EventControl>
          <EventControl label="Guests">
            <input
              name="guestCount"
              type="number"
              min={1}
              max={MAX_EVENT_GUESTS}
              step={1}
              defaultValue={guestCount ?? ""}
              className={controlClass}
            />
          </EventControl>
          <EventVenueInput
            key={eventVenue?.placeId ?? "no-event-venue"}
            initialVenue={eventVenue}
            label="Event venue"
          />
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center self-end rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-brand-soft outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 xl:mb-0.5"
          >
            Update details
          </button>
        </form>
      </div>
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
    <div className="inline-flex min-w-0 items-center gap-2">
      <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function EventControl({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <label className="grid gap-1 text-[11px] font-bold text-feasta-text-secondary">
      {label}
      {children}
    </label>
  );
}

const controlClass = "h-12 min-w-0 rounded-xl border border-feasta-border-soft bg-white px-2.5 text-xs font-semibold text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15";
