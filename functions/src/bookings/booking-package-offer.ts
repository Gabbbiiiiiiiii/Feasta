import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  CATERING_PACKAGE_SERVICE_TIERS,
  type CateringPackageServiceTier,
} from "../packages/package-domain.js";

const THEME_ID = /^[A-Za-z0-9_-]{2,80}$/u;
const MAX_INCLUDED_SERVICES = 50;
const MAX_INCLUDED_SERVICE_LENGTH = 160;
const MAX_THEME_DESCRIPTION_LENGTH = 500;
const MAX_THEME_IMAGES = 4;
const MAX_THEME_IMAGE_URL_LENGTH = 2048;
const MAX_PACKAGE_PRICE = 10_000_000;

const CLIENT_FINANCIAL_AUTHORITY_FIELDS = [
  "financialSnapshot", "grossAmountInCentavos", "requiredUpfrontAmountInCentavos", "remainingBalanceInCentavos",
  "customerRefundRateBps", "depositEligible", "agreementKey", "agreedAt",
  "submissionTime",
  "remainingBalanceTimingSchemaVersion",
  "bookingLifecyclePolicySnapshot",
  "lifecycleNextTransitionAt",
  "remainingBalanceNextCheckAt",
  "remainingBalanceEnforcement",
  "remainingBalanceEnforcementSchemaVersion",
  "submittedAt",
  "evaluatedAt",
  "authorityTimeSource",
  "agreementSchemaVersion",
  "bookingPaymentAgreement",
  "customerDefaultRefundRateBps",
  "providerReservationCompRateBps",
  "feastaCancellationFeeRateBps",
  "hardPaymentDeadlineAt",
  "preparationStartsAt",
  "depositEligibilityCutoffAt",
  "remainingBalanceDueAt",
  "eventStartAt",
  "paymentDefaultAllocation",
  "remainingCollectibleAmountInCentavos",
  "customerDefaultRefundAmountInCentavos",
  "providerReservationCompAmountInCentavos",
  "feastaCancellationFeeAmountInCentavos",
  "bookingPaymentPolicySnapshot",
  "bookingPolicySnapshot",
  "serviceBookingPolicy",
  "depositAllowed",
  "depositMinimumNoticeHours",
  "initialPaymentEligibilitySchemaVersion",
  "initialPaymentEligibility",
  "tierPrice",
  "servicePrice",
  "displayedServicePrice",
  "clientPrice",
  "packagePrice",
  "subtotal",
  "total",
  "totalAmount",
  "bookingTotal",
  "estimatedEventTotal",
  "depositAmount",
  "downPaymentAmount",
  "remainingBalance",
  "downPaymentPercentage",
  "paymentPercentage",
  "depositPercentage",
  "addonPrice",
  "addOnPrice",
  "packageThemePrice",
  "themePrice",
] as const;

const SERVICE_TIER_LABELS: Record<
  CateringPackageServiceTier,
  string
> = {
  drop_off: "Drop-Off Catering",
  buffet_setup: "Buffet Setup",
  full_service: "Full-Service Catering",
};

export type BookingPackageOfferSelection = {
  serviceTier: CateringPackageServiceTier | null;
  serviceTierLabel: string | null;
  serviceTierIncludedServices: string[];
  packageThemeId: string | null;
  packageThemeName: string | null;
  packageThemeDescription: string | null;
  packageThemeImageUrls: string[];
};

export type ResolvedBookingPackageOffer = {
  basePrice: number;
  selection: BookingPackageOfferSelection;
};

type StoredServiceOption = {
  price: number;
  includedServices: string[];
};

type StoredTheme = {
  id: string;
  name: string;
  description: string;
  imageUrls: string[];
};

/**
 * Rejects browser prices and totals. Package, tier, add-on, and
 * payment amounts are read from trusted records later.
 */
export function rejectClientBookingFinancialAuthority(
  input: Readonly<Record<string, unknown>>,
): void {
  for (const field of CLIENT_FINANCIAL_AUTHORITY_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(
        input,
        field,
      ) &&
      input[field] != null
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Booking prices must be calculated by FEASTA.",
      );
    }
  }
}

export function parseBookingPackageOfferInput(
  input: Readonly<Record<string, unknown>>,
): {
  serviceTier: CateringPackageServiceTier | null;
  packageThemeId: string | null;
} {
  return {
    serviceTier: parseServiceTier(
      input.serviceTier,
    ),
    packageThemeId: parsePackageThemeId(
      input.packageThemeId,
    ),
  };
}

/**
 * Stable ids only. Omitted when absent so legacy fingerprints stay stable.
 * Client prices are never part of this material.
 */
export function bookingOfferFingerprintFields(
  input: {
    serviceTier: CateringPackageServiceTier | null;
    packageThemeId: string | null;
  },
): {
  serviceTier?: CateringPackageServiceTier;
  packageThemeId?: string;
} {
  return {
    ...(input.serviceTier ?
      {serviceTier: input.serviceTier} :
      {}),
    ...(input.packageThemeId ?
      {packageThemeId: input.packageThemeId} :
      {}),
  };
}

/**
 * Re-reads the current package. Tier and theme prices from the
 * browser are not accepted by this function.
 */
export function resolveBookingPackageOffer(
  input: {
    packageData: Readonly<Record<string, unknown>>;
    serviceTier: CateringPackageServiceTier | null;
    packageThemeId: string | null;
  },
): ResolvedBookingPackageOffer {
  const enabledOptions =
    readEnabledServiceOptions(
      input.packageData.serviceOptions,
    );

  if (!enabledOptions) {
    if (input.serviceTier) {
      throw new HttpsError(
        "failed-precondition",
        "This package does not currently support the selected catering service option.",
      );
    }

    return {
      basePrice: requireStoredMoney(
        input.packageData.price,
        "Package price",
      ),
      selection: selectionSnapshot(
        null,
        [],
        resolveTheme(
          input.packageData.themeOptions,
          null,
          input.packageThemeId,
        ),
      ),
    };
  }

  if (!input.serviceTier) {
    throw new HttpsError(
      "invalid-argument",
      "Choose a catering service option.",
    );
  }

  const selectedOption =
    enabledOptions.get(input.serviceTier);

  if (!selectedOption) {
    throw new HttpsError(
      "failed-precondition",
      "The selected catering service option is no longer available.",
    );
  }

  return {
    basePrice: selectedOption.price,
    selection: selectionSnapshot(
      input.serviceTier,
      selectedOption.includedServices,
      resolveTheme(
        input.packageData.themeOptions,
        input.serviceTier,
        input.packageThemeId,
      ),
    ),
  };
}

function parseServiceTier(
  value: unknown,
): CateringPackageServiceTier | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "string" &&
    (
      CATERING_PACKAGE_SERVICE_TIERS as
        readonly string[]
    ).includes(value)
  ) {
    return value as CateringPackageServiceTier;
  }

  throw new HttpsError(
    "invalid-argument",
    "Catering service option is invalid.",
  );
}

function parsePackageThemeId(
  value: unknown,
): string | null {
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
      "Package theme is invalid.",
    );
  }

  const normalized = value.trim();

  if (!THEME_ID.test(normalized)) {
    throw new HttpsError(
      "invalid-argument",
      "Package theme is invalid.",
    );
  }

  return normalized;
}

function readEnabledServiceOptions(
  value: unknown,
): Map<
  CateringPackageServiceTier,
  StoredServiceOption
> | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Package service options are invalid.",
    );
  }

  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);

  if (keys.length === 0) {
    return null;
  }

  const allowed = new Set<string>(
    CATERING_PACKAGE_SERVICE_TIERS,
  );

  if (keys.some((key) => !allowed.has(key))) {
    throw new HttpsError(
      "failed-precondition",
      "Package service options are invalid.",
    );
  }

  const enabled = new Map<
    CateringPackageServiceTier,
    StoredServiceOption
  >();

  for (const tier of CATERING_PACKAGE_SERVICE_TIERS) {
    if (!Object.prototype.hasOwnProperty.call(data, tier)) {
      continue;
    }

    const option = readStoredServiceOption(
      data[tier],
    );

    if (!option) {
      throw new HttpsError(
        "failed-precondition",
        "Package service options are invalid.",
      );
    }

    enabled.set(tier, option);
  }

  if (enabled.size === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Package service options are invalid.",
    );
  }

  return enabled;
}

function readStoredServiceOption(
  value: unknown,
): StoredServiceOption | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const option = value as Record<string, unknown>;

  if (!isStoredMoney(option.price)) {
    return null;
  }

  return {
    price: roundCurrency(option.price),
    includedServices: readIncludedServices(
      option.includedServices,
    ),
  };
}

function readIncludedServices(
  value: unknown,
): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (
    !Array.isArray(value) ||
    value.length > MAX_INCLUDED_SERVICES
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Package service options are invalid.",
    );
  }

  return value.map((item) => {
    if (
      typeof item !== "string" ||
      item.trim().length === 0 ||
      item.trim().length > MAX_INCLUDED_SERVICE_LENGTH
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Package service options are invalid.",
      );
    }

    return item.trim();
  });
}

function resolveTheme(
  storedThemes: unknown,
  serviceTier: CateringPackageServiceTier | null,
  packageThemeId: string | null,
): StoredTheme | null {
  const themesApplicable =
    serviceTier === "buffet_setup" ||
    serviceTier === "full_service";

  if (!themesApplicable) {
    if (packageThemeId) {
      throw new HttpsError(
        "failed-precondition",
        serviceTier === "drop_off" ?
          "Package themes are not available for Drop-Off Catering." :
          "Package themes are not available for this package.",
      );
    }

    return null;
  }

  if (!packageThemeId) {
    return null;
  }

  const themes = readStoredThemes(storedThemes);
  const matches = themes.filter(
    (theme) => theme.id === packageThemeId,
  );

  if (matches.length !== 1) {
    throw new HttpsError(
      "failed-precondition",
      "The selected package theme is no longer available.",
    );
  }

  return matches[0] ?? null;
}

function readStoredThemes(
  value: unknown,
): StoredTheme[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpsError(
      "failed-precondition",
      "Package themes are invalid.",
    );
  }

  return value.flatMap((candidate) => {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return [];
    }

    const theme = candidate as Record<string, unknown>;
    const id = typeof theme.id === "string" ?
      theme.id.trim() :
      "";
    const name = typeof theme.name === "string" ?
      theme.name.trim() :
      "";

    if (
      !THEME_ID.test(id) ||
      name.length < 2 ||
      name.length > 80
    ) {
      return [];
    }

    const description =
      typeof theme.description === "string" ?
        theme.description
          .trim()
          .slice(0, MAX_THEME_DESCRIPTION_LENGTH) :
        "";

    return [{
      id,
      name,
      description,
      imageUrls: readThemeImageUrls(
        theme.imageUrls,
      ),
    }];
  });
}

function readThemeImageUrls(
  value: unknown,
): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string =>
      typeof item === "string" &&
      item.trim().length > 0 &&
      item.trim().length <= MAX_THEME_IMAGE_URL_LENGTH,
    )
    .slice(0, MAX_THEME_IMAGES)
    .map((item) => item.trim());
}

function selectionSnapshot(
  serviceTier: CateringPackageServiceTier | null,
  includedServices: readonly string[],
  theme: StoredTheme | null,
): BookingPackageOfferSelection {
  return {
    serviceTier,
    serviceTierLabel: serviceTier ?
      SERVICE_TIER_LABELS[serviceTier] :
      null,
    serviceTierIncludedServices: [
      ...includedServices,
    ],
    packageThemeId: theme?.id ?? null,
    packageThemeName: theme?.name ?? null,
    packageThemeDescription:
      theme?.description ?? null,
    packageThemeImageUrls: theme ?
      [...theme.imageUrls] :
      [],
  };
}

function requireStoredMoney(
  value: unknown,
  label: string,
): number {
  if (!isStoredMoney(value)) {
    throw new HttpsError(
      "failed-precondition",
      `${label} is invalid.`,
    );
  }

  return roundCurrency(value);
}

function isStoredMoney(
  value: unknown,
): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_PACKAGE_PRICE;
}

function roundCurrency(
  value: number,
): number {
  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100;
}
