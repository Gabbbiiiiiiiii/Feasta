"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{8,160}$/u;
const REASON_CODES = new Set([
  "PROVIDER_NOT_OPERATIONAL",
  "PROVIDER_SCHEDULE_INVALID",
  "SERVICE_CATEGORY_NOT_SUPPORTED",
  "EVENT_DATE_INVALID",
  "EVENT_TIME_INVALID",
  "OUTSIDE_OPERATING_DAY",
  "BLOCKED_DATE",
  "LEAD_TIME_NOT_MET",
  "MAX_EVENTS_REACHED",
  "TIME_CONFLICT",
  "GUEST_CAPACITY_BELOW_MINIMUM",
  "GUEST_CAPACITY_EXCEEDED",
]);

export type CustomerProviderAvailabilityReasonCode =
  | "PROVIDER_NOT_OPERATIONAL"
  | "PROVIDER_SCHEDULE_INVALID"
  | "SERVICE_CATEGORY_NOT_SUPPORTED"
  | "EVENT_DATE_INVALID"
  | "EVENT_TIME_INVALID"
  | "OUTSIDE_OPERATING_DAY"
  | "BLOCKED_DATE"
  | "LEAD_TIME_NOT_MET"
  | "MAX_EVENTS_REACHED"
  | "TIME_CONFLICT"
  | "GUEST_CAPACITY_BELOW_MINIMUM"
  | "GUEST_CAPACITY_EXCEEDED";

export type CustomerProviderAvailability = {
  providerId: string;
  available: boolean;
  reasonCode: CustomerProviderAvailabilityReasonCode | null;
  message: string;
};

export type CustomerProviderAvailabilityInput = {
  packageId: string;
  addonIds: readonly string[];
  eventDate: string;
  eventTime: string;
  eventEndTime?: string | null;
  serviceTier?: string | null;
  guestCount: number;
};

type AvailabilityResponse = {
  results?: unknown;
};

export async function checkCustomerProviderAvailability(
  input: CustomerProviderAvailabilityInput,
  expectedProviderIds: readonly string[],
): Promise<readonly CustomerProviderAvailability[]> {
  try {
    await auth.authStateReady();

    if (!auth.currentUser) {
      throw new Error("Please sign in again to check provider availability.");
    }

    initializeBrowserAppCheck();

    const callable = httpsCallable<
      CustomerProviderAvailabilityInput,
      AvailabilityResponse
    >(
      functions,
      "checkCustomerProviderAvailability",
      {timeout: 30_000},
    );
    const payload = normalizeAvailabilityPayload(input);

    try {
      const response = await callable(payload);
      return parseAvailabilityResponse(
        response.data,
        expectedProviderIds,
      );
    } catch (error: unknown) {
      // Deployed callables that predate service-tier-aware schedules reject
      // `serviceTier`. Retry without it, keeping eventTime/eventEndTime so
      // Step 1 availability still works before Functions are redeployed.
      const legacy = legacyAvailabilityPayload(payload, error);
      if (!legacy) throw error;
      const response = await callable(legacy);
      return parseAvailabilityResponse(
        response.data,
        expectedProviderIds,
      );
    }
  } catch (error: unknown) {
    throw normalizeAvailabilityError(error);
  }
}

function normalizeAvailabilityPayload(
  input: CustomerProviderAvailabilityInput,
): CustomerProviderAvailabilityInput {
  return {
    ...input,
    eventTime: canonicalizeClock(input.eventTime) ?? input.eventTime,
    ...(input.eventEndTime
      ? {eventEndTime: canonicalizeClock(input.eventEndTime) ?? input.eventEndTime}
      : {}),
  };
}

function legacyAvailabilityPayload(
  input: CustomerProviderAvailabilityInput,
  error: unknown,
): CustomerProviderAvailabilityInput | null {
  if (!isInvalidArgumentError(error)) return null;
  if (!input.serviceTier) return null;
  const eventTime = canonicalizeClock(input.eventTime);
  const eventEndTime =
    canonicalizeClock(input.eventEndTime) ??
    (eventTime ? nextClockMinute(eventTime) : null);
  if (!eventTime || !eventEndTime) return null;
  return {
    packageId: input.packageId,
    addonIds: input.addonIds,
    eventDate: input.eventDate,
    eventTime,
    eventEndTime,
    guestCount: input.guestCount,
  };
}

function isInvalidArgumentError(error: unknown): boolean {
  return error instanceof FirebaseError &&
    error.code.replace(/^functions\//u, "") === "invalid-argument";
}

function canonicalizeClock(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/u.exec(value.trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

/** Availability-only legacy range bound; never persisted for Drop-Off bookings. */
function nextClockMinute(eventTime: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(eventTime);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]) + 1;
  if (minutes >= 24 * 60) return null;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseAvailabilityResponse(
  response: AvailabilityResponse,
  expectedProviderIds: readonly string[],
): readonly CustomerProviderAvailability[] {
  if (!Array.isArray(response.results)) {
    throw invalidResponse();
  }

  const expected = new Set(expectedProviderIds);
  const seen = new Set<string>();
  const results = response.results.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw invalidResponse();
    }

    const result = item as Record<string, unknown>;
    const providerId = result.providerId;
    const available = result.available;
    const reasonCode = result.reasonCode;
    const message = result.message;

    if (
      typeof providerId !== "string" ||
      !SAFE_DOCUMENT_ID.test(providerId) ||
      !expected.has(providerId) ||
      seen.has(providerId) ||
      typeof available !== "boolean" ||
      typeof message !== "string" ||
      message.trim().length < 1 ||
      message.length > 240 ||
      (
        available && reasonCode !== null
      ) ||
      (
        !available &&
        (
          typeof reasonCode !== "string" ||
          !REASON_CODES.has(reasonCode)
        )
      )
    ) {
      throw invalidResponse();
    }

    seen.add(providerId);

    return {
      providerId,
      available,
      reasonCode: reasonCode as CustomerProviderAvailabilityReasonCode | null,
      message: message.trim(),
    };
  });

  if (seen.size !== expected.size) {
    throw invalidResponse();
  }

  return results;
}

function normalizeAvailabilityError(error: unknown): Error {
  if (error instanceof FirebaseError) {
    const code = error.code.replace(/^functions\//u, "");

    switch (code) {
    case "unauthenticated":
      return new Error("Please sign in again to check provider availability.");
    case "permission-denied":
      return new Error("Your account cannot check provider availability.");
    case "invalid-argument": {
      const detail = error.message.replace(/^[^:]+:\s*/u, "").trim();
      if (
        detail &&
        detail !== "invalid-argument" &&
        !/^INTERNAL$/iu.test(detail) &&
        detail.length <= 180
      ) {
        return new Error(detail);
      }
      return new Error("Review the event date, time, and guest count.");
    }
    case "failed-precondition":
      return new Error("Booking options changed. Refresh the page and try again.");
    case "resource-exhausted":
      return new Error("Too many availability checks were made. Please wait and try again.");
    case "deadline-exceeded":
    case "unavailable":
      return new Error("Provider availability could not be checked. Please try again.");
    default:
      return new Error("Provider availability could not be checked. Please try again.");
    }
  }

  if (
    error instanceof Error &&
    (
      error.message === "Please sign in again to check provider availability." ||
      error.message === "The provider availability response is invalid."
    )
  ) {
    return error;
  }

  return new Error("Provider availability could not be checked. Please try again.");
}

function invalidResponse(): Error {
  return new Error("The provider availability response is invalid.");
}

export type ProviderCalendarMonth = {
  month: string;
  dates: Array<{date: string; state: "booked" | "on_hold" | "unavailable"}>;
};

export async function getCustomerProviderCalendarAvailability(providerId: string, month: string): Promise<ProviderCalendarMonth> {
  try {
    await auth.authStateReady();
    if (!auth.currentUser) throw new Error("Please sign in again to check provider availability.");
    initializeBrowserAppCheck();
    const response = await httpsCallable<{providerId: string; month: string}, ProviderCalendarMonth>(
      functions, "getCustomerProviderCalendarAvailability", {timeout: 30_000},
    )({providerId, month});
    const data = response.data;
    const seen = new Set<string>();
    if (data?.month !== month || !Array.isArray(data.dates) || data.dates.length > 31) throw invalidResponse();
    for (const item of data.dates) {
      if (!item || typeof item.date !== "string" || !item.date.startsWith(`${month}-`) ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(item.date) ||
        new Date(`${item.date}T00:00:00Z`).toISOString().slice(0, 10) !== item.date ||
        !["booked", "on_hold", "unavailable"].includes(item.state) || seen.has(item.date)) throw invalidResponse();
      seen.add(item.date);
    }
    return data;
  } catch (error) { throw normalizeAvailabilityError(error); }
}
