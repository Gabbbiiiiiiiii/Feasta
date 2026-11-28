/**
 * Distinguishes historical V2 occasion authority from global eligibility.
 *
 * Structural identification only. This does not authorize package writes,
 * publication, or customer discovery.
 */

export type PackageOccasionContractMode =
  | "legacy_v2"
  | "global_v1"
  | "invalid";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const positive = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value > 0;

export function packageOccasionContractMode(
  value: unknown,
): PackageOccasionContractMode {
  if (!isRecord(value)) return "invalid";

  const hasGlobal =
    Object.hasOwn(value, "occasionEligibilityModel") ||
    Object.hasOwn(value, "globalEligibilityContractVersion");

  const hasLegacy =
    Object.hasOwn(value, "providerEligibilityRevision");

  // Mixed or incomplete version markers must never be accepted.
  if (hasGlobal && hasLegacy) return "invalid";

  if (hasGlobal) {
    return value.occasionEligibilityModel === "global_v1" &&
      value.globalEligibilityContractVersion === 1 &&
      positive(value.occasionCatalogRevision) &&
      value.occasionEligibilityState === "valid" ?
      "global_v1" : "invalid";
  }

  if (hasLegacy) {
    return positive(value.providerEligibilityRevision) &&
      positive(value.occasionCatalogRevision) ?
      "legacy_v2" : "invalid";
  }

  return "invalid";
}