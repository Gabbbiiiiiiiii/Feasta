"use client";

import {useCallback, useEffect, useState} from "react";

export const CUSTOMER_EVENT_LIST_STORAGE_KEY = "feasta.customer.event-list.v1";
export const CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY =
  "feasta.customer.event-list.schedule.v1";
export const CUSTOMER_EVENT_LIST_VERSION = 1;
export const CUSTOMER_EVENT_LIST_MAX_ITEMS = 24;
export const CUSTOMER_EVENT_LIST_OPEN_EVENT = "feasta:open-customer-event-list";

const CHANGE_EVENT = "feasta:customer-event-list-change";

export type CustomerEventListService = {
  id: string;
  providerId: string;
  providerName: string;
  name: string;
  category: string | null;
  price: number | null;
};

export type CustomerEventListConfiguration = {
  event: {
    eventType: string;
    eventDate: string;
    eventTime: string;
    eventEndTime: string;
    guestCount: number;
    eventLocation: string;
    eventAddress: string;
    specialRequest: string;
  };
  selectedFoods: readonly string[];
  selectedDecorations: readonly string[];
  selectedFurniture: readonly string[];
  selectedEventServices: readonly CustomerEventListService[];
  willArrangeOwnAddOns: boolean;
  customerArrangedAddOnsNote: string;
  estimatedTotal: number | null;
};

export type CustomerPackageEventListItem = {
  type?: "package";
  packageId: string;
  providerId: string;
  packageName: string;
  providerName: string;
  price: number | null;
  imageUrl: string | null;
  packageHref: string;
  configuration?: CustomerEventListConfiguration | null;
};

export type CustomerCustomMenuEventListItem = {
  type: "custom_menu";
  key: string;
  providerId: string;
  providerName: string;
  menuItemId: string;
  menuItemName: string;
  servingOptionId: string;
  servingOptionName: string;
  servingDescription: string;
  servingMinimumGuests: number;
  servingMaximumGuests: number;
  price: number;
  imageUrl: string;
  providerHref: string;
};

export type CustomerEventListItem =
  | CustomerPackageEventListItem
  | CustomerCustomMenuEventListItem;

export type CustomerEventListSchedule = {
  eventDate: string;
  eventTime: string;
  eventEndTime?: string;
  eventType?:
    | "birthday"
    | "wedding"
    | "debut"
    | "corporate"
    | "anniversary"
    | "other";
  guestCount?: number;
  eventLocation?: string;
  eventAddress?: string;
  specialRequest?: string;
};

type VersionedEventList = {
  version: typeof CUSTOMER_EVENT_LIST_VERSION;
  items: readonly CustomerEventListItem[];
};

export function customerEventListItemKey(item: CustomerEventListItem): string {
  return item.type === "custom_menu"
    ? `custom-menu:${item.providerId}:${item.menuItemId}`
    : item.packageId;
}

export function useCustomerEventList() {
  const [items, setItems] = useState<readonly CustomerEventListItem[]>([]);

  useEffect(() => {
    function synchronize() {
      setItems(readCustomerEventList());
    }

    function storageChanged(event: StorageEvent) {
      if (
        event.key !== null &&
        event.key !== CUSTOMER_EVENT_LIST_STORAGE_KEY &&
        event.key !== CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY
      ) {
        return;
      }
      synchronize();
    }

    synchronize();
    window.addEventListener(CHANGE_EVENT, synchronize);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener(CHANGE_EVENT, synchronize);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  const addItem = useCallback((item: CustomerEventListItem) => {
    addCustomerEventListItem(item);
  }, []);

  const removeItem = useCallback((itemKey: string) => {
    removeCustomerEventListItem(itemKey);
  }, []);

  const removeService = useCallback((packageId: string, serviceId: string) => {
    removeCustomerEventListService(packageId, serviceId);
  }, []);

  const clearItems = useCallback(() => {
    clearCustomerEventList();
  }, []);

  return {
    items,
    count: items.length,
    addItem,
    removeItem,
    removeService,
    clearItems,
  };
}

export function useCustomerEventListSchedule(): CustomerEventListSchedule | null {
  const [schedule, setSchedule] = useState<CustomerEventListSchedule | null>(null);

  useEffect(() => {
    function synchronize() {
      setSchedule(readCustomerEventListSchedule());
    }

    function storageChanged(event: StorageEvent) {
      if (
        event.key !== null &&
        event.key !== CUSTOMER_EVENT_LIST_STORAGE_KEY &&
        event.key !== CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY
      ) {
        return;
      }
      synchronize();
    }

    synchronize();
    window.addEventListener(CHANGE_EVENT, synchronize);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener(CHANGE_EVENT, synchronize);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  return schedule;
}

export function openCustomerEventList(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CUSTOMER_EVENT_LIST_OPEN_EVENT));
}

export function readCustomerEventList(): readonly CustomerEventListItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(CUSTOMER_EVENT_LIST_STORAGE_KEY);
    if (!raw) return [];
    return normalizeStoredEventList(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function readCustomerEventListSchedule(): CustomerEventListSchedule | null {
  if (typeof window === "undefined") return null;
  if (readCustomerEventList().length === 0) return null;

  try {
    const raw = window.localStorage.getItem(CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY);
    if (raw) {
      const normalized = normalizeCustomerEventListSchedule(JSON.parse(raw));
      if (normalized) return normalized;
    }
  } catch {
    // Fall through to a package configuration snapshot, if one is readable.
  }

  for (const item of readCustomerEventList()) {
    if (item.type === "custom_menu" || !item.configuration) continue;
    const normalized = normalizeCustomerEventListSchedule({
      eventDate: item.configuration.event.eventDate,
      eventTime: item.configuration.event.eventTime,
      eventEndTime: item.configuration.event.eventEndTime,
      guestCount: item.configuration.event.guestCount,
    });
    if (normalized) return normalized;
  }

  return null;
}

export function writeCustomerEventListSchedule(value: CustomerEventListSchedule): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeCustomerEventListSchedule(value);
  if (!normalized) return;

  try {
    window.localStorage.setItem(
      CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    notifyCustomerEventListChanged();
  } catch {
    // Storage can be unavailable in restricted browser environments.
  }
}

export function addCustomerEventListItem(item: CustomerEventListItem): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeEventListItem(item);
  if (!normalized) return;

  const next = [
    normalized,
    ...readCustomerEventList().filter(
      (candidate) =>
        customerEventListItemKey(candidate) !== customerEventListItemKey(normalized),
    ),
  ].slice(0, CUSTOMER_EVENT_LIST_MAX_ITEMS);

  writeCustomerEventList(next);
}

export function removeCustomerEventListItem(itemKey: string): void {
  if (typeof window === "undefined") return;
  const normalizedKey = safeText(itemKey, 320);
  if (!normalizedKey) return;

  const next = readCustomerEventList().filter(
    (item) => customerEventListItemKey(item) !== normalizedKey,
  );

  if (next.length === 0) {
    try {
      window.localStorage.removeItem(CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY);
    } catch {
      // Ignore unavailable storage.
    }
  }

  writeCustomerEventList(next);
}

export function removeCustomerEventListService(packageId: string, serviceId: string): void {
  if (typeof window === "undefined") return;
  const normalizedPackageId = safeText(packageId, 128);
  const normalizedServiceId = safeText(serviceId, 128);
  if (!normalizedPackageId || !normalizedServiceId) return;

  const next = readCustomerEventList().map((item) => {
    if (
      item.type === "custom_menu" ||
      item.packageId !== normalizedPackageId ||
      !item.configuration
    ) {
      return item;
    }

    const selectedEventServices = item.configuration.selectedEventServices.filter(
      (service) => service.id !== normalizedServiceId,
    );
    const serviceSubtotal = selectedEventServices.reduce(
      (total, service) => total + (service.price ?? 0),
      0,
    );

    return {
      ...item,
      configuration: {
        ...item.configuration,
        selectedEventServices,
        estimatedTotal: item.price === null ? null : item.price + serviceSubtotal,
      },
    };
  });

  writeCustomerEventList(next);
}

export function clearCustomerEventList(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CUSTOMER_EVENT_LIST_STORAGE_KEY);
    window.localStorage.removeItem(CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  notifyCustomerEventListChanged();
}

function writeCustomerEventList(items: readonly CustomerEventListItem[]): void {
  if (typeof window === "undefined") return;
  const payload: VersionedEventList = {
    version: CUSTOMER_EVENT_LIST_VERSION,
    items,
  };

  try {
    window.localStorage.setItem(
      CUSTOMER_EVENT_LIST_STORAGE_KEY,
      JSON.stringify(payload),
    );
    notifyCustomerEventListChanged();
  } catch {
    // Storage can be unavailable in restricted browser environments.
  }
}

function notifyCustomerEventListChanged(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function normalizeStoredEventList(value: unknown): readonly CustomerEventListItem[] {
  if (Array.isArray(value)) return normalizeEventListItems(value);

  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (record.version !== CUSTOMER_EVENT_LIST_VERSION) return [];
  return normalizeEventListItems(record.items);
}

function normalizeEventListItems(value: unknown): readonly CustomerEventListItem[] {
  if (!Array.isArray(value)) return [];
  const items: CustomerEventListItem[] = [];

  for (const candidate of value) {
    const item = normalizeEventListItem(candidate);
    if (!item) continue;
    if (
      items.some(
        (existing) => customerEventListItemKey(existing) === customerEventListItemKey(item),
      )
    ) {
      continue;
    }
    items.push(item);
    if (items.length >= CUSTOMER_EVENT_LIST_MAX_ITEMS) break;
  }

  return items;
}

function normalizeCustomerEventListSchedule(
  value: unknown,
): CustomerEventListSchedule | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.eventDate !== "string" || typeof record.eventTime !== "string") {
    return null;
  }

  const eventDate = record.eventDate.trim();
  const eventTime = record.eventTime.trim();
  if (!isCalendarDate(eventDate) || !isClockTime(eventTime)) return null;

  let eventEndTime: string | undefined;
  if (record.eventEndTime !== undefined) {
    if (typeof record.eventEndTime !== "string" || !isClockTime(record.eventEndTime.trim())) {
      return null;
    }
    eventEndTime = record.eventEndTime.trim();
  }

  let eventType: CustomerEventListSchedule["eventType"];
  if (record.eventType !== undefined) {
    if (
      record.eventType !== "birthday" &&
      record.eventType !== "wedding" &&
      record.eventType !== "debut" &&
      record.eventType !== "corporate" &&
      record.eventType !== "anniversary" &&
      record.eventType !== "other"
    ) {
      return null;
    }
    eventType = record.eventType;
  }

  let guestCount: number | undefined;
  if (record.guestCount !== undefined) {
    if (
      typeof record.guestCount !== "number" ||
      !Number.isSafeInteger(record.guestCount) ||
      record.guestCount < 1 ||
      record.guestCount > 10_000
    ) {
      return null;
    }
    guestCount = record.guestCount;
  }

  const eventLocation = optionalScheduleText(record.eventLocation, 180);
  const eventAddress = optionalScheduleText(record.eventAddress, 500);
  const specialRequest = optionalScheduleText(record.specialRequest, 1000);
  if (
    eventLocation === null ||
    eventAddress === null ||
    specialRequest === null
  ) {
    return null;
  }

  return {
    eventDate,
    eventTime,
    ...(eventEndTime ? {eventEndTime} : {}),
    ...(eventType ? {eventType} : {}),
    ...(guestCount !== undefined ? {guestCount} : {}),
    ...(eventLocation ? {eventLocation} : {}),
    ...(eventAddress ? {eventAddress} : {}),
    ...(specialRequest ? {specialRequest} : {}),
  };
}

function normalizeEventListItem(value: unknown): CustomerEventListItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.type === "custom_menu") return normalizeCustomMenuItem(record);
  if (record.type !== undefined && record.type !== "package") return null;

  const packageId = safeId(record.packageId);
  const providerId = safeId(record.providerId);
  const packageName = safeText(record.packageName, 160);
  const providerName = safeText(record.providerName, 160);
  const packageHref = safeText(record.packageHref, 1000);

  if (
    !packageId ||
    !providerId ||
    !packageName ||
    !providerName ||
    !packageHref ||
    !packageHref.startsWith("/customer/packages/") ||
    packageHref.startsWith("//") ||
    packageHref.includes("://")
  ) {
    return null;
  }

  return {
    type: "package",
    packageId,
    providerId,
    packageName,
    providerName,
    price: safeMoney(record.price),
    imageUrl: safeHttpsImageUrl(record.imageUrl),
    packageHref,
    configuration: normalizeConfiguration(record.configuration),
  };
}

function normalizeConfiguration(value: unknown): CustomerEventListConfiguration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!record.event || typeof record.event !== "object" || Array.isArray(record.event)) {
    return null;
  }

  const event = record.event as Record<string, unknown>;
  const eventType = safeText(event.eventType, 120);
  const eventDate = safeText(event.eventDate, 10);
  const eventTime = safeText(event.eventTime, 5);
  const eventEndTime = safeText(event.eventEndTime, 5);
  const eventLocation = safeText(event.eventLocation, 180);
  const eventAddress = safeText(event.eventAddress, 500);
  const guestCount = typeof event.guestCount === "number" &&
    Number.isInteger(event.guestCount) &&
    event.guestCount >= 1 &&
    event.guestCount <= 10_000
    ? event.guestCount
    : null;

  if (
    !eventType ||
    !eventDate ||
    !isCalendarDate(eventDate) ||
    !eventTime ||
    !isClockTime(eventTime) ||
    !eventEndTime ||
    !isClockTime(eventEndTime) ||
    eventEndTime <= eventTime ||
    guestCount === null ||
    !eventLocation ||
    !eventAddress
  ) {
    return null;
  }

  return {
    event: {
      eventType,
      eventDate,
      eventTime,
      eventEndTime,
      guestCount,
      eventLocation,
      eventAddress,
      specialRequest: safeText(event.specialRequest, 1000) ?? "",
    },
    selectedFoods: safeTextList(record.selectedFoods, 50, 160),
    selectedDecorations: safeTextList(record.selectedDecorations, 50, 160),
    selectedFurniture: safeTextList(record.selectedFurniture, 50, 160),
    selectedEventServices: normalizeServices(record.selectedEventServices),
    willArrangeOwnAddOns: record.willArrangeOwnAddOns === true,
    customerArrangedAddOnsNote: safeText(record.customerArrangedAddOnsNote, 1000) ?? "",
    estimatedTotal: safeMoney(record.estimatedTotal),
  };
}

function normalizeServices(value: unknown): readonly CustomerEventListService[] {
  if (!Array.isArray(value)) return [];
  const services: CustomerEventListService[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const id = safeId(record.id);
    const providerId = safeId(record.providerId);
    const providerName = safeText(record.providerName, 160);
    const name = safeText(record.name, 160);
    if (!id || !providerId || !providerName || !name) continue;
    if (services.some((service) => service.id === id)) continue;

    services.push({
      id,
      providerId,
      providerName,
      name,
      category: safeText(record.category, 120),
      price: safeMoney(record.price),
    });
    if (services.length >= 30) break;
  }

  return services;
}

function normalizeCustomMenuItem(
  record: Record<string, unknown>,
): CustomerCustomMenuEventListItem | null {
  const providerId = safeId(record.providerId);
  const menuItemId = safeId(record.menuItemId);
  const servingOptionId = safeId(record.servingOptionId);
  const providerName = boundedName(record.providerName, 160);
  const menuItemName = boundedName(record.menuItemName, 160);
  const servingOptionName = boundedName(record.servingOptionName, 80);
  const imageUrl = typeof record.imageUrl === "string" && record.imageUrl.length <= 1000
    ? safeHttpsImageUrl(record.imageUrl)
    : null;
  const price = safeMoney(record.price);
  const guests = normalizeServingGuests(record);

  if (
    !providerId ||
    !menuItemId ||
    !servingOptionId ||
    !providerName ||
    !menuItemName ||
    !servingOptionName ||
    !imageUrl ||
    !guests ||
    price === null ||
    price <= 0 ||
    record.providerHref !== `/customer/providers/${providerId}` ||
    typeof record.servingDescription !== "string" ||
    record.servingDescription.length > 160
  ) {
    return null;
  }

  return {
    type: "custom_menu",
    key: `custom-menu:${providerId}:${menuItemId}`,
    providerId,
    providerName,
    menuItemId,
    menuItemName,
    servingOptionId,
    servingOptionName,
    servingDescription: record.servingDescription.trim(),
    servingMinimumGuests: guests.minimum,
    servingMaximumGuests: guests.maximum,
    price,
    imageUrl,
    providerHref: record.providerHref,
  };
}

function normalizeServingGuests(
  record: Record<string, unknown>,
): {minimum: number; maximum: number} | null {
  const hasMinimum = "servingMinimumGuests" in record;
  const hasMaximum = "servingMaximumGuests" in record;
  const hasLegacy = "servingGuestCount" in record;

  if (hasMinimum || hasMaximum) {
    if (
      !hasMinimum ||
      !hasMaximum ||
      hasLegacy ||
      !isGuestCount(record.servingMinimumGuests) ||
      !isGuestCount(record.servingMaximumGuests) ||
      record.servingMaximumGuests < record.servingMinimumGuests
    ) {
      return null;
    }
    return {
      minimum: record.servingMinimumGuests,
      maximum: record.servingMaximumGuests,
    };
  }

  if (!isGuestCount(record.servingGuestCount)) return null;
  return {
    minimum: record.servingGuestCount,
    maximum: record.servingGuestCount,
  };
}

function isGuestCount(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 1_000_000;
}

function optionalScheduleText(value: unknown, maximumLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length > maximumLength) return null;
  return normalized || undefined;
}

function safeTextList(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): readonly string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const candidate of value) {
    const text = safeText(candidate, maximumLength);
    if (!text || result.includes(text)) continue;
    result.push(text);
    if (result.length >= maximumItems) break;
  }
  return result;
}

function safeMoney(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100_000_000
    ? value
    : null;
}

function safeHttpsImageUrl(value: unknown): string | null {
  const url = safeText(value, 1000);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value)
    ? value
    : null;
}

function boundedName(value: unknown, limit: number): string | null {
  return typeof value === "string" && value.trim().length <= limit
    ? safeText(value, limit)
    : null;
}

function safeText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/gu, " ").slice(0, maximumLength);
  return normalized || null;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;
}

function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/u.test(value);
}
