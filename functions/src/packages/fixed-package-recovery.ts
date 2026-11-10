import {createHash} from "node:crypto";
import {DocumentReference, GeoPoint, Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

type Row = Record<string, unknown>;
const content = [
  "name", "description", "serviceCategoryCode", "price", "serviceOptions",
  "themeOptions", "paymentPolicy", "depositPercentage", "minimumGuests", "maximumGuests",
  "imageUrl", "imageUrls", "foodInclusions", "decorInclusions", "furnitureInclusions",
  "serviceInclusions", "equipmentInclusions", "foodChoiceGroups", "pricingModel",
  "offerStructure", "packageStyle", "downPaymentPercentage", "balanceDueDaysBeforeEvent",
];
const metadata = [
  "providerId", "eventType", "status", "isActive", "isPublished", "providerPubliclyVisible",
  "publishedAt", "isDeleted", "deletedAt", "deletedBy", "deletionReason", "createdAt",
  "createdBy", "updatedAt", "updatedBy", "paymentTermsSchemaVersion",
  "balanceDueHoursBeforeEvent", "usesLegacyPaymentTerms", "offerSchemaVersion",
  "occasionSchemaVersion", "occasionScope", "occasionIds",
];

/** Tagged encoding avoids timestamp/map collisions and retains nanosecond precision. */
export function recoveryValue(value: unknown): unknown {
  if (value instanceof Timestamp) return ["timestamp", value.seconds, value.nanoseconds];
  if (value instanceof DocumentReference) return ["reference", value.path];
  if (value instanceof GeoPoint) return ["geopoint", value.latitude, value.longitude];
  if (Buffer.isBuffer(value)) return ["bytes", value.toString("base64")];
  if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) {
    return ["number", Object.is(value, -0) ? "-0" : String(value)];
  }
  if (value === null) return ["null"];
  if (Array.isArray(value)) return ["array", value.map(recoveryValue)];
  if (typeof value === "object" && value) {
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      return ["unsupported", value.constructor?.name ?? "object"];
    }
    return ["map", Object.keys(value).sort().map(key =>
      [key, recoveryValue((value as Row)[key])])];
  }
  return [typeof value, value];
}

export function recoveryHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(recoveryValue(value))).digest("hex");
}

export function recoveryConflict(reason: string): never {
  throw new HttpsError("failed-precondition", reason, {reason});
}

function unknownKeys(value: unknown, allowed: string[], path: string, issues: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(`${path}${key}: unsupported field`);
  }
}

/** Narrow older-writer Fixed shape only; no inferred prices, deadlines or selections. */
export function inspectFixedRecovery(source: Row) {
  const issues: string[] = [];
  unknownKeys(source, [...content, ...metadata], "", issues);
  const options = source.serviceOptions;
  unknownKeys(options, ["drop_off", "buffet_setup", "full_service"], "serviceOptions.", issues);
  if (options && typeof options === "object") {
    for (const [tier, option] of Object.entries(options)) {
      unknownKeys(option, ["price", "includedServices", "decorInclusions",
        "furnitureInclusions", "equipmentInclusions"], `serviceOptions.${tier}.`, issues);
    }
  }
  if (Array.isArray(source.themeOptions)) source.themeOptions.forEach((theme, index) => {
    unknownKeys(theme, ["id", "name", "description", "imageUrls"],
      `themeOptions[${index}].`, issues);
  });
  if (Array.isArray(source.foodChoiceGroups)) source.foodChoiceGroups.forEach((group, index) => {
    unknownKeys(group, ["id", "title", "selectionCount", "options"],
      `foodChoiceGroups[${index}].`, issues);
    if (Array.isArray(group?.options)) group.options.forEach((option: unknown, i: number) => {
      unknownKeys(option, ["id", "name"], `foodChoiceGroups[${index}].options[${i}].`, issues);
    });
  });
  if (source.status !== "draft" || source.isActive !== false ||
      source.isPublished !== false || source.providerPubliclyVisible !== false ||
      source.isDeleted !== false || source.publishedAt !== null ||
      ["deletedAt", "deletedBy", "deletionReason"].some(key =>
        source[key] !== undefined && source[key] !== null)) {
    issues.push("lifecycle: recovery requires an unpublished, private, undeleted draft");
  }
  if (source.offerStructure !== "fixed" ||
      !["per_pax", "per_bundle"].includes(String(source.pricingModel))) {
    issues.push("offerStructure: only explicit Fixed Per Pax or Per Bundle drafts are eligible");
  }
  if (source.offerSchemaVersion !== undefined && source.offerSchemaVersion !== 1) {
    issues.push("offerSchemaVersion: existing V2 contracts require the ordinary editor");
  }
  if (!(source.createdAt instanceof Timestamp) ||
      typeof source.createdBy !== "string" || !source.createdBy) {
    issues.push("creation metadata: a saved creation timestamp and creator are required");
  }
  if (source.paymentTermsSchemaVersion !== 2 || source.usesLegacyPaymentTerms === true ||
      source.balanceDueDaysBeforeEvent !== undefined && source.balanceDueDaysBeforeEvent !== null ||
      source.balanceDueHoursBeforeEvent !==
        (source.paymentPolicy === "deposit_then_balance" ? 24 : null)) {
    issues.push("payment terms: unsupported or ambiguous deadlines cannot be converted");
  }
  if (source.foodChoiceGroups !== undefined &&
      (!Array.isArray(source.foodChoiceGroups) || source.foodChoiceGroups.length > 0)) {
    issues.push("foodChoiceGroups: Fixed packages cannot discard customer selections");
  }
  const hasOccasion = ["occasionSchemaVersion", "occasionScope", "occasionIds"]
    .some(key => Object.hasOwn(source, key));
  if (hasOccasion && (source.occasionSchemaVersion !== 2 ||
      !["all", "specific"].includes(String(source.occasionScope)) ||
      !Array.isArray(source.occasionIds))) {
    issues.push("occasion selections: partial occasion metadata requires manual review");
  }
  const input: Row = Object.fromEntries(content.filter(key => Object.hasOwn(source, key))
    .map(key => [key, source[key]]));
  Object.assign(input, {
    sharedContractVersion: 2, offerSchemaVersion: 2, occasionSchemaVersion: 2,
    occasionScope: hasOccasion ? source.occasionScope : "specific",
    occasionIds: hasOccasion ? source.occasionIds : [source.eventType],
    idempotencyKey: "internal_fixed_recovery",
  });
  return {issues, input};
}

/** Reject normalization, truncation, deduplication and any other lossy conversion. */
export function assertRecoveryPreserved(source: Row, proposed: Row): void {
  const changed = [...content, "eventType", "createdAt", "createdBy",
    "occasionScope", "occasionIds", "paymentTermsSchemaVersion", "balanceDueHoursBeforeEvent"]
    .filter(key => Object.hasOwn(source, key) &&
      recoveryHash(source[key]) !== recoveryHash(proposed[key]));
  if (changed.length) {
    throw new HttpsError("failed-precondition", "LOSSY_RECOVERY", {
      reason: "LOSSY_RECOVERY", fields: changed,
    });
  }
}
