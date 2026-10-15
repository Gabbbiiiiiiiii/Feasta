import {
  providerCapacityCapabilities,
  type ProviderCapacityCapabilities,
} from "@feasta/shared-types";

import type {ProviderOnboardingDraft} from "./onboarding";
import type {ServiceCategoryOption} from
  "../service-categories/service-category-types";

export function providerProfileCompletedSteps(
  profile: ProviderOnboardingDraft,
  serviceCategories: readonly ServiceCategoryOption[],
): number[] {
  const completed: number[] = [];

  const nonempty = (value: unknown): boolean =>
    typeof value === "string" && value.trim().length > 0;

  const validEmail = (value: unknown): boolean =>
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());

  const validPhone = (value: unknown): boolean =>
    typeof value === "string" &&
    /^\+[1-9]\d{7,14}$/u.test(value.trim());

  const selectedCodes = profile.serviceCategories ?? [];

  const selectedCategories = selectedCodes.map((code) =>
    serviceCategories.find((category) => category.code === code),
  );

  const serviceType = profile.providerServiceType;

  const validCategories =
    selectedCodes.length > 0 &&
    selectedCategories.every((category) =>
      category != null &&
      category.status === "active" &&
      (
        serviceType === "both" ||
        category.serviceType === serviceType
      ),
    );

  const capabilities: ProviderCapacityCapabilities =
    selectedCategories.reduce<ProviderCapacityCapabilities>(
      (result, category) => {
        if (!category) return result;

        const categoryCapabilities =
          category.capacityCapabilities ??
          providerCapacityCapabilities([category.code]);

        return {
          requiresGuestCapacity:
            result.requiresGuestCapacity ||
            categoryCapabilities.requiresGuestCapacity,
          usesStaffCapacity:
            result.usesStaffCapacity ||
            categoryCapabilities.usesStaffCapacity,
          usesEquipmentCapacity:
            result.usesEquipmentCapacity ||
            categoryCapabilities.usesEquipmentCapacity,
        };
      },
      {
        requiresGuestCapacity: false,
        usesStaffCapacity: false,
        usesEquipmentCapacity: false,
      },
    );

  if (
    nonempty(profile.ownerFirstName) &&
    nonempty(profile.ownerLastName) &&
    validEmail(profile.ownerEmail) &&
    validPhone(profile.ownerPhone)
  ) {
    completed.push(1);
  }

  if (
    nonempty(profile.businessName) &&
    validEmail(profile.businessEmail) &&
    validPhone(profile.businessPhone) &&
    typeof profile.description === "string" &&
    profile.description.trim().length >= 20 &&
    (
      profile.businessRegistrationType === "individual" ||
      profile.businessRegistrationType === "registered_business"
    )
  ) {
    completed.push(2);
  }

  if (
    ["catering", "addon", "both"].includes(String(serviceType)) &&
    validCategories &&
    (profile.eventTypesSupported?.length ?? 0) > 0
  ) {
    completed.push(3);
  }

  if (
    nonempty(profile.address) &&
    nonempty(profile.city) &&
    nonempty(profile.province) &&
    (profile.serviceAreas?.length ?? 0) > 0 &&
    profile.locationCoordinates != null &&
    Number.isFinite(profile.locationCoordinates.latitude) &&
    Number.isFinite(profile.locationCoordinates.longitude) &&
    Math.abs(profile.locationCoordinates.latitude) <= 90 &&
    Math.abs(profile.locationCoordinates.longitude) <= 180
  ) {
    completed.push(4);
  }

  const validGuests = capabilities.requiresGuestCapacity
    ? Number.isInteger(profile.minGuestsPerEvent) &&
      Number.isInteger(profile.maxGuestsPerEvent) &&
      (profile.minGuestsPerEvent ?? 0) >= 1 &&
      (profile.minGuestsPerEvent ?? 0) <= 100000 &&
      (profile.maxGuestsPerEvent ?? 0) <= 100000 &&
      (profile.maxGuestsPerEvent ?? 0) >=
        (profile.minGuestsPerEvent ?? 0)
    : profile.minGuestsPerEvent === 0 &&
      profile.maxGuestsPerEvent === 0;

  const validCount = (value: unknown): boolean =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 100000;

  if (
    validCategories &&
    validGuests &&
    (
      !capabilities.usesStaffCapacity ||
      validCount(profile.availableStaffCount)
    ) &&
    (
      !capabilities.usesEquipmentCapacity ||
      validCount(profile.availableEquipmentCount)
    ) &&
    profile.maxEventsPerDay === 1 &&
    profile.acceptsMultipleEventsPerDay !== true &&
    (profile.operatingDays?.length ?? 0) > 0 &&
    Number.isInteger(profile.bookingLeadTimeDays) &&
    (profile.bookingLeadTimeDays ?? -1) >= 0 &&
    (profile.bookingLeadTimeDays ?? 366) <= 365
  ) {
    completed.push(5);
  }

  if (profile.providerAgreementAccepted === true) {
    completed.push(6);
  }

  return completed;
}