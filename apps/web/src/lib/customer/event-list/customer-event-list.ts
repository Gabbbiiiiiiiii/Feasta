"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

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

  selectedEventServices:
    readonly CustomerEventListService[];

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

  configuration?:
    | CustomerEventListConfiguration
    | null;
};

// Planning snapshots only. Booking submission must re-read the authoritative
// provider menu and serving option in Firestore before creating a request.
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

export type CustomerEventListItem = CustomerPackageEventListItem | CustomerCustomMenuEventListItem;

export type CustomerEventListSchedule = {
  eventDate: string;
  eventTime: string;

  /*
   * These remain optional so Event Lists saved before
   * full booking details were introduced still load.
   */
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


export function customerEventListItemKey(item: CustomerEventListItem): string {
  return item.type === "custom_menu"
    ? `custom-menu:${item.providerId}:${item.menuItemId}`
    : item.packageId;
}

const STORAGE_KEY =
  "feasta.customer.event-list.v1";

const SCHEDULE_STORAGE_KEY =
  "feasta.customer.event-list.schedule.v1";


const CHANGE_EVENT =
  "feasta:customer-event-list-change";

export const CUSTOMER_EVENT_LIST_OPEN_EVENT =
  "feasta:open-customer-event-list";

const MAX_ITEMS = 24;

export function useCustomerEventList() {
  const [items, setItems] = useState<
    readonly CustomerEventListItem[]
  >([]);

  useEffect(() => {
    function synchronize() {
      setItems(readCustomerEventList());
    }

    function storageChanged(
      event: StorageEvent,
    ) {
      if (
        event.key !== null &&
        event.key !== STORAGE_KEY
      ) {
        return;
      }

      synchronize();
    }

    synchronize();

    window.addEventListener(
      CHANGE_EVENT,
      synchronize,
    );

    window.addEventListener(
      "storage",
      storageChanged,
    );

    return () => {
      window.removeEventListener(
        CHANGE_EVENT,
        synchronize,
      );

      window.removeEventListener(
        "storage",
        storageChanged,
      );
    };
  }, []);

  const addItem = useCallback(
    (item: CustomerEventListItem) => {
      addCustomerEventListItem(item);
    },
    [],
  );

  const removeItem = useCallback(
    (packageId: string) => {
      removeCustomerEventListItem(
        packageId,
      );
    },
    [],
  );

  const removeService = useCallback(
    (
      packageId: string,
      serviceId: string,
    ) => {
      removeCustomerEventListService(
        packageId,
        serviceId,
      );
    },
    [],
  );

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

export function useCustomerEventListSchedule():
  CustomerEventListSchedule | null {
  const [
    schedule,
    setSchedule,
  ] =
    useState<CustomerEventListSchedule | null>(
      null,
    );

  useEffect(() => {
    function synchronize() {
      setSchedule(
        readCustomerEventListSchedule(),
      );
    }

    function storageChanged(
      event: StorageEvent,
    ) {
      if (
        event.key !== null &&
        event.key !== STORAGE_KEY &&
        event.key !==
          SCHEDULE_STORAGE_KEY
      ) {
        return;
      }

      synchronize();
    }

    synchronize();

    window.addEventListener(
      CHANGE_EVENT,
      synchronize,
    );

    window.addEventListener(
      "storage",
      storageChanged,
    );

    return () => {
      window.removeEventListener(
        CHANGE_EVENT,
        synchronize,
      );

      window.removeEventListener(
        "storage",
        storageChanged,
      );
    };
  }, []);

  return schedule;
}
export function openCustomerEventList():
  void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new Event(
      CUSTOMER_EVENT_LIST_OPEN_EVENT,
    ),
  );
}
export function readCustomerEventList():
  readonly CustomerEventListItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(
        STORAGE_KEY,
      );

    if (!raw) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    const items: CustomerEventListItem[] =
      [];

    for (const candidate of parsed) {
      const item =
        normalizeEventListItem(
          candidate,
        );

      if (!item) {
        continue;
      }

      if (
        items.some(
          (existing) =>
            customerEventListItemKey(existing) ===
            customerEventListItemKey(item),
        )
      ) {
        continue;
      }

      items.push(item);

      if (items.length >= MAX_ITEMS) {
        break;
      }
    }

    return items;
  }
  catch {
    return [];
  }
}

export function readCustomerEventListSchedule():
  CustomerEventListSchedule | null {
  if (typeof window === "undefined") {
    return null;
  }

  const items =
    readCustomerEventList();

  /*
   * A schedule belongs to the Event List.
   * Do not reuse stale schedule storage after
   * the customer has emptied the list.
   */
  if (items.length === 0) {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        SCHEDULE_STORAGE_KEY,
      );

    if (raw) {
      const parsed: unknown =
        JSON.parse(raw);

      const normalized =
        normalizeCustomerEventListSchedule(
          parsed,
        );

      if (normalized) {
        return normalized;
      }
    }
  }
  catch {
    // Fall through to package configuration compatibility.
  }

  /*
   * Backward compatibility:
   * a configured package may already contain
   * the event date and start time.
   */
  for (const item of items) {
    if (
      item.type === "custom_menu" ||
      !item.configuration
    ) {
      continue;
    }

    const normalized =
      normalizeCustomerEventListSchedule({
        eventDate:
          item.configuration.event
            .eventDate,

        eventTime:
          item.configuration.event
            .eventTime,
      });

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function writeCustomerEventListSchedule(
  value: CustomerEventListSchedule,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized =
    normalizeCustomerEventListSchedule(
      value,
    );

  if (!normalized) {
    return;
  }

  try {
    window.localStorage.setItem(
      SCHEDULE_STORAGE_KEY,
      JSON.stringify(
        normalized,
      ),
    );

    notifyCustomerEventListChanged();
  }
  catch {
    // Storage can be unavailable in restricted browser environments.
  }
}

export function addCustomerEventListItem(
  item: CustomerEventListItem,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalized =
    normalizeEventListItem(item);

  if (!normalized) {
    return;
  }

  const current =
    readCustomerEventList();

  // Replace by identity: package ID, or provider + menu item ID.
  // A different serving size updates the existing menu selection.
  const next = [
    normalized,
    ...current.filter(
      (candidate) =>
        customerEventListItemKey(candidate) !==
        customerEventListItemKey(normalized),
    ),
  ].slice(0, MAX_ITEMS);

  writeCustomerEventList(next);
}

export function removeCustomerEventListItem(
  itemKey: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedKey =
    safeText(
      itemKey,
      320,
    );

  if (!normalizedKey) {
    return;
  }

  const next =
    readCustomerEventList().filter(
      (item) =>
        customerEventListItemKey(
          item,
        ) !== normalizedKey,
    );

  if (next.length === 0) {
    window.localStorage.removeItem(
      SCHEDULE_STORAGE_KEY,
    );
  }

  writeCustomerEventList(next);
}
export function removeCustomerEventListService(
  packageId: string,
  serviceId: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedPackageId =
    safeText(
      packageId,
      128,
    );

  const normalizedServiceId =
    safeText(
      serviceId,
      128,
    );

  if (
    !normalizedPackageId ||
    !normalizedServiceId
  ) {
    return;
  }

  const next =
    readCustomerEventList().map(
      (item) => {
        if (
          item.type === "custom_menu" ||
          item.packageId !==
            normalizedPackageId ||
          !item.configuration
        ) {
          return item;
        }

        const selectedEventServices =
          item.configuration
            .selectedEventServices
            .filter(
              (service) =>
                service.id !==
                normalizedServiceId,
            );

        const serviceSubtotal =
          selectedEventServices.reduce(
            (total, service) =>
              total +
              (service.price ?? 0),
            0,
          );

        return {
          ...item,

          configuration: {
            ...item.configuration,

            selectedEventServices,

            estimatedTotal:
              item.price === null
                ? null
                : item.price +
                  serviceSubtotal,
          },
        };
      },
    );

  writeCustomerEventList(next);
}
export function clearCustomerEventList():
  void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(
    STORAGE_KEY,
  );

  window.localStorage.removeItem(
    SCHEDULE_STORAGE_KEY,
  );


  notifyCustomerEventListChanged();
}

function writeCustomerEventList(
  items: readonly CustomerEventListItem[],
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items),
    );

    notifyCustomerEventListChanged();
  }
  catch {
    // Storage can be unavailable in
    // restricted browser environments.
  }
}

function notifyCustomerEventListChanged():
  void {
  window.dispatchEvent(
    new Event(CHANGE_EVENT),
  );
}

function normalizeCustomerEventListSchedule(
  value: unknown,
): CustomerEventListSchedule | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  if (
    typeof record.eventDate !==
      "string" ||
    typeof record.eventTime !==
      "string"
  ) {
    return null;
  }

  const eventDate =
    record.eventDate.trim();

  const eventTime =
    record.eventTime.trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      eventDate,
    ) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/u.test(
      eventTime,
    )
  ) {
    return null;
  }

  const [
    yearText,
    monthText,
    dayText,
  ] =
    eventDate.split("-");

  const year =
    Number(yearText);

  const month =
    Number(monthText);

  const day =
    Number(dayText);

  const parsedDate =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    parsedDate.getUTCFullYear() !==
      year ||
    parsedDate.getUTCMonth() !==
      month - 1 ||
    parsedDate.getUTCDate() !==
      day
  ) {
    return null;
  }

  let eventEndTime:
    string | undefined;

  if (
    record.eventEndTime !==
    undefined
  ) {
    if (
      typeof record.eventEndTime !==
        "string"
    ) {
      return null;
    }

    const normalizedEndTime =
      record.eventEndTime.trim();

    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/u.test(
        normalizedEndTime,
      )
    ) {
      return null;
    }

    eventEndTime =
      normalizedEndTime;
  }

  let eventType:
    CustomerEventListSchedule["eventType"];

  if (
    record.eventType !==
    undefined
  ) {
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

    eventType =
      record.eventType;
  }

  let guestCount:
    number | undefined;

  if (
    record.guestCount !==
    undefined
  ) {
    if (
      typeof record.guestCount !==
        "number" ||
      !Number.isSafeInteger(
        record.guestCount,
      ) ||
      record.guestCount < 1 ||
      record.guestCount > 10_000
    ) {
      return null;
    }

    guestCount =
      record.guestCount;
  }

  function optionalText(
    candidate: unknown,
    maximumLength: number,
  ): string | undefined {
    if (
      candidate === undefined
    ) {
      return undefined;
    }

    if (
      typeof candidate !==
      "string"
    ) {
      return undefined;
    }

    const normalized =
      candidate.trim();

    if (
      normalized.length >
      maximumLength
    ) {
      return undefined;
    }

    return normalized ||
      undefined;
  }

  const eventLocation =
    optionalText(
      record.eventLocation,
      180,
    );

  const eventAddress =
    optionalText(
      record.eventAddress,
      500,
    );

  const specialRequest =
    optionalText(
      record.specialRequest,
      1_000,
    );

  return {
    eventDate,
    eventTime,

    ...(eventEndTime
      ? {eventEndTime}
      : {}),

    ...(eventType
      ? {eventType}
      : {}),

    ...(guestCount !==
    undefined
      ? {guestCount}
      : {}),

    ...(eventLocation
      ? {eventLocation}
      : {}),

    ...(eventAddress
      ? {eventAddress}
      : {}),

    ...(specialRequest
      ? {specialRequest}
      : {}),
  };
}

function normalizeEventListItem(
  value: unknown,
): CustomerEventListItem | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  if (record.type === "custom_menu") {
    return normalizeCustomMenuItem(record);
  }
  if (record.type !== undefined && record.type !== "package") return null;

  const packageId =
    safeText(
      record.packageId,
      128,
    );

  const providerId =
    safeText(
      record.providerId,
      128,
    );

  const packageName =
    safeText(
      record.packageName,
      160,
    );

  const providerName =
    safeText(
      record.providerName,
      160,
    );

  const packageHref =
    safeText(
      record.packageHref,
      1000,
    );

  if (
    !packageId ||
    !providerId ||
    !packageName ||
    !providerName ||
    !packageHref ||
    !packageHref.startsWith(
      "/customer/packages/",
    )
  ) {
    return null;
  }

  return {
    packageId,
    providerId,
    packageName,
    providerName,

    price:
      safeMoney(record.price),

    imageUrl:
      safeHttpsImageUrl(
        record.imageUrl,
      ),

    packageHref,

    configuration:
      normalizeConfiguration(
        record.configuration,
      ),
  };
}

function normalizeConfiguration(
  value: unknown,
): CustomerEventListConfiguration | null {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  if (
    !record.event ||
    typeof record.event !== "object"
  ) {
    return null;
  }

  const event =
    record.event as Record<
      string,
      unknown
    >;

  const eventType =
    safeText(
      event.eventType,
      120,
    );

  const eventDate =
    safeText(
      event.eventDate,
      10,
    );

  const eventTime =
    safeText(
      event.eventTime,
      5,
    );

  const eventEndTime =
    safeText(
      event.eventEndTime,
      5,
    );

  const eventLocation =
    safeText(
      event.eventLocation,
      180,
    );

  const eventAddress =
    safeText(
      event.eventAddress,
      500,
    );

  const guestCount =
    typeof event.guestCount === "number" &&
    Number.isInteger(event.guestCount) &&
    event.guestCount >= 1 &&
    event.guestCount <= 10_000
      ? event.guestCount
      : null;

  if (
    !eventType ||
    !eventDate ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      eventDate,
    ) ||
    !eventTime ||
    !/^([01]\d|2[0-3]):[0-5]\d$/u.test(
      eventTime,
    ) ||
    !eventEndTime ||
    !/^([01]\d|2[0-3]):[0-5]\d$/u.test(
      eventEndTime,
    ) ||
    eventEndTime <= eventTime ||
    guestCount === null ||
    !eventLocation ||
    !eventAddress
  ) {
    return null;
  }

  const selectedEventServices =
    normalizeServices(
      record.selectedEventServices,
    );

  return {
    event: {
      eventType,
      eventDate,
      eventTime,
      eventEndTime,
      guestCount,
      eventLocation,
      eventAddress,
      specialRequest:
        safeText(
          event.specialRequest,
          1000,
        ) ?? "",
    },

    selectedFoods:
      safeTextList(
        record.selectedFoods,
        50,
        160,
      ),

    selectedDecorations:
      safeTextList(
        record.selectedDecorations,
        50,
        160,
      ),

    selectedFurniture:
      safeTextList(
        record.selectedFurniture,
        50,
        160,
      ),

    selectedEventServices,

    willArrangeOwnAddOns:
      record.willArrangeOwnAddOns ===
      true,

    customerArrangedAddOnsNote:
      safeText(
        record.customerArrangedAddOnsNote,
        1000,
      ) ?? "",

    estimatedTotal:
      safeMoney(
        record.estimatedTotal,
      ),
  };
}

function normalizeServices(
  value: unknown,
): readonly CustomerEventListService[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const services:
    CustomerEventListService[] = [];

  for (const candidate of value) {
    if (
      !candidate ||
      typeof candidate !== "object"
    ) {
      continue;
    }

    const record =
      candidate as Record<
        string,
        unknown
      >;

    const id =
      safeText(
        record.id,
        128,
      );

    const providerId =
      safeText(
        record.providerId,
        128,
      );

    const providerName =
      safeText(
        record.providerName,
        160,
      );

    const name =
      safeText(
        record.name,
        160,
      );

    if (
      !id ||
      !providerId ||
      !providerName ||
      !name
    ) {
      continue;
    }

    if (
      services.some(
        (service) =>
          service.id === id,
      )
    ) {
      continue;
    }

    services.push({
      id,
      providerId,
      providerName,
      name,

      category:
        safeText(
          record.category,
          120,
        ),

      price:
        safeMoney(
          record.price,
        ),
    });

    if (services.length >= 30) {
      break;
    }
  }

  return services;
}

function safeTextList(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];

  for (const candidate of value) {
    const text =
      safeText(
        candidate,
        maximumLength,
      );

    if (
      !text ||
      result.includes(text)
    ) {
      continue;
    }

    result.push(text);

    if (
      result.length >= maximumItems
    ) {
      break;
    }
  }

  return result;
}

function safeMoney(
  value: unknown,
): number | null {
  return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100_000_000
    ? value
    : null;
}

function safeHttpsImageUrl(
  value: unknown,
): string | null {
  const url =
    safeText(
      value,
      1000,
    );

  if (!url) {
    return null;
  }

  try {
    const parsed =
      new URL(url);

    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }

    return parsed.toString();
  }
  catch {
    return null;
  }
}

function safeText(
  value: unknown,
  maximumLength: number,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value
      .trim()
      .replace(/\s+/gu, " ")
      .slice(0, maximumLength);

  return normalized || null;
}
function normalizeCustomMenuItem(
  record: Record<string, unknown>,
): CustomerCustomMenuEventListItem | null {
  const id =
    (value: unknown) =>
      typeof value === "string" &&
      /^[a-zA-Z0-9_-]{1,128}$/u.test(
        value,
      )
        ? value
        : null;

  const name =
    (
      value: unknown,
      limit: number,
    ) =>
      typeof value === "string" &&
      value.trim().length <= limit
        ? safeText(
            value,
            limit,
          )
        : null;

  const providerId =
    id(record.providerId);

  const menuItemId =
    id(record.menuItemId);

  const servingOptionId =
    id(record.servingOptionId);

  const providerName =
    name(
      record.providerName,
      160,
    );

  const menuItemName =
    name(
      record.menuItemName,
      160,
    );

  const servingOptionName =
    name(
      record.servingOptionName,
      80,
    );

  const imageUrl =
    typeof record.imageUrl ===
      "string" &&
    record.imageUrl.length <= 1000
      ? safeHttpsImageUrl(
          record.imageUrl,
        )
      : null;

  const price =
    safeMoney(
      record.price,
    );

  const hasMinimumGuests =
    "servingMinimumGuests" in
    record;

  const hasMaximumGuests =
    "servingMaximumGuests" in
    record;

  const hasLegacyGuestCount =
    "servingGuestCount" in record;

  let servingMinimumGuests: number;
  let servingMaximumGuests: number;

  if (
    hasMinimumGuests ||
    hasMaximumGuests
  ) {
    if (
      !hasMinimumGuests ||
      !hasMaximumGuests ||
      hasLegacyGuestCount ||
      typeof record.servingMinimumGuests !==
        "number" ||
      typeof record.servingMaximumGuests !==
        "number" ||
      !Number.isSafeInteger(
        record.servingMinimumGuests,
      ) ||
      !Number.isSafeInteger(
        record.servingMaximumGuests,
      ) ||
      record.servingMinimumGuests <
        1 ||
      record.servingMaximumGuests <
        1 ||
      record.servingMinimumGuests >
        1_000_000 ||
      record.servingMaximumGuests >
        1_000_000 ||
      record.servingMaximumGuests <
        record.servingMinimumGuests
    ) {
      return null;
    }

    servingMinimumGuests =
      record.servingMinimumGuests;

    servingMaximumGuests =
      record.servingMaximumGuests;
  }
  else {
    const legacyGuestCount =
      record.servingGuestCount;

    if (
      typeof legacyGuestCount !==
        "number" ||
      !Number.isSafeInteger(
        legacyGuestCount,
      ) ||
      legacyGuestCount < 1 ||
      legacyGuestCount >
        1_000_000
    ) {
      return null;
    }

    servingMinimumGuests =
      legacyGuestCount;

    servingMaximumGuests =
      legacyGuestCount;
  }

  if (
    !providerId ||
    !menuItemId ||
    !servingOptionId ||
    !providerName ||
    !menuItemName ||
    !servingOptionName ||
    !imageUrl ||
    price === null ||
    price <= 0 ||
    record.providerHref !==
      `/customer/providers/${providerId}` ||
    typeof record.servingDescription !==
      "string" ||
    record.servingDescription.length >
      160
  ) {
    return null;
  }

  return {
    type: "custom_menu",
    key:
      `custom-menu:${providerId}:${menuItemId}`,
    providerId,
    providerName,
    menuItemId,
    menuItemName,
    servingOptionId,
    servingOptionName,
    servingDescription:
      record.servingDescription.trim(),
    servingMinimumGuests,
    servingMaximumGuests,
    price,
    imageUrl,
    providerHref:
      record.providerHref,
  };
}
