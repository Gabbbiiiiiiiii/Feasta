"use client";

import {
  ArrowRight,
  CalendarDays,
  Check,
  MapPin,
  PartyPopper,
  Search,
  Wallet,
} from "lucide-react";
import {useRouter} from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {EventVenueInput} from "@/components/landing/event-venue-input";
import {PhilippineDateInput} from "@/components/forms/philippine-date-input";
import {Button} from "@/components/ui/button";
import {SearchInput} from "@/components/forms/search-input";
import {Select} from "@/components/ui/select";
import {useLiveSearch} from "@/lib/search/use-live-search";

import {
  CUSTOMER_PLANNING_EVENT_TYPES,
  MAX_EVENT_GUESTS,
  manilaDateValue,
  parseCustomerPlanningContext,
} from "@/lib/customer/planning/event-planning-context";
import type {ServiceCategoryOption} from "@/lib/service-categories/service-category-types";
import {
  parseProviderDiscoveryFilters,
  providerDiscoveryHref,
} from "@/lib/customer/providers/provider-query";

const controlClass =
  "h-12 min-h-12 min-w-0 w-full rounded-xl border-feasta-border-soft bg-feasta-canvas px-4 py-2 text-sm font-semibold focus-visible:ring-primary/20";

const EVENT_TYPE_LABELS: Record<string, string> = {
  birthday: "Birthday",
  wedding: "Wedding",
  debut: "Debut",
  corporate: "Corporate event",
  anniversary: "Anniversary",
  other: "Other celebration",
};

function FinderSection({
  number,
  title,
  description,
  icon,
  children,
}: {
  number: number;
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={[
        "grid min-w-0 content-start gap-2 border-t border-feasta-divider py-3 sm:py-4 lg:py-3",
        number === 1 ? "lg:col-span-5" :
        number === 2 ? "lg:col-span-7" :
        number === 3 ? "lg:col-span-7" :
        number === 4 ? "lg:col-span-5" :
        "lg:col-span-9",
      ].join(" ")}
      aria-labelledby={`event-finder-section-${number}`}
    >
      <div className="flex items-start gap-2 lg:items-center">
        <div
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary-strong lg:hidden"
          aria-hidden="true"
        >
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary lg:sr-only">
            Step {number}
          </p>

          <h3
            id={`event-finder-section-${number}`}
            className="mt-0.5 text-sm font-extrabold tracking-tight text-foreground sm:text-base lg:mt-0 lg:text-xs"
          >
            {title}
          </h3>

          <p className="mt-0.5 text-xs leading-5 text-feasta-text-secondary lg:hidden">
            {description}
          </p>
        </div>
      </div>

      <div className="min-w-0 sm:pl-[3.25rem] lg:pl-0">
        {children}
      </div>
    </section>
  );
}

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
  const parameters = new URLSearchParams(query);

  const planning = parseCustomerPlanningContext(
    Object.fromEntries(parameters),
    "",
  );

  const availableCodes = serviceCategoryOptions.map(
    (option) => option.code,
  );

  const [selectedCategories, setSelectedCategories] = useState<string[]>(() => {
    const selected = (parameters.get("categories") ?? "").split(",");
    const multiple = availableCodes.filter((code) =>
      selected.includes(code),
    );

    if (multiple.length > 0) return multiple;

    const single = parameters.get("category");

    return single && availableCodes.includes(single)
      ? [single]
      : availableCodes;
  });

  const allSelected =
    availableCodes.length > 0 && selectedCategories.length === availableCodes.length;

  const category =
    selectedCategories.length === 0
      ? "none"
      : allSelected
        ? "all"
        : selectedCategories.length === 1
          ? selectedCategories[0]
          : "all";

  const categoriesValue =
    selectedCategories.length > 1 && !allSelected
      ? selectedCategories.join(",")
      : "";

  const [search, setSearch] = useState(
    parameters.get("q") ?? "",
  );

  const [eventDate, setEventDate] = useState(
    planning?.eventDate ?? "",
  );

  const dateInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const live = useLiveSearch(search, (value) => {
    if (category === "none") return;
    const next = new URLSearchParams(query);
    next.delete("categories");

    const selectedType = serviceCategoryOptions.find((option) => option.code === category)?.serviceType;
    if (selectedCategories.length !== 1 ||
      (selectedType && next.has("service") && next.get("service") !== selectedType)) {
      next.delete("service");
    }

    for (const name of Array.from(next.keys())) {
      if (name.startsWith("eventVenue")) {
        next.delete(name);
      }
    }

    if (formRef.current) {
      for (const [name, entry] of new FormData(formRef.current)) {
        if (typeof entry === "string") {
          next.set(name, entry);
        }
      }
    }

    const trimmed = value.trim();

    if (trimmed) {
      next.set("q", trimmed);
    } else {
      next.delete("q");
    }

    next.delete("cursor");

    router.replace(
      providerDiscoveryHref(
        parseProviderDiscoveryFilters(
          Object.fromEntries(next),
        ),
      ),
      {scroll: false},
    );
  });

  useEffect(() => {
    if (dateInput.current) {
      dateInput.current.min = manilaDateValue();
    }
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (category === "none") return;
    const data = new FormData(event.currentTarget);
    const minimum = data.get("budgetMin");
    const maximum = data.get("budgetMax");
    const maximumInput = event.currentTarget.elements.namedItem("budgetMax") as HTMLInputElement;
    maximumInput.setCustomValidity(
      minimum && maximum && Number(maximum) < Number(minimum)
        ? "Maximum budget must be at least the starting budget."
        : "",
    );
    live.acknowledge();

    if (dateInput.current) {
      dateInput.current.min = manilaDateValue();
    }

    if (!event.currentTarget.reportValidity()) {
      return;
    }

    const next = new URLSearchParams(query);
    next.delete("categories");

    const selectedType = serviceCategoryOptions.find((option) => option.code === category)?.serviceType;
    if (selectedCategories.length !== 1 ||
      (selectedType && next.has("service") && next.get("service") !== selectedType)) {
      next.delete("service");
    }

    for (const name of Array.from(next.keys())) {
      if (name.startsWith("eventVenue")) {
        next.delete(name);
      }
    }

    for (const [name, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string") {
        next.set(name, value);
      }
    }

    const filters = parseProviderDiscoveryFilters(
      Object.fromEntries(next),
    );

    router.push(providerDiscoveryHref(filters));
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
      onInput={() => {
        const input = formRef.current?.elements.namedItem("budgetMax") as HTMLInputElement | null;
        input?.setCustomValidity("");
      }}
      className="mx-auto grid w-full min-w-0 gap-x-5 rounded-[24px] border border-feasta-border-soft bg-white px-4 pb-4 pt-4 shadow-[0_12px_32px_rgba(4,53,39,0.07)] sm:px-6 lg:grid-cols-12 lg:px-6 lg:py-4"
    >
      <div className="mb-2 flex flex-wrap items-center gap-3 sm:mb-3 lg:col-span-12 lg:mb-0">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-brand-soft"
          aria-hidden="true"
        >
          <PartyPopper className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary-strong lg:hidden">
            Your celebration starts here
          </p>

          <h2 className="text-lg font-extrabold tracking-tight text-foreground lg:text-base">
            Plan your event
          </h2>

          <p className="mt-1 text-xs text-feasta-text-secondary lg:hidden">
            Tell us what you have in mind and explore providers
            for your celebration.
          </p>
        </div>
      </div>

      <FinderSection
        number={1}
        title="What are you celebrating?"
        description="Start with your occasion and expected number of guests."
        icon={<PartyPopper className="size-5" />}
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label
              htmlFor="event-finder-type"
              className="mb-2 block text-xs font-bold text-feasta-text-secondary"
            >
              Event type
            </label>

            <Select
              id="event-finder-type"
              name="eventType"
              defaultValue={planning?.eventType ?? ""}
              className={controlClass}
            >
              <option value="">Choose your occasion</option>

              {CUSTOMER_PLANNING_EVENT_TYPES.map((value) => (
                <option key={value} value={value}>
                  {EVENT_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="event-finder-guests"
              className="mb-2 block text-xs font-bold text-feasta-text-secondary"
            >
              Number of guests
            </label>

            <input
              id="event-finder-guests"
              name="guestCount"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_EVENT_GUESTS}
              step={1}
              defaultValue={planning?.guestCount ?? ""}
              placeholder="e.g. 100"
              className={controlClass}
            />
          </div>
        </div>
      </FinderSection>

      <FinderSection
        number={2}
        title="Where is your event?"
        description="Choose a Google Maps location or pin the venue on the map."
        icon={<MapPin className="size-5" />}
      >
        <EventVenueInput
          initialVenue={planning?.eventVenue}
          placeholder="Enter where your event will take place"
          enableMap
          compactMapAction
        />
      </FinderSection>

      <FinderSection
        number={3}
        title="Event schedule"
        description="Share your event date and preferred start and end time."
        icon={<CalendarDays className="size-5" />}
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <label
              htmlFor="event-finder-date"
              className="mb-2 block text-xs font-bold text-feasta-text-secondary"
            >
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
            <label
              htmlFor="event-finder-start"
              className="mb-2 block text-xs font-bold text-feasta-text-secondary"
            >
              Start time
            </label>

            <input
              id="event-finder-start"
              name="eventTime"
              type="time"
              defaultValue={parameters.get("eventTime") ?? ""}
              className={controlClass}
            />
          </div>

          <div className="min-w-0">
            <label
              htmlFor="event-finder-end"
              className="mb-2 block text-xs font-bold text-feasta-text-secondary"
            >
              End time
            </label>

            <input
              id="event-finder-end"
              name="eventEndTime"
              type="time"
              defaultValue={parameters.get("eventEndTime") ?? ""}
              className={controlClass}
            />
          </div>
        </div>

        <p
          id="event-finder-planning-hint"
          className="mt-2 text-xs leading-5 text-feasta-text-secondary"
        >
          Provider availability requires a valid date, time
          range, and guest count.
        </p>
      </FinderSection>

      <FinderSection
        number={4}
        title="Budget range"
        description="Set an estimated spending range for your planning."
        icon={<Wallet className="size-5" />}
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label
              htmlFor="event-finder-budget-min"
              className="mb-2 block text-xs font-bold text-feasta-text-secondary"
            >
              Starting budget (₱)
            </label>

            <input
              id="event-finder-budget-min"
              type="number"
              min={0}
              name="budgetMin"
              defaultValue={planning?.budgetMin ?? ""}
              max={100000000}
              step={1}
              placeholder="Minimum amount"
              className="h-11 min-h-11 w-full min-w-0 rounded-xl border border-feasta-border-soft bg-feasta-canvas px-3 py-2 text-sm font-medium text-primary-strong placeholder:text-feasta-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            />
          </div>

          <div className="min-w-0">
            <label
              htmlFor="event-finder-budget-max"
              className="mb-2 block text-xs font-bold text-feasta-text-secondary"
            >
              Maximum budget (₱)
            </label>

            <input
              id="event-finder-budget-max"
              type="number"
              min={0}
              name="budgetMax"
              defaultValue={planning?.budgetMax ?? ""}
              max={100000000}
              step={1}
              placeholder="No upper limit"
              className="h-11 min-h-11 w-full min-w-0 rounded-xl border border-feasta-border-soft bg-feasta-canvas px-3 py-2 text-sm font-medium text-primary-strong placeholder:text-feasta-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            />
          </div>
        </div>

      </FinderSection>

      <FinderSection
        number={5}
        title="Services needed"
        description="Choose any combination of services to explore matching providers."
        icon={<Check className="size-5" />}
      >
                <input
          type="hidden"
          name="category"
          value={category === "none" ? "" : category}
        />
        {categoriesValue ? (
          <input
            type="hidden"
            name="categories"
            value={categoriesValue}
          />
        ) : null}

        <fieldset className="min-w-0">
            <legend className="sr-only">
              Choose service category
            </legend>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <label
                className={`flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-primary/25 ${
                  allSelected
                    ? "border-primary/40 bg-primary-tint text-primary-strong"
                    : "border-feasta-border-soft bg-white text-foreground hover:border-primary/25 hover:bg-primary-tint/40"
                }`}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelectedCategories(allSelected ? [] : availableCodes)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span>Select All</span>
              </label>
              {serviceCategoryOptions.map((option) => (
                <label
                  key={option.code}
                  className={`flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-primary/25 ${
                    selectedCategories.includes(option.code)
                      ? "border-primary/40 bg-primary-tint text-primary-strong"
                      : "border-feasta-border-soft bg-white text-foreground hover:border-primary/25 hover:bg-primary-tint/40"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(option.code)}
                    onChange={() => setSelectedCategories((current) =>
                      current.includes(option.code)
                        ? current.filter((code) => code !== option.code)
                        : availableCodes.filter((code) =>
                            current.includes(code) || code === option.code,
                          ),
                    )}
                    className="size-4 shrink-0 accent-primary"
                  />

                  <span>{option.name}</span>
                </label>
              ))}
            </div>

            <p className="sr-only">
              Choose any combination of service categories,
              or Select All.
              Search results match at least one selected category.
            </p>
            {category === "none" ? (
              <p role="status" className="mt-1 text-xs font-medium text-amber-700">
                Select at least one service before searching.
              </p>
            ) : null}
        </fieldset>

        <div className="mt-2">
          <label
            htmlFor="event-finder-search"
            className="mb-2 block text-xs font-bold text-feasta-text-secondary"
          >
            Search providers or services
          </label>

          <SearchInput
            value={search}
            onChange={(event) => {
              live.change(event.target.value);
              setSearch(event.target.value);
            }}
            onClear={
              search
                ? () => {
                    live.change("");
                    setSearch("");
                  }
                : undefined
            }
            id="event-finder-search"
            name="q"
            minLength={1}
            maxLength={80}
            placeholder="Search by provider or service name"
            className={`${controlClass} pl-11`}
          />
        </div>
      </FinderSection>

      <div className="border-t border-feasta-divider pt-4 sm:pl-[3.25rem] lg:col-span-3 lg:flex lg:items-end lg:pl-0 lg:pt-3">
        <Button
          type="submit"
          aria-label="Find Services"
          disabled={category === "none" || (!allSelected && (selectedCategories.length > 30 || categoriesValue.length > 1024))}
          className="flex h-12 min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold shadow-brand-soft sm:h-14"
        >
          <Search aria-hidden="true" className="size-4" />
          Find matching services
          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </form>
  );
}
