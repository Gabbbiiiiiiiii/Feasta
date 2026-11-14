import {parseProviderSetups, PROVIDER_SETUP_EVENT_TYPES, PROVIDER_SETUP_LIMIT,
  type ProviderSetup, type ProviderSetupEventType} from "./provider-setup-gallery";

/** Private extension only. Neither the legacy editor nor public projection uses this parser. */
export type ProviderSetupV2 = Omit<ProviderSetup, "setupOccasionSchemaVersion" | "eventType"> & {
  setupOccasionSchemaVersion: 2;
  eventType: ProviderSetupEventType | null;
  occasionScope: "specific" | "all";
  occasionIds: string[];
  occasionMatchIds: string[];
  occasionCatalogRevision: number;
  providerEligibilityRevision: number;
  occasionEligibilityState: "valid" | "review_required";
};
const baseFields = ["id", "title", "description", "eventType", "themeTags", "imageUrls", "isPublished"];
const selectionFields = ["setupOccasionSchemaVersion", "occasionScope", "occasionIds"];
const derivedFields = ["occasionMatchIds", "occasionCatalogRevision", "providerEligibilityRevision", "occasionEligibilityState"];
const idPattern = /^[a-z][a-z0-9_]{1,63}$/u;
function fail(message = "Invalid private Setup Gallery V2 record."): never { throw new Error(message); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, fields: string[]) {
  if (Object.keys(value).some((key) => !fields.includes(key)) || fields.some((key) => !Object.hasOwn(value, key))) fail();
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) return fail("Setup Gallery V2 authority is unavailable.");
  return value;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !idPattern.test(id)) || new Set(value).size !== value.length) return fail();
  return [...value];
}
function scalar(value: unknown): value is ProviderSetupEventType {
  return typeof value === "string" && (PROVIDER_SETUP_EVENT_TYPES as readonly string[]).includes(value);
}
function selection(value: Record<string, unknown>, maximum: number) {
  positive(maximum);
  const selected = ids(value.occasionIds);
  if (value.setupOccasionSchemaVersion !== 2 ||
    (value.occasionScope !== "specific" && value.occasionScope !== "all") ||
    (value.occasionScope === "specific" ? selected.length < 1 || selected.length > maximum : selected.length !== 0)) fail();
  return {setupOccasionSchemaVersion: 2 as const, occasionScope: value.occasionScope as "specific" | "all", occasionIds: selected};
}
function base(value: Record<string, unknown>, ownerId: string, eventType: ProviderSetupEventType | null) {
  if (typeof value.description !== "string" || !Array.isArray(value.themeTags) || !Array.isArray(value.imageUrls)) fail();
  if (eventType === null && value.isPublished !== false) fail("An unmapped setup cannot be published.");
  // Reuse all legacy text, identity, publication, image ordering and owner-scoped URL checks.
  // The placeholder is used only for base validation, never stored or returned as a mapping.
  const fields = Object.fromEntries(baseFields.map((key) => [key, value[key]]));
  const parsed = parseProviderSetups([{...fields, eventType: eventType ?? "birthday"}], ownerId)[0];
  return {...parsed, eventType};
}

/** Structural private parsing does not assert freshness or grant publication authority. */
export function parsePrivateProviderSetups(value: unknown, ownerId: string, maxSpecificOccasions: number): (ProviderSetup | ProviderSetupV2)[] {
  positive(maxSpecificOccasions);
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > PROVIDER_SETUP_LIMIT) return fail();
  const seen = new Set<string>();
  return value.map((entry) => {
    const v = record(entry);
    let parsed: ProviderSetup | ProviderSetupV2;
    if (v.setupOccasionSchemaVersion !== 2) parsed = parseProviderSetups([entry], ownerId)[0];
    else {
      exact(v, [...baseFields, ...selectionFields, ...derivedFields]);
      if (v.eventType !== null && !scalar(v.eventType)) fail();
      const scope = selection(v, maxSpecificOccasions);
      const matches = ids(v.occasionMatchIds);
      if (v.occasionEligibilityState !== "valid" && v.occasionEligibilityState !== "review_required") fail();
      if (v.occasionEligibilityState === "valid" && (!matches.length ||
        (scope.occasionScope === "specific" && (matches.length !== scope.occasionIds.length || scope.occasionIds.some((id) => !matches.includes(id)))))) fail();
      parsed = {...base(v, ownerId, v.eventType as ProviderSetupEventType | null), ...scope,
        occasionMatchIds: matches, occasionCatalogRevision: positive(v.occasionCatalogRevision),
        providerEligibilityRevision: positive(v.providerEligibilityRevision), occasionEligibilityState: v.occasionEligibilityState as "valid" | "review_required"};
    }
    if (seen.has(parsed.id)) fail("Setup identifiers must be unique.");
    seen.add(parsed.id);
    return parsed;
  });
}

export type SetupGalleryOccasion = {
  id: string; active: boolean; moderationState: "approved";
  applicableServiceCategoryCodes: string[]; sortOrder: number;
  setupGalleryLegacyEventType?: ProviderSetupEventType | null;
};
/** Server adapter must supply a COMPLETE bounded snapshot and fence both revisions at commit.
 * No physical provider revision source or feature-gate path is assumed here.
 */
export type SetupGalleryAuthority = {
  catalog: readonly SetupGalleryOccasion[];
  catalogComplete: boolean;
  catalogRevision: number;
  providerEligibilityRevision: number;
  approvedCateringCategoryCodes: readonly string[];
  approvedOccasionIds: readonly string[];
  maxSpecificOccasions: number;
  maxCatalogRecords: number;
  maxEffectiveMatches: number;
};

/** Pure validation core, deliberately not wired to a writer or a client-controlled authority. */
export function resolveSetupGalleryV2(value: unknown, ownerId: string, authority: SetupGalleryAuthority,
  previousEventType?: ProviderSetupEventType | null): ProviderSetupV2 {
  const v = record(value);
  // eventType and all derived metadata are forbidden writable fields.
  exact(v, [...baseFields.filter((key) => key !== "eventType"), ...selectionFields]);
  const scope = selection(v, authority.maxSpecificOccasions);
  positive(authority.catalogRevision); positive(authority.providerEligibilityRevision);
  positive(authority.maxCatalogRecords); positive(authority.maxEffectiveMatches);
  if (authority.catalogComplete !== true || authority.catalog.length > authority.maxCatalogRecords ||
    !authority.approvedCateringCategoryCodes.length) fail("Complete Setup Gallery V2 authority is unavailable.");
  ids(authority.approvedOccasionIds);
  const seen = new Set<string>();
  for (const occasion of authority.catalog) {
    if (!idPattern.test(occasion.id) || seen.has(occasion.id) || typeof occasion.active !== "boolean" ||
      occasion.moderationState !== "approved" || !Number.isSafeInteger(occasion.sortOrder) ||
      !Array.isArray(occasion.applicableServiceCategoryCodes) || !occasion.applicableServiceCategoryCodes.length ||
      occasion.applicableServiceCategoryCodes.some((code) => typeof code !== "string" || !code) ||
      (occasion.setupGalleryLegacyEventType !== undefined && occasion.setupGalleryLegacyEventType !== null && !scalar(occasion.setupGalleryLegacyEventType))) fail("Invalid occasion catalog authority.");
    seen.add(occasion.id);
  }
  const applicable = authority.catalog.filter((o) => o.active && o.applicableServiceCategoryCodes.some((code) => authority.approvedCateringCategoryCodes.includes(code)));
  const effective = (scope.occasionScope === "all" ? applicable : applicable.filter((o) => scope.occasionIds.includes(o.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!effective.length || effective.length > authority.maxEffectiveMatches ||
    (scope.occasionScope === "specific" && effective.length !== scope.occasionIds.length) ||
    effective.some((o) => !authority.approvedOccasionIds.includes(o.id))) fail("Setup occasion eligibility requires review.");
  const mapped = effective.map((o) => o.setupGalleryLegacyEventType).filter(scalar);
  const eventType = previousEventType && mapped.includes(previousEventType) ? previousEventType : mapped[0] ?? null;
  const result = {...base(v, ownerId, eventType), ...scope, occasionMatchIds: effective.map((o) => o.id),
    occasionCatalogRevision: authority.catalogRevision, providerEligibilityRevision: authority.providerEligibilityRevision,
    occasionEligibilityState: "valid" as const};
  return parsePrivateProviderSetups([result], ownerId, authority.maxSpecificOccasions)[0] as ProviderSetupV2;
}
