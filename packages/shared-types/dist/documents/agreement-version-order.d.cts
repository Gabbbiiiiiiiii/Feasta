/**
 * Numeric dotted version order for one agreement lineage.
 *
 * Legacy labels such as 2026-09-27 are not rewritten and are not compared
 * numerically. They still participate in exact duplicate detection. A new
 * numeric version is allowed beside an incomparable legacy label. Numeric
 * versions must be strictly newer than every other numeric version in that
 * same agreement.
 */
export declare function isRealCalendarDate(value: string): boolean;
export declare function isNumericDottedVersion(value: string): boolean;
export declare function compareNumericAgreementVersions(left: string, right: string): -1 | 0 | 1 | null;
export declare function suggestNextAgreementVersion(current: string | null): string;
export declare function agreementVersionChoiceError(candidate: string, versions: readonly {
    version: string;
    status?: string;
}[], ignoring?: string): string | null;
//# sourceMappingURL=agreement-version-order.d.cts.map