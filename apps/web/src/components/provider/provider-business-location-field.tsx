"use client";

import {
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import {ProviderBusinessLocationMap} from "@/components/provider/provider-business-location-map";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  getEventVenueDetails,
  searchEventVenues,
  type EventVenueSuggestion,
} from "@/lib/customer/planning/event-venue-client";

type BusinessLocation = {
  address: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

export function ProviderBusinessLocationField({
  address,
  city,
  province,
  coordinates,
  serviceAreas,
  maxServiceDistanceKm,
  loading,
  fieldErrors,
  onLocationChange,
  onLocationClear,
  onServiceAreasChange,
  onMaximumDistanceChange,
}: {
  address: string;
  city: string;
  province: string;
  coordinates: Coordinates | null;
  serviceAreas: readonly string[];
  maxServiceDistanceKm: number | null;
  loading: boolean;
  fieldErrors: Record<string, string>;
  onLocationChange: (location: BusinessLocation) => void;
  onLocationClear: () => void;
  onServiceAreasChange: (areas: string[]) => void;
  onMaximumDistanceChange: (distance: number | null) => void;
}) {
  const addressId = useId();
  const suggestionsId = `${addressId}-suggestions`;
  const areaId = useId();
  const requestId = useRef(0);
  const skipNextSearch = useRef(false);

  const [query, setQuery] = useState(address);
  const [suggestions, setSuggestions] =
    useState<readonly EventVenueSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [locationStatus, setLocationStatus] =
    useState<"idle" | "searching" | "resolving">("idle");
  const [locationError, setLocationError] =
    useState<string | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [areaInput, setAreaInput] = useState("");

  const locationConfirmed =
    Boolean(address.trim()) &&
    Boolean(city.trim()) &&
    Boolean(province.trim()) &&
    coordinates !== null;

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }

    const trimmedQuery = query.trim();

    if (locationConfirmed || trimmedQuery.length < 2) {
      return;
    }

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;

    const timeout = window.setTimeout(() => {
      setLocationStatus("searching");
      setLocationError(null);

      void searchEventVenues(trimmedQuery)
        .then((results) => {
          if (requestId.current !== currentRequest) return;

          setSuggestions(results);
          setActiveIndex(results.length > 0 ? 0 : -1);
          setLocationStatus("idle");
        })
        .catch((caught: unknown) => {
          if (requestId.current !== currentRequest) return;

          setSuggestions([]);
          setActiveIndex(-1);
          setLocationStatus("idle");
          setLocationError(
            caught instanceof Error
              ? caught.message
              : "Business address search is unavailable.",
          );
        });
    }, 320);

    return () => {
      window.clearTimeout(timeout);

      if (requestId.current === currentRequest) {
        requestId.current += 1;
      }
    };
  }, [locationConfirmed, query]);

  function updateQuery(value: string) {
    requestId.current += 1;
    setQuery(value);
    setSuggestions([]);
    setActiveIndex(-1);
    setLocationStatus("idle");
    setLocationError(null);

    if (locationConfirmed) {
      onLocationClear();
    }
  }

  function selectSuggestion(
    suggestion: EventVenueSuggestion,
  ) {
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    skipNextSearch.current = true;
    setQuery(suggestion.fullAddress);
    setSuggestions([]);
    setActiveIndex(-1);
    setLocationStatus("resolving");
    setLocationError(null);

    void getEventVenueDetails(suggestion.placeId)
      .then((details) => {
        if (requestId.current !== currentRequest) return;

        onLocationChange({
          address: details.address,
          city: details.city,
          province: details.province,
          latitude: details.latitude,
          longitude: details.longitude,
        });
        setQuery(details.address);
        setLocationStatus("idle");
      })
      .catch((caught: unknown) => {
        if (requestId.current !== currentRequest) return;

        onLocationClear();
        setLocationStatus("idle");
        setLocationError(
          caught instanceof Error
            ? caught.message
            : "That business location could not be selected.",
        );
      });
  }

  function handleAddressKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (suggestions.length === 0) {
      if (event.key === "Escape") {
        setSuggestions([]);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(
        (current) => (current + 1) % suggestions.length,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0
          ? suggestions.length - 1
          : current - 1,
      );
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const suggestion = suggestions[activeIndex];

      if (suggestion) {
        selectSuggestion(suggestion);
      }
      return;
    }

    if (event.key === "Escape") {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }

  function addArea() {
    const area = areaInput
      .trim()
      .replace(/\s+/gu, " ");

    if (!area) return;

    const exists = serviceAreas.some(
      (current) =>
        current.toLocaleLowerCase() ===
        area.toLocaleLowerCase(),
    );

    if (!exists) {
      onServiceAreasChange([...serviceAreas, area]);
    }

    setAreaInput("");
  }

  function removeArea(area: string) {
    onServiceAreasChange(
      serviceAreas.filter((current) => current !== area),
    );
  }

  function handleAreaKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addArea();
    }
  }

  const addressError =
    fieldErrors.address ?? locationError;

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-2xl border border-input bg-card p-4 sm:p-5">
        <div>
          <h3 className="text-base font-bold text-foreground">
            Business location
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Search for your business address or a nearby landmark.
            FEASTA will save the map location automatically.
          </p>
        </div>

        <div className="relative">
          <label
            htmlFor={addressId}
            className="mb-2 block text-sm font-bold text-foreground"
          >
            Search business address
            <span className="text-destructive"> *</span>
          </label>

          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            />

            <Input
              id={addressId}
              value={query}
              disabled={loading}
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
              aria-controls={suggestionsId}
              aria-activedescendant={
                activeIndex >= 0
                  ? `${addressId}-option-${activeIndex}`
                  : undefined
              }
              aria-invalid={Boolean(addressError)}
              placeholder="Search address, barangay, or landmark"
              className="pl-12 pr-12"
              onChange={(event) =>
                updateQuery(event.target.value)
              }
              onKeyDown={handleAddressKeyDown}
            />

            {locationStatus !== "idle" ? (
              <LoaderCircle
                aria-hidden="true"
                className="absolute right-4 top-1/2 size-5 -translate-y-1/2 animate-spin text-primary motion-reduce:animate-none"
              />
            ) : query ? (
              <button
                type="button"
                disabled={loading}
                aria-label="Clear business location"
                onClick={() => {
                  requestId.current += 1;
                  setQuery("");
                  setSuggestions([]);
                  setActiveIndex(-1);
                  setLocationError(null);
                  onLocationClear();
                }}
                className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </div>

          {suggestions.length > 0 ? (
            <ul
              id={suggestionsId}
              role="listbox"
              aria-label="Business address suggestions"
              className="absolute inset-x-0 z-40 mt-2 max-h-72 overflow-y-auto rounded-xl border border-input bg-card p-1.5 shadow-lg"
            >
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.placeId}
                  role="presentation"
                >
                  <button
                    id={`${addressId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) =>
                      event.preventDefault()
                    }
                    onClick={() =>
                      selectSuggestion(suggestion)
                    }
                    className={[
                      "grid min-h-12 w-full gap-0.5 rounded-lg px-3 py-2 text-left",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      index === activeIndex
                        ? "bg-secondary"
                        : "hover:bg-secondary/70",
                    ].join(" ")}
                  >
                    <span className="text-sm font-bold text-foreground">
                      {suggestion.mainText}
                    </span>
                    {suggestion.secondaryText ? (
                      <span className="text-xs leading-5 text-muted-foreground">
                        {suggestion.secondaryText}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {addressError ? (
            <p
              className="mt-2 text-sm text-destructive"
              role="alert"
            >
              {addressError}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Select an address from the suggestions, or use the map
              if your exact address is not listed.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-dashed border-input bg-secondary/40 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">
                Can&apos;t find your exact address?
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Move a map pin to your exact business location.
                FEASTA will identify the address automatically.
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              disabled={loading}
              onClick={() => {
                setSuggestions([]);
                setActiveIndex(-1);
                setLocationError(null);
                setShowMapPicker((current) => !current);
              }}
              className="shrink-0"
            >
              <MapPin aria-hidden="true" className="size-4" />
              {showMapPicker
                ? "Close map"
                : locationConfirmed
                  ? "Adjust location on map"
                  : "Set location on map"}
            </Button>
          </div>

          {showMapPicker ? (
            <div className="mt-4">
              <ProviderBusinessLocationMap
                initialCoordinates={coordinates}
                disabled={loading}
                onCancel={() => setShowMapPicker(false)}
                onConfirm={(location) => {
                  requestId.current += 1;
                  skipNextSearch.current = true;
                  setQuery(location.address);
                  setSuggestions([]);
                  setActiveIndex(-1);
                  setLocationError(null);
                  onLocationChange(location);
                  setShowMapPicker(false);
                }}
              />
            </div>
          ) : null}
        </div>

        {locationConfirmed ? (
          <div className="flex items-start gap-3 rounded-xl border border-success bg-success-subtle p-4">
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-success"
            />
            <div className="min-w-0">
              <p className="font-bold text-foreground">
                Location confirmed
              </p>
              <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                {address}
              </p>
              <p className="text-sm font-semibold text-foreground">
                {[city, province].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 rounded-2xl border border-input bg-card p-4 sm:p-5">
        <div>
          <h3 className="text-base font-bold text-foreground">
            Areas you serve
            <span className="text-destructive"> *</span>
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Add the cities, municipalities, or provinces where
            customers can book your services. Choose a province
            when you serve the whole province.
          </p>
        </div>

        <div>
          <label
            htmlFor={areaId}
            className="mb-2 block text-sm font-bold text-foreground"
          >
            Add a city, municipality, or province
          </label>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              id={areaId}
              value={areaInput}
              disabled={loading}
              maxLength={100}
              placeholder="Example: Ormoc City, Kananga, or Leyte"
              onChange={(event) =>
                setAreaInput(event.target.value)
              }
              onKeyDown={handleAreaKeyDown}
            />

            <Button
              type="button"
              variant="secondary"
              size="compact"
              disabled={loading || !areaInput.trim()}
              onClick={addArea}
              className="h-14"
            >
              <Plus aria-hidden="true" className="size-4" />
              Add area
            </Button>
          </div>

          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Press Enter, type a comma, or select Add area.
          </p>
        </div>

        {serviceAreas.length > 0 ? (
          <div
            className="flex flex-wrap gap-2"
            aria-label="Selected service areas"
          >
            {serviceAreas.map((area) => (
              <span
                key={area}
                className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-input bg-secondary px-3 py-1.5 text-sm font-semibold text-foreground"
              >
                <MapPin
                  aria-hidden="true"
                  className="size-4 shrink-0 text-primary"
                />
                <span className="break-words">{area}</span>
                <button
                  type="button"
                  disabled={loading}
                  aria-label={`Remove ${area}`}
                  onClick={() => removeArea(area)}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X
                    aria-hidden="true"
                    className="size-3.5"
                  />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {fieldErrors.serviceAreas ? (
          <p className="text-sm text-destructive" role="alert">
            {fieldErrors.serviceAreas}
          </p>
        ) : (
          <p className="text-xs font-semibold text-muted-foreground">
            {serviceAreas.length === 0
              ? "No service areas added yet."
              : `${serviceAreas.length} service ${
                  serviceAreas.length === 1 ? "area" : "areas"
                } selected.`}
          </p>
        )}
      </section>

      <section className="grid gap-4 rounded-2xl border border-input bg-card p-4 sm:p-5">
        <div>
          <h3 className="text-base font-bold text-foreground">
            How far are you willing to travel?
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            This optional limit helps FEASTA determine whether an
            event location is within your normal travel range.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label
            className={[
              "flex cursor-pointer gap-3 rounded-xl border p-4",
              maxServiceDistanceKm == null
                ? "border-primary bg-secondary"
                : "border-input",
            ].join(" ")}
          >
            <input
              type="radio"
              name="provider-travel-limit"
              checked={maxServiceDistanceKm == null}
              disabled={loading}
              onChange={() =>
                onMaximumDistanceChange(null)
              }
              className="mt-1 size-4 accent-primary"
            />
            <span>
              <span className="block font-bold text-foreground">
                No specific distance limit
              </span>
              <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                Your selected service areas will define where
                you normally accept bookings.
              </span>
            </span>
          </label>

          <label
            className={[
              "flex cursor-pointer gap-3 rounded-xl border p-4",
              maxServiceDistanceKm != null
                ? "border-primary bg-secondary"
                : "border-input",
            ].join(" ")}
          >
            <input
              type="radio"
              name="provider-travel-limit"
              checked={maxServiceDistanceKm != null}
              disabled={loading}
              onChange={() =>
                onMaximumDistanceChange(
                  maxServiceDistanceKm ?? 50,
                )
              }
              className="mt-1 size-4 accent-primary"
            />
            <span>
              <span className="block font-bold text-foreground">
                Set a maximum travel distance
              </span>
              <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                Use this if your business has a normal travel
                radius for events.
              </span>
            </span>
          </label>
        </div>

        {maxServiceDistanceKm != null ? (
          <div className="max-w-xs">
            <label
              htmlFor={`${areaId}-distance`}
              className="mb-2 block text-sm font-bold text-foreground"
            >
              Maximum travel distance
            </label>

            <div className="relative">
              <Input
                id={`${areaId}-distance`}
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                value={maxServiceDistanceKm}
                disabled={loading}
                aria-invalid={Boolean(
                  fieldErrors.maxServiceDistanceKm,
                )}
                onChange={(event) => {
                  const raw = event.target.value;

                  onMaximumDistanceChange(
                    raw === "" ? 0 : Number(raw),
                  );
                }}
                className="pr-14"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                km
              </span>
            </div>

            {fieldErrors.maxServiceDistanceKm ? (
              <p
                className="mt-2 text-sm text-destructive"
                role="alert"
              >
                {fieldErrors.maxServiceDistanceKm}
              </p>
            ) : (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Example: 50 km means you normally travel up to
                50 kilometers from your business location.
              </p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
