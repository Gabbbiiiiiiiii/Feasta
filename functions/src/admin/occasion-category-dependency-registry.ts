/**
 * Category-wide dependency witness for universal ("all") packages.
 *
 * Separate from occasionDependencies/{occasionId}/entries.
 *
 * A registry entry alone never proves historical completeness or
 * authorizes occasion deactivation/activation.
 */

export interface OccasionCategoryDependencyEntry {
  schemaVersion: 1;
  kind: "universal_package";
  categoryCode: string;
  sourceId: string;
  sourcePath: string;
}

const ID = /^[a-z][a-z0-9_]{1,63}$/u;
const SOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export function validOccasionCategoryDependencyEntry(
  value: unknown,
): value is OccasionCategoryDependencyEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const entry = value as Record<string, unknown>;

  return entry.schemaVersion === 1 &&
    entry.kind === "universal_package" &&
    typeof entry.categoryCode === "string" &&
    ID.test(entry.categoryCode) &&
    typeof entry.sourceId === "string" &&
    SOURCE_ID.test(entry.sourceId) &&
    entry.sourcePath === `packages/${entry.sourceId}`;
}

export function occasionCategoryDependencyEntryPath(
  value: OccasionCategoryDependencyEntry,
): string {
  if (!validOccasionCategoryDependencyEntry(value)) {
    throw new Error("OCCASION_CATEGORY_DEPENDENCY_ENTRY_INVALID");
  }

  return `occasionCategoryDependencies/${value.categoryCode}/entries/` +
    `universal_package_${value.sourceId}`;
}
