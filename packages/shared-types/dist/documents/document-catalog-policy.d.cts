export declare const DOCUMENT_CATEGORIES = "documentCategories";
export declare const AGREEMENT_TEMPLATES = "agreementTemplates";
export declare const BUSINESS_DOCUMENT_TYPES = "businessDocumentTypes";
export { AGREEMENT_TYPES } from "./agreement-types.cjs";
export type DocumentServiceType = "catering" | "addon" | "both";
export type BusinessDocumentRule = {
    effect: "required" | "one_of";
    oneOfGroup: string;
    registrationScope: "any" | "registered_business" | "individual";
    serviceTypes: DocumentServiceType[];
    serviceCategoryCodes: string[];
    excludeServiceCategoryCodes: string[];
};
export type BusinessDocumentCatalogRecord = {
    code: string;
    categoryCode: string;
    name: string;
    description: string;
    status: "active" | "discontinued";
    sortName: string;
    rules: BusinessDocumentRule[];
};
export type BusinessDocumentPolicyRecord = Pick<BusinessDocumentCatalogRecord, "code" | "name" | "status"> & {
    rules: readonly BusinessDocumentRule[];
};
export type VerificationDocumentPolicy = {
    requiredAll: string[];
    requiredOneOf: string[][];
};
type ProviderDocumentContext = {
    providerServiceType: DocumentServiceType | null;
    serviceCategories: readonly string[];
    businessRegistrationType?: "individual" | "registered_business";
};
/**
 * Initial records migrated from the previous fixed verification policy.
 * Runtime checks read Firestore only. Administrators can replace these.
 */
export declare function initialBusinessDocumentTypes(): BusinessDocumentCatalogRecord[];
export declare function isDocumentCode(value: unknown): value is string;
export declare function resolveVerificationDocumentPolicy(catalog: readonly BusinessDocumentPolicyRecord[], input: ProviderDocumentContext): VerificationDocumentPolicy;
export declare function providerDocumentContext(provider: Readonly<Record<string, unknown>>): ProviderDocumentContext;
export declare function parseBusinessDocumentType(id: string, data: Record<string, unknown> | undefined): BusinessDocumentCatalogRecord | null;
//# sourceMappingURL=document-catalog-policy.d.cts.map