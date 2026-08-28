import {CalendarDays, Clock3, UsersRound} from "lucide-react";

import {
  formatCustomerEventDate,
  formatCustomerEventTime,
  manilaDateValue,
} from "@/lib/customer/planning/event-planning-context";
import type {ProviderDiscoveryFilters} from "@/lib/customer/providers/provider-types";

export function ProviderEventContextPanel({
  filters,
}: {
  filters: ProviderDiscoveryFilters;
}) {
  const context = filters.eventContext;
  if (!context) return null;

  return (
    <section
      aria-labelledby="marketplace-event-context-title"
      className="rounded-[22px] border border-primary/15 bg-secondary/70 p-4 shadow-[0_5px_20px_rgb(43_33_29/0.03)] sm:p-5"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-primary-strong">Your event</p>
          <h2 id="marketplace-event-context-title" className="sr-only">Selected event details</h2>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-foreground">
            <div className="inline-flex items-center gap-2">
              <CalendarDays aria-hidden="true" className="size-4 text-primary" />
              <dt className="sr-only">Date</dt>
              <dd>{formatCustomerEventDate(context.eventDate)}</dd>
            </div>
            <div className="inline-flex items-center gap-2">
              <Clock3 aria-hidden="true" className="size-4 text-primary" />
              <dt className="sr-only">Time</dt>
              <dd>{formatCustomerEventTime(context.eventTime)}–{formatCustomerEventTime(context.eventEndTime)}</dd>
            </div>
            <div className="inline-flex items-center gap-2">
              <UsersRound aria-hidden="true" className="size-4 text-primary" />
              <dt className="sr-only">Guests</dt>
              <dd>{context.guestCount.toLocaleString("en-PH")} guests</dd>
            </div>
          </dl>
        </div>

        <form action="/customer/providers" method="get" className="grid gap-2 sm:grid-cols-[1fr_0.8fr_0.8fr_0.7fr_auto] sm:items-end">
          {filters.search ? <input type="hidden" name="q" value={filters.search} /> : null}
          {filters.serviceType !== "all" ? <input type="hidden" name="service" value={filters.serviceType} /> : null}
          {filters.category !== "all" ? <input type="hidden" name="category" value={filters.category} /> : null}
          <EventControl label="Date">
            <input name="eventDate" type="date" min={manilaDateValue()} required defaultValue={context.eventDate} className={controlClass} />
          </EventControl>
          <EventControl label="Start">
            <input name="eventTime" type="time" required defaultValue={context.eventTime} className={controlClass} />
          </EventControl>
          <EventControl label="End">
            <input name="eventEndTime" type="time" required defaultValue={context.eventEndTime} className={controlClass} />
          </EventControl>
          <EventControl label="Guests">
            <input name="guestCount" type="number" min={1} max={10_000} step={1} required defaultValue={context.guestCount} className={controlClass} />
          </EventControl>
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-brand-soft outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Update availability
          </button>
        </form>
      </div>
    </section>
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

const controlClass = "h-10 min-w-0 rounded-xl border border-feasta-border-soft bg-white px-2.5 text-xs font-semibold text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/15";
