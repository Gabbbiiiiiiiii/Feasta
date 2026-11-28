"use client";

import {AlertTriangle, CalendarClock, CheckCircle2, Info} from "lucide-react";
import {useMemo, useState, type FormEvent} from "react";

import {
  CANCELLATION_CUTOFF_HOURS_MAX_HARD,
  CANCELLATION_CUTOFF_HOURS_MIN_HARD,
  CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH,
  computeCancellationCutoffDate,
  daysAndHoursToTotalHours,
  formatCancellationCutoffDuration,
  hoursToDaysAndHours,
  type AdminDefaultCancellationPolicyDto,
} from "@feasta/shared-types";

import {FormField} from "@/components/forms/form-field";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
  updateAdminDefaultCancellationPolicy,
  type AdminDefaultCancellationPolicyPayload,
} from "@/lib/admin/file-maintenance/admin-cancellation-policy-client";

type DurationFields = {
  days: string;
  hours: string;
};

type ValidationErrors = {
  defaultCutoff?: string;
  minCutoff?: string;
  maxCutoff?: string;
  guidanceNote?: string;
};

function toDurationFields(totalHours: number): DurationFields {
  const {days, hours} = hoursToDaysAndHours(totalHours);
  return {days: String(days), hours: String(hours)};
}

function parseDurationFields(
  fields: DurationFields,
  label: string,
): {totalHours: number | null; error?: string} {
  const daysRaw = fields.days.trim();
  const hoursRaw = fields.hours.trim();
  if (daysRaw === "" && hoursRaw === "") {
    return {totalHours: null, error: `Enter days or hours for ${label.toLowerCase()}.`};
  }
  const days = daysRaw === "" ? 0 : Number(daysRaw);
  const hours = hoursRaw === "" ? 0 : Number(hoursRaw);
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    return {totalHours: null, error: "Days must be a whole number from 0 to 365."};
  }
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) {
    return {totalHours: null, error: "Hours must be a whole number from 0 to 23."};
  }
  const totalHours = daysAndHoursToTotalHours(days, hours);
  if (
    !Number.isInteger(totalHours) ||
    totalHours < CANCELLATION_CUTOFF_HOURS_MIN_HARD ||
    totalHours > CANCELLATION_CUTOFF_HOURS_MAX_HARD
  ) {
    return {
      totalHours: null,
      error: `${label} must be between 1 hour and 365 days before the event.`,
    };
  }
  return {totalHours};
}

const EXAMPLE_EVENT_START = new Date("2026-12-10T06:00:00.000Z"); // Dec 10, 2026, 2:00 PM Asia/Manila

function formatManilaDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

export function CancellationPolicyManagementClient({
  initialPolicy,
}: {
  initialPolicy: AdminDefaultCancellationPolicyDto;
}) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [defaultFields, setDefaultFields] = useState<DurationFields>(() =>
    toDurationFields(initialPolicy.defaultCutoffHoursBeforeEvent),
  );
  const [minFields, setMinFields] = useState<DurationFields>(() =>
    toDurationFields(initialPolicy.minCutoffHoursBeforeEvent),
  );
  const [maxFields, setMaxFields] = useState<DurationFields>(() =>
    toDurationFields(initialPolicy.maxCutoffHoursBeforeEvent),
  );
  const [guidanceNote, setGuidanceNote] = useState(initialPolicy.guidanceNote ?? "");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [pendingPayload, setPendingPayload] =
    useState<AdminDefaultCancellationPolicyPayload | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const previewDefaultHours = useMemo(() => {
    const parsed = parseDurationFields(defaultFields, "Suggested default cutoff");
    return parsed.totalHours;
  }, [defaultFields]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const parsedMin = parseDurationFields(minFields, "Minimum allowed cutoff");
    const parsedMax = parseDurationFields(maxFields, "Maximum allowed cutoff");
    const parsedDefault = parseDurationFields(defaultFields, "Suggested default cutoff");

    const nextErrors: ValidationErrors = {};
    if (parsedMin.error) nextErrors.minCutoff = parsedMin.error;
    if (parsedMax.error) nextErrors.maxCutoff = parsedMax.error;
    if (parsedDefault.error) nextErrors.defaultCutoff = parsedDefault.error;

    if (
      parsedMin.totalHours !== null &&
      parsedMax.totalHours !== null &&
      parsedMin.totalHours > parsedMax.totalHours
    ) {
      nextErrors.minCutoff = "Minimum allowed cutoff cannot exceed maximum allowed cutoff.";
    }

    if (
      parsedDefault.totalHours !== null &&
      parsedMin.totalHours !== null &&
      parsedMax.totalHours !== null &&
      (parsedDefault.totalHours < parsedMin.totalHours ||
        parsedDefault.totalHours > parsedMax.totalHours)
    ) {
      nextErrors.defaultCutoff =
        "Suggested default cutoff must fall within the minimum and maximum allowed range.";
    }

    if (guidanceNote.trim().length > CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH) {
      nextErrors.guidanceNote = `Guidance note must be at most ${CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH} characters.`;
    }

    setErrors(nextErrors);
    if (
      Object.keys(nextErrors).length > 0 ||
      parsedMin.totalHours === null ||
      parsedMax.totalHours === null ||
      parsedDefault.totalHours === null
    ) {
      return;
    }

    setPendingPayload({
      defaultCutoffHoursBeforeEvent: parsedDefault.totalHours,
      minCutoffHoursBeforeEvent: parsedMin.totalHours,
      maxCutoffHoursBeforeEvent: parsedMax.totalHours,
      guidanceNote: guidanceNote.trim() || null,
    });
    setConfirmOpen(true);
  }

  async function confirmSave() {
    if (!pendingPayload || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = await updateAdminDefaultCancellationPolicy(pendingPayload);
      setPolicy({
        policyVersion: saved.policyVersion,
        defaultCutoffHoursBeforeEvent: saved.defaultCutoffHoursBeforeEvent,
        minCutoffHoursBeforeEvent: saved.minCutoffHoursBeforeEvent,
        maxCutoffHoursBeforeEvent: saved.maxCutoffHoursBeforeEvent,
        guidanceNote: saved.guidanceNote,
        updatedAt: new Date().toISOString(),
        isSeededFallback: false,
      });
      setConfirmOpen(false);
      setPendingPayload(null);
      setFeedback({
        tone: "success",
        message: `Default cancellation policy updated (Version ${saved.policyVersion}).`,
      });
    } catch (caught) {
      setConfirmOpen(false);
      setFeedback({
        tone: "error",
        message: caught instanceof Error
          ? caught.message
          : "We could not save the default cancellation policy.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="admin-cancellation-policy-heading"
      className="grid gap-6 rounded-card border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="admin-cancellation-policy-heading" className="text-xl font-bold text-foreground">
            Default Cancellation Policy
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Set the platform-recommended cancellation cutoff before an event starts and the allowed
            minimum/maximum bounds for Providers who configure a custom cutoff.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={policy.isSeededFallback ? "draft" : "published"}
            label={policy.isSeededFallback ? "Platform Default" : `Version ${policy.policyVersion}`}
          />
          {policy.updatedAt ? (
            <span className="text-xs text-muted-foreground">
              Updated {formatManilaDateTime(new Date(policy.updatedAt))}
            </span>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={
            feedback.tone === "error"
              ? "flex items-start gap-3 rounded-xl border border-destructive bg-destructive-subtle p-4 text-sm text-destructive"
              : "flex items-start gap-3 rounded-xl border border-success bg-success-subtle p-4 text-sm text-success"
          }
        >
          {feedback.tone === "error" ? (
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          )}
          <p className="font-semibold">{feedback.message}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="grid gap-6">
        <div className="grid gap-5 lg:grid-cols-3">
          <DurationInputGroup
            idPrefix="admin-default-cutoff"
            title="Suggested Default Cutoff"
            description="Recommended notice before event start offered to Providers as a one-click default."
            value={defaultFields}
            error={errors.defaultCutoff}
            onChange={(next) => {
              setDefaultFields(next);
              setErrors((current) => ({...current, defaultCutoff: undefined}));
            }}
          />
          <DurationInputGroup
            idPrefix="admin-min-cutoff"
            title="Minimum Allowed Cutoff"
            description="Shortest cancellation notice Providers may choose when setting a custom cutoff."
            value={minFields}
            error={errors.minCutoff}
            onChange={(next) => {
              setMinFields(next);
              setErrors((current) => ({...current, minCutoff: undefined}));
            }}
          />
          <DurationInputGroup
            idPrefix="admin-max-cutoff"
            title="Maximum Allowed Cutoff"
            description="Longest cancellation notice Providers may choose when setting a custom cutoff."
            value={maxFields}
            error={errors.maxCutoff}
            onChange={(next) => {
              setMaxFields(next);
              setErrors((current) => ({...current, maxCutoff: undefined}));
            }}
          />
        </div>

        <FormField
          id="admin-cancellation-guidance-note"
          label="Default guidance note (optional)"
          description="Shown to Providers when reviewing the Admin default and to Customers during booking review."
          error={errors.guidanceNote}
        >
          <Textarea
            value={guidanceNote}
            maxLength={CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH}
            placeholder="Example: Cancellations must be submitted before the cutoff date so Providers can manage food sourcing and staffing."
            onChange={(event) => {
              setGuidanceNote(event.target.value);
              setErrors((current) => ({...current, guidanceNote: undefined}));
            }}
          />
          <p className="text-right text-xs text-muted-foreground">
            {guidanceNote.length.toLocaleString()} / {CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH.toLocaleString()} characters
          </p>
        </FormField>

        <div className="grid gap-3 rounded-xl border border-border bg-secondary/45 p-4 text-sm">
          <div className="flex items-center gap-2 font-bold text-primary-strong">
            <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
            Live Booking Cutoff Preview
          </div>
          {previewDefaultHours !== null ? (
            <p className="text-foreground">
              With a suggested default of{" "}
              <strong>{formatCancellationCutoffDuration(previewDefaultHours)}</strong>{" "}
              ({previewDefaultHours} {previewDefaultHours === 1 ? "hour" : "hours"}) before event start,
              a booking scheduled for{" "}
              <strong>{formatManilaDateTime(EXAMPLE_EVENT_START)}</strong>{" "}
              will allow customer cancellation until{" "}
              <strong>
                {formatManilaDateTime(
                  computeCancellationCutoffDate(EXAMPLE_EVENT_START, previewDefaultHours),
                )}
              </strong>.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Enter valid days and hours above to preview the computed cancellation date.
            </p>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-info bg-info-subtle p-4 text-sm">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
          <p className="leading-6">
            Providers who select <strong>Apply Admin Default</strong> automatically use the updated
            default for future bookings. Providers with custom cutoffs and all existing bookings
            keep their saved terms.
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            Save Default Cancellation Policy
          </Button>
        </div>
      </form>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save default cancellation policy?"
        description="This updates the suggested cancellation cutoff and Provider bounds for future bookings. Existing bookings keep their frozen cutoff date."
        cancelLabel="Cancel"
        confirmLabel="Save Policy"
        loadingLabel="Saving policy"
        loading={saving}
        onConfirm={confirmSave}
      />
    </section>
  );
}

function DurationInputGroup({
  idPrefix,
  title,
  description,
  value,
  error,
  onChange,
}: {
  idPrefix: string;
  title: string;
  description: string;
  value: DurationFields;
  error?: string;
  onChange: (next: DurationFields) => void;
}) {
  return (
    <fieldset className="grid content-start gap-3 rounded-xl border border-border bg-muted/20 p-4">
      <legend className="px-1 text-sm font-bold text-foreground">{title}</legend>
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      <div className="grid grid-cols-2 gap-3">
        <FormField id={`${idPrefix}-days`} label="Days" required>
          <Input
            type="number"
            min={0}
            max={365}
            step={1}
            inputMode="numeric"
            value={value.days}
            onChange={(event) => onChange({...value, days: event.target.value})}
          />
        </FormField>
        <FormField id={`${idPrefix}-hours`} label="Hours (0–23)" required>
          <Input
            type="number"
            min={0}
            max={23}
            step={1}
            inputMode="numeric"
            value={value.hours}
            onChange={(event) => onChange({...value, hours: event.target.value})}
          />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
