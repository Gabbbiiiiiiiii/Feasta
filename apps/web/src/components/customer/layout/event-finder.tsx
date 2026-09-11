"use client";

import {ArrowRight} from "lucide-react";
import {useRouter} from "next/navigation";
import {useEffect, useRef, useState, type FormEvent} from "react";

import {EventVenueInput} from "@/components/landing/event-venue-input";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {
  manilaDateValue,
  parseCustomerPlanningContext,
} from "@/lib/customer/planning/event-planning-context";
import {PROVIDER_CATEGORY_OPTIONS, PROVIDER_SERVICE_TYPE_OPTIONS} from "@/lib/customer/providers/provider-catalog";
import {
  parseProviderDiscoveryFilters,
  providerDiscoveryHref,
} from "@/lib/customer/providers/provider-query";

const controlClass = "h-12 min-h-12 min-w-0 rounded-xl border-feasta-border-soft bg-feasta-canvas py-2 text-sm font-semibold";

export function EventFinder({query, onFind}: {query: string; onFind: () => void}) {
  const router = useRouter();
  const parameters = new URLSearchParams(query);
  // A fixed lower bound keeps URL-derived defaults identical during SSR and hydration.
  // The canonical provider parser validates against today's date on submission.
  const planning = parseCustomerPlanningContext(Object.fromEntries(parameters), "");
  const [eventDate, setEventDate] = useState(planning?.eventDate ?? "");
  const dateInput = useRef<HTMLInputElement>(null);
  const category = parameters.get("category");
  const serviceType = parameters.get("service");
  const hasAdditionalFilters = Boolean(parameters.get("q")) ||
    PROVIDER_SERVICE_TYPE_OPTIONS.some((option) => option.value === serviceType);

  useEffect(() => {
    if (dateInput.current) dateInput.current.min = manilaDateValue();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const clearFilters = submitter?.getAttribute("value") === "clear-filters";
    if (dateInput.current) dateInput.current.min = manilaDateValue();
    if (!clearFilters && !event.currentTarget.reportValidity()) return;
    const values = new FormData(event.currentTarget);
    const nextParameters = new URLSearchParams(query);
    // Venue fields come from the existing selector, including clearing a selection.
    for (const name of Array.from(nextParameters.keys())) {
      if (name.startsWith("eventVenue")) nextParameters.delete(name);
    }
    for (const [name, value] of values) {
      if (typeof value === "string") nextParameters.set(name, value);
    }
    if (clearFilters) {
      for (const name of ["q", "service", "category"]) nextParameters.delete(name);
    }
    // Reuse category/search validation and planning serialization; changing filters
    // resets pagination. A date alone remains planning context, not availability.
    const filters = parseProviderDiscoveryFilters(Object.fromEntries(nextParameters));
    router.push(providerDiscoveryHref(filters));
    onFind();
  }

  return (
    <form
      action="/customer/providers"
      method="get"
      role="search"
      aria-label="Event Finder"
      onSubmit={submit}
      className="rounded-xl border border-feasta-border-soft bg-card p-4 shadow-card sm:py-3"
    >
      <p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-primary-strong">
        Find services for your event
      </p>

      <div className="mt-3 grid min-w-0 items-start gap-3 sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(10rem,1fr)_minmax(0,1.35fr)_auto]">
        <EventVenueInput initialVenue={planning?.eventVenue} placeholder="Ormoc City, Leyte" />
        <div className="min-w-0">
          <label htmlFor="event-finder-date" className="mb-2 block text-xs font-bold text-feasta-text-secondary">
            Event Date
          </label>
          <div className="group relative">
            <Input
              id="event-finder-date"
              ref={dateInput}
              name="eventDate"
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              aria-describedby="event-finder-planning-hint"
              className={`${controlClass} ${eventDate ? "" : "text-transparent focus:text-foreground"}`}
            />
            {!eventDate ? (
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-semibold text-feasta-text-tertiary group-focus-within:hidden">
                Select event date
              </span>
            ) : null}
          </div>
        </div>
        <div className="min-w-0">
          <label htmlFor="event-finder-service" className="mb-2 block text-xs font-bold text-feasta-text-secondary">
            Service Category
          </label>
          <Select
            id="event-finder-service"
            name="category"
            defaultValue={PROVIDER_CATEGORY_OPTIONS.some((option) => option.value === category) ? category ?? "all" : "all"}
            className={controlClass}
          >
            <option value="all">What service do you need?</option>
            {PROVIDER_CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" className="h-12 min-h-12 w-full shrink-0 rounded-xl px-5 text-sm sm:mt-6 lg:w-auto">
          Find Services <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <details className="mt-2" open={hasAdditionalFilters || undefined}>
        <summary className="w-fit cursor-pointer rounded-lg py-1 text-xs font-bold text-feasta-text-secondary hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          More filters
        </summary>
        <div className="mt-2 grid items-start gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor="event-finder-search" className="mb-2 block text-xs font-bold text-feasta-text-secondary">
              Search approved providers
            </label>
            <Input id="event-finder-search" type="search" name="q" minLength={2} maxLength={80} defaultValue={parameters.get("q") ?? ""} placeholder="Search providers or services" className={controlClass} />
          </div>
          <div className="min-w-0">
            <label htmlFor="event-finder-provider-type" className="mb-2 block text-xs font-bold text-feasta-text-secondary">
              Provider Type
            </label>
            <Select id="event-finder-provider-type" name="service" defaultValue={PROVIDER_SERVICE_TYPE_OPTIONS.some((option) => option.value === serviceType) ? serviceType ?? "all" : "all"} className={controlClass}>
              <option value="all">All provider types</option>
              {PROVIDER_SERVICE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label} provider</option>
              ))}
            </Select>
          </div>
          <button type="submit" value="clear-filters" formNoValidate className="w-fit rounded-lg py-2 text-xs font-bold text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Clear filters
          </button>
        </div>
      </details>

      <p id="event-finder-planning-hint" className="sr-only">
        Location and date are saved with your event details. Availability also needs a time range and guest count.
      </p>
    </form>
  );
}
