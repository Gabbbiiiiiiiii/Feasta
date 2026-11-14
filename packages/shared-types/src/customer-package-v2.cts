/** Canonical V2 food-choice metadata validation; lifecycle gates remain separate. */
// Resolve against the canonical shared-types build through tsconfig paths.
import type {FoodChoiceOptionV2, FoodChoiceGroupV2} from "./provider-package-v2.cjs";

export class FoodChoiceValidationError extends Error {
  constructor() { super("INVALID_FOOD_CHOICE_GROUP"); this.name = "FoodChoiceValidationError"; }
}

const invalid = (): never => {throw new FoodChoiceValidationError();};
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const norm = (value: string) => value.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleLowerCase("en-PH");
const stableId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/u.test(value);
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      !([Object.prototype, null].includes(Object.getPrototypeOf(value))) ||
      Object.getOwnPropertySymbols(value).length ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some((d) => !d.enumerable || !("value" in d))) return invalid();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== fields.length ||
      Object.keys(data).some((key) => !fields.includes(key)) ||
      fields.some((key) => !own(data, key))) return invalid();
  return data;
}
function title(value: unknown, max: number, allowIncomplete: boolean): string {
  if (typeof value !== "string" || value.length > max || /[\p{Cc}\p{Cf}]/u.test(value) ||
      (!allowIncomplete && !value.trim())) return invalid();
  return value;
}
/** Validate choice metadata independent of the legacy foodInclusions array.
 * `allowIncomplete` is only for unbound editor progress, never a package write.
 * The backend must revalidate with allowIncomplete=false before creating a draft.
 */
export function parseFoodChoiceGroupsV2(value: unknown, allowIncomplete = false): FoodChoiceGroupV2[] {
  if (!Array.isArray(value) || value.length > 10) return invalid();
  const seenGroupIds = new Set<string>();
  const seenTitles = new Set<string>();
  let totalOptions = 0;
  return value.map((group): FoodChoiceGroupV2 => {
    const row = record(group, ["id", "title", "selectionCount", "options"]);
    if (!stableId(row.id) || seenGroupIds.has(row.id)) return invalid();
    seenGroupIds.add(row.id);
    const groupTitle = title(row.title, 80, allowIncomplete);
    if (groupTitle.trim()) {
      const key = norm(groupTitle);
      if (seenTitles.has(key)) return invalid();
      seenTitles.add(key);
    }
    if (!Array.isArray(row.options) || row.options.length > 10 ||
        (!allowIncomplete && row.options.length < 2)) return invalid();
    totalOptions += row.options.length;
    if (totalOptions > 50) return invalid();
    if (typeof row.selectionCount !== "number" || !Number.isSafeInteger(row.selectionCount) || row.selectionCount < 1 ||
        row.selectionCount > 10 ||
        (!allowIncomplete && row.selectionCount > row.options.length)) return invalid();
    const seenIds = new Set<string>();
    const seenOptions = new Set<string>();
    const options = row.options.map((option): FoodChoiceOptionV2 => {
      const dish = record(option, ["id", "name"]);
      if (!stableId(dish.id) || seenIds.has(dish.id)) return invalid();
      seenIds.add(dish.id);
      const name = title(dish.name, 120, allowIncomplete);
      if (name.trim()) {
        const key = norm(name);
        if (seenOptions.has(key)) return invalid();
        seenOptions.add(key);
      }
      return {id: dish.id, name};
    });
    return {id: row.id, title: groupTitle, selectionCount: row.selectionCount as number, options};
  });
}

/** Only server-loaded authority may be passed to this predicate. */
type Row = Readonly<Record<string, unknown>>;
export interface CustomerPackageV2Authority {
  enabled: boolean; catalogRevision: unknown; providerEligibilityRevision: unknown;
  maxSpecificOccasions: unknown; maxThemeImages?: unknown; approvedOccasionIds: unknown; approvedCategoryCodes: unknown;
  catalog: readonly Row[];
}
const revision = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) &&
  v.length <= 1000 && v.every(x => typeof x === "string" && x.length > 0) &&
  new Set(v).size === v.length;
const list = (v: unknown): boolean => Array.isArray(v) && v.length <= 50 &&
  v.every(x => typeof x === "string" && x.trim().length > 0 && x.length <= 160);
const money = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) &&
  v > 0 && v <= 10_000_000 && /^\d+(?:\.\d{1,2})?$/.test(String(v));
export function isCurrentCustomerPackageV2(p: Row, a: CustomerPackageV2Authority): boolean {
  if (!isPublishablePackageV2(p, a.maxThemeImages) || p.status !== "published" ||
      p.isActive !== true || p.isPublished !== true || p.providerPubliclyVisible !== true ||
      p.isDeleted !== false || !p.publishedAt || !a.enabled || p.sharedContractVersion !== 2 || p.occasionSchemaVersion !== 2 ||
      p.offerSchemaVersion !== 2 || !revision(p.revision) || !revision(a.catalogRevision) ||
      !revision(a.providerEligibilityRevision) || !revision(a.maxSpecificOccasions) || a.maxSpecificOccasions > 100 ||
      p.occasionCatalogRevision !== a.catalogRevision ||
      p.providerEligibilityRevision !== a.providerEligibilityRevision ||
      p.occasionEligibilityState !== "valid" || !strings(p.occasionIds) ||
      !strings(p.occasionMatchIds) || !strings(a.approvedOccasionIds) ||
      !strings(a.approvedCategoryCodes) || typeof p.serviceCategoryCode !== "string" ||
      !a.approvedCategoryCodes.includes(p.serviceCategoryCode) ||
      (p.occasionScope !== "all" && p.occasionScope !== "specific")) return false;
  if (a.catalog.length > 1000 || a.catalog.some(o => !isCanonicalOccasionV2(o.id, o))) return false;
  const category = p.serviceCategoryCode;
  const applicable = a.catalog.filter(o => o.active === true && o.moderationState === "approved" &&
    Array.isArray(o.applicableServiceCategoryCodes) && o.applicableServiceCategoryCodes.includes(category))
    .sort((x,y) => Number(x.sortOrder) - Number(y.sortOrder) || (String(x.id) < String(y.id) ? -1 : String(x.id) > String(y.id) ? 1 : 0));
  if (applicable.some(o => typeof o.id !== "string" || !/^[a-z][a-z0-9_]{1,63}$/.test(o.id) ||
      !Number.isSafeInteger(o.sortOrder) || !revision(o.revision)) ||
      new Set(applicable.map(o => o.id)).size !== applicable.length) return false;
  const selected = p.occasionScope === "all" ? applicable :
    applicable.filter(o => (p.occasionIds as string[]).includes(o.id as string));
  const ids = selected.map(o => o.id as string);
  if (!ids.length || ids.some(id => !(a.approvedOccasionIds as string[]).includes(id)) ||
      (p.occasionScope === "all" ? p.occasionIds.length !== 0 :
        p.occasionIds.length > (a.maxSpecificOccasions as number) || ids.length !== p.occasionIds.length) ||
      JSON.stringify(ids) !== JSON.stringify(p.occasionMatchIds) || !ids.includes(p.eventType as string)) return false;
  if (p.pricingModel !== undefined && p.pricingModel !== "per_pax" && p.pricingModel !== "per_bundle") return false;
  if (!revision(p.minimumGuests) || !revision(p.maximumGuests) ||
      p.minimumGuests > p.maximumGuests || p.maximumGuests > 100_000 || !money(p.price) ||
      !p.serviceOptions || typeof p.serviceOptions !== "object" || Array.isArray(p.serviceOptions)) return false;
  const tiers = Object.entries(p.serviceOptions);
  if (!tiers.length || tiers.length > 3 || tiers.some(([key, v]) =>
    !["drop_off", "buffet_setup", "full_service"].includes(key) || !v || typeof v !== "object" ||
    !money(v.price) || !list(v.includedServices) ||
    ["decorInclusions", "furnitureInclusions", "equipmentInclusions"].some(k =>
      Object.hasOwn(v, k) && !list(v[k])))) return false;
  if (p.price !== Math.min(...tiers.map(([,v]) => v.price)) ||
      ["serviceInclusions", "decorInclusions", "furnitureInclusions", "foodInclusions"].some(k => !list(p[k])) ||
      Object.hasOwn(p,"equipmentInclusions") && !list(p.equipmentInclusions)) return false;
  return true;
}
export function customerPackageEstimate(unit: number | null, guests: number,
  model?: "per_pax" | "per_bundle"): number | null {
  if (unit === null || !Number.isFinite(unit) || unit < 0 ||
      (model === "per_pax" && (!Number.isSafeInteger(guests) || guests < 1))) return null;
  const cents = Math.round(unit * 100) * (model === "per_pax" ? guests : 1);
  return Number.isSafeInteger(cents) && cents <= 1_000_000_000 ? cents / 100 : null;
}

/** Shared production completeness check for publication, Web and the Mobile gateway.
 * Media ownership is verified externally by the publisher, never by a client flag. */
/**
 * Allow LF and CRLF paragraphs in package descriptions.
 * The original value is never normalized or rewritten.
 * Other control, format, surrogate and invisible characters remain invalid.
 */
function publicationDescriptionText(
  value: unknown,
  min: number,
  max: number,
): boolean {
  if (typeof value !== "string" ||
      value.trim().length < min ||
      value.length > max) {
    return false;
  }

  return !/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u
    .test(value.replace(/\r\n|\n/gu, ""));
}
export function isPublishablePackageV2(p: Row, maxThemeImages: unknown): boolean {
  if (!revision(maxThemeImages) || maxThemeImages > 1000 ||
      p.sharedContractVersion !== 2 || p.offerSchemaVersion !== 2 ||
      p.occasionSchemaVersion !== 2 ||
      (p.offerStructure !== undefined && p.offerStructure !== "fixed" && p.offerStructure !== "customizable") ||
      ["individualFoodDraft", "individualFoodItems", "individualPricing"].some(k => Object.hasOwn(p,k)) ||
      !text(p.name,2,80) || !publicationDescriptionText(p.description, 10, 5000) ||
      !list(p.foodInclusions) || !(p.foodInclusions as string[]).length) return false;
  try {
    const groups = p.foodChoiceGroups === undefined ? [] : parseFoodChoiceGroupsV2(p.foodChoiceGroups);
    if (p.offerStructure === "customizable" && (!groups.length ||
        (p.pricingModel !== "per_pax" && p.pricingModel !== "per_bundle")) ||
        p.offerStructure === "fixed" && groups.length) return false;
  } catch {return false;}
  if (p.paymentTermsSchemaVersion !== 2 ||
      (p.balanceDueDaysBeforeEvent !== undefined && p.balanceDueDaysBeforeEvent !== null) ||
      (p.paymentPolicy === "full_payment" ? p.depositPercentage !== 100 || p.balanceDueHoursBeforeEvent !== null :
        p.paymentPolicy !== "deposit_then_balance" || typeof p.depositPercentage !== "number" ||
        !Number.isFinite(p.depositPercentage) || p.depositPercentage <= 0 || p.depositPercentage >= 100 ||
        p.balanceDueHoursBeforeEvent !== 24)) return false;
  const urls = p.imageUrls === undefined ? (p.imageUrl ? [p.imageUrl] : []) : p.imageUrls;
  if (!images(urls,8) || p.imageUrl !== (urls[0] ?? "") || !Array.isArray(p.themeOptions) ||
      p.themeOptions.length > 12) return false;
  const ids = new Set();
  for (const theme of p.themeOptions) {
    if (!theme || typeof theme !== "object" || !text(theme.id,2,80) ||
        !/^[A-Za-z0-9_-]+$/.test(theme.id) || ids.has(theme.id) || !text(theme.name,2,80) ||
        typeof theme.description !== "string" || theme.description.length > 500 ||
        Object.keys(theme).some(k => !["id","name","description","imageUrls"].includes(k)) ||
        !images(theme.imageUrls,Math.min(4,maxThemeImages))) return false;
    ids.add(theme.id);
  }
  if (p.themeOptions.length && (!p.serviceOptions || typeof p.serviceOptions !== "object" ||
      !("buffet_setup" in p.serviceOptions || "full_service" in p.serviceOptions))) return false;
  return true;
}
function text(v: unknown, min: number, max: number): v is string {
  return typeof v === "string" && v.trim().length >= min && v.length <= max && !/[\p{Cc}\p{Cf}]/u.test(v);
}
function images(v: unknown, max: number): v is string[] {
  return Array.isArray(v) && v.length <= max && v.every(raw => {
    if (typeof raw !== "string" || raw.length > 2048) return false;
    try {const url = new URL(raw); return url.protocol === "https:" && !url.username &&
      !url.password && !url.port && !url.search && !url.hash;} catch {return false;}
  });
}

/** V2 production requires explicit valid payment configuration; legacy defaults stay unchanged. */
export function isV2PaymentPolicyValid(p: Row, settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  const v = settings as Row;
  if (!revision(v.minimumDepositRateBps) || !revision(v.maximumDepositRateBps) ||
      v.minimumDepositRateBps > v.maximumDepositRateBps || v.maximumDepositRateBps >= 10000) return false;
  const rate = typeof p.depositPercentage === "number" ? Math.round(p.depositPercentage * 100) : NaN;
  return p.paymentPolicy === "full_payment" || (p.paymentPolicy === "deposit_then_balance" &&
    typeof p.depositPercentage === "number" && Number.isSafeInteger(rate) &&
    Math.abs(p.depositPercentage * 100 - rate) < 1e-8 &&
    rate >= v.minimumDepositRateBps && rate <= v.maximumDepositRateBps);
}
/** Same provider admission for Web and the callable consumed by Mobile. */
export function isCustomerProviderV2(id: string, p: Row, owner: Row): boolean {
  return p.verificationStatus === "approved" && p.isActive === true && p.isSuspended !== true &&
    p.isDeleted !== true && p.isBlocked !== true && p.publiclyVisible !== false &&
    ["catering","both"].includes(String(p.providerServiceType)) &&
    Array.isArray(p.operatingDays) && p.operatingDays.length > 0 &&
    p.operatingDays.every(d => ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].includes(d)) &&
    Number.isSafeInteger(p.bookingLeadTimeDays) && (p.bookingLeadTimeDays as number) >= 0 &&
    (p.bookingLeadTimeDays as number) <= 365 && typeof p.ownerId === "string" && !!p.ownerId.trim() &&
    ["businessName","description","address","city","province"].every(k => typeof p[k] === "string" && !!p[k].trim()) &&
    owner.role === "provider" && owner.providerId === id && owner.accountStatus === "active" &&
    owner.isActive !== false && owner.isBlocked !== true;
}

export function isPackageWithinProviderV2(p: Row, provider: Row): boolean {
  return Array.isArray(provider.serviceCategories) && provider.serviceCategories.includes(p.serviceCategoryCode) &&
    revision(provider.minGuestsPerEvent) && revision(provider.maxGuestsPerEvent) &&
    provider.minGuestsPerEvent <= provider.maxGuestsPerEvent && revision(p.minimumGuests) && revision(p.maximumGuests) &&
    p.minimumGuests >= provider.minGuestsPerEvent && p.maximumGuests <= provider.maxGuestsPerEvent;
}

export function isCanonicalOccasionV2(id: unknown, o: Row): boolean {
  return typeof id === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(id) && o.id === id &&
    o.active === true && o.moderationState === "approved" && typeof o.label === "string" &&
    [...o.label].length >= 2 && [...o.label].length <= 80 && Number.isSafeInteger(o.sortOrder) &&
    revision(o.revision) && Array.isArray(o.applicableServiceCategoryCodes) &&
    o.applicableServiceCategoryCodes.length >= 1 && o.applicableServiceCategoryCodes.length <= 50 &&
    o.applicableServiceCategoryCodes.every(c => typeof c === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(c));
}
