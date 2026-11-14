"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGREEMENT_AUDIENCES = exports.AGREEMENT_PURPOSES = exports.AGREEMENT_TYPES = void 0;
exports.initialAgreementTypes = initialAgreementTypes;
exports.parseAgreementType = parseAgreementType;
exports.isTrustedAgreementType = isTrustedAgreementType;
exports.providerOnboardingType = providerOnboardingType;
exports.AGREEMENT_TYPES = "agreementTypes";
// "custom" stays parseable so an already-stored agreementTypes/custom_agreement
// document does not crash readers. It is not seeded and is not trusted.
exports.AGREEMENT_PURPOSES = [
    "provider_onboarding",
    "platform_terms",
    "privacy_notice",
    "custom",
];
exports.AGREEMENT_AUDIENCES = ["provider", "platform", "custom"];
const CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
function initialAgreementTypes() {
    return [
        {
            code: "provider_agreement",
            name: "Provider Agreement",
            description: "Agreement providers review and accept during onboarding.",
            purpose: "provider_onboarding",
            singleton: true,
            requiresAcceptance: true,
            targetAudience: "provider",
            system: true,
            isActive: true,
            sortOrder: 10,
        },
        {
            code: "terms_of_service",
            name: "Terms of Service",
            description: "Rules governing use of the FEASTA platform.",
            purpose: "platform_terms",
            singleton: true,
            requiresAcceptance: false,
            targetAudience: "platform",
            system: true,
            isActive: true,
            sortOrder: 20,
        },
        {
            code: "privacy_policy",
            name: "Privacy Policy",
            description: "Explains FEASTA's handling of personal information.",
            purpose: "privacy_notice",
            singleton: true,
            requiresAcceptance: false,
            targetAudience: "platform",
            system: true,
            isActive: true,
            sortOrder: 30,
        },
    ];
}
function parseAgreementType(id, data) {
    if (!CODE_PATTERN.test(id) || id.length < 2 || id.length > 100)
        return null;
    if (typeof data.code === "string" && data.code !== id)
        return null;
    if (typeof data.name !== "string")
        return null;
    const name = data.name.trim();
    if (name.length < 2 || name.length > 120)
        return null;
    if (!isPurpose(data.purpose) || typeof data.singleton !== "boolean")
        return null;
    if (typeof data.requiresAcceptance !== "boolean")
        return null;
    if (!isAudience(data.targetAudience) || typeof data.system !== "boolean") {
        return null;
    }
    if (typeof data.isActive !== "boolean")
        return null;
    if (!isSortOrder(data.sortOrder))
        return null;
    const description = typeof data.description === "string" ?
        data.description.trim() :
        "";
    if (description.length > 500)
        return null;
    return {
        code: id,
        name,
        description,
        purpose: data.purpose,
        singleton: data.singleton,
        requiresAcceptance: data.requiresAcceptance,
        targetAudience: data.targetAudience,
        system: data.system,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
    };
}
function isTrustedAgreementType(type) {
    const contract = initialAgreementTypes().find((entry) => entry.code === type.code);
    if (!contract || type.system !== true)
        return false;
    return type.purpose === contract.purpose &&
        type.singleton === contract.singleton &&
        type.requiresAcceptance === contract.requiresAcceptance &&
        type.targetAudience === contract.targetAudience;
}
function providerOnboardingType(types) {
    const matches = types.filter((type) => isTrustedAgreementType(type) && type.purpose === "provider_onboarding");
    return matches.length === 1 ? matches[0] : null;
}
function isPurpose(value) {
    return typeof value === "string" &&
        exports.AGREEMENT_PURPOSES.includes(value);
}
function isAudience(value) {
    return typeof value === "string" &&
        exports.AGREEMENT_AUDIENCES.includes(value);
}
function isSortOrder(value) {
    return typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 1000;
}
//# sourceMappingURL=agreement-types.cjs.map