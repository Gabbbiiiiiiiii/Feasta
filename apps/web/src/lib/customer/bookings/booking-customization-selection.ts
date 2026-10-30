import {
  CATERING_PACKAGE_SERVICE_TIERS,
  cateringPackageServiceTierLabel,
  normalizeCateringPackageServiceTier,
  type CateringPackageServiceTier,
} from "@/lib/catering/catering-service-tier";
import type {
  PackageServiceOptions,
  PackageThemeOption,
} from "@/lib/catering/package-offer-configuration";

const STABLE_ID = /^[A-Za-z0-9_-]{2,80}$/u;
const MAX_INSPIRATION_NOTES = 1000;

const UNTRUSTED_BOOKING_FIELDS = [
  "themeInspiration",
  "referenceSetupId",
  "servicePrice",
  "displayedServicePrice",
  "tierPrice",
  "clientPrice",
  "packagePrice",
  "subtotal",
  "totalAmount",
  "downPaymentAmount",
  "remainingBalance",
  "downPaymentPercentage",
] as const;

export type BookingThemeInspiration = {
  notes: string;
  referenceSetupId: string | null;
};

export type BookingCustomizationPackageSource = {
  serviceOptions?: PackageServiceOptions;
  themeOptions?: readonly PackageThemeOption[];
};

export type ReconciledBookingCustomization = {
  serviceTier: CateringPackageServiceTier | null;
  packageThemeId: string | null;
  themeInspiration: BookingThemeInspiration;
  availableTiers: readonly CateringPackageServiceTier[];
  availableThemes: readonly PackageThemeOption[];
  themesApplicable: boolean;
  displayedServicePrice: number | null;
};

export function emptyBookingThemeInspiration(): BookingThemeInspiration {
  return {
    notes: "",
    referenceSetupId: null,
  };
}

/** Drops a local setup reference that is not in the currently loaded published gallery. */
export function clearStaleSetupReference(
  inspiration: BookingThemeInspiration,
  publishedSetupIds: readonly string[],
): BookingThemeInspiration {
  if (!inspiration.referenceSetupId || publishedSetupIds.includes(inspiration.referenceSetupId)) {
    return inspiration;
  }
  return {...inspiration, referenceSetupId: null};
}

export function bookingCustomizationSupportsThemes(
  serviceTier: CateringPackageServiceTier | null,
): boolean {
  return serviceTier === "buffet_setup" || serviceTier === "full_service";
}

export function availablePackageServiceTiers(
  serviceOptions: PackageServiceOptions | undefined,
): CateringPackageServiceTier[] {
  if (!serviceOptions) {
    return [];
  }

  return CATERING_PACKAGE_SERVICE_TIERS.filter(
    (tier) => serviceOptions[tier] !== undefined,
  );
}

/**
 * Client customization only. Event List snapshots are ignored so a saved
 * price or tier cannot select an option the current package does not offer.
 */
export function reconcileBookingCustomization(input: {
  packageSource: BookingCustomizationPackageSource;
  serviceTier: unknown;
  packageThemeId: unknown;
  themeInspiration?: unknown;
  eventListSnapshot?: unknown;
}): ReconciledBookingCustomization {
  const availableTiers = availablePackageServiceTiers(
    input.packageSource.serviceOptions,
  );
  const availableThemes = input.packageSource.themeOptions ?? [];
  const requestedTier = normalizeCateringPackageServiceTier(input.serviceTier);
  const serviceTier = requestedTier && availableTiers.includes(requestedTier)
    ? requestedTier
    : null;
  const themesApplicable = bookingCustomizationSupportsThemes(serviceTier) &&
    availableThemes.length > 0;
  const requestedThemeId = typeof input.packageThemeId === "string"
    ? input.packageThemeId
    : null;
  const selectedTheme = themesApplicable
    ? availableThemes.find((theme) => theme.id === requestedThemeId) ?? null
    : null;
  const themeInspiration = themesApplicable
    ? sanitizeThemeInspiration(input.themeInspiration)
    : emptyBookingThemeInspiration();
  const displayedServicePrice = serviceTier
    ? input.packageSource.serviceOptions?.[serviceTier]?.price ?? null
    : null;

  return {
    serviceTier,
    packageThemeId: selectedTheme?.id ?? null,
    themeInspiration,
    availableTiers,
    availableThemes: themesApplicable ? availableThemes : [],
    themesApplicable,
    displayedServicePrice,
  };
}

export function parseStoredBookingCustomization(
  record: Record<string, unknown>,
): {
  serviceTier: CateringPackageServiceTier | null;
  packageThemeId: string | null;
  themeInspiration: BookingThemeInspiration;
} | null {
  const serviceTier = parseOptionalServiceTier(record.serviceTier);
  if (serviceTier === "invalid") {
    return null;
  }

  const packageThemeId = parseOptionalStableId(record.packageThemeId);
  if (packageThemeId === "invalid") {
    return null;
  }

  const themeInspiration = parseStoredThemeInspiration(record.themeInspiration);
  if (!themeInspiration) {
    return null;
  }

  return {
    serviceTier,
    packageThemeId,
    themeInspiration,
  };
}

export function bookingCustomizationReviewLabel(
  serviceTier: CateringPackageServiceTier | null,
): string | null {
  return serviceTier ? cateringPackageServiceTierLabel(serviceTier) : null;
}

/**
 * Stable service-tier and theme ids may be submitted. Inspiration notes,
 * setup references, and every client price stay off the booking request.
 * The server re-reads the package and derives the financial snapshot.
 */
export function omitUntrustedBookingCustomization<
  T extends Record<string, unknown>,
>(input: T): T {
  const next = {...input};
  for (const field of UNTRUSTED_BOOKING_FIELDS) {
    delete next[field];
  }
  return next;
}

function parseOptionalServiceTier(
  value: unknown,
): CateringPackageServiceTier | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }

  return normalizeCateringPackageServiceTier(value) ?? "invalid";
}

function parseOptionalStableId(
  value: unknown,
): string | null | "invalid" {
  if (value === undefined || value === null) {
    return null;
  }

  return typeof value === "string" && STABLE_ID.test(value) ? value : "invalid";
}

function parseStoredThemeInspiration(
  value: unknown,
): BookingThemeInspiration | null {
  if (value === undefined || value === null) {
    return emptyBookingThemeInspiration();
  }

  if (!isRecord(value)) {
    return null;
  }

  if (
    value.notes !== undefined &&
    (typeof value.notes !== "string" || value.notes.length > MAX_INSPIRATION_NOTES)
  ) {
    return null;
  }

  const referenceSetupId = parseOptionalStableId(value.referenceSetupId);
  if (referenceSetupId === "invalid") {
    return null;
  }

  if ("price" in value || "servicePrice" in value || "displayedServicePrice" in value) {
    return null;
  }

  return {
    notes: typeof value.notes === "string" ? value.notes.trim() : "",
    referenceSetupId,
  };
}

function sanitizeThemeInspiration(value: unknown): BookingThemeInspiration {
  if (!isRecord(value)) {
    return emptyBookingThemeInspiration();
  }

  const referenceSetupId = parseOptionalStableId(value.referenceSetupId);

  return {
    notes: typeof value.notes === "string"
      ? value.notes.slice(0, MAX_INSPIRATION_NOTES)
      : "",
    referenceSetupId: referenceSetupId === "invalid" ? null : referenceSetupId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
