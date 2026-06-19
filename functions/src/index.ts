import {initializeApp} from "firebase-admin/app";
import * as logger from "firebase-functions/logger";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";

initializeApp();

// Use a server-side Google Maps web-services key here, not the Android Maps SDK key.
const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
const functionRegion = "asia-southeast1";
const requestTimeoutMs = 10000;
const ormocCenter = {latitude: 11.0064, longitude: 124.6075};

type UnknownRecord = Record<string, unknown>;

type PlacesAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      place?: string;
      placeId?: string;
      text?: {text?: string};
      structuredFormat?: {
        mainText?: {text?: string};
        secondaryText?: {text?: string};
      };
    };
  }>;
};

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type PlaceDetailsResponse = {
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  addressComponents?: GoogleAddressComponent[];
};

type GeocodingResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
    address_components?: GoogleAddressComponent[];
  }>;
};

type DirectionsResponse = {
  status: string;
  error_message?: string;
  routes?: Array<{
    overview_polyline?: {
      points?: string;
    };
    legs?: Array<{
      distance?: {
        text?: string;
        value?: number;
      };
      duration?: {
        text?: string;
        value?: number;
      };
    }>;
  }>;
};

type StructuredAddress = {
  fullAddress: string;
  streetName: string;
  barangay: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
};

const callableOptions = {
  region: functionRegion,
  secrets: [googleMapsApiKey],
  timeoutSeconds: 20,
  memory: "256MiB" as const,
};

export const searchPlaces = onCall(callableOptions, async (request) => {
  try {
    const data = asRecord(request.data);
    const query = requireString(data, "query", 2, 120);
    const apiKey = getGoogleMapsApiKey();
    const response = await fetchGoogleJson<PlacesAutocompleteResponse>(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "suggestions.placePrediction.place",
            "suggestions.placePrediction.placeId",
            "suggestions.placePrediction.text.text",
            "suggestions.placePrediction.structuredFormat.mainText.text",
            "suggestions.placePrediction.structuredFormat.secondaryText.text",
          ].join(","),
        },
        body: JSON.stringify({
          input: query,
          includedRegionCodes: ["ph"],
          locationBias: {
            circle: {
              center: ormocCenter,
              radius: 75000,
            },
          },
        }),
      },
    );

    return (response.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction)
      .filter((prediction): prediction is NonNullable<typeof prediction> => {
        return prediction != null;
      })
      .map((prediction) => {
        const mainText =
          prediction.structuredFormat?.mainText?.text ??
          prediction.text?.text ??
          "";
        const secondaryText =
          prediction.structuredFormat?.secondaryText?.text ?? "";
        const fullAddress = prediction.text?.text ?? [
          mainText,
          secondaryText,
        ].filter(Boolean).join(", ");

        return {
          placeId: prediction.placeId ?? prediction.place ?? "",
          mainText,
          secondaryText,
          fullAddress,
        };
      })
      .filter((item) => item.placeId.length > 0 && item.mainText.length > 0)
      .slice(0, 8);
  } catch (error) {
    throw toHttpsError(error, "Unable to search places.");
  }
});

export const reverseGeocode = onCall(callableOptions, async (request) => {
  try {
    const data = asRecord(request.data);
    const latitude = requireCoordinate(data, "latitude", -90, 90);
    const longitude = requireCoordinate(data, "longitude", -180, 180);
    const apiKey = getGoogleMapsApiKey();
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${latitude},${longitude}`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("region", "ph");

    const response = await fetchGoogleJson<GeocodingResponse>(url.toString());

    if (response.status === "ZERO_RESULTS") {
      throw new HttpsError(
        "not-found",
        "No address was found for this map position.",
      );
    }

    if (response.status !== "OK") {
      logger.warn("Geocoding API rejected the request", {
        status: response.status,
        errorMessage: response.error_message,
      });
      throw new HttpsError(
        "unavailable",
        "Unable to load address. Please try again or enter manually.",
      );
    }

    const result = response.results?.[0];
    if (!result) {
      throw new HttpsError(
        "not-found",
        "No address was found for this map position.",
      );
    }

    const resultLat = result.geometry?.location?.lat ?? latitude;
    const resultLng = result.geometry?.location?.lng ?? longitude;

    return buildStructuredAddress({
      fullAddress: result.formatted_address ?? "",
      components: result.address_components ?? [],
      latitude: resultLat,
      longitude: resultLng,
    });
  } catch (error) {
    throw toHttpsError(error, "Unable to reverse geocode this location.");
  }
});

export const getPlaceDetails = onCall(callableOptions, async (request) => {
  try {
    const data = asRecord(request.data);
    const placeId = requireString(data, "placeId", 4, 220);
    const apiKey = getGoogleMapsApiKey();
    const placeResource = placeId.startsWith("places/")
      ? placeId
      : `places/${encodeURIComponent(placeId)}`;

    const response = await fetchGoogleJson<PlaceDetailsResponse>(
      `https://places.googleapis.com/v1/${placeResource}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "formattedAddress",
            "location",
            "addressComponents",
          ].join(","),
        },
      },
    );

    const latitude = response.location?.latitude;
    const longitude = response.location?.longitude;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      throw new HttpsError(
        "not-found",
        "This place does not include a usable map location.",
      );
    }

    return buildStructuredAddress({
      fullAddress: response.formattedAddress ?? "",
      components: response.addressComponents ?? [],
      latitude,
      longitude,
    });
  } catch (error) {
    throw toHttpsError(error, "Unable to get place details.");
  }
});

export const getDirections = onCall(callableOptions, async (request) => {
  try {
    const data = asRecord(request.data);
    const originLat = requireCoordinate(data, "originLat", -90, 90);
    const originLng = requireCoordinate(data, "originLng", -180, 180);
    const destinationLat = requireCoordinate(data, "destinationLat", -90, 90);
    const destinationLng = requireCoordinate(data, "destinationLng", -180, 180);
    const apiKey = getGoogleMapsApiKey();
    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${originLat},${originLng}`);
    url.searchParams.set("destination", `${destinationLat},${destinationLng}`);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("region", "ph");
    url.searchParams.set("key", apiKey);

    const response = await fetchGoogleJson<DirectionsResponse>(url.toString());

    if (response.status === "ZERO_RESULTS") {
      throw new HttpsError("not-found", "No route was found for this trip.");
    }

    if (response.status !== "OK") {
      logger.warn("Directions API rejected the request", {
        status: response.status,
        errorMessage: response.error_message,
      });
      throw new HttpsError(
        "unavailable",
        "Unable to load route details. Please try again.",
      );
    }

    const route = response.routes?.[0];
    const leg = route?.legs?.[0];

    if (!route || !leg) {
      throw new HttpsError("not-found", "No route was found for this trip.");
    }

    return {
      distanceText: leg.distance?.text ?? "",
      distanceMeters: leg.distance?.value ?? 0,
      durationText: leg.duration?.text ?? "",
      durationSeconds: leg.duration?.value ?? 0,
      encodedPolyline: route.overview_polyline?.points ?? "",
    };
  } catch (error) {
    throw toHttpsError(error, "Unable to get directions.");
  }
});

function getGoogleMapsApiKey(): string {
  const apiKey = googleMapsApiKey.value();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "Google Maps API key is not configured on Firebase Functions.",
    );
  }

  return apiKey;
}

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Request body is invalid.");
  }

  return value as UnknownRecord;
}

function requireString(
  data: UnknownRecord,
  field: string,
  minLength: number,
  maxLength: number,
): string {
  const value = data[field];

  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength || trimmed.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be between ${minLength} and ${maxLength} characters.`,
    );
  }

  return trimmed;
}

function requireCoordinate(
  data: UnknownRecord,
  field: string,
  min: number,
  max: number,
): number {
  const value = data[field];
  const coordinate = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    throw new HttpsError("invalid-argument", `${field} is not valid.`);
  }

  return coordinate;
}

async function fetchGoogleJson<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn("Google Maps API HTTP error", {
        status: response.status,
        body,
      });
      throw new HttpsError(
        "unavailable",
        "Google Maps service is temporarily unavailable.",
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (isAbortError(error)) {
      throw new HttpsError(
        "deadline-exceeded",
        "Google Maps request timed out.",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildStructuredAddress(params: {
  fullAddress: string;
  components: GoogleAddressComponent[];
  latitude: number;
  longitude: number;
}): StructuredAddress {
  const streetNumber = componentValue(params.components, ["street_number"]);
  const route = componentValue(params.components, ["route"]);
  const premise = componentValue(params.components, [
    "premise",
    "point_of_interest",
    "establishment",
  ]);
  const streetName = [streetNumber, route].filter(Boolean).join(" ") || premise;
  const barangay = componentValue(params.components, [
    "sublocality_level_1",
    "sublocality",
    "neighborhood",
    "administrative_area_level_3",
  ]);
  const city = componentValue(params.components, [
    "locality",
    "postal_town",
    "administrative_area_level_2",
  ]);
  const province = componentValue(params.components, [
    "administrative_area_level_1",
  ]);
  const postalCode = componentValue(params.components, ["postal_code"]);
  const country = componentValue(params.components, ["country"]) || "Philippines";
  const fullAddress =
    params.fullAddress ||
    [streetName, barangay, city, province, postalCode, country]
      .filter(Boolean)
      .join(", ");

  return {
    fullAddress,
    streetName,
    barangay,
    city: city || "Ormoc City",
    province: province || "Leyte",
    postalCode,
    country,
    latitude: params.latitude,
    longitude: params.longitude,
  };
}

function componentValue(
  components: GoogleAddressComponent[],
  preferredTypes: string[],
): string {
  for (const type of preferredTypes) {
    const component = components.find((item) => {
      return item.types?.includes(type) ?? false;
    });

    if (component) {
      return (component.longText ?? component.long_name ?? "").trim();
    }
  }

  return "";
}

function toHttpsError(error: unknown, fallbackMessage: string): HttpsError {
  if (error instanceof HttpsError) return error;

  logger.error(fallbackMessage, error);

  if (isAbortError(error)) {
    return new HttpsError("deadline-exceeded", "The request timed out.");
  }

  return new HttpsError("unavailable", fallbackMessage);
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as {name?: string}).name === "AbortError"
  );
}
