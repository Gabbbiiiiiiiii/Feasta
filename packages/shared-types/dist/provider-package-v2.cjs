"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PRIVATE_OCCASION_LENGTH = exports.MAX_PRIVATE_PACKAGE_OCCASIONS = exports.MAX_DROP_OFF_ORDER_QUANTITY = void 0;
exports.isDropOffOrderQuantity = isDropOffOrderQuantity;
exports.dropOffOrderLimit = dropOffOrderLimit;
exports.privateOccasionKey = privateOccasionKey;
exports.parsePrivatePackageOccasions = parsePrivatePackageOccasions;
exports.MAX_DROP_OFF_ORDER_QUANTITY = 100;
function isDropOffOrderQuantity(value) {
    return typeof value === "number" && Number.isSafeInteger(value) &&
        value >= 1 && value <= exports.MAX_DROP_OFF_ORDER_QUANTITY;
}
/** Legacy offers retain the previous Special Request quantity limit. */
function dropOffOrderLimit(pricingModel, configuredLimit) {
    if (pricingModel === undefined)
        return exports.MAX_DROP_OFF_ORDER_QUANTITY;
    return pricingModel === "per_bundle" && isDropOffOrderQuantity(configuredLimit) ? configuredLimit : 1;
}
exports.MAX_PRIVATE_PACKAGE_OCCASIONS = 10;
exports.MAX_PRIVATE_OCCASION_LENGTH = 60;
function privateOccasionKey(value) {
    return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-PH");
}
function parsePrivatePackageOccasions(value) {
    if (!Array.isArray(value) || value.length > exports.MAX_PRIVATE_PACKAGE_OCCASIONS) {
        throw new Error("Invalid custom occasions.");
    }
    const seen = new Set();
    return value.map((item) => {
        if (typeof item !== "string" || /[\p{Cc}\p{Cf}]/u.test(item)) {
            throw new Error("Invalid custom occasion name.");
        }
        const name = item.trim().replace(/\s+/gu, " ");
        const key = privateOccasionKey(name);
        if (name.length < 2 || name.length > exports.MAX_PRIVATE_OCCASION_LENGTH || seen.has(key)) {
            throw new Error("Invalid or duplicate custom occasion name.");
        }
        seen.add(key);
        return name;
    });
}
//# sourceMappingURL=provider-package-v2.cjs.map