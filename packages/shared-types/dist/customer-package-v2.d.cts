/** Only server-loaded authority may be passed to this predicate. */
type Row = Readonly<Record<string, unknown>>;
export interface CustomerPackageV2Authority {
    enabled: boolean;
    catalogRevision: unknown;
    providerEligibilityRevision: unknown;
    maxSpecificOccasions: unknown;
    approvedOccasionIds: unknown;
    approvedCategoryCodes: unknown;
    catalog: readonly Row[];
}
export declare function isCurrentCustomerPackageV2(p: Row, a: CustomerPackageV2Authority): boolean;
export declare function customerPackageEstimate(unit: number | null, guests: number, model?: "per_pax" | "per_bundle"): number | null;
export {};
//# sourceMappingURL=customer-package-v2.d.cts.map