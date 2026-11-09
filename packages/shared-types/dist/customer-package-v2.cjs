"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FoodChoiceValidationError = void 0;
exports.parseFoodChoiceGroupsV2 = parseFoodChoiceGroupsV2;
exports.isCurrentCustomerPackageV2 = isCurrentCustomerPackageV2;
exports.customerPackageEstimate = customerPackageEstimate;
exports.isPublishablePackageV2 = isPublishablePackageV2;
exports.isV2PaymentPolicyValid = isV2PaymentPolicyValid;
exports.isCustomerProviderV2 = isCustomerProviderV2;
exports.isPackageWithinProviderV2 = isPackageWithinProviderV2;
exports.isCanonicalOccasionV2 = isCanonicalOccasionV2;
class FoodChoiceValidationError extends Error {
    constructor() { super("INVALID_FOOD_CHOICE_GROUP"); this.name = "FoodChoiceValidationError"; }
}
exports.FoodChoiceValidationError = FoodChoiceValidationError;
const invalid = () => { throw new FoodChoiceValidationError(); };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const norm = (value) => value.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleLowerCase("en-PH");
const stableId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/u.test(value);
function record(value, fields) {
    if (value === null || typeof value !== "object" || Array.isArray(value) ||
        !([Object.prototype, null].includes(Object.getPrototypeOf(value))) ||
        Object.getOwnPropertySymbols(value).length ||
        Object.values(Object.getOwnPropertyDescriptors(value)).some((d) => !d.enumerable || !("value" in d)))
        return invalid();
    const data = value;
    if (Object.keys(data).length !== fields.length ||
        Object.keys(data).some((key) => !fields.includes(key)) ||
        fields.some((key) => !own(data, key)))
        return invalid();
    return data;
}
function title(value, max, allowIncomplete) {
    if (typeof value !== "string" || value.length > max || /[\p{Cc}\p{Cf}]/u.test(value) ||
        (!allowIncomplete && !value.trim()))
        return invalid();
    return value;
}
/** Validate choice metadata independent of the legacy foodInclusions array.
 * `allowIncomplete` is only for unbound editor progress, never a package write.
 * The backend must revalidate with allowIncomplete=false before creating a draft.
 */
function parseFoodChoiceGroupsV2(value, allowIncomplete = false) {
    if (!Array.isArray(value) || value.length > 10)
        return invalid();
    const seenGroupIds = new Set();
    const seenTitles = new Set();
    let totalOptions = 0;
    return value.map((group) => {
        const row = record(group, ["id", "title", "selectionCount", "options"]);
        if (!stableId(row.id) || seenGroupIds.has(row.id))
            return invalid();
        seenGroupIds.add(row.id);
        const groupTitle = title(row.title, 80, allowIncomplete);
        if (groupTitle.trim()) {
            const key = norm(groupTitle);
            if (seenTitles.has(key))
                return invalid();
            seenTitles.add(key);
        }
        if (!Array.isArray(row.options) || row.options.length > 10 ||
            (!allowIncomplete && row.options.length < 2))
            return invalid();
        totalOptions += row.options.length;
        if (totalOptions > 50)
            return invalid();
        if (typeof row.selectionCount !== "number" || !Number.isSafeInteger(row.selectionCount) || row.selectionCount < 1 ||
            row.selectionCount > 10 ||
            (!allowIncomplete && row.selectionCount > row.options.length))
            return invalid();
        const seenIds = new Set();
        const seenOptions = new Set();
        const options = row.options.map((option) => {
            const dish = record(option, ["id", "name"]);
            if (!stableId(dish.id) || seenIds.has(dish.id))
                return invalid();
            seenIds.add(dish.id);
            const name = title(dish.name, 120, allowIncomplete);
            if (name.trim()) {
                const key = norm(name);
                if (seenOptions.has(key))
                    return invalid();
                seenOptions.add(key);
            }
            return { id: dish.id, name };
        });
        return { id: row.id, title: groupTitle, selectionCount: row.selectionCount, options };
    });
}
const revision = (v) => Number.isSafeInteger(v) && v > 0;
const strings = (v) => Array.isArray(v) &&
    v.length <= 1000 && v.every(x => typeof x === "string" && x.length > 0) &&
    new Set(v).size === v.length;
const list = (v) => Array.isArray(v) && v.length <= 50 &&
    v.every(x => typeof x === "string" && x.trim().length > 0 && x.length <= 160);
const money = (v) => typeof v === "number" && Number.isFinite(v) &&
    v > 0 && v <= 10_000_000 && /^\d+(?:\.\d{1,2})?$/.test(String(v));
function isCurrentCustomerPackageV2(p, a) {
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
        (p.occasionScope !== "all" && p.occasionScope !== "specific"))
        return false;
    if (a.catalog.length > 1000 || a.catalog.some(o => !isCanonicalOccasionV2(o.id, o)))
        return false;
    const category = p.serviceCategoryCode;
    const applicable = a.catalog.filter(o => o.active === true && o.moderationState === "approved" &&
        Array.isArray(o.applicableServiceCategoryCodes) && o.applicableServiceCategoryCodes.includes(category))
        .sort((x, y) => Number(x.sortOrder) - Number(y.sortOrder) || (String(x.id) < String(y.id) ? -1 : String(x.id) > String(y.id) ? 1 : 0));
    if (applicable.some(o => typeof o.id !== "string" || !/^[a-z][a-z0-9_]{1,63}$/.test(o.id) ||
        !Number.isSafeInteger(o.sortOrder) || !revision(o.revision)) ||
        new Set(applicable.map(o => o.id)).size !== applicable.length)
        return false;
    const selected = p.occasionScope === "all" ? applicable :
        applicable.filter(o => p.occasionIds.includes(o.id));
    const ids = selected.map(o => o.id);
    if (!ids.length || ids.some(id => !a.approvedOccasionIds.includes(id)) ||
        (p.occasionScope === "all" ? p.occasionIds.length !== 0 :
            p.occasionIds.length > a.maxSpecificOccasions || ids.length !== p.occasionIds.length) ||
        JSON.stringify(ids) !== JSON.stringify(p.occasionMatchIds) || !ids.includes(p.eventType))
        return false;
    if (p.pricingModel !== undefined && p.pricingModel !== "per_pax" && p.pricingModel !== "per_bundle")
        return false;
    if (!revision(p.minimumGuests) || !revision(p.maximumGuests) ||
        p.minimumGuests > p.maximumGuests || p.maximumGuests > 100_000 || !money(p.price) ||
        !p.serviceOptions || typeof p.serviceOptions !== "object" || Array.isArray(p.serviceOptions))
        return false;
    const tiers = Object.entries(p.serviceOptions);
    if (!tiers.length || tiers.length > 3 || tiers.some(([key, v]) => !["drop_off", "buffet_setup", "full_service"].includes(key) || !v || typeof v !== "object" ||
        !money(v.price) || !list(v.includedServices) ||
        ["decorInclusions", "furnitureInclusions", "equipmentInclusions"].some(k => Object.hasOwn(v, k) && !list(v[k]))))
        return false;
    if (p.price !== Math.min(...tiers.map(([, v]) => v.price)) ||
        ["serviceInclusions", "decorInclusions", "furnitureInclusions", "foodInclusions"].some(k => !list(p[k])) ||
        Object.hasOwn(p, "equipmentInclusions") && !list(p.equipmentInclusions))
        return false;
    return true;
}
function customerPackageEstimate(unit, guests, model) {
    if (unit === null || !Number.isFinite(unit) || unit < 0 ||
        (model === "per_pax" && (!Number.isSafeInteger(guests) || guests < 1)))
        return null;
    const cents = Math.round(unit * 100) * (model === "per_pax" ? guests : 1);
    return Number.isSafeInteger(cents) && cents <= 1_000_000_000 ? cents / 100 : null;
}
/** Shared production completeness check for publication, Web and the Mobile gateway.
 * Media ownership is verified externally by the publisher, never by a client flag. */
function isPublishablePackageV2(p, maxThemeImages) {
    if (!revision(maxThemeImages) || maxThemeImages > 1000 ||
        p.sharedContractVersion !== 2 || p.offerSchemaVersion !== 2 ||
        p.occasionSchemaVersion !== 2 ||
        (p.offerStructure !== undefined && p.offerStructure !== "fixed" && p.offerStructure !== "customizable") ||
        ["individualFoodDraft", "individualFoodItems", "individualPricing"].some(k => Object.hasOwn(p, k)) ||
        !text(p.name, 2, 80) || !text(p.description, 10, 5000) ||
        !list(p.foodInclusions) || !p.foodInclusions.length)
        return false;
    try {
        const groups = p.foodChoiceGroups === undefined ? [] : parseFoodChoiceGroupsV2(p.foodChoiceGroups);
        if (p.offerStructure === "customizable" && (!groups.length ||
            (p.pricingModel !== "per_pax" && p.pricingModel !== "per_bundle")) ||
            p.offerStructure === "fixed" && groups.length)
            return false;
    }
    catch {
        return false;
    }
    if (p.paymentTermsSchemaVersion !== 2 ||
        (p.balanceDueDaysBeforeEvent !== undefined && p.balanceDueDaysBeforeEvent !== null) ||
        (p.paymentPolicy === "full_payment" ? p.depositPercentage !== 100 || p.balanceDueHoursBeforeEvent !== null :
            p.paymentPolicy !== "deposit_then_balance" || typeof p.depositPercentage !== "number" ||
                !Number.isFinite(p.depositPercentage) || p.depositPercentage <= 0 || p.depositPercentage >= 100 ||
                p.balanceDueHoursBeforeEvent !== 24))
        return false;
    const urls = p.imageUrls === undefined ? (p.imageUrl ? [p.imageUrl] : []) : p.imageUrls;
    if (!images(urls, 8) || p.imageUrl !== (urls[0] ?? "") || !Array.isArray(p.themeOptions) ||
        p.themeOptions.length > 12)
        return false;
    const ids = new Set();
    for (const theme of p.themeOptions) {
        if (!theme || typeof theme !== "object" || !text(theme.id, 2, 80) ||
            !/^[A-Za-z0-9_-]+$/.test(theme.id) || ids.has(theme.id) || !text(theme.name, 2, 80) ||
            typeof theme.description !== "string" || theme.description.length > 500 ||
            Object.keys(theme).some(k => !["id", "name", "description", "imageUrls"].includes(k)) ||
            !images(theme.imageUrls, Math.min(4, maxThemeImages)))
            return false;
        ids.add(theme.id);
    }
    if (p.themeOptions.length && (!p.serviceOptions || typeof p.serviceOptions !== "object" ||
        !("buffet_setup" in p.serviceOptions || "full_service" in p.serviceOptions)))
        return false;
    return true;
}
function text(v, min, max) {
    return typeof v === "string" && v.trim().length >= min && v.length <= max && !/[\p{Cc}\p{Cf}]/u.test(v);
}
function images(v, max) {
    return Array.isArray(v) && v.length <= max && v.every(raw => {
        if (typeof raw !== "string" || raw.length > 2048)
            return false;
        try {
            const url = new URL(raw);
            return url.protocol === "https:" && !url.username &&
                !url.password && !url.port && !url.search && !url.hash;
        }
        catch {
            return false;
        }
    });
}
/** V2 production requires explicit valid payment configuration; legacy defaults stay unchanged. */
function isV2PaymentPolicyValid(p, settings) {
    if (!settings || typeof settings !== "object")
        return false;
    const v = settings;
    if (!revision(v.minimumDepositRateBps) || !revision(v.maximumDepositRateBps) ||
        v.minimumDepositRateBps > v.maximumDepositRateBps || v.maximumDepositRateBps >= 10000)
        return false;
    const rate = typeof p.depositPercentage === "number" ? Math.round(p.depositPercentage * 100) : NaN;
    return p.paymentPolicy === "full_payment" || (p.paymentPolicy === "deposit_then_balance" &&
        typeof p.depositPercentage === "number" && Number.isSafeInteger(rate) &&
        Math.abs(p.depositPercentage * 100 - rate) < 1e-8 &&
        rate >= v.minimumDepositRateBps && rate <= v.maximumDepositRateBps);
}
/** Same provider admission for Web and the callable consumed by Mobile. */
function isCustomerProviderV2(id, p, owner) {
    return p.verificationStatus === "approved" && p.isActive === true && p.isSuspended !== true &&
        p.isDeleted !== true && p.isBlocked !== true && p.publiclyVisible !== false &&
        ["catering", "both"].includes(String(p.providerServiceType)) &&
        Array.isArray(p.operatingDays) && p.operatingDays.length > 0 &&
        p.operatingDays.every(d => ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].includes(d)) &&
        Number.isSafeInteger(p.bookingLeadTimeDays) && p.bookingLeadTimeDays >= 0 &&
        p.bookingLeadTimeDays <= 365 && typeof p.ownerId === "string" && !!p.ownerId.trim() &&
        ["businessName", "description", "address", "city", "province"].every(k => typeof p[k] === "string" && !!p[k].trim()) &&
        owner.role === "provider" && owner.providerId === id && owner.accountStatus === "active" &&
        owner.isActive !== false && owner.isBlocked !== true;
}
function isPackageWithinProviderV2(p, provider) {
    return Array.isArray(provider.serviceCategories) && provider.serviceCategories.includes(p.serviceCategoryCode) &&
        revision(provider.minGuestsPerEvent) && revision(provider.maxGuestsPerEvent) &&
        provider.minGuestsPerEvent <= provider.maxGuestsPerEvent && revision(p.minimumGuests) && revision(p.maximumGuests) &&
        p.minimumGuests >= provider.minGuestsPerEvent && p.maximumGuests <= provider.maxGuestsPerEvent;
}
function isCanonicalOccasionV2(id, o) {
    return typeof id === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(id) && o.id === id &&
        o.active === true && o.moderationState === "approved" && typeof o.label === "string" &&
        [...o.label].length >= 2 && [...o.label].length <= 80 && Number.isSafeInteger(o.sortOrder) &&
        revision(o.revision) && Array.isArray(o.applicableServiceCategoryCodes) &&
        o.applicableServiceCategoryCodes.length >= 1 && o.applicableServiceCategoryCodes.length <= 50 &&
        o.applicableServiceCategoryCodes.every(c => typeof c === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(c));
}
//# sourceMappingURL=customer-package-v2.cjs.map