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

export const PACKAGE_PAYMENT_POLICIES = [
  "full_payment",
  "deposit_then_balance",
] as const;

export type PackagePaymentPolicy =
  (typeof PACKAGE_PAYMENT_POLICIES)[number];

export type PackageInput = {
  name: string;
  description: string;
  eventType: string;
  price: number;

  paymentPolicy:
    PackagePaymentPolicy | null;

  depositPercentage: number;

  balanceDueDaysBeforeEvent:
    number | null;

  /*
   * Temporary compatibility projection.
   *
   * Existing booking/provider-request code still
   * consumes downPaymentPercentage. New package
   * writes derive it from canonical payment terms.
   */
  downPaymentPercentage: number;

  usesLegacyPaymentTerms: boolean;

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

const MIN_DEPOSIT_PERCENTAGE = 20;
const MAX_DEPOSIT_PERCENTAGE = 80;

const MIN_BALANCE_DUE_DAYS = 1;
const MAX_BALANCE_DUE_DAYS = 30;

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

  const paymentTerms =
    parsePackagePaymentTerms(
      data,
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
    price,

    ...paymentTerms,

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

export function assertCanonicalPackagePaymentTerms(
  packageInput: PackageInput,
): asserts packageInput is PackageInput & {
  paymentPolicy: PackagePaymentPolicy;
  usesLegacyPaymentTerms: false;
} {
  if (
    packageInput.usesLegacyPaymentTerms ||
    packageInput.paymentPolicy === null
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Choose Full Payment or Down Payment + Balance.",
    );
  }
}

export function assertPackagePublishable(
  packageData: Readonly<Record<string, unknown>>,
): void {
  parsePackageInput(packageData);

  // Structured inclusions are optional, including for image-based menus.

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

function parsePackagePaymentTerms(
  data: Readonly<Record<string, unknown>>,
): {
  paymentPolicy:
    PackagePaymentPolicy | null;
  depositPercentage: number;
  balanceDueDaysBeforeEvent:
    number | null;
  downPaymentPercentage: number;
  usesLegacyPaymentTerms: boolean;
} {
  /*
   * Existing package documents predate
   * paymentPolicy/depositPercentage.
   *
   * They remain readable and publishable until
   * edited, at which point current terms are
   * required and the package is migrated.
   */
  if (
    data.paymentPolicy === undefined ||
    data.paymentPolicy === null ||
    data.paymentPolicy === ""
  ) {
    const legacyPercentage =
      requiredPercentage(
        data.downPaymentPercentage,
        "Legacy down-payment percentage",
      );

    return {
      paymentPolicy: null,
      depositPercentage:
        legacyPercentage,
      balanceDueDaysBeforeEvent:
        null,
      downPaymentPercentage:
        legacyPercentage,
      usesLegacyPaymentTerms:
        true,
    };
  }

  const paymentPolicy =
    parsePackagePaymentPolicy(
      data.paymentPolicy,
    );

  if (!paymentPolicy) {
    throw new HttpsError(
      "invalid-argument",
      "Payment policy is invalid.",
    );
  }

  if (
    paymentPolicy ===
    "full_payment"
  ) {
    const depositPercentage =
      requiredPercentage(
        data.depositPercentage,
        "Full-payment percentage",
      );

    if (
      depositPercentage !== 100
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Full-payment packages must require 100%.",
      );
    }

    if (
      data.balanceDueDaysBeforeEvent !==
        undefined &&
      data.balanceDueDaysBeforeEvent !==
        null
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Full-payment packages cannot have a remaining-balance deadline.",
      );
    }

    if (
      data.downPaymentPercentage !==
        undefined &&
      data.downPaymentPercentage !==
        null
    ) {
      const compatibilityPercentage =
        requiredPercentage(
          data.downPaymentPercentage,
          "Down-payment compatibility percentage",
        );

      if (
        compatibilityPercentage !==
        100
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Full-payment compatibility percentage must be 100%.",
        );
      }
    }

    return {
      paymentPolicy,
      depositPercentage: 100,
      balanceDueDaysBeforeEvent:
        null,
      downPaymentPercentage:
        100,
      usesLegacyPaymentTerms:
        false,
    };
  }

  const depositPercentage =
    requiredPercentage(
      data.depositPercentage,
      "Deposit percentage",
    );

  if (
    depositPercentage <
      MIN_DEPOSIT_PERCENTAGE ||
    depositPercentage >
      MAX_DEPOSIT_PERCENTAGE
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Deposit percentage must be between " +
        `${MIN_DEPOSIT_PERCENTAGE} and ` +
        `${MAX_DEPOSIT_PERCENTAGE}.`,
    );
  }

  const balanceDueDaysBeforeEvent =
    requiredPositiveInteger(
      data.balanceDueDaysBeforeEvent,
      "Balance due days before event",
    );

  if (
    balanceDueDaysBeforeEvent <
      MIN_BALANCE_DUE_DAYS ||
    balanceDueDaysBeforeEvent >
      MAX_BALANCE_DUE_DAYS
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Balance deadline must be between " +
        `${MIN_BALANCE_DUE_DAYS} and ` +
        `${MAX_BALANCE_DUE_DAYS} days before the event.`,
    );
  }

  if (
    data.downPaymentPercentage !==
      undefined &&
    data.downPaymentPercentage !==
      null
  ) {
    const compatibilityPercentage =
      requiredPercentage(
        data.downPaymentPercentage,
        "Down-payment compatibility percentage",
      );

    if (
      compatibilityPercentage !==
      depositPercentage
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Payment percentages do not match.",
      );
    }
  }

  return {
    paymentPolicy,
    depositPercentage,
    balanceDueDaysBeforeEvent,
    downPaymentPercentage:
      depositPercentage,
    usesLegacyPaymentTerms:
      false,
  };
}

function parsePackagePaymentPolicy(
  value: unknown,
): PackagePaymentPolicy | null {
  if (
    value === "full_payment" ||
    value ===
      "deposit_then_balance"
  ) {
    return value;
  }

  return null;
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
  const retained = new Set([
    ...(Array.isArray(previous.imageUrls) ? previous.imageUrls : []),
    previous.imageUrl,
  ]);
  const images = input.imageUrls ?? (input.imageUrl ? [input.imageUrl] : []);
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
