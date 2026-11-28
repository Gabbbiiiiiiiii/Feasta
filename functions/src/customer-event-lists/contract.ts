import {eventListSchema} from "./schema";

export type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
export type RecordValue = {[key: string]: Json};
export type PlanningEntry = RecordValue & {
  kind: "catering_package" | "custom_menu" | "marketplace_service";
  providerId: string; selectionId: string; variantId: string | null; identity: string;
  configuration: RecordValue | null;
};
export type PlanningDocument = RecordValue & {
  version: 1; ownerUid: string; revision: number; entries: PlanningEntry[];
};
type Schema = {
  type: string; nullable?: boolean; min?: number; max?: number;
  pattern?: string; format?: string; values?: readonly Json[];
  fields?: {[key: string]: Schema}; required?: readonly string[];
  items?: Schema; unique?: boolean;
};
export const MAX_DOCUMENT_BYTES = 100000;
export const MAX_ENTRY_BYTES = 24000;
/** Display-only metadata. None of these states authorize a booking. */
export function planningReadiness(entry: PlanningEntry): string {
  if (entry.kind === "custom_menu") return "unsupported_requires_review";
  if (entry.kind === "marketplace_service" && entry.expectedRevision === null) {
    return "marketplace_metadata_refresh_required";
  }
  return entry.configuration === null ? "needs_customization" : "configured_revalidation_required";
}
export function invalid(): never { throw new Error("Invalid customer Event List cloud contract"); }
function validate(value: unknown, schema: Schema): void {
  if (value === null && schema.nullable) return;
  if (schema.type === "enum") { if (!schema.values!.includes(value as Json)) invalid(); return; }
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) invalid();
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some(k => !Object.hasOwn(schema.fields!, k)) ||
        schema.required!.some(k => !Object.hasOwn(record,k))) invalid();
    for (const key of Object.keys(record)) validate(record[key], schema.fields![key]);
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length > schema.max! ||
        value.length < (schema.min ?? 0)) invalid();
    value.forEach(v => validate(v, schema.items!));
    if (schema.unique && new Set(value.map(stable)).size !== value.length) invalid();
  } else if (schema.type === "string") {
    if (typeof value !== "string" || value.length > schema.max! ||
        value.length < schema.min! || /[\x00-\x09\x0b-\x1f\x7f]/u.test(value)) invalid();
    if (schema.pattern && new RegExp(schema.pattern).exec(value)?.[0] !== value) invalid();
    if (schema.format === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/u.test(value)) invalid();
    if (schema.format === "date" && (!/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0,10) !== value)) invalid();
  } else if (schema.type === "boolean") { if (typeof value !== "boolean") invalid(); }
  else if (typeof value !== "number" || !Number.isFinite(value) ||
      value < schema.min! || value > schema.max! ||
      (schema.type === "integer" && !Number.isSafeInteger(value))) invalid();
}
export function stable(value: Json): string {
  if (Array.isArray(value)) return "["+value.map(stable).join(",")+"]";
  if (value && typeof value === "object") {
    return "{"+Object.keys(value).sort()
      .map(k => JSON.stringify(k)+":"+stable(value[k])).join(",")+"}";
  }
  return JSON.stringify(value);
}
function bytes(value: Json): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
export function identity(
  entry: Pick<PlanningEntry, "kind"|"providerId"|"selectionId"|"variantId">,
): string {
  return [entry.kind,entry.providerId,entry.selectionId,
    ...(entry.variantId === null ? [] : [entry.variantId])].join(":");
}
function uniqueBy(rows: Json | undefined, key: (r: RecordValue) => string) {
  if (!Array.isArray(rows)) return;
  if (new Set(rows.map(r => key(r as RecordValue))).size !== rows.length) invalid();
}
function eventSemantics(value: Json) {
  if (!value) return;
  const e = value as RecordValue;
  if (e.eventEndTime && String(e.eventEndTime) <= String(e.eventTime)) invalid();
}
export function decodeDocument(value: unknown, ownerUid: string): PlanningDocument {
  validate(value, eventListSchema as Schema);
  const doc = value as PlanningDocument;
  if (doc.ownerUid !== ownerUid || bytes(doc) > MAX_DOCUMENT_BYTES) invalid();
  uniqueBy(doc.entries,e => String(e.identity));
  eventSemantics(doc.schedule);
  for (const e of doc.entries) {
    if (bytes(e) > MAX_ENTRY_BYTES || e.identity !== identity(e)) invalid();
    if ((e.kind === "custom_menu") !== (e.variantId !== null && e.menu !== null) ||
        (e.kind !== "custom_menu" && (e.variantId !== null || e.menu !== null))) invalid();
    if (e.kind === "custom_menu" && (e.configuration !== null ||
        Number((e.menu as RecordValue).servingMinimumGuests) >
        Number((e.menu as RecordValue).servingMaximumGuests))) invalid();
    const image = /^https:\/\/[^\s/#@:]+(?::\d+)?(?:\/[^\s#]*)?$/u;
    if (e.imageUrl !== null &&
        (typeof e.imageUrl !== "string" || !image.test(e.imageUrl))) invalid();
    if (e.href !== null && (typeof e.href !== "string" ||
        !e.href.startsWith("/customer/") || /[\\\r\n]/u.test(e.href))) invalid();
    const c = e.configuration;
    if (c) {
      eventSemantics(c.event);
      if (c.sharedContractVersion === 2 && (!c.expectedPackageRevision ||
          !Array.isArray(c.foodChoiceSelections))) invalid();
      if (c.sharedContractVersion !== 2 && Array.isArray(c.foodChoiceSelections) &&
          c.foodChoiceSelections.length) invalid();
      uniqueBy(c.foodChoiceSelections,r => String(r.groupId));
      uniqueBy(c.selectedEventServices,r => String(r.source ?? "")+":"+r.providerId+":"+r.id);
      uniqueBy(c.selectedAddOns,r => String(r.source)+":"+r.providerId+":"+r.addonId);
    }
  }
  return JSON.parse(JSON.stringify(doc)) as PlanningDocument;
}
export function decodeJson(raw: string, uid: string): PlanningDocument {
  if (new TextEncoder().encode(raw).length > MAX_DOCUMENT_BYTES) invalid();
  return decodeDocument(JSON.parse(raw),uid);
}
export function encodeDocument(value: PlanningDocument): string {
  return JSON.stringify(decodeDocument(value,value.ownerUid));
}

/** Run INSIDE a trusted Firestore transaction after checking current active customer ownership.
 * No cloud SDK, callable registration, or UI integration exists in Phase 2A.
 * Every command must carry the revision it read; retries re-read, never blind overwrite.
 */
export function advance(
  current: PlanningDocument, proposed: PlanningDocument, expectedRevision: number,
): PlanningDocument {
  const before = decodeDocument(current,current.ownerUid);
  const next = decodeDocument(proposed,current.ownerUid);
  if (before.revision !== expectedRevision || next.revision !== expectedRevision+1 ||
      stable(before.migration) !== stable(next.migration)) invalid();
  return next;
}
/** Initialization only. An existing cloud resource, even empty, always wins.
 * Never merge another device's old local snapshot. Conflicts require review in Phase 2B.
 * Cleared resources must remain as empty documents; deletion is forbidden.
 */
export function initializeMigration(
  uid: string, cloud: unknown | null, local: unknown,
): PlanningDocument {
  if (cloud !== null) return decodeDocument(cloud,uid);
  const next = decodeDocument(local,uid);
  if (next.revision !== 0) invalid();
  return next;
}
