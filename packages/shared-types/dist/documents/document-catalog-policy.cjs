"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGREEMENT_TYPES = exports.BUSINESS_DOCUMENT_TYPES = exports.AGREEMENT_TEMPLATES = exports.DOCUMENT_CATEGORIES = void 0;
exports.initialBusinessDocumentTypes = initialBusinessDocumentTypes;
exports.isDocumentCode = isDocumentCode;
exports.resolveVerificationDocumentPolicy = resolveVerificationDocumentPolicy;
exports.providerDocumentContext = providerDocumentContext;
exports.parseBusinessDocumentType = parseBusinessDocumentType;
exports.DOCUMENT_CATEGORIES = "documentCategories";
exports.AGREEMENT_TEMPLATES = "agreementTemplates";
exports.BUSINESS_DOCUMENT_TYPES = "businessDocumentTypes";
var agreement_types_cjs_1 = require("./agreement-types.cjs");
Object.defineProperty(exports, "AGREEMENT_TYPES", { enumerable: true, get: function () { return agreement_types_cjs_1.AGREEMENT_TYPES; } });
const DOCUMENT_CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
function rule(input) {
    return {
        effect: input.effect,
        oneOfGroup: input.oneOfGroup ?? "",
        registrationScope: input.registrationScope ?? "any",
        serviceTypes: input.serviceTypes ?? [],
        serviceCategoryCodes: input.serviceCategoryCodes ?? [],
        excludeServiceCategoryCodes: input.excludeServiceCategoryCodes ?? [],
    };
}
/**
 * Initial records migrated from the previous fixed verification policy.
 * Runtime checks read Firestore only. Administrators can replace these.
 */
function initialBusinessDocumentTypes() {
    return [
        documentType("valid_id", "Valid government ID", [rule({ effect: "required" })]),
        documentType("business_permit", "Business permit", [rule({
                effect: "required",
                registrationScope: "registered_business",
            })]),
        documentType("dti_registration", "DTI or SEC registration", [rule({
                effect: "required",
                registrationScope: "registered_business",
            })]),
        documentType("bir_registration", "BIR documentation", [rule({
                effect: "required",
                registrationScope: "registered_business",
            })]),
        documentType("sanitary_permit", "Sanitary permit", [
            rule({
                effect: "required",
                serviceTypes: ["catering", "both"],
            }),
        ]),
        documentType("mayors_permit", "Mayor's permit", [
            rule({
                effect: "required",
                serviceCategoryCodes: ["venue_provider"],
            }),
        ]),
        documentType("other", "Other supporting document", []),
    ];
}
function documentType(code, name, rules) {
    return {
        code,
        categoryCode: "business_documents",
        name,
        description: "",
        status: "active",
        sortName: name.toLowerCase(),
        rules,
    };
}
function isDocumentCode(value) {
    return typeof value === "string" &&
        value.length >= 2 &&
        value.length <= 100 &&
        DOCUMENT_CODE_PATTERN.test(value);
}
function resolveVerificationDocumentPolicy(catalog, input) {
    const requiredAll = [];
    const groups = new Map();
    for (const documentTypeRecord of catalog) {
        if (documentTypeRecord.status !== "active")
            continue;
        const matching = documentTypeRecord.rules.filter((entry) => ruleMatches(entry, input));
        if (matching.some((entry) => entry.effect === "required")) {
            requiredAll.push(documentTypeRecord.code);
            continue;
        }
        for (const entry of matching) {
            if (entry.effect !== "one_of" || !entry.oneOfGroup)
                continue;
            const group = groups.get(entry.oneOfGroup) ?? [];
            if (!group.includes(documentTypeRecord.code)) {
                group.push(documentTypeRecord.code);
            }
            groups.set(entry.oneOfGroup, group);
        }
    }
    return {
        requiredAll: [...new Set(requiredAll)].sort(),
        requiredOneOf: [...groups.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([, codes]) => [...codes].sort())
            .filter((codes) => codes.length > 0),
    };
}
function ruleMatches(entry, input) {
    if (entry.registrationScope === "individual" &&
        input.businessRegistrationType !== "individual") {
        return false;
    }
    if (entry.registrationScope === "registered_business" &&
        input.businessRegistrationType === "individual") {
        return false;
    }
    if (entry.serviceTypes.length > 0 &&
        (input.providerServiceType === null ||
            !entry.serviceTypes.includes(input.providerServiceType))) {
        return false;
    }
    if (entry.serviceCategoryCodes.length > 0 &&
        !entry.serviceCategoryCodes.some((code) => input.serviceCategories.includes(code))) {
        return false;
    }
    return !entry.excludeServiceCategoryCodes.some((code) => input.serviceCategories.includes(code));
}
function providerDocumentContext(provider) {
    const serviceType = provider.providerServiceType;
    const categories = Array.isArray(provider.serviceCategories) ?
        provider.serviceCategories.filter((value) => typeof value === "string") :
        typeof provider.providerCategory === "string" ?
            [provider.providerCategory] :
            [];
    const registration = provider.businessRegistrationType;
    return {
        providerServiceType: serviceType === "catering" ||
            serviceType === "addon" ||
            serviceType === "both" ?
            serviceType :
            null,
        serviceCategories: categories,
        businessRegistrationType: registration === "individual" ||
            registration === "registered_business" ?
            registration :
            undefined,
    };
}
function parseBusinessDocumentType(id, data) {
    if (!data ||
        data.code !== id ||
        !isDocumentCode(data.categoryCode) ||
        typeof data.name !== "string" ||
        !data.name.trim() ||
        (data.status !== "active" && data.status !== "discontinued") ||
        !Array.isArray(data.rules)) {
        return null;
    }
    const rules = data.rules.flatMap((ruleValue) => {
        const parsed = parseRule(ruleValue);
        return parsed ? [parsed] : [];
    });
    if (rules.length !== data.rules.length)
        return null;
    const name = data.name.trim();
    return {
        code: id,
        categoryCode: data.categoryCode,
        name,
        description: typeof data.description === "string" ?
            data.description.trim() :
            "",
        status: data.status,
        sortName: typeof data.sortName === "string" && data.sortName.trim() ?
            data.sortName.trim() :
            name.toLowerCase(),
        rules,
    };
}
function parseRule(value) {
    if (typeof value !== "object" ||
        value === null ||
        Array.isArray(value)) {
        return null;
    }
    const record = value;
    if (record.effect !== "required" && record.effect !== "one_of") {
        return null;
    }
    if (record.registrationScope !== "any" &&
        record.registrationScope !== "registered_business" &&
        record.registrationScope !== "individual") {
        return null;
    }
    if (typeof record.oneOfGroup !== "string" ||
        (record.effect === "one_of" &&
            !isDocumentCode(record.oneOfGroup))) {
        return null;
    }
    const serviceTypes = stringList(record.serviceTypes);
    const serviceCategoryCodes = stringList(record.serviceCategoryCodes);
    const excludeServiceCategoryCodes = stringList(record.excludeServiceCategoryCodes);
    if (!serviceTypes ||
        !serviceCategoryCodes ||
        !excludeServiceCategoryCodes ||
        serviceTypes.some((type) => type !== "catering" && type !== "addon" && type !== "both") ||
        serviceCategoryCodes.some((code) => !isDocumentCode(code)) ||
        excludeServiceCategoryCodes.some((code) => !isDocumentCode(code))) {
        return null;
    }
    return {
        effect: record.effect,
        oneOfGroup: record.oneOfGroup,
        registrationScope: record.registrationScope,
        serviceTypes: serviceTypes,
        serviceCategoryCodes,
        excludeServiceCategoryCodes,
    };
}
function stringList(value) {
    if (!Array.isArray(value))
        return null;
    if (value.some((item) => typeof item !== "string"))
        return null;
    return value;
}
//# sourceMappingURL=document-catalog-policy.cjs.map