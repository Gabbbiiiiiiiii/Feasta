"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import type {CustomerProviderAvailability} from "@/lib/customer/bookings/customer-provider-availability-client";
import type {CustomerEventContext} from "@/lib/customer/planning/event-planning-context";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";

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

type MarketplaceAvailabilityResponse = {results?: unknown};

export async function checkMarketplaceProviderAvailability(
  providerIds: readonly string[],
  context: CustomerEventContext,
): Promise<readonly CustomerProviderAvailability[]> {
  try {
    await auth.authStateReady();
    if (!auth.currentUser) {
      throw new Error("Please sign in again to check provider availability.");
    }
    initializeBrowserAppCheck();
    const callable = httpsCallable<
      {
        providerIds: readonly string[];
        eventDate: string;
        eventTime: string;
        eventEndTime: string;
        guestCount: number;
        serviceType: CustomerEventContext["serviceType"];
      },
      MarketplaceAvailabilityResponse
    >(functions, "checkMarketplaceProviderAvailability", {timeout: 30_000});
    const response = await callable({providerIds, ...context});
    return parseResponse(response.data, providerIds);
  } catch (error: unknown) {
    throw normalizeError(error);
  }
}

function parseResponse(
  response: MarketplaceAvailabilityResponse,
  expectedProviderIds: readonly string[],
): readonly CustomerProviderAvailability[] {
  if (!Array.isArray(response.results)) throw invalidResponse();
  const expected = new Set(expectedProviderIds);
  const seen = new Set<string>();
  const results = response.results.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw invalidResponse();
    }
    const result = item as Record<string, unknown>;
    if (
      typeof result.providerId !== "string" ||
      !SAFE_DOCUMENT_ID.test(result.providerId) ||
      !expected.has(result.providerId) ||
      seen.has(result.providerId) ||
      typeof result.available !== "boolean" ||
      typeof result.message !== "string" ||
      result.message.trim().length < 1 ||
      result.message.length > 240 ||
      (result.available && result.reasonCode !== null) ||
      (!result.available &&
        (typeof result.reasonCode !== "string" || !REASON_CODES.has(result.reasonCode)))
    ) throw invalidResponse();
    seen.add(result.providerId);
    return {
      providerId: result.providerId,
      available: result.available,
      reasonCode: result.reasonCode as CustomerProviderAvailability["reasonCode"],
      message: result.message.trim(),
    };
  });
  if (seen.size !== expected.size) throw invalidResponse();
  return results;
}

function normalizeError(error: unknown): Error {
  if (error instanceof FirebaseError) {
    const code = error.code.replace(/^functions\//u, "");
    if (code === "unauthenticated") {
      return new Error("Please sign in again to check provider availability.");
    }
    if (code === "resource-exhausted") {
      return new Error("Too many availability checks were made. Please wait and try again.");
    }
    if (code === "invalid-argument") {
      return new Error("Review the event date, time, and guest count.");
    }
  }
  if (error instanceof Error &&
    (error.message === "Please sign in again to check provider availability." ||
      error.message === "The marketplace availability response is invalid.")) {
    return error;
  }
  return new Error("Provider availability could not be checked. Please try again.");
}

function invalidResponse(): Error {
  return new Error("The marketplace availability response is invalid.");
}
