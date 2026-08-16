import type {
  DocumentData,
  DocumentSnapshot,
} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {
  isApprovedProviderForOperations,
  PROVIDER_EVENT_TYPES,
} from "../shared/constants.js";

export const PACKAGE_STATUSES = [
  "draft",
  "published",
  "archived",
] as const;

export type PackageStatus =
  (typeof PACKAGE_STATUSES)[number];

export type PackageInput = {
  name: string;
  description: string;
  eventType: string;
  price: number;
  downPaymentPercentage: number;
  minimumGuests: number;
  maximumGuests: number;
  imageUrl: string;
  foodInclusions: readonly string[];
  decorInclusions: readonly string[];
  furnitureInclusions: readonly string[];
  serviceInclusions: readonly string[];
};

export type AuthorizedProvider = {
  providerId: string;
  ownerId: string;
  providerData: DocumentData;
};

export type AuthorizedPackage = {
  packageId: string;
  providerId: string;
  status: PackageStatus;
  packageData: DocumentData;
};

const MAX_PACKAGE_NAME_LENGTH = 120;
const MAX_PACKAGE_DESCRIPTION_LENGTH = 2000;
const MAX_IMAGE_URL_LENGTH = 2048;
const MAX_INCLUSION_LENGTH = 160;
const MAX_INCLUSIONS_PER_GROUP = 50;

const MAX_PACKAGE_PRICE = 10_000_000;
const MAX_GUEST_COUNT = 100_000;

export function authorizeProviderForPackageManagement(
  input: {
    actorUid: string;
    providerSnapshot: DocumentSnapshot<DocumentData>;
  },
): AuthorizedProvider {
  const {
    actorUid,
    providerSnapshot,
  } = input;

  if (!providerSnapshot.exists) {
    throw new HttpsError(
      "failed-precondition",
      "The provider account was not found.",
    );
  }

  const providerData =
    providerSnapshot.data() ?? {};

  const ownerId = stringValue(
    providerData.ownerId,
  );

  if (
    !ownerId ||
    ownerId !== actorUid
  ) {
    throw new HttpsError(
      "permission-denied",
      "You do not own this provider account.",
    );
  }

  if (
    !isApprovedProviderForOperations(
      providerData,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider account is not available for package management.",
    );
  }

  return {
    providerId: providerSnapshot.id,
    ownerId,
    providerData,
  };
}

export function authorizeOwnedPackage(
  input: {
    providerId: string;
    packageSnapshot: DocumentSnapshot<DocumentData>;
  },
): AuthorizedPackage {
  const {
    providerId,
    packageSnapshot,
  } = input;

  if (!packageSnapshot.exists) {
    throw new HttpsError(
      "not-found",
      "The package was not found.",
    );
  }

  const packageData =
    packageSnapshot.data() ?? {};

  const storedProviderId =
    stringValue(packageData.providerId);

  if (
    !storedProviderId ||
    storedProviderId !== providerId
  ) {
    throw new HttpsError(
      "permission-denied",
      "You do not own this package.",
    );
  }

  const status = parsePackageStatus(
    packageData.status,
  );

  if (!status) {
    throw new HttpsError(
      "failed-precondition",
      "The package status is invalid.",
    );
  }

  return {
    packageId: packageSnapshot.id,
    providerId: storedProviderId,
    status,
    packageData,
  };
}

export function assertPackageMatchesProviderCapabilities(
  providerData: Readonly<Record<string, unknown>>,
  packageInput: PackageInput,
): void {
  const providerServiceType =
    typeof providerData.providerServiceType === "string"
      ? providerData.providerServiceType.trim()
      : "";

  if (
    providerServiceType !== "catering" &&
    providerServiceType !== "both"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Only catering providers can manage catering packages.",
    );
  }

  const supportedEventTypes = Array.isArray(
    providerData.eventTypesSupported,
  )
    ? providerData.eventTypesSupported.filter(
        (value): value is string =>
          typeof value === "string",
      )
    : [];

  if (
    !supportedEventTypes.includes(
      packageInput.eventType,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This event type is not enabled for the provider.",
    );
  }

  const providerMinimumGuests =
    providerData.minGuestsPerEvent;

  const providerMaximumGuests =
    providerData.maxGuestsPerEvent;

  if (
    !Number.isSafeInteger(
      providerMinimumGuests,
    ) ||
    !Number.isSafeInteger(
      providerMaximumGuests,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider guest-capacity settings are invalid.",
    );
  }

  if (
    packageInput.minimumGuests <
      (providerMinimumGuests as number) ||
    packageInput.maximumGuests >
      (providerMaximumGuests as number)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Package guest capacity must stay within the provider's configured guest capacity.",
    );
  }
}

export function parsePackageInput(
  value: unknown,
): PackageInput {
  const data = recordValue(value);

  const name = requiredString(
    data.name,
    "Package name",
    2,
    MAX_PACKAGE_NAME_LENGTH,
  );

  const description = requiredString(
    data.description,
    "Package description",
    10,
    MAX_PACKAGE_DESCRIPTION_LENGTH,
  );

  const eventType = requiredEventType(
    data.eventType,
  );

  const price = requiredMoney(
    data.price,
    "Package price",
  );

  const downPaymentPercentage =
    requiredPercentage(
      data.downPaymentPercentage,
      "Down-payment percentage",
    );

  const minimumGuests =
    requiredPositiveInteger(
      data.minimumGuests,
      "Minimum guests",
    );

  const maximumGuests =
    requiredPositiveInteger(
      data.maximumGuests,
      "Maximum guests",
    );

  if (maximumGuests < minimumGuests) {
    throw new HttpsError(
      "invalid-argument",
      "Maximum guests cannot be lower than minimum guests.",
    );
  }

  if (
    minimumGuests > MAX_GUEST_COUNT ||
    maximumGuests > MAX_GUEST_COUNT
  ) {
    throw new HttpsError(
      "invalid-argument",
      `Guest capacity cannot exceed ${MAX_GUEST_COUNT}.`,
    );
  }

  const imageUrl = optionalString(
    data.imageUrl,
    "Package image URL",
    MAX_IMAGE_URL_LENGTH,
  );

  return {
    name,
    description,
    eventType,
    price,
    downPaymentPercentage,
    minimumGuests,
    maximumGuests,
    imageUrl,

    foodInclusions: inclusionArray(
      data.foodInclusions,
      "Food inclusions",
    ),

    decorInclusions: inclusionArray(
      data.decorInclusions,
      "Decoration inclusions",
    ),

    furnitureInclusions: inclusionArray(
      data.furnitureInclusions,
      "Furniture inclusions",
    ),

    serviceInclusions: inclusionArray(
      data.serviceInclusions,
      "Service inclusions",
    ),
  };
}

export function assertPackagePublishable(
  packageData: Readonly<Record<string, unknown>>,
): void {
  parsePackageInput(packageData);

  const hasAtLeastOneInclusion = [
    packageData.foodInclusions,
    packageData.decorInclusions,
    packageData.furnitureInclusions,
    packageData.serviceInclusions,
  ].some(
    (value) =>
      Array.isArray(value) &&
      value.length > 0,
  );

  if (!hasAtLeastOneInclusion) {
    throw new HttpsError(
      "failed-precondition",
      "Add at least one package inclusion before publishing.",
    );
  }
}

export function parsePackageStatus(
  value: unknown,
): PackageStatus | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim().toLowerCase();

  return (
    PACKAGE_STATUSES as readonly string[]
  ).includes(normalized) ?
    normalized as PackageStatus :
    null;
}

export function assertDraftPackage(
  packageRecord: AuthorizedPackage,
): void {
  if (packageRecord.status !== "draft") {
    throw new HttpsError(
      "failed-precondition",
      "Only draft packages can be edited using this operation.",
    );
  }
}

export function assertPublishedPackage(
  packageRecord: AuthorizedPackage,
): void {
  if (
    packageRecord.status !== "published"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Only published packages can be archived.",
    );
  }
}

function recordValue(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Package data is invalid.",
    );
  }

  return value as Record<string, unknown>;
}

function requiredString(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
): string {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${label} is required.`,
    );
  }

  const normalized = value.trim();

  if (
    normalized.length < minimumLength ||
    normalized.length > maximumLength
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${label} must be between ${minimumLength} and ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function optionalString(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "";
  }

  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${label} must be a string.`,
    );
  }

  const normalized = value.trim();

  if (normalized.length > maximumLength) {
    throw new HttpsError(
      "invalid-argument",
      `${label} is too long.`,
    );
  }

  return normalized;
}

function requiredEventType(
  value: unknown,
): string {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "Event type is required.",
    );
  }

  const normalized =
    value.trim().toLowerCase();

  if (
    !(
      PROVIDER_EVENT_TYPES as readonly string[]
    ).includes(normalized)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Event type is not supported.",
    );
  }

  return normalized;
}

function requiredMoney(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_PACKAGE_PRICE
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${label} is invalid.`,
    );
  }

  return normalizeMoney(value);
}

function normalizeMoney(
  value: number,
): number {
  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100;
}

function requiredPercentage(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${label} must be between 0 and 100.`,
    );
  }

  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100;
}

function requiredPositiveInteger(
  value: unknown,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${label} must be a positive whole number.`,
    );
  }

  return value as number;
}

function inclusionArray(
  value: unknown,
  label: string,
): readonly string[] {
  if (
    value === undefined ||
    value === null
  ) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpsError(
      "invalid-argument",
      `${label} must be a list.`,
    );
  }

  if (
    value.length >
    MAX_INCLUSIONS_PER_GROUP
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${label} contains too many items.`,
    );
  }

  const normalized = value.map(
    (item, index) => {
      if (typeof item !== "string") {
        throw new HttpsError(
          "invalid-argument",
          `${label} item ${index + 1} is invalid.`,
        );
      }

      const inclusion = item.trim();

      if (
        inclusion.length < 1 ||
        inclusion.length >
          MAX_INCLUSION_LENGTH
      ) {
        throw new HttpsError(
          "invalid-argument",
          `${label} item ${index + 1} must be between 1 and ${MAX_INCLUSION_LENGTH} characters.`,
        );
      }

      return inclusion;
    },
  );

  return [...new Set(normalized)];
}

function stringValue(
  value: unknown,
): string {
  return typeof value === "string" ?
    value.trim() :
    "";
}