"use client";

import {ArrowRight, CalendarDays, PartyPopper, Users} from "lucide-react";
import {useRouter} from "next/navigation";
import {useEffect, useRef, useState, type FormEvent} from "react";

import {
  CUSTOMER_PLANNING_EVENT_TYPES,
  manilaDateValue,
  MAX_EVENT_GUESTS,
} from "@/lib/customer/planning/event-planning-context";

import {EventVenueInput} from "./event-venue-input";
import {parseProviderDiscoveryFilters, providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import {PUBLIC_PROVIDER_MARKETPLACE_PATH} from "@/lib/customer/providers/provider-route-policy";

const EVENT_TYPE_LABELS = {
  birthday: "Birthday",
  wedding: "Wedding",
  debut: "Debut",
  corporate: "Corporate",
  anniversary: "Anniversary",
  other: "Other",
} satisfies Record<(typeof CUSTOMER_PLANNING_EVENT_TYPES)[number], string>;

export function StartYourEventForm() {
  const router = useRouter();
  const dateInput = useRef<HTMLInputElement>(null);
  const [guestError, setGuestError] = useState<string | null>(null);

  useEffect(() => {
    if (dateInput.current) dateInput.current.min = manilaDateValue();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const guestValue = String(values.get("guestCount") ?? "").trim();
    const guests = Number(guestValue);
    if (
      guestValue &&
      (!/^\d{1,5}$/u.test(guestValue) ||
        !Number.isSafeInteger(guests) ||
        guests < 1 ||
        guests > MAX_EVENT_GUESTS)
    ) {
      setGuestError(`Enter a whole number from 1 to ${MAX_EVENT_GUESTS.toLocaleString("en-PH")}.`);
      const guestControl = form.elements.namedItem("guestCount");
      if (guestControl instanceof HTMLElement) guestControl.focus();
      return;
    }
    setGuestError(null);

    const parameters = new URLSearchParams();
    for (const [name, value] of values.entries()) {
      const normalized = typeof value === "string" ? value.trim() : "";
      if (normalized) parameters.set(name, normalized);
    }
    router.push(providerDiscoveryHref(parseProviderDiscoveryFilters(Object.fromEntries(parameters))));
  }

  return (
    <form
      action={PUBLIC_PROVIDER_MARKETPLACE_PATH}
      method="get"
      onSubmit={submit}
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.05fr_0.9fr_0.7fr_1.45fr_auto]"
    >
      <label className="group">
        <span className="mb-2 block text-xs font-bold text-feasta-text-secondary">
          Event type
        </span>
        <div className="relative">
          <PartyPopper
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-feasta-text-tertiary"
          />
          <select
            name="eventType"
            aria-label="Event type"
            defaultValue=""
            className={[
              "h-12 w-full appearance-none rounded-xl",
              "border border-feasta-border-soft bg-feasta-canvas",
              "pl-11 pr-9 text-sm font-semibold text-foreground outline-none",
              "transition-[border-color,box-shadow,background-color]",
              "focus:border-primary/60 focus:bg-white focus:ring-4 focus:ring-primary/10",
            ].join(" ")}
          >
            <option value="">Any occasion</option>
            {CUSTOMER_PLANNING_EVENT_TYPES.map((eventType) => (
              <option key={eventType} value={eventType}>
                {EVENT_TYPE_LABELS[eventType]}
              </option>
            ))}
          </select>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-feasta-text-tertiary"
          >
            ▼
          </span>
        </div>
      </label>

      <label>
        <span className="mb-2 block text-xs font-bold text-feasta-text-secondary">
          Date
        </span>
        <div className="relative">
          <CalendarDays
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-feasta-text-tertiary"
          />
          <input
            type="date"
            name="eventDate"
            aria-label="Date"
            ref={dateInput}
            className={[
              "h-12 w-full rounded-xl",
              "border border-feasta-border-soft bg-feasta-canvas",
              "pl-11 pr-3 text-sm font-semibold text-foreground outline-none",
              "transition-[border-color,box-shadow,background-color]",
              "focus:border-primary/60 focus:bg-white focus:ring-4 focus:ring-primary/10",
            ].join(" ")}
          />
        </div>
      </label>

      <label>
        <span className="mb-2 block text-xs font-bold text-feasta-text-secondary">
          Guests
        </span>
        <div className="relative">
          <Users
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-feasta-text-tertiary"
          />
          <input
            type="number"
            name="guestCount"
            aria-label="Guests"
            min={1}
            max={MAX_EVENT_GUESTS}
            step={1}
            inputMode="numeric"
            placeholder="50"
            aria-describedby={guestError ? "landing-guest-error" : undefined}
            onChange={() => guestError && setGuestError(null)}
            className={[
              "h-12 w-full rounded-xl",
              "border border-feasta-border-soft bg-feasta-canvas",
              "pl-11 pr-3 text-sm font-semibold text-foreground outline-none",
              "placeholder:text-feasta-text-tertiary",
              "transition-[border-color,box-shadow,background-color]",
              "focus:border-primary/60 focus:bg-white focus:ring-4 focus:ring-primary/10",
            ].join(" ")}
          />
        </div>
        {guestError ? (
          <span id="landing-guest-error" className="mt-1.5 block text-xs text-destructive">
            {guestError}
          </span>
        ) : null}
      </label>

      <EventVenueInput />

      <div className="sm:col-span-2 xl:col-span-1">
        <span aria-hidden="true" className="mb-2 hidden text-xs font-bold xl:block">
          &nbsp;
        </span>
        <button
          type="submit"
          className={[
            "group flex h-12 w-full items-center justify-center",
            "gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground",
            "shadow-brand-soft transition-[transform,background-color,box-shadow] duration-normal",
            "hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-brand",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
            "motion-reduce:transform-none",
          ].join(" ")}
        >
          Explore
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
          />
        </button>
      </div>
    </form>
  );
}
