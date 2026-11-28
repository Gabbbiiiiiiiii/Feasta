import {formatCancellationCutoffDuration} from "@feasta/shared-types";

export type BookingCancellationCutoffView = {
  sourceKind: "admin_default" | "provider_custom";
  cutoffHoursBeforeEvent: number;
  cancellationCutoffAt: string;
  submittedPastCutoff: boolean;
};

function toIsoString(value: unknown): string | null {
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (value && typeof value === "object" && "toDate" in value && typeof (value as {toDate?: unknown}).toDate === "function") {
    const date = (value as {toDate: () => Date}).toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export function parseBookingCancellationCutoffView(
  value: unknown,
): BookingCancellationCutoffView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const sourceKind = record.sourceKind;
  if (sourceKind !== "admin_default" && sourceKind !== "provider_custom") {
    return null;
  }
  const cutoffHours = record.cutoffHoursBeforeEvent;
  if (typeof cutoffHours !== "number" || !Number.isSafeInteger(cutoffHours) || cutoffHours < 1) {
    return null;
  }
  const cancellationCutoffAt = toIsoString(record.cancellationCutoffAt);
  if (!cancellationCutoffAt) return null;

  return {
    sourceKind,
    cutoffHoursBeforeEvent: cutoffHours,
    cancellationCutoffAt,
    submittedPastCutoff: record.submittedPastCutoff === true,
  };
}

export function formatCancellationCutoffDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

export function describeCancellationCutoff(view: BookingCancellationCutoffView): string {
  const duration = formatCancellationCutoffDuration(view.cutoffHoursBeforeEvent);
  const cutoffDate = formatCancellationCutoffDateTime(view.cancellationCutoffAt);
  if (view.submittedPastCutoff) {
    return `Past cancellation cutoff (${duration} before event; cutoff was ${cutoffDate})`;
  }
  return `Cancel before ${cutoffDate} (${duration} before event)`;
}
