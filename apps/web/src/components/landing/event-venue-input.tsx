"use client";

import {LoaderCircle, MapPin, X} from "lucide-react";
import {useEffect, useId, useRef, useState} from "react";

import type {CustomerEventVenue} from "@/lib/customer/planning/event-planning-context";
import {
  getEventVenueDetails,
  searchEventVenues,
  type EventVenueSuggestion,
} from "@/lib/customer/planning/event-venue-client";

export function EventVenueInput({
  initialVenue = null,
  label = "Location",
  placeholder = "Search event venue or address",
}: {
  initialVenue?: CustomerEventVenue | null;
  label?: string;
  placeholder?: string;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-suggestions`;
  const requestId = useRef(0);
  const skipNextSearch = useRef(false);
  const [query, setQuery] = useState(initialVenue?.address ?? "");
  const [selectedVenue, setSelectedVenue] = useState(initialVenue);
  const [suggestions, setSuggestions] = useState<readonly EventVenueSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [status, setStatus] = useState<"idle" | "searching" | "resolving">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
  if (skipNextSearch.current) {
    skipNextSearch.current = false;
    return;
  }

  const trimmedQuery = query.trim();

  if (selectedVenue || trimmedQuery.length < 2) {
    return;
  }

  const currentRequest = requestId.current + 1;
  requestId.current = currentRequest;

  const timeout = window.setTimeout(() => {
    setStatus("searching");
    setError(null);

    void searchEventVenues(trimmedQuery)
      .then((results) => {
        if (requestId.current !== currentRequest) return;

        setSuggestions(results);
        setActiveIndex(results.length > 0 ? 0 : -1);
        setStatus("idle");
      })
      .catch((caught: unknown) => {
        if (requestId.current !== currentRequest) return;

        setSuggestions([]);
        setActiveIndex(-1);
        setStatus("idle");
        setError(
          caught instanceof Error
            ? caught.message
            : "Event venue search is unavailable.",
        );
      });
  }, 320);

  return () => {
    window.clearTimeout(timeout);

    if (requestId.current === currentRequest) {
      requestId.current += 1;
    }
  };
}, [query, selectedVenue]);

  function updateQuery(value: string) {
    requestId.current += 1;
    setQuery(value);
    setSelectedVenue(null);
    setSuggestions([]);
    setActiveIndex(-1);
    setStatus("idle");
    setError(null);
  }

  function selectSuggestion(suggestion: EventVenueSuggestion) {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    skipNextSearch.current = true;
    setQuery(suggestion.fullAddress);
    setSuggestions([]);
    setActiveIndex(-1);
    setStatus("resolving");
    setError(null);
    void getEventVenueDetails(suggestion.placeId)
      .then((details) => {
        if (requestId.current !== currentRequest) return;
        setSelectedVenue({
          label: suggestion.mainText,
          address: details.address,
          city: details.city,
          province: details.province,
          placeId: suggestion.placeId,
          latitude: details.latitude,
          longitude: details.longitude,
        });
        setQuery(details.address);
        setStatus("idle");
      })
      .catch((caught: unknown) => {
        if (requestId.current !== currentRequest) return;
        setSelectedVenue(null);
        setStatus("idle");
        setError(caught instanceof Error ? caught.message : "That event venue could not be selected.");
      });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) {
      if (event.key === "Escape") setSuggestions([]);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];
      if (suggestion) selectSuggestion(suggestion);
    } else if (event.key === "Escape") {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }

  return (
    <div className="relative min-w-0">
      <label htmlFor={inputId} className="mb-2 block text-xs font-bold text-feasta-text-secondary">
        {label}
      </label>

      <div className="relative">
        <MapPin
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-feasta-text-tertiary"
        />
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
          aria-describedby={error ? `${inputId}-status` : undefined}
          autoComplete="off"
          placeholder={placeholder}
          className={[
            "h-12 w-full rounded-xl",
            "border border-feasta-border-soft bg-feasta-canvas",
            "pl-11 pr-11 text-sm font-semibold text-foreground",
            "outline-none placeholder:text-feasta-text-tertiary",
            "transition-[border-color,box-shadow,background-color]",
            "focus:border-primary/60 focus:bg-white focus:ring-4 focus:ring-primary/10",
          ].join(" ")}
        />

        {status !== "idle" ? (
          <LoaderCircle
            aria-hidden="true"
            className="absolute right-3.5 top-1/2 size-[18px] -translate-y-1/2 animate-spin text-primary motion-reduce:animate-none"
          />
        ) : query ? (
          <button
            type="button"
            onClick={() => updateQuery("")}
            aria-label="Clear event venue"
            className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-feasta-text-tertiary transition-colors hover:bg-secondary hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>

      {suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Event venue suggestions"
          className="absolute inset-x-0 top-full z-40 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-feasta-border-soft bg-white p-1.5 shadow-modal"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.placeId} role="presentation">
              <button
                id={`${inputId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(suggestion)}
                className={[
                  "grid min-h-12 w-full gap-0.5 rounded-xl px-3 py-2 text-left",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                  index === activeIndex ? "bg-secondary" : "hover:bg-feasta-surface-soft",
                ].join(" ")}
              >
                <span className="text-sm font-bold text-foreground">{suggestion.mainText}</span>
                {suggestion.secondaryText ? (
                  <span className="text-xs leading-5 text-feasta-text-secondary">{suggestion.secondaryText}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selectedVenue ? (
        <p className="mt-1.5 text-xs leading-5 text-feasta-text-secondary">
          Event venue selected: <span className="font-bold text-foreground">{selectedVenue.label}</span>
        </p>
      ) : null}

      <p
        id={`${inputId}-status`}
        className={error ? "mt-1.5 text-xs leading-5 text-destructive" : "sr-only"}
        aria-live="polite"
      >
        {error ?? (status === "searching" ? "Searching event venues." : status === "resolving" ? "Loading event venue details." : "")}
      </p>

      {selectedVenue ? (
        <>
          <input type="hidden" name="eventVenueLabel" value={selectedVenue.label} />
          <input type="hidden" name="eventVenueAddress" value={selectedVenue.address} />
          <input type="hidden" name="eventVenueCity" value={selectedVenue.city} />
          <input type="hidden" name="eventVenueProvince" value={selectedVenue.province} />
          <input type="hidden" name="eventVenuePlaceId" value={selectedVenue.placeId} />
          <input type="hidden" name="eventVenueLat" value={selectedVenue.latitude} />
          <input type="hidden" name="eventVenueLng" value={selectedVenue.longitude} />
        </>
      ) : null}
    </div>
  );
}
