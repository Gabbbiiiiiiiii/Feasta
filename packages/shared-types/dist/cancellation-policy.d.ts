export declare const CANCELLATION_POLICY_SCHEMA_VERSION: 1;
export declare const CANCELLATION_POLICY_SETTINGS_DOC_ID: "cancellationPolicy";
export declare const CANCELLATION_CUTOFF_HOURS_MIN_HARD = 1;
export declare const CANCELLATION_CUTOFF_HOURS_MAX_HARD: number;
export declare const DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS = 72;
export declare const DEFAULT_ADMIN_CANCELLATION_MIN_HOURS = 24;
export declare const DEFAULT_ADMIN_CANCELLATION_MAX_HOURS = 720;
export declare const CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH = 1000;
export type ProviderCancellationPolicyMode = "admin_default" | "provider_custom";
export type EffectiveCancellationPolicySourceKind = "admin_default" | "provider_custom";
export type AdminDefaultCancellationPolicy<TTimestamp = unknown> = {
    schemaVersion: typeof CANCELLATION_POLICY_SCHEMA_VERSION;
    policyVersion: number;
    defaultCutoffHoursBeforeEvent: number;
    minCutoffHoursBeforeEvent: number;
    maxCutoffHoursBeforeEvent: number;
    guidanceNote: string | null;
    updatedAt: TTimestamp;
    updatedBy: string | null;
};
export type AdminDefaultCancellationPolicyDto = {
    policyVersion: number;
    defaultCutoffHoursBeforeEvent: number;
    minCutoffHoursBeforeEvent: number;
    maxCutoffHoursBeforeEvent: number;
    guidanceNote: string | null;
    updatedAt: string | null;
    isSeededFallback: boolean;
};
export type ProviderCancellationPolicy<TTimestamp = unknown> = {
    schemaVersion: typeof CANCELLATION_POLICY_SCHEMA_VERSION;
    mode: "admin_default";
    policyVersion: number;
    effectiveAt: TTimestamp;
} | {
    schemaVersion: typeof CANCELLATION_POLICY_SCHEMA_VERSION;
    mode: "provider_custom";
    cutoffHoursBeforeEvent: number;
    policyVersion: number;
    effectiveAt: TTimestamp;
};
export type ProviderCancellationPolicyDto = {
    mode: ProviderCancellationPolicyMode;
    cutoffHoursBeforeEvent: number | null;
    policyVersion: number;
    effectiveAt: string;
};
export type CancellationPolicySnapshot<TTimestamp = unknown> = {
    schemaVersion: typeof CANCELLATION_POLICY_SCHEMA_VERSION;
    sourceKind: EffectiveCancellationPolicySourceKind;
    cutoffHoursBeforeEvent: number;
    eventStartAt: TTimestamp;
    cancellationCutoffAt: TTimestamp;
    submittedPastCutoff: boolean;
    adminPolicyVersion: number;
    providerPolicyVersion: number | null;
    capturedAt: TTimestamp;
};
export type CancellationCutoffDisclosure = {
    sourceKind: EffectiveCancellationPolicySourceKind;
    cutoffHoursBeforeEvent: number;
    guidanceNote: string | null;
};
export declare function hoursToDaysAndHours(totalHours: number): {
    days: number;
    hours: number;
};
export declare function daysAndHoursToTotalHours(days: number, hours: number): number;
export declare function formatCancellationCutoffDuration(totalHours: number): string;
export declare function computeCancellationCutoffDate(eventStart: Date, cutoffHoursBeforeEvent: number): Date;
//# sourceMappingURL=cancellation-policy.d.ts.map