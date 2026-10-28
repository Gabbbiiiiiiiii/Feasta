/**
 * Private, incomplete FEASTA package editor progress.
 * This module deliberately does not validate a canonical package, authorize an
 * occasion, upload an asset, or grant publication capability.
 * Match packages/shared-types/src/provider-package-v2.cts.
 */

export type ProgressRecord = Record<string, unknown>;

export class EditorProgressError extends Error {
  constructor(public readonly reason:
    "INVALID_EDITOR_PROGRESS" | "EDITOR_DRAFT_TOO_LARGE" | "CLIENT_UPGRADE_REQUIRED") {
    super(reason);
    this.name = "EditorProgressError";
  }
}

const invalid = (): never => { throw new EditorProgressError("INVALID_EDITOR_PROGRESS"); };
const MAX_BYTES = 128 * 1024;
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const OCCASION_ID = /^[a-z][a-z0-9_]{1,63}$/u;
const KEY = /^[A-Za-z0-9_-]{16,128}$/u;
const UNSAFE = /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;

function object(value: unknown, permitted: readonly string[]): ProgressRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  const record = value as ProgressRecord;
  if (Reflect.ownKeys(record).some((key) => typeof key !== "string" ||
    !permitted.includes(key))) return invalid();
  if (Object.values(Object.getOwnPropertyDescriptors(record)).some((d) =>
    !("value" in d) || !d.enumerable)) return invalid();
  return record;
}

function string(value: unknown, max: number, allowEmpty = true): string {
  if (typeof value !== "string" || UNSAFE.test(value) || [...value].length > max ||
      (!allowEmpty && value.length === 0)) return invalid();
  return value;
}

function id(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) return invalid();
  return value;
}

function list(value: unknown, max: number, element: (v: unknown) => string): string[] {
  if (!Array.isArray(value) || value.length > max || Object.keys(value).length !== value.length) {
    return invalid();
  }
  const items = value.map(element);
  if (new Set(items).size !== items.length) return invalid();
  return items;
}

function lines(value: unknown): string[] {
  return list(value, 50, (v) => string(v, 160));
}

function optional<T>(input: ProgressRecord, field: string,
  convert: (value: unknown) => T, output: ProgressRecord): void {
  if (Object.prototype.hasOwnProperty.call(input, field)) {
    output[field] = convert(input[field]);
  }
}

export interface EditorProgressLimits {
  maxSpecificOccasions: number;
  maxThemeImages: number;
}

export function validatePackageEditorProgress(
  value: unknown, limits: EditorProgressLimits,
): ProgressRecord {
  if (!Number.isSafeInteger(limits.maxSpecificOccasions) ||
      limits.maxSpecificOccasions < 1 || limits.maxSpecificOccasions > 100 ||
      !Number.isSafeInteger(limits.maxThemeImages) ||
      limits.maxThemeImages < 1 || limits.maxThemeImages > 4) return invalid();

  const input = object(value, [
    "name", "description", "serviceCategoryCode", "occasion", "pricingModel", "priceText",
    "minimumGuestsText", "maximumGuestsText", "tiers", "foodInclusions", "serviceInclusions",
    "decorInclusions", "furnitureInclusions", "equipmentInclusions", "themes",
    "marketingAssetIds", "paymentPolicy", "depositPercentageText",
  ]);
  const output: ProgressRecord = {};
  optional(input, "name", (v) => string(v, 80), output);
  optional(input, "description", (v) => string(v, 5000), output);
  optional(input, "serviceCategoryCode", (v) => string(v, 128), output);
  optional(input, "priceText", (v) => string(v, 64), output);
  optional(input, "minimumGuestsText", (v) => string(v, 64), output);
  optional(input, "maximumGuestsText", (v) => string(v, 64), output);
  optional(input, "depositPercentageText", (v) => string(v, 64), output);
  optional(input, "pricingModel", (v) => {
    if (!["legacy", "per_pax", "per_bundle"].includes(v as string)) return invalid();
    return v;
  }, output);
  optional(input, "paymentPolicy", (v) => {
    if (!["full_payment", "deposit_then_balance"].includes(v as string)) return invalid();
    return v;
  }, output);

  optional(input, "occasion", (v) => {
    const data = object(v, ["occasionSchemaVersion", "occasionScope", "occasionIds"]);
    if (data.occasionSchemaVersion !== 2) return invalid();
    const occ: ProgressRecord = {occasionSchemaVersion: 2};
    optional(data, "occasionScope", (scope) => {
      if (scope !== "specific" && scope !== "all") return invalid();
      return scope;
    }, occ);
    optional(data, "occasionIds", (ids) => {
      const parsed = list(ids, limits.maxSpecificOccasions, (i) => {
        if (typeof i !== "string" || !OCCASION_ID.test(i)) return invalid();
        return i;
      });
      if (occ.occasionScope === "all" && parsed.length) return invalid();
      return parsed;
    }, occ);
    return occ;
  }, output);

  optional(input, "tiers", (v) => {
    const src = object(v, ["drop_off", "buffet_setup", "full_service"]);
    const tiers: ProgressRecord = {};
    for (const [key, row] of Object.entries(src)) {
      const tier = object(row, ["enabled", "priceText", "includedServices",
        "decorInclusions", "furnitureInclusions", "equipmentInclusions"]);
      // Frozen contract requires these fields when a tier record exists.
      if (typeof tier.enabled !== "boolean") return invalid();
      const record: ProgressRecord = {enabled: tier.enabled};
      optional(tier, "priceText", (p) => string(p, 64), record);
      for (const field of ["includedServices", "decorInclusions",
        "furnitureInclusions", "equipmentInclusions"]) {
        optional(tier, field, lines, record);
      }
      if (Object.keys(record).length !== 6) return invalid();
      tiers[key] = record;
    }
    return tiers;
  }, output);

  for (const field of ["foodInclusions", "serviceInclusions", "decorInclusions",
    "furnitureInclusions", "equipmentInclusions"]) {
    optional(input, field, lines, output);
  }
  optional(input, "marketingAssetIds", (v) => list(v, 8, id), output);
  optional(input, "themes", (v) => {
    if (!Array.isArray(v) || v.length > 12 || Object.keys(v).length !== v.length) return invalid();
    const seen = new Set<string>();
    return v.map((item) => {
      const theme = object(item, ["editorThemeId", "name", "description", "assetIds"]);
      if (Object.keys(theme).length !== 4) return invalid();
      const editorThemeId = id(theme.editorThemeId);
      if (seen.has(editorThemeId)) return invalid();
      seen.add(editorThemeId);
      return {
        editorThemeId,
        name: string(theme.name, 80),
        description: string(theme.description, 500),
        assetIds: list(theme.assetIds, limits.maxThemeImages, id),
      };
    });
  }, output);

  const size = Buffer.byteLength(JSON.stringify(output), "utf8");
  if (size > MAX_BYTES) throw new EditorProgressError("EDITOR_DRAFT_TOO_LARGE");
  return output;
}

export interface SaveEditorProgressInput {
  editorDraftId: string | null;
  expectedRevision: number;
  packageId: null;
  expectedPackageRevision: null;
  editorSchemaVersion: 2;
  currentStep: 0 | 1 | 2 | 3 | 4;
  progress: ProgressRecord;
  idempotencyKey: string;
}

/**
 * This first stage supports unbound, incomplete drafts ONLY. Existing package
 * binding requires the separately reviewed package-revision adapter.
 */
export function parseSaveEditorProgress(
  value: unknown, limits: EditorProgressLimits,
): SaveEditorProgressInput {
  const data = object(value, ["editorDraftId", "expectedRevision", "packageId",
    "expectedPackageRevision", "editorSchemaVersion", "currentStep", "progress", "idempotencyKey"]);
  if (Object.keys(data).length !== 8) return invalid();
  if (data.editorSchemaVersion !== 2) {
    throw new EditorProgressError("CLIENT_UPGRADE_REQUIRED");
  }
  if (data.packageId !== null || data.expectedPackageRevision !== null) {
    throw new EditorProgressError("CLIENT_UPGRADE_REQUIRED");
  }
  if (data.editorDraftId !== null) id(data.editorDraftId);
  if (!Number.isSafeInteger(data.expectedRevision) ||
      (data.expectedRevision as number) < 0 ||
      (data.editorDraftId === null && data.expectedRevision !== 0) ||
      (data.editorDraftId !== null && data.expectedRevision === 0) ||
      ![0, 1, 2, 3, 4].includes(data.currentStep as number) ||
      typeof data.idempotencyKey !== "string" || !KEY.test(data.idempotencyKey)) return invalid();
  return {
    editorDraftId: data.editorDraftId as string | null,
    expectedRevision: data.expectedRevision as number,
    packageId: null,
    expectedPackageRevision: null,
    editorSchemaVersion: 2,
    currentStep: data.currentStep as 0 | 1 | 2 | 3 | 4,
    progress: validatePackageEditorProgress(data.progress, limits),
    idempotencyKey: data.idempotencyKey,
  };
}

export function parseGetEditorProgress(value: unknown): string {
  const data = object(value, ["editorDraftId"]);
  if (Object.keys(data).length !== 1) return invalid();
  return id(data.editorDraftId);
}

/** Existing upload/asset registry has no approved editor-draft attachment contract.
 * Save progress must not produce dangling references or accept claimed ownership.
 * An empty editor media outline is safe until that separate contract is reviewed.
 */
export function assertNoUnverifiedEditorAssets(progress: ProgressRecord): void {
  if (Array.isArray(progress.marketingAssetIds) && progress.marketingAssetIds.length > 0) {
    throw new EditorProgressError("CLIENT_UPGRADE_REQUIRED");
  }
  if (Array.isArray(progress.themes) && progress.themes.some((theme) =>
    Array.isArray(theme.assetIds) && theme.assetIds.length > 0)) {
    throw new EditorProgressError("CLIENT_UPGRADE_REQUIRED");
  }
}


/** A deletion is a revision-checked private recovery action, not publication. */
export function parseDiscardEditorProgress(value: unknown): {
  editorDraftId: string; expectedRevision: number; idempotencyKey: string;
} {
  const data = object(value, ["editorDraftId", "expectedRevision", "idempotencyKey"]);
  if (Object.keys(data).length !== 3 ||
      !Number.isSafeInteger(data.expectedRevision) ||
      (data.expectedRevision as number) < 1 ||
      typeof data.idempotencyKey !== "string" || !KEY.test(data.idempotencyKey)) return invalid();
  return {editorDraftId: id(data.editorDraftId),
    expectedRevision: data.expectedRevision as number,
    idempotencyKey: data.idempotencyKey};
}

export function parseListEditorProgress(value: unknown): void {
  object(value, []);
}
