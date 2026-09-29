"use client";

import {LocateFixed} from "lucide-react";
import {useEffect, useRef, useState} from "react";

import {Button} from "@/components/ui/button";
import {
  reverseGeocodeEventVenue,
} from "@/lib/customer/planning/event-venue-client";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type ResolvedLocation = {
  address: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
};

const ORMOC_CENTER: Coordinates = {
  latitude: 11.005,
  longitude: 124.6075,
};

let mapsConfigured = false;

export function ProviderBusinessLocationMap({
  initialCoordinates,
  disabled,
  onConfirm,
  onCancel,
  ariaLabel = "Adjust business location map",
  markerTitle = "Business location",
  pinHint = "Click the map to place the red pin on your exact business location. Click another point to adjust it.",
  compact = false,
}: {
  initialCoordinates: Coordinates | null;
  disabled: boolean;
  onConfirm: (location: ResolvedLocation) => void;
  onCancel: () => void;
  ariaLabel?: string;
  markerTitle?: string;
  pinHint?: string;
  compact?: boolean;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const currentLocationMarkerRef =
    useRef<google.maps.Marker | null>(null);
  const businessLocationMarkerRef =
    useRef<google.maps.Marker | null>(null);
  const mapClickListenerRef =
    useRef<google.maps.MapsEventListener | null>(null);
  const reverseRequestId = useRef(0);
  const reverseTimerRef =
    useRef<number | null>(null);

  const [mapStatus, setMapStatus] =
    useState<"loading" | "ready" | "error">("loading");
  const [resolveStatus, setResolveStatus] =
    useState<"idle" | "resolving">("idle");
  const [locating, setLocating] = useState(false);
  const [resolvedLocation, setResolvedLocation] =
    useState<ResolvedLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function initializeMap() {
      const apiKey =
        process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY?.trim();

      if (!apiKey) {
        setMapStatus("error");
        setError(
          "The map is not configured. Search for your address instead.",
        );
        return;
      }

      try {
        const {
          importLibrary,
          setOptions,
        } = await import("@googlemaps/js-api-loader");

        if (!mapsConfigured) {
          setOptions({
            key: apiKey,
            v: "weekly",
            language: "en",
            region: "PH",
            authReferrerPolicy: "origin",
          });
          mapsConfigured = true;
        }

        const {Map} = await importLibrary("maps");
        const {Marker} = await importLibrary("marker");

        if (cancelled || !mapElementRef.current) {
          return;
        }

        const center = initialCoordinates
          ? {
              lat: initialCoordinates.latitude,
              lng: initialCoordinates.longitude,
            }
          : {
              lat: ORMOC_CENTER.latitude,
              lng: ORMOC_CENTER.longitude,
            };

        const map = new Map(mapElementRef.current, {
          center,
          zoom: initialCoordinates ? 17 : 13,
          clickableIcons: false,
          fullscreenControl: !compact,
          gestureHandling: "greedy",
          mapTypeControl: !compact,
          mapTypeControlOptions: {
            mapTypeIds: [
              google.maps.MapTypeId.ROADMAP,
              google.maps.MapTypeId.SATELLITE,
            ],
            style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
          },
          streetViewControl: !compact,
          zoomControl: !compact,
        });

        mapRef.current = map;

        const createCurrentLocationMarker = (
          position: google.maps.LatLngLiteral,
        ) => {
          currentLocationMarkerRef.current?.setMap(null);

          currentLocationMarkerRef.current = new Marker({
            map,
            position,
            title: "Your current location",
            zIndex: 2,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: "#4285F4",
              fillOpacity: 1,
              scale: 8,
              strokeColor: "#FFFFFF",
              strokeOpacity: 1,
              strokeWeight: 3,
            },
          });
        };

        const resolveBusinessLocation = (
          position: google.maps.LatLngLiteral,
        ) => {
          if (reverseTimerRef.current !== null) {
            window.clearTimeout(reverseTimerRef.current);
          }

          const currentRequest =
            reverseRequestId.current + 1;

          reverseRequestId.current = currentRequest;

          setResolveStatus("resolving");
          setResolvedLocation(null);
          setError(null);

          reverseTimerRef.current = window.setTimeout(() => {
            void reverseGeocodeEventVenue(
              position.lat,
              position.lng,
            )
              .then((details) => {
                if (
                  cancelled ||
                  reverseRequestId.current !== currentRequest
                ) {
                  return;
                }

                setResolvedLocation({
                  address: details.address,
                  city: details.city,
                  province: details.province,
                  latitude: position.lat,
                  longitude: position.lng,
                });

                setResolveStatus("idle");
              })
              .catch((caught: unknown) => {
                if (
                  cancelled ||
                  reverseRequestId.current !== currentRequest
                ) {
                  return;
                }

                setResolvedLocation(null);
                setResolveStatus("idle");
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "FEASTA could not identify that map location. Choose another point and try again.",
                );
              });
          }, 350);
        };

        const setBusinessLocation = (
          position: google.maps.LatLngLiteral,
        ) => {
          if (businessLocationMarkerRef.current) {
            businessLocationMarkerRef.current.setPosition(
              position,
            );
          } else {
            businessLocationMarkerRef.current = new Marker({
              map,
              position,
              title: markerTitle,
              zIndex: 3,
            });
          }

          resolveBusinessLocation(position);
        };

        (
          map as google.maps.Map & {
            createFeastaCurrentLocationMarker?: (
              position: google.maps.LatLngLiteral,
            ) => void;
            setFeastaBusinessLocation?: (
              position: google.maps.LatLngLiteral,
            ) => void;
          }
        ).createFeastaCurrentLocationMarker =
          createCurrentLocationMarker;

        (
          map as google.maps.Map & {
            setFeastaBusinessLocation?: (
              position: google.maps.LatLngLiteral,
            ) => void;
          }
        ).setFeastaBusinessLocation =
          setBusinessLocation;

        if (initialCoordinates) {
          setBusinessLocation(center);
        }

        if (mapElementRef.current && typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            google.maps.event.trigger(map, "resize");
          });
          resizeObserver.observe(mapElementRef.current);
        }

        mapClickListenerRef.current = map.addListener(
          "click",
          (event: google.maps.MapMouseEvent) => {
            if (disabled || !event.latLng) {
              return;
            }

            setBusinessLocation({
              lat: event.latLng.lat(),
              lng: event.latLng.lng(),
            });
          },
        );

        setMapStatus("ready");
      } catch {
        if (cancelled) return;

        setMapStatus("error");
        setError(
          "The map could not be loaded. Search for your address instead.",
        );
      }
    }

    void initializeMap();

    return () => {
      cancelled = true;
      reverseRequestId.current += 1;

      if (reverseTimerRef.current !== null) {
        window.clearTimeout(reverseTimerRef.current);
      }

      resizeObserver?.disconnect();

      mapClickListenerRef.current?.remove();
      mapClickListenerRef.current = null;

      currentLocationMarkerRef.current?.setMap(null);
      currentLocationMarkerRef.current = null;

      businessLocationMarkerRef.current?.setMap(null);
      businessLocationMarkerRef.current = null;

      mapRef.current = null;
    };
  }, [compact, disabled, initialCoordinates, markerTitle]);

  function locateCurrentPosition() {
    if (disabled || locating) {
      return;
    }

    if (!navigator.geolocation) {
      setError(
        "Current location is not supported by this browser. Move the map manually instead.",
      );
      return;
    }

    setLocating(true);
    setError(null);
    setResolvedLocation(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const map = mapRef.current;

        if (!map) {
          setLocating(false);
          setError(
            "The map is not ready yet. Wait a moment and try again.",
          );
          return;
        }

        const currentPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        map.setCenter(currentPosition);
        map.setZoom(17);

        (
          map as google.maps.Map & {
            createFeastaCurrentLocationMarker?: (
              position: google.maps.LatLngLiteral,
            ) => void;
            setFeastaBusinessLocation?: (
              position: google.maps.LatLngLiteral,
            ) => void;
          }
        ).createFeastaCurrentLocationMarker?.(
          currentPosition,
        );

        (
          map as google.maps.Map & {
            setFeastaBusinessLocation?: (
              position: google.maps.LatLngLiteral,
            ) => void;
          }
        ).setFeastaBusinessLocation?.(
          currentPosition,
        );

        setLocating(false);
      },
      (geolocationError) => {
        setLocating(false);

        if (geolocationError.code === 1) {
          setError(
            "Location permission was denied. You can still move the map manually.",
          );
          return;
        }

        if (geolocationError.code === 2) {
          setError(
            "Your current location could not be determined. Move the map manually or try again.",
          );
          return;
        }

        if (geolocationError.code === 3) {
          setError(
            "Finding your current location took too long. Try again or move the map manually.",
          );
          return;
        }

        setError(
          "FEASTA could not access your current location. Move the map manually instead.",
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 30_000,
      },
    );
  }

  const locateDisabled = disabled || locating || mapStatus !== "ready";

  return (
    <div className={compact ? "grid min-w-0 gap-1.5" : "grid min-w-0 gap-3 sm:gap-4"}>
      {compact ? null : (
        <div className="flex flex-col gap-3 rounded-xl border border-input bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-foreground">
              Use your current location
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              FEASTA can center the map on your device location.
              You can adjust the pin before confirming.
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            disabled={locateDisabled}
            onClick={locateCurrentPosition}
            className="shrink-0"
          >
            {locating ? "Locating..." : "Locate me"}
          </Button>
        </div>
      )}

      <div className="relative min-w-0 overflow-hidden rounded-xl border border-input bg-secondary">
        <div
          ref={mapElementRef}
          className={compact
            ? "h-32 w-full max-w-full overflow-hidden sm:h-36"
            : "h-[clamp(15rem,34dvh,22.5rem)] w-full max-w-full overflow-hidden"}
          aria-label={ariaLabel}
        />

        {compact ? (
          <Button
            type="button"
            variant="secondary"
            disabled={locateDisabled}
            onClick={locateCurrentPosition}
            className="absolute right-2 top-2 z-10 h-8 min-h-8 rounded-full px-3 text-xs shadow"
          >
            <LocateFixed aria-hidden="true" className="size-3.5" />
            {locating ? "Locating..." : "Locate me"}
          </Button>
        ) : null}

        {mapStatus === "loading" ? (
          <div className="absolute inset-0 grid place-items-center bg-background/80">
            <p className="text-sm font-semibold text-muted-foreground">
              Loading map...
            </p>
          </div>
        ) : null}

        {!compact && mapStatus === "ready" ? (
          <div className="pointer-events-none absolute bottom-8 left-2 right-14 sm:bottom-10 sm:left-3 sm:right-16">
            <div className="mx-auto max-w-md rounded-lg bg-background/95 px-3 py-2 text-center text-xs font-semibold leading-5 text-foreground shadow">
              {pinHint}
            </div>
          </div>
        ) : null}
      </div>

      {compact ? (
        <p className="text-[11px] leading-4 text-muted-foreground">{pinHint}</p>
      ) : null}

      {resolveStatus === "resolving" ? (
        <p
          className="text-sm text-muted-foreground"
          aria-live="polite"
        >
          Checking this location...
        </p>
      ) : null}

      {resolvedLocation ? (
        compact ? (
          <p className="truncate text-xs font-semibold text-foreground">
            {resolvedLocation.address}
          </p>
        ) : (
          <div className="rounded-xl border border-input bg-card p-4">
            <p className="text-sm font-bold text-foreground">
              Location found
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {resolvedLocation.address}
            </p>
            <p className="text-sm font-semibold text-foreground">
              {[resolvedLocation.city, resolvedLocation.province]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        )
      ) : null}

      {error ? (
        <p
          className="text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className={compact
        ? "flex flex-row justify-end gap-2"
        : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"}
      >
        <Button
          type="button"
          variant="secondary"
          size={compact ? "compact" : "default"}
          disabled={disabled}
          onClick={onCancel}
          className={compact ? "h-8 min-h-8 px-3 text-xs" : undefined}
        >
          Cancel
        </Button>

        <Button
          type="button"
          size={compact ? "compact" : "default"}
          disabled={
            disabled ||
            mapStatus !== "ready" ||
            resolveStatus === "resolving" ||
            !resolvedLocation
          }
          onClick={() => {
            if (resolvedLocation) {
              onConfirm(resolvedLocation);
            }
          }}
          className={compact ? "h-8 min-h-8 px-3 text-xs" : undefined}
        >
          Confirm this location
        </Button>
      </div>
    </div>
  );
}
