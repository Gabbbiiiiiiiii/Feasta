import type {
  ProviderCapacityCapabilities,
  ProviderOperatingDay,
  ServiceCategoryCode,
  ProviderServiceType,
} from "@feasta/shared-types";

export type ProviderAvailabilitySettings = {
  supportedOccasionIds?: readonly string[];
  availabilitySettingsRevision?: number;
  providerId: string;
  providerServiceType: ProviderServiceType;
  serviceCategories: readonly ServiceCategoryCode[];
  operatingDays: readonly ProviderOperatingDay[];
  unavailableDates: readonly string[];
  bookingLeadTimeDays: number;
  acceptsMultipleEventsPerDay: boolean;
  maxEventsPerDay: number;
  guestCapacity: {
    minimum: number;
    maximum: number;
  } | null;
  availableStaffCount: number | null;
  availableEquipmentCount: number | null;
  capacityCapabilities: ProviderCapacityCapabilities;
};

export type UpdateProviderAvailabilitySettingsInput = {
  supportedOccasionIds?: readonly string[];
  expectedSettingsRevision: number;
  occasionCatalogRevision?: number;
  operatingDays: readonly ProviderOperatingDay[];
  bookingLeadTimeDays: number;
  acceptsMultipleEventsPerDay: boolean;
  maxEventsPerDay: number;
  minGuestsPerEvent: number;
  maxGuestsPerEvent: number;
  availableStaffCount: number;
  availableEquipmentCount: number;
};

export type UpdateProviderAvailabilitySettingsResult = {
  providerId: string;
  settings: Omit<
    UpdateProviderAvailabilitySettingsInput,
    "expectedSettingsRevision" | "occasionCatalogRevision"
  > & {availabilitySettingsRevision: number};
  capacityCapabilities: ProviderCapacityCapabilities;
};

export type ProviderAvailabilityAction =
  | "mark_unavailable"
  | "mark_available";

export type UpdateProviderAvailabilityInput = {
  date: string;
  action: ProviderAvailabilityAction;
};

export type UpdateProviderAvailabilityResult = {
  providerId: string;
  date: string;
  action: ProviderAvailabilityAction;
  unavailableDates: string[];
};
