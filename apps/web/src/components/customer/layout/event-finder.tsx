"use client";

import {ArrowRight} from "lucide-react";
import {useRouter} from "next/navigation";
import {useEffect, useRef, useState, type FormEvent} from "react";

import {EventVenueInput} from "@/components/landing/event-venue-input";
import {PhilippineDateInput} from "@/components/forms/philippine-date-input";
import {Button} from "@/components/ui/button";
import {SearchInput} from "@/components/forms/search-input";
import {useLiveSearch} from "@/lib/search/use-live-search";
import {Select} from "@/components/ui/select";
import {
  manilaDateValue,
  parseCustomerPlanningContext,
} from "@/lib/customer/planning/event-planning-context";
import type {ServiceCategoryOption} from "@/lib/service-categories/service-category-types";
import {
  parseProviderDiscoveryFilters,
  providerDiscoveryHref,
} from "@/lib/customer/providers/provider-query";

const controlClass = "h-12 min-h-12 min-w-0 rounded-xl border-feasta-border-soft bg-feasta-canvas py-2 text-sm font-semibold";

export function EventFinder({
  query,
  onFind,
  serviceCategoryOptions = [],
}: {
  query: string;
  onFind: () => void;
  serviceCategoryOptions?: readonly ServiceCategoryOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState(new URLSearchParams(query).get("q") ?? "");
  const parameters = new URLSearchParams(query);
  // A fixed lower bound keeps URL-derived defaults identical during SSR and hydration.
  // The canonical provider parser validates against today's date on submission.
  const planning = parseCustomerPlanningContext(Object.fromEntries(parameters), "");
  const [eventDate, setEventDate] = useState(planning?.eventDate ?? "");
  const dateInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const live = useLiveSearch(search, (value) => {
    const next = new URLSearchParams(query);
    for (const name of Array.from(next.keys())) {
      if (name.startsWith("eventVenue")) next.delete(name);
    }
    if (formRef.current) {
      for (const [name, entry] of new FormData(formRef.current)) {
        if (typeof entry === "string") next.set(name, entry);
      }
    }
    const trimmed = value.trim();
    if (trimmed) next.set("q", trimmed);
    else next.delete("q");
    next.delete("cursor");
    router.replace(
      providerDiscoveryHref(parseProviderDiscoveryFilters(Object.fromEntries(next))),
      {scroll: false},
    );
  });
  const category = parameters.get("category");
  const providerType = parameters.get("service");
  const selectedProviderType =
    providerType === "catering" || providerType === "addon" || providerType === "both"
      ? providerType
      : "all";
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(selectedProviderType !== "all");

  useEffect(() => {
    if (dateInput.current) dateInput.current.min = manilaDateValue();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    live.acknowledge();
    if (dateInput.current) dateInput.current.min = manilaDateValue();
    if (!event.currentTarget.reportValidity()) return;
    const values = new FormData(event.currentTarget);
    const nextParameters = new URLSearchParams(query);
    // Venue fields come from the existing selector, including clearing a selection.
    for (const name of Array.from(nextParameters.keys())) {
      if (name.startsWith("eventVenue")) nextParameters.delete(name);
    }
    for (const [name, value] of values) {
      if (typeof value === "string") nextParameters.set(name, value);
    }
    // Reuse category/search validation and planning serialization; changing filters
    // resets pagination. A date alone remains planning context, not availability.
    const filters = parseProviderDiscoveryFilters(Object.fromEntries(nextParameters));
    router.push(providerDiscoveryHref(filters));
    onFind();
  }

  function clearDiscoveryFilters() {
    live.acknowledge("");

    const next = new URLSearchParams(query);

    // Match submit behavior for venue selection and clearing.
    for (const name of Array.from(next.keys())) {
      if (name.startsWith("eventVenue")) next.delete(name);
    }

    if (formRef.current) {
      for (const [name, value] of new FormData(formRef.current)) {
        if (
          typeof value === "string" &&
          !["q", "service", "category", "cursor"].includes(name)
        ) {
          next.set(name, value);
        }
      }
    }

    for (const name of ["q", "service", "category", "cursor"]) {
      next.delete(name);
    }

    setSearch("");

    router.push(
      providerDiscoveryHref(
        parseProviderDiscoveryFilters(Object.fromEntries(next)),
      ),
    );

    onFind();
  }

  return (
    <form
      ref={formRef}
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

      <div className="mt-3 grid min-w-0 items-start gap-3">
        <EventVenueInput
          initialVenue={planning?.eventVenue}
          placeholder="Enter where your event will take place"
          enableMap
        />
        <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2 sm:gap-x-4 lg:grid-cols-[minmax(10rem,1fr)_minmax(0,1.35fr)_auto]">
          <div className="min-w-0">
            <label htmlFor="event-finder-date" className="mb-2 block text-xs font-bold text-feasta-text-secondary">
              Event Date
            </label>
            <PhilippineDateInput
              id="event-finder-date"
              ref={dateInput}
              name="eventDate"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              aria-describedby="event-finder-planning-hint"
              placeholder="Select event date"
              visibleText
              displayClassName="left-4 right-12 text-sm font-semibold"
              className={controlClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="event-finder-service" className="mb-2 block text-xs font-bold text-feasta-text-secondary">
              Type of Service
            </label>
            <Select
              id="event-finder-service"
              name="category"
              defaultValue={
                serviceCategoryOptions.some(
                  (option) => option.code === category,
                )
                  ? category ?? "all"
                  : "all"
              }
              className={controlClass}
            >
              <option value="all">What service do you need?</option>
              {serviceCategoryOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" className="h-12 min-h-12 w-full shrink-0 rounded-xl px-5 text-sm sm:mt-6 lg:w-auto">
            Find Services <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <label htmlFor="event-finder-search" className="mb-2 block text-xs font-bold text-feasta-text-secondary">
          Search providers or services
        </label>
        <SearchInput
          value={search}
          onChange={(event) => {
            live.change(event.target.value);
            setSearch(event.target.value);
          }}
          onClear={search ? () => {
            live.change("");
            setSearch("");
          } : undefined}
          id="event-finder-search"
          name="q"
          minLength={1}
          maxLength={80}
          placeholder="Search by provider or service name"
          className={controlClass}
        />
      </div>

      <details
        open={moreFiltersOpen}
        onToggle={(event) => setMoreFiltersOpen(event.currentTarget.open)}
        className="group mt-3 rounded-xl border border-feasta-border-soft bg-feasta-canvas/40 px-3 py-2"
      >
        <summary className="flex min-h-10 cursor-pointer items-center text-sm font-bold text-feasta-text-secondary">
          More filters
        </summary>

        <div className="mt-3 grid min-w-0 gap-3 border-t border-feasta-border-soft pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <label
              htmlFor="event-finder-provider-type"
              className="mb-2 block text-xs font-bold text-feasta-text-secondary"
            >
              Provider Type
            </label>

            <Select
              id="event-finder-provider-type"
              name="service"
              defaultValue={selectedProviderType}
              className={controlClass}
            >
              <option value="all">All provider types</option>
              <option value="catering">Catering provider</option>
              <option value="addon">Event services provider</option>
              <option value="both">Catering and event services provider</option>
            </Select>
          </div>

          <button
            type="button"
            onClick={clearDiscoveryFilters}
            className="min-h-12 rounded-xl border border-feasta-border-soft bg-card px-4 text-sm font-bold text-primary-strong transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
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
