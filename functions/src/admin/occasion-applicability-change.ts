/**
 * Plans an administrator's proposed occasion applicability change.
 *
 * Pure validation only:
 * - Never reads or writes Firestore.
 * - Never authorizes a mutation.
 * - Dependency and compatibility checks must be performed separately
 *   before any catalog update is committed.
 */

const CATEGORY_CODE = /^[a-z][a-z0-9_]{1,63}$/u;
const MAX_CATEGORIES = 100;

export interface OccasionApplicabilityChange {
  added: string[];
  removed: string[];
  unchanged: string[];
  changed: boolean;
}

function validateCodes(
  codes: readonly string[],
  allowEmpty: boolean,
): void {
  if (!Array.isArray(codes) ||
      (!allowEmpty && codes.length === 0) ||
      codes.length > MAX_CATEGORIES ||
      new Set(codes).size !== codes.length ||
      codes.some((code) =>
        typeof code !== "string" ||
        !CATEGORY_CODE.test(code))) {
    throw new Error("INVALID_SERVICE_CATEGORY");
  }
}

export function planOccasionApplicabilityChange(input: {
  before: readonly string[];
  after: readonly string[];
  activeCategoryCodes: readonly string[];
}): OccasionApplicabilityChange {
  validateCodes(input.before, true);
  validateCodes(input.after, false);
  validateCodes(input.activeCategoryCodes, true);

  const before = new Set(input.before);
  const after = new Set(input.after);
  const active = new Set(input.activeCategoryCodes);

  if (input.after.some((code) => !active.has(code))) {
    throw new Error("INVALID_SERVICE_CATEGORY");
  }

  const added = input.after
    .filter((code) => !before.has(code))
    .sort();

  const removed = input.before
    .filter((code) => !after.has(code))
    .sort();

  const unchanged = input.before
    .filter((code) => after.has(code))
    .sort();

  return {
    added,
    removed,
    unchanged,
    changed: added.length > 0 || removed.length > 0,
  };
}