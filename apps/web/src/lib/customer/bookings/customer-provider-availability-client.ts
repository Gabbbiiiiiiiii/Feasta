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
  eventEndTime: string;
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
    const response = await callable(input);

    return parseAvailabilityResponse(
      response.data,
      expectedProviderIds,
    );
  } catch (error: unknown) {
    throw normalizeAvailabilityError(error);
  }
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
    case "invalid-argument":
      return new Error("Review the event date, time, and guest count.");
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
