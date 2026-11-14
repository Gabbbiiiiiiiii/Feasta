/**
 * Pure agreement authoring contract, also imported by the web editor.
 * Shared by Web and Functions; keep this module free of server dependencies.
 * Never call the formatter when reading published history or snapshots.
 */
export type AgreementTextSection = {
    title: string;
    paragraphs: string[];
};
export declare class AgreementTextValidationError extends Error {
}
export declare function validateAgreementSections(value: unknown): AgreementTextSection[];
export declare function agreementSectionsToText(sections: readonly AgreementTextSection[]): string;
export declare function parseAgreementText(rawText: string): {
    normalizedText: string;
    sections: AgreementTextSection[];
};
//# sourceMappingURL=agreement-text.d.cts.map