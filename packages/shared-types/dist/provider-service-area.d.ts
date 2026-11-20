export declare const PROVIDER_SERVICE_AREAS: readonly [{
    readonly key: "ormoc-city|leyte";
    readonly city: "Ormoc City";
    readonly province: "Leyte";
    readonly label: "Ormoc City, Leyte";
    readonly aliases: readonly ["Ormoc", "Ormoc City", "City of Ormoc"];
}, {
    readonly key: "albuera|leyte";
    readonly city: "Albuera";
    readonly province: "Leyte";
    readonly label: "Albuera, Leyte";
    readonly aliases: readonly ["Albuera", "Municipality of Albuera"];
}, {
    readonly key: "kananga|leyte";
    readonly city: "Kananga";
    readonly province: "Leyte";
    readonly label: "Kananga, Leyte";
    readonly aliases: readonly ["Kananga", "Municipality of Kananga"];
}, {
    readonly key: "isabel|leyte";
    readonly city: "Isabel";
    readonly province: "Leyte";
    readonly label: "Isabel, Leyte";
    readonly aliases: readonly ["Isabel", "Municipality of Isabel"];
}, {
    readonly key: "baybay-city|leyte";
    readonly city: "Baybay City";
    readonly province: "Leyte";
    readonly label: "Baybay City, Leyte";
    readonly aliases: readonly ["Baybay", "Baybay City", "City of Baybay"];
}];
export type ProviderServiceArea = (typeof PROVIDER_SERVICE_AREAS)[number];
export type ProviderServiceAreaKey = ProviderServiceArea["key"];
export type ProviderServiceAreaLabel = ProviderServiceArea["label"];
/**
 * Resolves a supported FEASTA municipality/city without maps or coordinates.
 * The optional province may be supplied separately by address-component callers.
 */
export declare function normalizeProviderServiceArea(value: unknown, province?: unknown): ProviderServiceArea | null;
export declare function normalizeExistingProviderServiceAreas(value: unknown): {
    supported: ProviderServiceAreaLabel[];
    unsupported: string[];
};
//# sourceMappingURL=provider-service-area.d.ts.map