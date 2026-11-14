/**
 * Shared Admin occasion package dependency validation.
 *
 * Reused by atomic deactivation and its read-only readiness preview.
 * No Firestore reads or writes occur here.
 *
 * The caller must supply a complete, transactionally read package inventory.
 */

export interface OccasionPackageDependencyRow {
  id: string;
  data: Record<string, unknown>;
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[a-z][a-z0-9_]{1,63}$/u.test(value);
}

function refuse(code: string): never {
  throw new Error(code);
}

export function assertNoOccasionPackageDependencies(input: {
  packageRows: readonly OccasionPackageDependencyRow[];
  occasionId: string;
  codes: readonly string[];
}): void {
  const {packageRows, occasionId, codes} = input;
  const applicable = new Set(codes);

  for (const row of packageRows) {
    const data = row.data;

    // Preserve the existing historical-record rules during extraction.
    if (data.isDeleted === true) continue;

    if (data.status === "archived" &&
        data.isActive === false &&
        data.isPublished === false &&
        data.providerPubliclyVisible === false) {
      continue;
    }

    let depends = false;

    if (data.occasionSchemaVersion === 2) {
      if (!Array.isArray(data.occasionIds) ||
          !Array.isArray(data.occasionMatchIds) ||
          !["specific", "all"].includes(data.occasionScope as string)) {
        refuse("OCCASION_PACKAGE_DEPENDENCY_REQUIRES_REVIEW");
      }

      const ids = data.occasionIds as unknown[];
      const matches = data.occasionMatchIds as unknown[];

      if (!ids.every(validId) || !matches.every(validId)) {
        refuse("OCCASION_PACKAGE_DEPENDENCY_REQUIRES_REVIEW");
      }

      depends = ids.includes(occasionId) ||
        matches.includes(occasionId);

      if (data.occasionScope === "all") {
        if (!validId(data.serviceCategoryCode)) {
          refuse("OCCASION_PACKAGE_DEPENDENCY_REQUIRES_REVIEW");
        }

        depends ||= applicable.has(data.serviceCategoryCode);
      }
    } else if (data.occasionSchemaVersion === undefined ||
               data.occasionSchemaVersion === 1) {
      if (typeof data.eventType !== "string") {
        refuse("OCCASION_PACKAGE_DEPENDENCY_REQUIRES_REVIEW");
      }

      depends = data.eventType === occasionId;
    } else {
      refuse("OCCASION_PACKAGE_DEPENDENCY_REQUIRES_REVIEW");
    }

    if (depends) {
      refuse("OCCASION_LIVE_PACKAGE_DEPENDENCY");
    }
  }
}