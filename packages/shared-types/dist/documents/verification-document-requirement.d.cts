export interface ProviderVerificationDocumentPolicy {
    requiredAll: readonly string[];
    requiredOneOf: readonly (readonly string[])[];
}
export declare function verificationDocumentRequirement(type: string, policy: ProviderVerificationDocumentPolicy): "required" | "one_of" | "optional";
export declare function verificationDocumentsSatisfyPolicy(documentTypes: ReadonlySet<string>, policy: ProviderVerificationDocumentPolicy): boolean;
//# sourceMappingURL=verification-document-requirement.d.cts.map