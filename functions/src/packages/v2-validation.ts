/** Pure V2 primitives. Not connected to any callable, trigger, or production parser. */
import {HttpsError} from "firebase-functions/v2/https";

export type ValidationReason =
  | "INVALID_OCCASION_SELECTION" | "INVALID_CAPABILITY_CHANGE"
  | "INVALID_REVIEW_TARGET" | "INVALID_REVIEW_REASON"
  | "INVALID_PRICE" | "INVALID_INCLUSION" | "CONFIG_UNAVAILABLE"
  | "INVALID_SERVICE_CATEGORY" | "INVALID_NAME" | "UNKNOWN_FIELD"
  | "OCCASION_INACTIVE" | "PROVIDER_OCCASION_INELIGIBLE" | "UNIVERSAL_REVALIDATION_REQUIRED";

export function invalid(reason: ValidationReason): never {
  throw new HttpsError(["CONFIG_UNAVAILABLE", "OCCASION_INACTIVE",
    "PROVIDER_OCCASION_INELIGIBLE", "UNIVERSAL_REVALIDATION_REQUIRED"].includes(reason) ?
    "failed-precondition" : "invalid-argument", reason, {reason});
}

export function record(value: unknown, reason: ValidationReason): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.getOwnPropertySymbols(value).length) return invalid(reason);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((d) => !d.enumerable || !("value" in d))) {
    return invalid(reason);
  }
  return value as Record<string, unknown>;
}

export function exact(
  value: unknown, required: readonly string[], optional: readonly string[],
  reason: ValidationReason,
): Record<string, unknown> {
  const result = record(value, reason);
  if (required.some((key) => !Object.hasOwn(result, key))) return invalid(reason);
  if (Object.keys(result).some((key) => !required.includes(key) && !optional.includes(key))) {
    return invalid(reason === "INVALID_REVIEW_TARGET" || reason === "INVALID_CAPABILITY_CHANGE" ?
      reason : "UNKNOWN_FIELD");
  }
  return result;
}

export function positiveRevision(value: unknown, reason: ValidationReason): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return invalid(reason);
  }
  return value;
}

export function documentId(value: unknown, reason: ValidationReason): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    return invalid(reason);
  }
  return value;
}

export function mutationKey(value: unknown, reason: ValidationReason): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
    return invalid(reason);
  }
  return value;
}

// Reject controls, format/invisible characters and malformed UTF-16 before trimming.
const unsafeText = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
export function plainText(
  value: unknown, min: number, max: number, reason: ValidationReason, collapse = false,
): string {
  if (typeof value !== "string" || unsafeText.test(value)) return invalid(reason);
  const text = collapse ? value.trim().replace(/\s+/gu, " ") : value.trim();
  const count = [...text].length;
  if (count < min || count > max) return invalid(reason);
  return text;
}

export function normalizedText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}
