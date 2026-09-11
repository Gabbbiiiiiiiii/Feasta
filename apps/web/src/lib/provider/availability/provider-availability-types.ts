import type {
  ProviderCapacityCapabilities,
  ProviderOperatingDay,
  ProviderServiceCategory,
  ProviderServiceType,
} from "@feasta/shared-types";

export type ProviderAvailabilitySettings = {
  providerId: string;
  providerServiceType: ProviderServiceType;
  serviceCategories: readonly ProviderServiceCategory[];
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
  settings: UpdateProviderAvailabilitySettingsInput;
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
