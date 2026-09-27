import {verifyProviderServiceImage} from "../shared/cloudinary.js";
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

export const CATERING_PACKAGE_SERVICE_TIERS = [
  "drop_off",
  "buffet_setup",
  "full_service",
] as const;

export type CateringPackageServiceTier =
  (typeof CATERING_PACKAGE_SERVICE_TIERS)[number];
export type PackageServiceOption = {
  price: number;
  includedServices: readonly string[];
};

export type PackageServiceOptions =
  Partial<
    Record<
      CateringPackageServiceTier,
      PackageServiceOption
    >
  >;

export type PackageThemeOption = {
  id: string;
  name: string;
  description: string;
  imageUrls: string[];
};

export type PackageInput = {
  name: string;
  description: string;
  eventType: string;
  serviceTier: CateringPackageServiceTier | null;
  serviceOptions: PackageServiceOptions;
  themeOptions: readonly PackageThemeOption[];
  price: number;
  downPaymentPercentage: number;
  minimumGuests: number;
  maximumGuests: number;
  imageUrl: string;
  imageUrls?: readonly string[];
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

  const serviceTier =
    optionalPackageServiceTier(
      data.serviceTier,
    );
  const serviceOptions =
    parsePackageServiceOptions(
      data.serviceOptions,
    );

  const themeOptions =
    parsePackageThemeOptions(
      data.themeOptions,
    );

  const price = requiredMoney(
    data.price,
    "Package price",
  );
  const serviceOptionPrices =
    Object.values(serviceOptions)
      .map((option) => option?.price)
      .filter(
        (value): value is number =>
          typeof value === "number",
      );

  if (serviceOptionPrices.length > 0) {
    const startingPrice =
      Math.min(...serviceOptionPrices);

    if (
      Math.abs(price - startingPrice) >
        0.009
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Package price must equal the lowest enabled service option price.",
      );
    }

    if (
      serviceTier &&
      !serviceOptions[serviceTier]
    ) {
      throw new HttpsError(
        "invalid-argument",
        "The compatibility service tier must also be enabled in the package service options.",
      );
    }

    const supportsThemes =
      serviceOptions.buffet_setup !==
        undefined ||
      serviceOptions.full_service !==
        undefined;

    if (
      themeOptions.length > 0 &&
      !supportsThemes
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Theme options require Buffet Setup or Full-Service Catering.",
      );
    }
  }

  const downPaymentPercentage =
    requiredFullPaymentPercentage(
      data.downPaymentPercentage,
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

  const imageUrls = parsePackageImageUrls(data.imageUrls);

  return {
    name,
    description,
    eventType,
    serviceTier,
    serviceOptions,
    themeOptions,
    price,
    downPaymentPercentage,
    minimumGuests,
    maximumGuests,
    imageUrl: imageUrls ? imageUrls[0] ?? "" : imageUrl,
    ...(imageUrls !== undefined ? {imageUrls} : {}),

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

  // Structured inclusions are optional, including for image-based menus.

}

function parsePackageServiceOptions(
  value: unknown,
): PackageServiceOptions {
  if (
    value === undefined ||
    value === null
  ) {
    return {};
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Package service options are invalid.",
    );
  }

  const data =
    value as Record<string, unknown>;

  const allowed =
    new Set<string>(
      CATERING_PACKAGE_SERVICE_TIERS,
    );

  if (
    Object.keys(data).some(
      (key) => !allowed.has(key),
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Package service options contain an unsupported service type.",
    );
  }

  const result: PackageServiceOptions = {};

  for (
    const tier of
      CATERING_PACKAGE_SERVICE_TIERS
  ) {
    const raw = data[tier];

    if (raw === undefined) {
      continue;
    }

    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {
      throw new HttpsError(
        "invalid-argument",
        `${tier} service option is invalid.`,
      );
    }

    const option =
      raw as Record<string, unknown>;

    if (
      Object.keys(option).some(
        (key) =>
          key !== "price" &&
          key !== "includedServices",
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        `${tier} service option contains unsupported fields.`,
      );
    }

    result[tier] = {
      price: requiredMoney(
        option.price,
        `${tier} price`,
      ),
      includedServices:
        serviceOptionInclusionArray(
          option.includedServices,
          `${tier} included services`,
        ),
    };
  }

  return result;
}

function parsePackageThemeOptions(
  value: unknown,
): PackageThemeOption[] {
  if (
    value === undefined ||
    value === null
  ) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    value.length > 12
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Package theme options are invalid.",
    );
  }

  return value.map(
    (raw, index) => {
      if (
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw)
      ) {
        throw new HttpsError(
          "invalid-argument",
          `Theme option ${index + 1} is invalid.`,
        );
      }

      const theme =
        raw as Record<string, unknown>;

      /*
       * Legacy fields remain accepted so existing package documents
       * can still be parsed/published during migration, but they are
       * deliberately ignored and are not returned in new writes.
       */
      const allowed =
        new Set([
          "id",
          "name",
          "description",
          "imageUrls",
          "furnitureInclusions",
          "setupInclusions",
          "additionalPrice",
        ]);

      if (
        Object.keys(theme).some(
          (key) => !allowed.has(key),
        )
      ) {
        throw new HttpsError(
          "invalid-argument",
          `Theme option ${index + 1} contains unsupported fields.`,
        );
      }

      const id =
        requiredString(
          theme.id,
          `Theme option ${index + 1} ID`,
          2,
          80,
        );

      if (
        !/^[A-Za-z0-9_-]+$/u.test(id)
      ) {
        throw new HttpsError(
          "invalid-argument",
          `Theme option ${index + 1} ID is invalid.`,
        );
      }

      const name =
        requiredString(
          theme.name,
          `Theme option ${index + 1} name`,
          2,
          80,
        );

      const description =
        typeof theme.description ===
          "string"
          ? theme.description
              .trim()
              .replace(/\s+/gu, " ")
          : "";

      if (description.length > 500) {
        throw new HttpsError(
          "invalid-argument",
          `${name} description cannot exceed 500 characters.`,
        );
      }

      const imageUrls = parsePackageImageUrls(theme.imageUrls) ?? [];

      if (imageUrls.length !== 0 && (imageUrls.length < 3 || imageUrls.length > 4)) {
        throw new HttpsError("invalid-argument", `${name} must have 3 to 4 reference photos.`);
      }

      return {
        id,
        name,
        description,
        imageUrls,
      };
    },
  );
}
function optionalPackageServiceTier(
  value: unknown,
): CateringPackageServiceTier | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "Catering service level is invalid.",
    );
  }

  const normalized =
    value.trim().toLowerCase();

  if (
    !(
      CATERING_PACKAGE_SERVICE_TIERS as
        readonly string[]
    ).includes(normalized)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Choose Drop-Off, Buffet Setup, or Full-Service Catering.",
    );
  }

  return normalized as CateringPackageServiceTier;
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

export function assertEditablePackage(
  packageRecord: AuthorizedPackage,
): void {
  if (
    packageRecord.status !== "draft" &&
    packageRecord.status !== "published"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Only draft or published packages can be edited.",
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


function requiredFullPaymentPercentage(
  value: unknown,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value !== 100
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Full payment must be exactly 100%.",
    );
  }

  return 100;
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

function serviceOptionInclusionArray(
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

  let totalCharacters = 0;

  const normalized = value.map(
    (item, index) => {
      if (typeof item !== "string") {
        throw new HttpsError(
          "invalid-argument",
          `${label} item ${index + 1} is invalid.`,
        );
      }

      const inclusion = item.trim();

      if (inclusion.length < 1) {
        throw new HttpsError(
          "invalid-argument",
          `${label} item ${index + 1} cannot be empty.`,
        );
      }

      totalCharacters += inclusion.length;

      if (totalCharacters > 10_000) {
        throw new HttpsError(
          "invalid-argument",
          `${label} is too long.`,
        );
      }

      return inclusion;
    },
  );

  return [...new Set(normalized)];
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
export function parsePackageImageUrls(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) {
    throw new HttpsError("invalid-argument", "Choose at most 8 package images.");
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.length > MAX_IMAGE_URL_LENGTH) {
      throw new HttpsError("invalid-argument", "Invalid package image.");
    }
    try {
      const url = new URL(entry);
      if (url.protocol !== "https:" || url.username || url.password ||
        url.port || url.search || url.hash) {
        throw new Error();
      }
      return url.toString();
    } catch { throw new HttpsError("invalid-argument", "Invalid package image URL."); }
  });
}

export async function verifyPackageImages(
  input: PackageInput,
  ownerId: string,
  previous: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  const previousVisualStyleImages = Array.isArray(previous.themeOptions)
    ? previous.themeOptions.flatMap((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
        const record = raw as Record<string, unknown>;
        return Array.isArray(record.imageUrls)
          ? record.imageUrls.filter((url): url is string => typeof url === "string")
          : [];
      })
    : [];

  const retained = new Set([
    ...(Array.isArray(previous.imageUrls) ? previous.imageUrls : []),
    previous.imageUrl,
    ...previousVisualStyleImages,
  ]);
  const images = [
    ...(input.imageUrls ?? (input.imageUrl ? [input.imageUrl] : [])),
    ...input.themeOptions.flatMap((style) => style.imageUrls),
  ];
  await Promise.all(images.map(async (url) => {
    if (retained.has(url)) return;
    // Legacy callers must pass the same checks for newly supplied assets.
    parsePackageImageUrls([url]);
    const pathname = new URL(url).pathname;
    const match = pathname.match(
      /\/feasta\/providers\/([^/]+)\/services\/([^/]+)\/image(?:\.[a-z]+)?$/u,
    );
    if (new URL(url).hostname !== "res.cloudinary.com" || !match || match[1] !== ownerId) {
      throw new HttpsError("permission-denied", "Package images must belong to this provider.");
    }
    await verifyProviderServiceImage({ownerId, serviceId: match[2]!, url,
      publicId: "feasta/providers/" + ownerId + "/services/" + match[2] + "/image",
      maximumBytes: 5 * 1024 * 1024});
  }));
}
