"use client";

import {ProviderBusinessLocationMap} from "@/components/provider/provider-business-location-map";
import type {EventVenueDetails} from "@/lib/customer/planning/event-venue-client";

export type EventMapCoordinates = Pick<EventVenueDetails, "latitude" | "longitude">;

export function CustomerEventAddressMap({coordinates, onConfirm, onCancel}: {
  coordinates: EventMapCoordinates | null;
  onConfirm: (location: EventVenueDetails) => void;
  onCancel: () => void;
}) {
  return (
    <section aria-label="Choose event address on map" className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Choose a point, then confirm the address. You can also close the map and enter your complete event address manually.
      </p>
      <ProviderBusinessLocationMap
        initialCoordinates={coordinates}
        disabled={false}
        ariaLabel="Adjust event location map"
        markerTitle="Event location"
        pinHint="Click the map to place the pin at your event venue. Click another point to adjust it."
        locateLabel="Use my location"
        unavailableMessage="Enter your complete event address manually instead."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </section>
  );
}
