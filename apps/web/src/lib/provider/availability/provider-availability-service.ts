import "server-only";

import {
  PROVIDER_OPERATING_DAYS,
  isServiceCategoryCode,
  PROVIDER_SERVICE_TYPES,
  providerCapacityCapabilities,
  type ProviderOperatingDay,
  type ServiceCategoryCode,
  type ProviderServiceType,
} from "@feasta/shared-types";

import {Timestamp} from "firebase-admin/firestore";
import {ACTIVE_EVENT_STATUSES, timestampToIsoDate} from "@/lib/provider/calendar/provider-calendar-service";
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

  const minimumGuests = integer(provider.minGuestsPerEvent, 0, 100_000, 0);
  const maximumGuests = integer(provider.maxGuestsPerEvent, 0, 100_000, 0);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const online = await adminDb.collection("providerRequests")
    .where("providerId", "==", providerId)
    .where("status", "in", [...ACTIVE_EVENT_STATUSES])
    .where("eventDate", ">=", Timestamp.fromDate(new Date(`${today}T00:00:00+08:00`)))
    .select("eventDate", "mainEventId")
    .get();
  const eventsByDate = new Map<string, Set<string>>();
  for (const row of online.docs) {
    const date = timestampToIsoDate(row.get("eventDate"));
    if (!date) continue;
    const eventId = row.get("mainEventId");
    const key = typeof eventId === "string" && eventId ? `event:${eventId}` : `request:${row.id}`;
    const events = eventsByDate.get(date) ?? new Set<string>();
    events.add(key);
    eventsByDate.set(date, events);
  }
  const occupiedSlotsByDate = Object.fromEntries(Array.from(eventsByDate, ([date, events]) => [date, events.size]));
  const walkIns = provider.walkInReservedCounts;
  const storedCounts = walkIns && typeof walkIns === "object" && !Array.isArray(walkIns)
    ? Object.entries(walkIns)
    : [...new Set(Array.isArray(provider.walkInReservedDates) ? provider.walkInReservedDates : [])].map((date) => [date, 1]);
  for (const [date, count] of storedCounts) {
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today &&
        typeof count === "number" && Number.isSafeInteger(count) && count > 0 && count <= 100) {
      occupiedSlotsByDate[date] = (occupiedSlotsByDate[date] ?? 0) + count;
    }
  }

  const blockedDates = unavailableDates(provider.unavailableDates);
  const storedReasons = (await providerSnapshot.ref.collection("availabilityDetails").doc("blockedDates").get()).data()?.reasons;
  const unavailableDateReasons = Object.fromEntries(blockedDates.flatMap((date) =>
    typeof storedReasons?.[date] === "string" ? [[date, storedReasons[date]]] : []));

  return {
    supportedOccasionIds: Array.isArray(provider.supportedOccasionIds)
      ? provider.supportedOccasionIds.filter((id: unknown): id is string => typeof id === "string") : [],
    availabilitySettingsRevision: integer(provider.availabilitySettingsRevision, 0, Number.MAX_SAFE_INTEGER, 0),
    providerId,
    occupiedSlotsByDate,
    providerServiceType,
    serviceCategories,
    operatingDays: operatingDays(provider.operatingDays),
    unavailableDates: blockedDates,
    unavailableDateReasons,
    bookingLeadTimeDays: integer(
      provider.bookingLeadTimeDays,
      0,
      365,
      0,
    ),
    acceptsMultipleEventsPerDay: integer(provider.maxEventsPerDay, 1, 100, 1) > 1,
    maxEventsPerDay: integer(provider.maxEventsPerDay, 1, 100, 1),
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
): ServiceCategoryCode[] {
  const values =
    Array.isArray(value)
      ? value
      : [fallback];

  return [
    ...new Set(
      values.filter(
        (category): category is ServiceCategoryCode =>
          isServiceCategoryCode(category),
      ),
    ),
  ];
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
