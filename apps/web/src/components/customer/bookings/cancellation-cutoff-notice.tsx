"use client";

import {AlertTriangle, CalendarClock} from "lucide-react";
import {useState} from "react";

import {
  computeCancellationCutoffDate,
  formatCancellationCutoffDuration,
  type CancellationCutoffDisclosure,
} from "@feasta/shared-types";

function formatManilaDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

function parseManilaEventStart(
  eventDate?: string | null,
  eventTime?: string | null,
): Date | null {
  if (!eventDate) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(eventDate.trim())
    ? eventDate.trim()
    : null;
  if (dateOnly) {
    const timePart = eventTime && /^\d{2}:\d{2}$/u.test(eventTime.trim())
      ? `${eventTime.trim()}:00`
      : "00:00:00";
    const parsed = new Date(`${dateOnly}T${timePart}+08:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(eventDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function PreBookingCancellationCutoffNotice({
  cutoff,
  eventDate,
  eventTime,
}: {
  cutoff: CancellationCutoffDisclosure;
  eventDate?: string | null;
  eventTime?: string | null;
}) {
  const [nowMs] = useState(() => Date.now());
  const duration = formatCancellationCutoffDuration(cutoff.cutoffHoursBeforeEvent);
  const eventStart = parseManilaEventStart(eventDate, eventTime);
  const cutoffDate = eventStart
    ? computeCancellationCutoffDate(eventStart, cutoff.cutoffHoursBeforeEvent)
    : null;
  const pastCutoffNow = cutoffDate !== null && nowMs >= cutoffDate.getTime();

  if (pastCutoffNow && cutoffDate) {
    return (
      <div
        role="status"
        className="mt-3 flex items-start gap-2.5 rounded-[14px] border border-warning/40 bg-warning-subtle p-3 text-xs leading-5"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="font-bold text-warning">
            Past cancellation cutoff — non-cancellable once confirmed
          </p>
          <p className="mt-0.5 text-foreground">
            This Provider requires cancellation at least <strong>{duration}</strong> before event start
            (cutoff: <strong>{formatManilaDateTime(cutoffDate)}</strong>). Because your selected event is within this window, you will not be able to submit a cancellation once booked. Report an Issue remains available for emergencies.
          </p>
          {cutoff.guidanceNote ? (
            <p className="mt-1 text-muted-foreground">{cutoff.guidanceNote}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-[14px] border border-primary/15 bg-secondary/45 p-3 text-xs leading-5">
      <CalendarClock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-strong" />
      <div className="min-w-0">
        <p className="font-bold text-primary-strong">
          {cutoffDate
            ? `Cancellation cutoff: ${formatManilaDateTime(cutoffDate)}`
            : `Cancellation cutoff: ${duration} before event start`}
        </p>
        <p className="mt-0.5 text-muted-foreground">
          {cutoffDate
            ? `Cancel at least ${duration} before event start (${cutoff.sourceKind === "admin_default" ? "FEASTA default policy" : "Provider custom policy"}). New cancellation requests close after this cutoff date.`
            : `New cancellation requests close ${duration} before the scheduled event start.`}
        </p>
        {cutoff.guidanceNote ? (
          <p className="mt-1 text-muted-foreground">{cutoff.guidanceNote}</p>
        ) : null}
      </div>
    </div>
  );
}
