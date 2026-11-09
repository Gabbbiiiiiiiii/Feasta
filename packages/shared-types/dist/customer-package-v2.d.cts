/** Canonical V2 food-choice metadata validation; lifecycle gates remain separate. */
import type { FoodChoiceGroupV2 } from "./provider-package-v2.cjs";
export declare class FoodChoiceValidationError extends Error {
    constructor();
}
/** Validate choice metadata independent of the legacy foodInclusions array.
 * `allowIncomplete` is only for unbound editor progress, never a package write.
 * The backend must revalidate with allowIncomplete=false before creating a draft.
 */
export declare function parseFoodChoiceGroupsV2(value: unknown, allowIncomplete?: boolean): FoodChoiceGroupV2[];
/** Only server-loaded authority may be passed to this predicate. */
type Row = Readonly<Record<string, unknown>>;
export interface CustomerPackageV2Authority {
    enabled: boolean;
    catalogRevision: unknown;
    providerEligibilityRevision: unknown;
    maxSpecificOccasions: unknown;
    maxThemeImages?: unknown;
    approvedOccasionIds: unknown;
    approvedCategoryCodes: unknown;
    catalog: readonly Row[];
}
export declare function isCurrentCustomerPackageV2(p: Row, a: CustomerPackageV2Authority): boolean;
export declare function customerPackageEstimate(unit: number | null, guests: number, model?: "per_pax" | "per_bundle"): number | null;
/** Shared production completeness check for publication, Web and the Mobile gateway.
 * Media ownership is verified externally by the publisher, never by a client flag. */
export declare function isPublishablePackageV2(p: Row, maxThemeImages: unknown): boolean;
/** V2 production requires explicit valid payment configuration; legacy defaults stay unchanged. */
export declare function isV2PaymentPolicyValid(p: Row, settings: unknown): boolean;
/** Same provider admission for Web and the callable consumed by Mobile. */
export declare function isCustomerProviderV2(id: string, p: Row, owner: Row): boolean;
export declare function isPackageWithinProviderV2(p: Row, provider: Row): boolean;
export declare function isCanonicalOccasionV2(id: unknown, o: Row): boolean;
export {};
//# sourceMappingURL=customer-package-v2.d.cts.map