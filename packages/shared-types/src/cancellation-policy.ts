export const CANCELLATION_POLICY_SCHEMA_VERSION = 1 as const;
export const CANCELLATION_POLICY_SETTINGS_DOC_ID = "cancellationPolicy" as const;

export const CANCELLATION_CUTOFF_HOURS_MIN_HARD = 1;
export const CANCELLATION_CUTOFF_HOURS_MAX_HARD = 24 * 365;

export const DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS = 72;
export const DEFAULT_ADMIN_CANCELLATION_MIN_HOURS = 24;
export const DEFAULT_ADMIN_CANCELLATION_MAX_HOURS = 720;

export const CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH = 1_000;

export type ProviderCancellationPolicyMode =
  | "admin_default"
  | "provider_custom";

export type EffectiveCancellationPolicySourceKind =
  | "admin_default"
  | "provider_custom";

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

export type ProviderCancellationPolicy<TTimestamp = unknown> =
  | {
    schemaVersion: typeof CANCELLATION_POLICY_SCHEMA_VERSION;
    mode: "admin_default";
    policyVersion: number;
    effectiveAt: TTimestamp;
  }
  | {
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

export function hoursToDaysAndHours(totalHours: number): {
  days: number;
  hours: number;
} {
  const safe = Number.isFinite(totalHours) && totalHours > 0
    ? Math.trunc(totalHours)
    : 0;
  return {
    days: Math.floor(safe / 24),
    hours: safe % 24,
  };
}

export function daysAndHoursToTotalHours(days: number, hours: number): number {
  if (
    !Number.isInteger(days) ||
    !Number.isInteger(hours) ||
    days < 0 ||
    hours < 0 ||
    hours > 23
  ) {
    return Number.NaN;
  }
  return days * 24 + hours;
}

export function formatCancellationCutoffDuration(totalHours: number): string {
  const {days, hours} = hoursToDaysAndHours(totalHours);
  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  }
  if (hours > 0 || parts.length === 0) {
    parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  }
  return parts.join(" ");
}

export function computeCancellationCutoffDate(
  eventStart: Date,
  cutoffHoursBeforeEvent: number,
): Date {
  return new Date(eventStart.getTime() - cutoffHoursBeforeEvent * 3_600_000);
}
