"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCurrentCustomerPackageV2 = isCurrentCustomerPackageV2;
exports.customerPackageEstimate = customerPackageEstimate;
const revision = (v) => Number.isSafeInteger(v) && v > 0;
const strings = (v) => Array.isArray(v) &&
    v.length <= 1000 && v.every(x => typeof x === "string" && x.length > 0) &&
    new Set(v).size === v.length;
const list = (v) => Array.isArray(v) && v.length <= 50 &&
    v.every(x => typeof x === "string" && x.trim().length > 0 && x.length <= 160);
const money = (v) => typeof v === "number" && Number.isFinite(v) &&
    v > 0 && v <= 10_000_000 && Math.abs(v * 100 - Math.round(v * 100)) <= 1e-8;
function isCurrentCustomerPackageV2(p, a) {
    if (!a.enabled || p.sharedContractVersion !== 2 || p.occasionSchemaVersion !== 2 ||
        p.offerSchemaVersion !== 2 || !revision(p.revision) || !revision(a.catalogRevision) ||
        !revision(a.providerEligibilityRevision) || !revision(a.maxSpecificOccasions) ||
        p.occasionCatalogRevision !== a.catalogRevision ||
        p.providerEligibilityRevision !== a.providerEligibilityRevision ||
        p.occasionEligibilityState !== "valid" || !strings(p.occasionIds) ||
        !strings(p.occasionMatchIds) || !strings(a.approvedOccasionIds) ||
        !strings(a.approvedCategoryCodes) || typeof p.serviceCategoryCode !== "string" ||
        !a.approvedCategoryCodes.includes(p.serviceCategoryCode) ||
        (p.occasionScope !== "all" && p.occasionScope !== "specific"))
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
//# sourceMappingURL=customer-package-v2.cjs.map