import {HttpsError} from "firebase-functions/v2/https";
import {resolveOfferV2} from "../packages/offer-v2-validation.js";
import {isLegacyOccasionPackage} from "../packages/legacy-occasion-publication-guard.js";

import {
  validateBookingPackage,
} from "./booking-contract.js";

import {
  parseBookingPackageOfferInput,
  resolveBookingPackageOffer,
  type ResolvedBookingPackageOffer,
} from "./booking-package-offer.js";

import {
  parseFoodChoiceSelections,
  resolveFoodChoiceSelections,
} from "./food-choice-selection.js";

import type {
  MultiProviderSubmissionEntry,
} from "./multi-provider-submission-contract.js";

/**
 * Task 3 — partial authoritative package resolution.
 *
 * The caller MUST supply a freshly read package document from
 * the trusted booking transaction.
 *
 * verifiedV2 MUST come from the existing server-side
 * requireCustomerPackageV2 admission guard, never the client.
 *
 * This result is NOT a booking admission decision.
 * Availability, provider identity/verification, add-ons,
 * selections outside the V2 food/tier/theme model,
 * financial policy, and acknowledgements remain mandatory.
 */

type TrustedPackageInput = {
  entry: MultiProviderSubmissionEntry;
  packageData: Readonly<Record<string, unknown>>;
  eventType: string;
  guestCount: number;
  verifiedV2: boolean;
};

export type ResolvedMultiProviderPackageCore = {
  providerId: string;
  packageId: string;
  packageName: string;
  verifiedV2: boolean;
  expectedPackageRevision: number | null;
  basePrice: number;
  offer: ResolvedBookingPackageOffer["selection"];
  foodChoices: ReturnType<typeof resolveFoodChoiceSelections>;
};

function reject(
  message: string,
  code: "invalid-argument" | "failed-precondition" | "aborted" =
    "failed-precondition",
): never {
  throw new HttpsError(code, message);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return reject("Saved package configuration is invalid.", "invalid-argument");
  }

  return value as Record<string, unknown>;
}

function configurationRecord(
  entry: MultiProviderSubmissionEntry,
): Record<string, unknown> {
  return asRecord(entry.configuration);
}

function readMetadata(
  configuration: Record<string, unknown>,
): {
  sharedContractVersion: number | null;
  expectedPackageRevision: number | null;
} {
  const version = configuration.sharedContractVersion;
  const revision = configuration.expectedPackageRevision;

  const hasVersion = version !== undefined && version !== null;
  const hasRevision = revision !== undefined && revision !== null;

  if (hasVersion !== hasRevision) {
    return reject(
      "Package version and revision must be supplied together.",
      "invalid-argument",
    );
  }

  if (!hasVersion) {
    return {
      sharedContractVersion: null,
      expectedPackageRevision: null,
    };
  }

  if (
    version !== 2 ||
    typeof revision !== "number" ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  ) {
    return reject("Invalid package revision.", "invalid-argument");
  }

  return {
    sharedContractVersion: 2,
    expectedPackageRevision: revision,
  };
}

/**
 * Parse saved selection strings without trusting the Event List.
 * The list bounds match the current Web and Mobile models.
 */
function savedSelectionList(
  value: unknown,
  field: string,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 50
  ) {
    return reject(`${field} is invalid.`, "invalid-argument");
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    if (
      typeof item !== "string" ||
      item.length > 160 ||
      item.trim().length === 0
    ) {
      return reject(`${field} is invalid.`, "invalid-argument");
    }

    const selected = item.trim();

    if (seen.has(selected)) {
      return reject(`${field} contains duplicates.`, "invalid-argument");
    }

    seen.add(selected);
    result.push(selected);
  }

  return result;
}

/**
 * Match FEASTA's existing validatePackageSelections logic:
 * every chosen item must exist in the current stored list.
 */
function validateStoredSelectionList(
  selections: readonly string[],
  storedValues: unknown,
  field: string,
): void {
  if (selections.length === 0) {
    return;
  }

  if (!Array.isArray(storedValues)) {
    return reject("Package customization options are unavailable.");
  }

  const allowedValues = new Set(
    storedValues.flatMap((value: unknown) => {
      if (typeof value !== "string") {
        return [];
      }

      const normalized = value.trim();
      return normalized ? [normalized] : [];
    }),
  );

  if (selections.some((value) => !allowedValues.has(value))) {
    return reject(
      `${field} contains an unavailable package option.`,
      "invalid-argument",
    );
  }
}

/**
 * Add-on prices and other providers require separate server-side
 * validation. Until that exists, fail closed rather than silently
 * ignoring selections from either customer platform.
 */
function rejectUnsupportedServiceSelections(
  configuration: Readonly<Record<string, unknown>>,
): void {
  for (const field of ["selectedEventServices", "selectedAddOns"]) {
    const value = configuration[field];

    if (value === undefined || value === null) {
      continue;
    }

    if (!Array.isArray(value)) {
      return reject(`${field} is invalid.`, "invalid-argument");
    }

    if (value.length > 0) {
      return reject(
        "Add-on services need updated booking validation.",
      );
    }
  }
}

/**
 * Resolve only the core package selection against trusted data.
 *
 * IMPORTANT: Do not use this result alone to authorize Firestore
 * writes or to calculate a complete customer payment obligation.
 */
export function resolveMultiProviderPackageCore(
  input: TrustedPackageInput,
): ResolvedMultiProviderPackageCore {
  const {
    entry,
    packageData,
    eventType,
    guestCount,
    verifiedV2,
  } = input;

  const configuration = configurationRecord(entry);
  const metadata = readMetadata(configuration);

  if (
    !Number.isSafeInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > 10000
  ) {
    return reject("Invalid guest count.", "invalid-argument");
  }

  // The caller must establish V2 eligibility with
  // requireCustomerPackageV2 inside the same trusted transaction.
  const storedV2 = packageData.occasionSchemaVersion === 2;

  if (storedV2) {
    if (
      !verifiedV2 ||
      metadata.sharedContractVersion !== 2 ||
      metadata.expectedPackageRevision === null
    ) {
      return reject("Verified package metadata is required.");
    }

    if (packageData.revision !== metadata.expectedPackageRevision) {
      return reject(
        "Package changed. Reload your selections.",
        "aborted",
      );
    }
  } else if (
    verifiedV2 ||
    metadata.sharedContractVersion !== null
  ) {
    return reject("Package version is incompatible.");
  }

  // Preserve the existing booking function's legacy admission rule.
  // A non-V2 package is not automatically eligible for booking.
  if (!verifiedV2 && !isLegacyOccasionPackage(packageData)) {
    return reject(
      "This package needs verified occasion compatibility before booking.",
    );
  }

  const validation = validateBookingPackage({
    packageData,
    expectedProviderId: entry.providerId,
    submittedEventType: eventType,
    guestCount,
    verifiedV2,
  });

  if (!validation.valid) {
    return reject(
      `Package cannot be booked: ${validation.code}.`,
    );
  }

  const {serviceTier, packageThemeId} =
    parseBookingPackageOfferInput(configuration);

  const selectedFoods = savedSelectionList(
    configuration.selectedFoods,
    "selectedFoods",
  );

  const selectedDecorations = savedSelectionList(
    configuration.selectedDecorations,
    "selectedDecorations",
  );

  const selectedFurniture = savedSelectionList(
    configuration.selectedFurniture,
    "selectedFurniture",
  );

  rejectUnsupportedServiceSelections(configuration);

  validateStoredSelectionList(
    selectedFoods,
    packageData.foodInclusions,
    "selectedFoods",
  );

  const tierInclusions = verifiedV2 ?
    resolveOfferV2(
      Object.fromEntries(
        [
          "offerSchemaVersion",
          "serviceOptions",
          "serviceInclusions",
          "decorInclusions",
          "furnitureInclusions",
          "foodInclusions",
          "price",
          "equipmentInclusions",
          "pricingModel",
          "foodChoiceGroups",
        ]
          .filter((key) => Object.hasOwn(packageData, key))
          .map((key) => [key, packageData[key]]),
      ),
      serviceTier,
    ) :
    null;

  validateStoredSelectionList(
    selectedDecorations,
    tierInclusions?.decorInclusions ?? packageData.decorInclusions,
    "selectedDecorations",
  );

  validateStoredSelectionList(
    selectedFurniture,
    tierInclusions?.furnitureInclusions ?? packageData.furnitureInclusions,
    "selectedFurniture",
  );

  const foodSelections = parseFoodChoiceSelections(
    configuration.foodChoiceSelections,
  );

  // The current package, not the saved Event List, determines
  // allowed food groups and customer-selectable options.
  const foodChoices = resolveFoodChoiceSelections(
    packageData,
    foodSelections,
  );

  // The current package, not client estimates, determines
  // the tier/theme offer and base price.
  const resolved = resolveBookingPackageOffer({
    packageData,
    guestCount,
    serviceTier,
    packageThemeId,
  });

  if (
    !Number.isFinite(resolved.basePrice) ||
    resolved.basePrice < 0
  ) {
    return reject("Authoritative package price is invalid.");
  }

  const packageName = packageData.name;

  if (
    typeof packageName !== "string" ||
    packageName.trim().length === 0
  ) {
    return reject("Package name is invalid.");
  }

  return {
    providerId: entry.providerId,
    packageId: entry.packageId,
    packageName: packageName.trim(),
    verifiedV2,
    expectedPackageRevision:
      metadata.expectedPackageRevision,
    basePrice: resolved.basePrice,
    offer: resolved.selection,
    foodChoices,
  };
}