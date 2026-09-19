import "server-only";

import {
  PROVIDER_OPERATING_DAYS,
  PROVIDER_SERVICE_CATEGORIES,
  PROVIDER_SERVICE_TYPES,
  providerCapacityCapabilities,
  type ProviderOperatingDay,
  type ProviderServiceCategory,
  type ProviderServiceType,
} from "@feasta/shared-types";

import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

import type {
  ProviderAvailabilitySettings,
} from "./provider-availability-types";

export async function getProviderAvailabilitySettings():
Promise<ProviderAvailabilitySettings> {
  const account = await requireApprovedProvider();
  const providerId = requireDocumentId(account.providerId);
  const providerSnapshot = await adminDb
    .collection("providers")
    .doc(providerId)
    .get();

  if (
    !providerSnapshot.exists ||
    providerSnapshot.data()?.ownerId !== account.uid
  ) {
    throw new Error(
      "The provider availability settings are unavailable.",
    );
  }

  const provider = providerSnapshot.data() ?? {};
  const providerServiceType = providerType(
    provider.providerServiceType,
  );
  const serviceCategories = providerCategories(
    provider.serviceCategories,
    provider.providerCategory,
  );

  if (!providerServiceType || serviceCategories.length === 0) {
    throw new Error(
      "The provider availability settings are unavailable.",
    );
  }

  const capacityCapabilities =
    providerCapacityCapabilities(serviceCategories);
  const acceptsMultipleEventsPerDay =
    provider.acceptsMultipleEventsPerDay === true;
  const minimumGuests = integer(provider.minGuestsPerEvent, 0, 100_000, 0);
  const maximumGuests = integer(provider.maxGuestsPerEvent, 0, 100_000, 0);

  return {
    providerId,
    providerServiceType,
    serviceCategories,
    operatingDays: operatingDays(provider.operatingDays),
    unavailableDates: unavailableDates(provider.unavailableDates),
    bookingLeadTimeDays: integer(
      provider.bookingLeadTimeDays,
      0,
      365,
      0,
    ),
    acceptsMultipleEventsPerDay,
    maxEventsPerDay: acceptsMultipleEventsPerDay
      ? integer(provider.maxEventsPerDay, 1, 100, 1)
      : 1,
    guestCapacity: capacityCapabilities.requiresGuestCapacity
      ? {
          minimum: minimumGuests,
          maximum: maximumGuests,
        }
      : null,
    availableStaffCount: capacityCapabilities.usesStaffCapacity
      ? integer(provider.availableStaffCount, 0, 100_000, 0)
      : null,
    availableEquipmentCount: capacityCapabilities.usesEquipmentCapacity
      ? integer(provider.availableEquipmentCount, 0, 100_000, 0)
      : null,
    capacityCapabilities,
  };
}

function providerType(value: unknown): ProviderServiceType | null {
  return typeof value === "string" &&
    PROVIDER_SERVICE_TYPES.includes(value as ProviderServiceType)
    ? value as ProviderServiceType
    : null;
}

function providerCategories(
  value: unknown,
  fallback: unknown,
): ProviderServiceCategory[] {
  const values = Array.isArray(value) ? value : [fallback];

  return [...new Set(values.filter(
    (category): category is ProviderServiceCategory =>
      typeof category === "string" &&
      PROVIDER_SERVICE_CATEGORIES.includes(
        category as ProviderServiceCategory,
      ),
  ))];
}

function operatingDays(value: unknown): ProviderOperatingDay[] {
  if (!Array.isArray(value)) return [];

  const selected = new Set(value.filter(
    (day): day is ProviderOperatingDay =>
      typeof day === "string" &&
      PROVIDER_OPERATING_DAYS.includes(day as ProviderOperatingDay),
  ));

  return PROVIDER_OPERATING_DAYS.filter((day) => selected.has(day));
}

function unavailableDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value.filter(
    (date): date is string =>
      typeof date === "string" && isIsoDate(date),
  ))].sort();
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
    ? value as number
    : fallback;
}

function requireDocumentId(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error(
      "The provider availability settings are unavailable.",
    );
  }

  const id = value.trim();

  if (
    id.length < 1 ||
    id.length > 160 ||
    id.includes("/")
  ) {
    throw new Error(
      "The provider availability settings are unavailable.",
    );
  }

  return id;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}
