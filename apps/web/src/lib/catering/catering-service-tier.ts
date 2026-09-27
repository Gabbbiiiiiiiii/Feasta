export const CATERING_PACKAGE_SERVICE_TIERS = [
  "drop_off",
  "buffet_setup",
  "full_service",
] as const;

export type CateringPackageServiceTier =
  (typeof CATERING_PACKAGE_SERVICE_TIERS)[number];

export type CateringServiceTier =
  CateringPackageServiceTier;

export function normalizeCateringPackageServiceTier(
  value: unknown,
): CateringPackageServiceTier | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value.trim().toLowerCase();

  return (
    CATERING_PACKAGE_SERVICE_TIERS as
      readonly string[]
  ).includes(normalized)
    ? normalized as CateringPackageServiceTier
    : null;
}

export function cateringPackageServiceTierLabel(
  value: CateringPackageServiceTier,
): string {
  switch (value) {
    case "drop_off":
      return "Drop-Off Catering";

    case "buffet_setup":
      return "Buffet Setup";

    case "full_service":
      return "Full-Service Catering";
  }
}

export function cateringPackageServiceTierDescription(
  value: CateringPackageServiceTier,
): string {
  switch (value) {
    case "drop_off":
      return "Ready-made package delivery without buffet setup or on-site service staff.";

    case "buffet_setup":
      return "Food with buffet equipment and setup for self-service events.";

    case "full_service":
      return "Complete catering with setup, staffing, and provider-defined event service.";
  }
}