/**
 * Pure historical dependency witness extraction.
 *
 * No Firestore operations, coverage certification, or authorization
 * to activate/deactivate occasions.
 */

import {
  classifyMainEventForRegistry,
  occasionDependencyEntryPath,
  type OccasionDependencyEntry,
} from "./occasion-dependency-registry.js";

import {
  occasionCategoryDependencyEntryPath,
  type OccasionCategoryDependencyEntry,
} from "./occasion-category-dependency-registry.js";

export interface HistoricalWitness {
  path: string;
  value: Record<string, unknown>;
}

export type HistoricalClassification =
  | {kind: "witnesses"; witnesses: HistoricalWitness[]}
  | {kind: "excluded"; reason: "customer_draft" | "inactive_history"}
  | {kind: "unresolved"; reason: string};

const ID = /^[a-z][a-z0-9_]{1,63}$/u;
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;

function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function uniqueIds(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every(validId) &&
    new Set(value).size === value.length;
}

function unresolved(): HistoricalClassification {
  return {kind: "unresolved", reason: "HISTORICAL_DEPENDENCY_REQUIRES_REVIEW"};
}

function occasionWitness(
  kind: "package" | "submitted_booking",
  sourceId: string,
  occasionId: string,
): HistoricalWitness {
  const entry: OccasionDependencyEntry = {
    schemaVersion: 1,
    kind,
    occasionId,
    sourceId,
    sourcePath: `${kind === "package" ? "packages" : "mainEvents"}/${sourceId}`,
  };

  return {
    path: occasionDependencyEntryPath(entry),
    value: {...entry},
  };
}

export function classifyHistoricalPackage(
  id: string,
  data: Record<string, unknown>,
): HistoricalClassification {
  if (!DOCUMENT_ID.test(id) || !data ||
      typeof data !== "object" || Array.isArray(data)) {
    return unresolved();
  }

  if (data.isDeleted === true ||
      (data.status === "archived" &&
       data.isActive === false &&
       data.isPublished === false &&
       data.providerPubliclyVisible === false)) {
    return {kind: "excluded", reason: "inactive_history"};
  }

  if (data.occasionSchemaVersion === undefined ||
      data.occasionSchemaVersion === 1) {
    if (!validId(data.eventType)) return unresolved();

    return {
      kind: "witnesses",
      witnesses: [occasionWitness("package", id, data.eventType)],
    };
  }

  if (data.occasionSchemaVersion !== 2 ||
      !uniqueIds(data.occasionIds) ||
      !uniqueIds(data.occasionMatchIds) ||
      !validId(data.eventType) ||
      !validId(data.serviceCategoryCode)) {
    return unresolved();
  }

  const ids = data.occasionIds;
  const matches = data.occasionMatchIds;

  if (data.occasionScope === "specific") {
    if (ids.length === 0 ||
        ids.length !== matches.length ||
        !ids.every(value => matches.includes(value)) ||
        !matches.includes(data.eventType)) {
      return unresolved();
    }

    return {
      kind: "witnesses",
      witnesses: [...ids].sort().map(occasionId =>
        occasionWitness("package", id, occasionId)),
    };
  }

  if (data.occasionScope === "all") {
    if (ids.length !== 0 ||
        matches.length === 0 ||
        !matches.includes(data.eventType)) {
      return unresolved();
    }

    const entry: OccasionCategoryDependencyEntry = {
      schemaVersion: 1,
      kind: "universal_package",
      categoryCode: data.serviceCategoryCode,
      sourceId: id,
      sourcePath: `packages/${id}`,
    };

    return {
      kind: "witnesses",
      witnesses: [{
        path: occasionCategoryDependencyEntryPath(entry),
        value: {...entry},
      }],
    };
  }

  return unresolved();
}

export function classifyHistoricalMainEvent(
  id: string,
  data: Record<string, unknown>,
): HistoricalClassification {
  const classification = classifyMainEventForRegistry(id, data);

  if (classification === "customer_draft") {
    return {kind: "excluded", reason: "customer_draft"};
  }

  if (classification !== "submitted_booking" ||
      !validId(data.eventType)) {
    return unresolved();
  }

  // Provider-request relationships require independent verification.
  return {
    kind: "witnesses",
    witnesses: [
      occasionWitness("submitted_booking", id, data.eventType),
    ],
  };
}
