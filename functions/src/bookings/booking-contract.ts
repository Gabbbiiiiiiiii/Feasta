import {
  PROVIDER_EVENT_TYPES,
} from "../shared/constants.js";

export type BookingPackageIssueCode =
  | "PACKAGE_UNAVAILABLE"
  | "PACKAGE_CONDITIONS_INVALID"
  | "GUEST_COUNT_BELOW_MINIMUM"
  | "GUEST_COUNT_ABOVE_MAXIMUM"
  | "EVENT_TYPE_NOT_SUPPORTED";

export type BookingPackageValidation =
  | {
    valid: true;
    eventType: string;
    minimumGuests: number;
    maximumGuests: number;
  }
  | {
    valid: false;
    code: BookingPackageIssueCode;
  };

type ValidateBookingPackageInput = {
  packageData:
    Readonly<Record<string, unknown>>;
  expectedProviderId: string;
  submittedEventType: string;
  guestCount: number;
};

/**
 * Applies the package contract used by the public
 * marketplace before a booking can be created.
 */
export function validateBookingPackage(
  input: ValidateBookingPackageInput,
): BookingPackageValidation {
  const {
    packageData,
    expectedProviderId,
    submittedEventType,
    guestCount,
  } = input;

  if (
    packageData.providerId !==
      expectedProviderId ||
    packageData.isActive !== true ||
    packageData.isDeleted === true ||
    packageData.isPublished !== true ||
    packageData.status !== "published" ||
    packageData.providerPubliclyVisible !==
      true
  ) {
    return {
      valid: false,
      code: "PACKAGE_UNAVAILABLE",
    };
  }

  const minimumGuests = boundedInteger(
    packageData.minimumGuests,
    1,
    100_000,
  );
  const maximumGuests = boundedInteger(
    packageData.maximumGuests,
    1,
    100_000,
  );

  if (
    minimumGuests === null ||
    maximumGuests === null ||
    minimumGuests > maximumGuests
  ) {
    return {
      valid: false,
      code: "PACKAGE_CONDITIONS_INVALID",
    };
  }

  if (guestCount < minimumGuests) {
    return {
      valid: false,
      code: "GUEST_COUNT_BELOW_MINIMUM",
    };
  }

  if (guestCount > maximumGuests) {
    return {
      valid: false,
      code: "GUEST_COUNT_ABOVE_MAXIMUM",
    };
  }

  const packageEventTypes =
    canonicalEventTypes(
      packageData.eventTypes,
      packageData.eventType,
    );

  if (packageEventTypes.length === 0) {
    return {
      valid: false,
      code: "PACKAGE_CONDITIONS_INVALID",
    };
  }

  const eventType =
    canonicalEventType(
      submittedEventType,
    );

  if (
    !eventType ||
    !packageEventTypes.includes(eventType)
  ) {
    return {
      valid: false,
      code: "EVENT_TYPE_NOT_SUPPORTED",
    };
  }

  return {
    valid: true,
    eventType,
    minimumGuests,
    maximumGuests,
  };
}

function canonicalEventTypes(
  value: unknown,
  legacyValue: unknown,
): readonly string[] {
  const values = Array.isArray(value)
    ? value
    : typeof legacyValue === "string"
      ? [legacyValue]
      : [];

  return [
    ...new Set(
      values.flatMap((item) => {
        const eventType =
          canonicalEventType(item);

        return eventType
          ? [eventType]
          : [];
      }),
    ),
  ];
}

function canonicalEventType(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim().toLowerCase();

  return (
    PROVIDER_EVENT_TYPES as
      readonly string[]
  ).includes(normalized) ?
    normalized :
    null;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum ?
    value as number :
    null;
}
