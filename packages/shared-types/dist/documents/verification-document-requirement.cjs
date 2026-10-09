"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificationDocumentRequirement = verificationDocumentRequirement;
exports.verificationDocumentsSatisfyPolicy = verificationDocumentsSatisfyPolicy;
function verificationDocumentRequirement(type, policy) {
    if (policy.requiredAll.includes(type))
        return "required";
    if (policy.requiredOneOf.some((group) => group.includes(type))) {
        return "one_of";
    }
    return "optional";
}
function verificationDocumentsSatisfyPolicy(documentTypes, policy) {
    return policy.requiredAll.every((type) => documentTypes.has(type)) &&
        policy.requiredOneOf.every((group) => group.some((type) => documentTypes.has(type)));
}
//# sourceMappingURL=verification-document-requirement.cjs.map