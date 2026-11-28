export declare const AGREEMENT_TYPES = "agreementTypes";
export declare const AGREEMENT_PURPOSES: readonly ["provider_onboarding", "platform_terms", "privacy_notice", "custom"];
export type AgreementPurpose = (typeof AGREEMENT_PURPOSES)[number];
export declare const AGREEMENT_AUDIENCES: readonly ["provider", "platform", "custom"];
export type AgreementAudience = (typeof AGREEMENT_AUDIENCES)[number];
export type AgreementTypeRecord = {
    code: string;
    name: string;
    description: string;
    purpose: AgreementPurpose;
    singleton: boolean;
    requiresAcceptance: boolean;
    targetAudience: AgreementAudience;
    system: boolean;
    isActive: boolean;
    sortOrder: number;
};
export declare function initialAgreementTypes(): AgreementTypeRecord[];
export declare function parseAgreementType(id: string, data: Record<string, unknown>): AgreementTypeRecord | null;
export declare function isTrustedAgreementType(type: AgreementTypeRecord): boolean;
export declare function providerOnboardingType(types: readonly AgreementTypeRecord[]): AgreementTypeRecord | null;
//# sourceMappingURL=agreement-types.d.cts.map