"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";

import {functions, initializeBrowserAppCheck} from "@/lib/firebase/client";

export type EventVenueSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullAddress: string;
};

export type EventVenueDetails = {
  address: string;
  city: string;
  province: string;
  latitude: number;
  longitude: number;
};

export async function searchEventVenues(
  query: string,
): Promise<readonly EventVenueSuggestion[]> {
  initializeBrowserAppCheck();
  const callable = httpsCallable<{query: string}, unknown>(
    functions,
    "searchPlaces",
    {timeout: 14_000},
  );

  try {
    const response = await callable({query: query.trim()});
    return Array.isArray(response.data)
      ? response.data.flatMap(parseSuggestion).slice(0, 8)
      : [];
  } catch (error) {
    throw venueError(error);
  }
}

export async function getEventVenueDetails(
  placeId: string,
): Promise<EventVenueDetails> {
  initializeBrowserAppCheck();
  const callable = httpsCallable<{placeId: string}, unknown>(
    functions,
    "getPlaceDetails",
    {timeout: 14_000},
  );

  try {
    const response = await callable({placeId});
    return parseDetails(response.data);
  } catch (error) {
    throw venueError(error);
  }
}

function parseSuggestion(value: unknown): EventVenueSuggestion[] {
  if (!isRecord(value)) return [];
  const placeId = safeText(value.placeId, 220);
  const mainText = safeText(value.mainText, 120);
  const secondaryText = safeText(value.secondaryText, 180);
  const fullAddress = safeText(value.fullAddress, 240);
  return placeId && mainText && fullAddress
    ? [{placeId, mainText, secondaryText, fullAddress}]
    : [];
}

function parseDetails(value: unknown): EventVenueDetails {
  if (!isRecord(value)) throw invalidResponse();
  const address = safeText(value.fullAddress, 240);
  const city = safeText(value.city, 100);
  const province = safeText(value.province, 100);
  const latitude = value.latitude;
  const longitude = value.longitude;
  if (
    !address ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude)
  ) {
    throw invalidResponse();
  }
  return {address, city, province, latitude, longitude};
}

function venueError(error: unknown): Error {
  if (error instanceof FirebaseError) {
    const code = error.code.replace(/^functions\//u, "");
    if (code === "resource-exhausted") {
      return new Error("Too many location searches. Please wait and try again.");
    }
    if (code === "deadline-exceeded") {
      return new Error("Location search timed out. Please try again.");
    }
    if (code === "invalid-argument") {
      return new Error("Enter a valid event venue or address.");
    }
  }
  return new Error(
    "Event venue search is temporarily unavailable. You can still explore without a location.",
  );
}

function invalidResponse(): Error {
  return new Error("The event venue response was invalid. Please try again.");
}

function safeText(value: unknown, maximum: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/gu, " ").slice(0, maximum)
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
