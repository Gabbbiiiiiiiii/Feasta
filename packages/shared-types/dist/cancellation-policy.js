export const CANCELLATION_POLICY_SCHEMA_VERSION = 1;
export const CANCELLATION_POLICY_SETTINGS_DOC_ID = "cancellationPolicy";
export const CANCELLATION_CUTOFF_HOURS_MIN_HARD = 1;
export const CANCELLATION_CUTOFF_HOURS_MAX_HARD = 24 * 365;
export const DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS = 72;
export const DEFAULT_ADMIN_CANCELLATION_MIN_HOURS = 24;
export const DEFAULT_ADMIN_CANCELLATION_MAX_HOURS = 720;
export const CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH = 1_000;
export function hoursToDaysAndHours(totalHours) {
    const safe = Number.isFinite(totalHours) && totalHours > 0
        ? Math.trunc(totalHours)
        : 0;
    return {
        days: Math.floor(safe / 24),
        hours: safe % 24,
    };
}
export function daysAndHoursToTotalHours(days, hours) {
    if (!Number.isInteger(days) ||
        !Number.isInteger(hours) ||
        days < 0 ||
        hours < 0 ||
        hours > 23) {
        return Number.NaN;
    }
    return days * 24 + hours;
}
export function formatCancellationCutoffDuration(totalHours) {
    const { days, hours } = hoursToDaysAndHours(totalHours);
    const parts = [];
    if (days > 0) {
        parts.push(`${days} ${days === 1 ? "day" : "days"}`);
    }
    if (hours > 0 || parts.length === 0) {
        parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
    }
    return parts.join(" ");
}
export function computeCancellationCutoffDate(eventStart, cutoffHoursBeforeEvent) {
    return new Date(eventStart.getTime() - cutoffHoursBeforeEvent * 3_600_000);
}
//# sourceMappingURL=cancellation-policy.js.map