"use client";

import {
  CalendarDays,
  Clock3,
  MapPin,
  Search,
  UsersRound,
} from "lucide-react";
import {useRouter} from "next/navigation";
import {useMemo, useState, type FormEvent, type ReactNode} from "react";

import {Button} from "@/components/ui/button";
import {PROVIDER_SERVICE_TYPE_OPTIONS} from "@/lib/customer/providers/provider-catalog";
import {providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import {
  manilaDateValue,
  validateCustomerEventContext,
  type CustomerEventContextDraft,
  type CustomerEventContextErrors,
} from "@/lib/customer/planning/event-planning-context";

const INITIAL_DRAFT: CustomerEventContextDraft = {
  eventDate: "",
  eventTime: "",
  eventEndTime: "",
  guestCount: "",
  serviceType: "all",
};

export function MarketplaceSearch() {
  const router = useRouter();
  const minimumDate = useMemo(() => manilaDateValue(), []);
  const [draft, setDraft] = useState(INITIAL_DRAFT);
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<CustomerEventContextErrors>({});

  function updateDraft(field: keyof CustomerEventContextDraft, value: string) {
    setDraft((current) => ({...current, [field]: value}));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = {...current};
      delete next[field];
      return next;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateCustomerEventContext(draft, minimumDate);
    setErrors(validation.errors);
    if (!validation.context) return;

    const normalizedSearch = search.trim().length >= 2
      ? search.trim().replace(/\s+/gu, " ").slice(0, 80)
      : "";
    router.push(providerDiscoveryHref({
      search: normalizedSearch,
      serviceType: validation.context.serviceType,
      category: "all",
      cursor: null,
      eventContext: validation.context,
    }));
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Plan a new event"
      className="rounded-2xl border border-white/80 bg-white p-3 shadow-[0_10px_28px_rgba(38,24,20,0.12)] sm:p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.75fr]">
        <PlanningField id="home-service-type" label="Service type" error={errors.serviceType} icon={<Search aria-hidden="true" />}>
          <select
            id="home-service-type"
            value={draft.serviceType}
            onChange={(event) => updateDraft("serviceType", event.target.value)}
            aria-invalid={Boolean(errors.serviceType)}
            aria-describedby={errors.serviceType ? "home-service-type-error" : undefined}
            className={controlClass}
          >
            <option value="all">All event services</option>
            {PROVIDER_SERVICE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </PlanningField>

        <PlanningField id="home-event-date" label="Event date" error={errors.eventDate} icon={<CalendarDays aria-hidden="true" />}>
          <input
            id="home-event-date"
            type="date"
            min={minimumDate}
            value={draft.eventDate}
            onChange={(event) => updateDraft("eventDate", event.target.value)}
            aria-invalid={Boolean(errors.eventDate)}
            aria-describedby={errors.eventDate ? "home-event-date-error" : undefined}
            className={controlClass}
          />
        </PlanningField>

        <PlanningField id="home-event-time" label="Start time" error={errors.eventTime} icon={<Clock3 aria-hidden="true" />}>
          <input
            id="home-event-time"
            type="time"
            value={draft.eventTime}
            onChange={(event) => updateDraft("eventTime", event.target.value)}
            aria-invalid={Boolean(errors.eventTime)}
            aria-describedby={errors.eventTime ? "home-event-time-error" : undefined}
            className={controlClass}
          />
        </PlanningField>

        <PlanningField id="home-event-end-time" label="End time" error={errors.eventEndTime} icon={<Clock3 aria-hidden="true" />}>
          <input
            id="home-event-end-time"
            type="time"
            value={draft.eventEndTime}
            onChange={(event) => updateDraft("eventEndTime", event.target.value)}
            aria-invalid={Boolean(errors.eventEndTime)}
            aria-describedby={errors.eventEndTime ? "home-event-end-time-error" : undefined}
            className={controlClass}
          />
        </PlanningField>

        <PlanningField id="home-guest-count" label="Guests" error={errors.guestCount} icon={<UsersRound aria-hidden="true" />}>
          <input
            id="home-guest-count"
            type="number"
            min={1}
            max={10_000}
            step={1}
            inputMode="numeric"
            value={draft.guestCount}
            onChange={(event) => updateDraft("guestCount", event.target.value)}
            aria-invalid={Boolean(errors.guestCount)}
            aria-describedby={errors.guestCount ? "home-guest-count-error" : undefined}
            className={controlClass}
          />
        </PlanningField>
      </div>

      <div className="mt-3 grid gap-3 border-t border-[#E2BFB5]/60 pt-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
        <label className="grid gap-1.5" htmlFor="home-marketplace-search">
          <span className="text-xs font-bold text-[#5A413A]">Optional provider or service search</span>
          <span className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8E7068]" />
            <input
              id="home-marketplace-search"
              type="search"
              minLength={2}
              maxLength={80}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search caterers, venues, photographers, and services"
              className={`${controlClass} pl-9`}
            />
          </span>
        </label>

        <p className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[#5A413A]">
          <MapPin aria-hidden="true" className="size-4 text-primary" />
          Ormoc City, Leyte
        </p>

        <Button type="submit" className="min-h-11 rounded-xl px-6 font-bold">
          <Search aria-hidden="true" className="size-4" />
          Find available services
        </Button>
      </div>
    </form>
  );
}

function PlanningField({id, label, error, icon, children}: {
  id: string;
  label: string;
  error?: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5A413A] [&_svg]:size-3.5 [&_svg]:text-primary" htmlFor={id}>
        {icon}
        {label}
      </label>
      {children}
      {error ? (
        <span id={`${id}-error`} role="alert" className="text-xs font-semibold text-destructive">{error}</span>
      ) : null}
    </div>
  );
}

const controlClass = [
  "h-11 w-full min-w-0 rounded-xl border border-feasta-border-soft",
  "bg-feasta-canvas px-3 text-sm font-semibold text-foreground outline-none",
  "transition-[border-color,background-color,box-shadow]",
  "focus:border-primary/40 focus:bg-white focus:ring-4 focus:ring-primary/[0.07]",
  "aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:ring-destructive/10",
].join(" ");
