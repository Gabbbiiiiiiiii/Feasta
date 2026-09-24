import type {ProviderServiceType} from "./enums.js";

export const SERVICE_CATEGORY_STATUSES = [
  "active",
  "discontinued",
] as const;

export type ServiceCategoryStatus =
  (typeof SERVICE_CATEGORY_STATUSES)[number];

export type ServiceCategoryCode = string;

export const SERVICE_CATEGORY_CODE_PATTERN =
  /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export function isServiceCategoryCode(
  value: unknown,
): value is ServiceCategoryCode {
  return typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 100 &&
    SERVICE_CATEGORY_CODE_PATTERN.test(value);
}

export function normalizeServiceCategoryCode(
  value: string,
): ServiceCategoryCode {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "");
}

export interface ServiceCategoryCapacityCapabilities {
  requiresGuestCapacity: boolean;
  usesStaffCapacity: boolean;
  usesEquipmentCapacity: boolean;
}

export interface ServiceCategoryDefinition {
  code: ServiceCategoryCode;
  name: string;
  serviceType: Exclude<ProviderServiceType, "both">;
  capacityCapabilities?: ServiceCategoryCapacityCapabilities;
}

export interface ServiceCategoryRecord
  extends ServiceCategoryDefinition {
  status: ServiceCategoryStatus;
  sortName: string;
}

type LegacyServiceCategoryDefinition = {
  code: ServiceCategoryCode;
  name: string;
  serviceType: Exclude<ProviderServiceType, "both">;
};

export const DEFAULT_SERVICE_CATEGORY_DEFINITIONS = [
  {
    code: "catering_service",
    name: "Catering Service",
    serviceType: "catering",
  },
  {
    code: "food_trays_packed_meals",
    name: "Food Trays & Packed Meals",
    serviceType: "catering",
  },
  {
    code: "catering_event_styling",
    name: "Catering & Event Styling",
    serviceType: "catering",
  },
  {
    code: "photographer",
    name: "Photography",
    serviceType: "addon",
  },
  {
    code: "videographer",
    name: "Videography",
    serviceType: "addon",
  },
  {
    code: "photo_booth",
    name: "Photo Booth",
    serviceType: "addon",
  },
  {
    code: "event_coordinator",
    name: "Event Coordinator",
    serviceType: "addon",
  },
  {
    code: "event_host_emcee",
    name: "Event Host / Emcee",
    serviceType: "addon",
  },
  {
    code: "sound_system",
    name: "Sound System",
    serviceType: "addon",
  },
  {
    code: "lights_and_sounds",
    name: "Lights & Sounds",
    serviceType: "addon",
  },
  {
    code: "singer_band",
    name: "Singer / Band",
    serviceType: "addon",
  },
  {
    code: "dancer_performer",
    name: "Dancer / Performer",
    serviceType: "addon",
  },
  {
    code: "decorator_event_stylist",
    name: "Decorator / Event Stylist",
    serviceType: "addon",
  },
  {
    code: "florist",
    name: "Florist",
    serviceType: "addon",
  },
  {
    code: "cake_provider",
    name: "Cake Provider",
    serviceType: "addon",
  },
  {
    code: "gown_suit_rental",
    name: "Gown & Suit Rental",
    serviceType: "addon",
  },
  {
    code: "car_rental",
    name: "Car Rental",
    serviceType: "addon",
  },
  {
    code: "venue_provider",
    name: "Venue Provider",
    serviceType: "addon",
  },
  {
    code: "tables_chairs_rental",
    name: "Tables & Chairs Rental",
    serviceType: "addon",
  },
  {
    code: "other_event_service",
    name: "Other Event Service",
    serviceType: "addon",
  },
] as const satisfies readonly LegacyServiceCategoryDefinition[];
