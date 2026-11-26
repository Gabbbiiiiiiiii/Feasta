"use client";

import {AlertTriangle, CalendarClock, CheckCircle2, SlidersHorizontal, Sparkles} from "lucide-react";
import {useMemo, useState, type FormEvent} from "react";

import {
  computeCancellationCutoffDate,
  daysAndHoursToTotalHours,
  DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS,
  DEFAULT_ADMIN_CANCELLATION_MAX_HOURS,
  DEFAULT_ADMIN_CANCELLATION_MIN_HOURS,
  formatCancellationCutoffDuration,
  hoursToDaysAndHours,
  type AdminDefaultCancellationPolicyDto,
  type ProviderCancellationPolicyDto,
} from "@feasta/shared-types";

import {FormField} from "@/components/forms/form-field";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  saveProviderCancellationPolicy,
  type ProviderCancellationPolicyPayload,
} from "@/lib/provider/refund-policy/provider-refund-policy-client";

const FALLBACK_ADMIN_DEFAULT: AdminDefaultCancellationPolicyDto = {
  policyVersion: 1,
  defaultCutoffHoursBeforeEvent: DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS,
  minCutoffHoursBeforeEvent: DEFAULT_ADMIN_CANCELLATION_MIN_HOURS,
  maxCutoffHoursBeforeEvent: DEFAULT_ADMIN_CANCELLATION_MAX_HOURS,
  guidanceNote: null,
  updatedAt: null,
  isSeededFallback: true,
};

const EXAMPLE_EVENT_START = new Date("2026-12-10T06:00:00.000Z"); // Dec 10, 2026, 2:00 PM Asia/Manila

function formatManilaDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

export function ProviderCancellationCutoffSection({
  adminDefault = FALLBACK_ADMIN_DEFAULT,
  providerPolicy = null,
  onSaved,
}: {
  adminDefault?: AdminDefaultCancellationPolicyDto;
  providerPolicy?: ProviderCancellationPolicyDto | null;
  onSaved: (message: string) => void;
}) {
  const initialCustomHours = providerPolicy?.mode === "provider_custom" && providerPolicy.cutoffHoursBeforeEvent
    ? providerPolicy.cutoffHoursBeforeEvent
    : adminDefault.defaultCutoffHoursBeforeEvent;
  const initialParts = hoursToDaysAndHours(initialCustomHours);

  const [showCustomForm, setShowCustomForm] = useState(
    providerPolicy === null || providerPolicy.mode === "provider_custom",
  );
  const [editing, setEditing] = useState(providerPolicy === null);
  const [days, setDays] = useState(String(initialParts.days));
  const [hours, setHours] = useState(String(initialParts.hours));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingPayload, setPendingPayload] =
    useState<ProviderCancellationPolicyPayload | null>(null);
  const [saving, setSaving] = useState(false);

  const adminDefaultDuration = formatCancellationCutoffDuration(
    adminDefault.defaultCutoffHoursBeforeEvent,
  );
  const minDuration = formatCancellationCutoffDuration(adminDefault.minCutoffHoursBeforeEvent);
  const maxDuration = formatCancellationCutoffDuration(adminDefault.maxCutoffHoursBeforeEvent);

  const effectiveHours = providerPolicy?.mode === "provider_custom" && providerPolicy.cutoffHoursBeforeEvent
    ? providerPolicy.cutoffHoursBeforeEvent
    : adminDefault.defaultCutoffHoursBeforeEvent;

  const customOutOfRange =
    providerPolicy?.mode === "provider_custom" &&
    providerPolicy.cutoffHoursBeforeEvent !== null &&
    (providerPolicy.cutoffHoursBeforeEvent < adminDefault.minCutoffHoursBeforeEvent ||
      providerPolicy.cutoffHoursBeforeEvent > adminDefault.maxCutoffHoursBeforeEvent);

  const parsedCustomHours = useMemo(() => {
    const dRaw = days.trim();
    const hRaw = hours.trim();
    if (dRaw === "" && hRaw === "") return null;
    const d = dRaw === "" ? 0 : Number(dRaw);
    const h = hRaw === "" ? 0 : Number(hRaw);
    const total = daysAndHoursToTotalHours(d, h);
    return Number.isInteger(total) && total > 0 ? total : null;
  }, [days, hours]);

  function handleCustomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    const dRaw = days.trim();
    const hRaw = hours.trim();
    if (dRaw === "" && hRaw === "") {
      setValidationError("Enter days or hours for your cancellation cutoff.");
      return;
    }
    const d = dRaw === "" ? 0 : Number(dRaw);
    const h = hRaw === "" ? 0 : Number(hRaw);
    if (!Number.isInteger(d) || d < 0 || d > 365) {
      setValidationError("Days must be a whole number from 0 to 365.");
      return;
    }
    if (!Number.isInteger(h) || h < 0 || h > 23) {
      setValidationError("Hours must be a whole number from 0 to 23.");
      return;
    }
    const totalHours = daysAndHoursToTotalHours(d, h);
    if (
      !Number.isInteger(totalHours) ||
      totalHours < adminDefault.minCutoffHoursBeforeEvent ||
      totalHours > adminDefault.maxCutoffHoursBeforeEvent
    ) {
      setValidationError(
        `Custom cancellation cutoff must be between ${minDuration} and ${maxDuration} before the event.`,
      );
      return;
    }
    setValidationError(null);
    setPendingPayload({mode: "provider_custom", cutoffHoursBeforeEvent: totalHours});
  }

  async function confirmSave() {
    if (!pendingPayload || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveProviderCancellationPolicy(pendingPayload);
      const message = pendingPayload.mode === "admin_default"
        ? `Admin default cancellation cutoff (${adminDefaultDuration} before event) applied.`
        : `Custom cancellation cutoff (${formatCancellationCutoffDuration(pendingPayload.cutoffHoursBeforeEvent)} before event) saved.`;
      setPendingPayload(null);
      setEditing(false);
      onSaved(message);
    } catch (caught) {
      setPendingPayload(null);
      const message = caught instanceof Error && caught.message
        ? caught.message
        : "We could not save your cancellation cutoff policy. Please try again.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="provider-cancellation-cutoff" className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="provider-cancellation-cutoff" className="text-2xl font-black tracking-tight">
            Cancellation Cutoff Policy
          </h2>
          <p className="mt-1 text-muted-foreground">
            Choose how early customers must cancel before an event starts. After this cutoff date passes, new cancellation requests are closed.
          </p>
        </div>
        {providerPolicy && !editing ? (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => {
              setSaveError(null);
              setValidationError(null);
              setEditing(true);
              setShowCustomForm(providerPolicy.mode === "provider_custom");
            }}
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            Change Cutoff
          </Button>
        ) : null}
      </div>

      {saveError ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive bg-destructive-subtle p-4 text-sm text-destructive">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p className="font-semibold">{saveError}</p>
        </div>
      ) : null}

      {providerPolicy && !editing ? (
        <div className="grid gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge
                status="published"
                label={providerPolicy.mode === "admin_default" ? "Using Admin Default" : "Custom Cutoff"}
              />
              <span className="text-sm font-semibold text-muted-foreground">
                Version {providerPolicy.policyVersion}
              </span>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary-strong">
              <CalendarClock aria-hidden="true" className="size-4" />
              {formatCancellationCutoffDuration(effectiveHours)} before event
            </span>
          </div>

          <p className="text-sm text-muted-foreground">
            {providerPolicy.mode === "admin_default"
              ? `Linked to FEASTA's Admin default (${adminDefaultDuration} before event). If Admin updates the default later, your future bookings will automatically use the updated cutoff.`
              : `Customers must cancel at least ${formatCancellationCutoffDuration(effectiveHours)} (${effectiveHours} ${effectiveHours === 1 ? "hour" : "hours"}) before the scheduled event start.`}
          </p>

          <div className="rounded-lg bg-muted/60 p-3.5 text-sm">
            <span className="font-semibold text-foreground">Example: </span>
            For an event on <strong>{formatManilaDateTime(EXAMPLE_EVENT_START)}</strong>, customers can cancel until{" "}
            <strong>
              {formatManilaDateTime(computeCancellationCutoffDate(EXAMPLE_EVENT_START, effectiveHours))}
            </strong>.
          </div>

          {customOutOfRange ? (
            <div role="status" className="rounded-lg border border-warning bg-warning-subtle p-3 text-sm">
              Your saved custom cutoff is outside the current platform range ({minDuration}–{maxDuration}). It remains active until you edit it.
            </div>
          ) : null}

          {adminDefault.guidanceNote ? (
            <p className="text-xs leading-5 text-muted-foreground">
              <strong className="text-foreground">Admin guidance:</strong> {adminDefault.guidanceNote}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4">
          {!providerPolicy ? (
            <div className="rounded-xl border border-primary/20 bg-secondary/45 p-4 text-sm">
              <p className="font-bold text-primary-strong">
                Choose your cancellation cutoff policy
              </p>
              <p className="mt-1 text-muted-foreground">
                FEASTA recommends the Admin default of <strong>{adminDefaultDuration} before the event</strong>. Apply it with one click, or configure your own cutoff below. Until you choose, new bookings automatically use the Admin default.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Option 1: Apply Admin Default */}
            <article className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-primary-strong">
                    <Sparkles aria-hidden="true" className="size-3.5" />
                    Recommended by Admin
                  </span>
                  {providerPolicy?.mode === "admin_default" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                      <CheckCircle2 aria-hidden="true" className="size-3.5" />
                      Active
                    </span>
                  ) : null}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Apply Admin Default</h3>
                  <p className="mt-1 text-2xl font-black text-primary-strong">
                    {adminDefaultDuration} before event
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Stays automatically synced if Admin updates the platform default. Existing bookings always keep their frozen cutoff date.
                  </p>
                </div>
                <div className="rounded-lg bg-muted/60 p-3 text-xs leading-5 text-foreground">
                  Example: For a <strong>{formatManilaDateTime(EXAMPLE_EVENT_START)}</strong> event, cancel by{" "}
                  <strong>
                    {formatManilaDateTime(
                      computeCancellationCutoffDate(
                        EXAMPLE_EVENT_START,
                        adminDefault.defaultCutoffHoursBeforeEvent,
                      ),
                    )}
                  </strong>.
                </div>
                {adminDefault.guidanceNote ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {adminDefault.guidanceNote}
                  </p>
                ) : null}
              </div>

              <Button
                type="button"
                disabled={saving}
                onClick={() => {
                  setSaveError(null);
                  setValidationError(null);
                  setPendingPayload({mode: "admin_default"});
                }}
              >
                Apply Admin Default
              </Button>
            </article>

            {/* Option 2: Set Up Your Own Custom Cutoff */}
            <article className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-foreground">Set Up Your Own Cutoff</h3>
                  {providerPolicy?.mode === "provider_custom" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                      <CheckCircle2 aria-hidden="true" className="size-3.5" />
                      Active
                    </span>
                  ) : null}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  Allowed platform range: <strong>{minDuration}</strong> to <strong>{maxDuration}</strong> before event start.
                </p>

                {showCustomForm ? (
                  <form onSubmit={handleCustomSubmit} noValidate className="grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField id="provider-cutoff-days" label="Days" required>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          step={1}
                          inputMode="numeric"
                          value={days}
                          onChange={(event) => {
                            setDays(event.target.value);
                            setValidationError(null);
                          }}
                        />
                      </FormField>
                      <FormField id="provider-cutoff-hours" label="Hours (0–23)" required>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          step={1}
                          inputMode="numeric"
                          value={hours}
                          onChange={(event) => {
                            setHours(event.target.value);
                            setValidationError(null);
                          }}
                        />
                      </FormField>
                    </div>

                    {validationError ? (
                      <p role="alert" className="text-xs font-medium text-destructive">
                        {validationError}
                      </p>
                    ) : null}

                    {parsedCustomHours !== null ? (
                      <div className="rounded-lg bg-muted/60 p-3 text-xs leading-5 text-foreground">
                        Preview: <strong>{formatCancellationCutoffDuration(parsedCustomHours)}</strong> before event — for{" "}
                        <strong>{formatManilaDateTime(EXAMPLE_EVENT_START)}</strong>, cancel by{" "}
                        <strong>
                          {formatManilaDateTime(
                            computeCancellationCutoffDate(EXAMPLE_EVENT_START, parsedCustomHours),
                          )}
                        </strong>.
                      </div>
                    ) : null}

                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                      {providerPolicy ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="compact"
                          disabled={saving}
                          onClick={() => setEditing(false)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                      <Button type="submit" variant="secondary" disabled={saving}>
                        Save Custom Cutoff
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                    {providerPolicy ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="compact"
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowCustomForm(true)}
                    >
                      Set Up Your Own Cutoff
                    </Button>
                  </div>
                )}
              </div>
            </article>
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={pendingPayload !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPayload(null);
        }}
        title={
          pendingPayload?.mode === "admin_default"
            ? "Apply Admin default cancellation cutoff?"
            : "Save custom cancellation cutoff?"
        }
        description={
          pendingPayload?.mode === "admin_default"
            ? `Future bookings will allow customer cancellations until ${adminDefaultDuration} before event start (staying synced with Admin default updates). Existing bookings keep their frozen cutoff date.`
            : pendingPayload?.mode === "provider_custom"
              ? `Future bookings will allow customer cancellations until ${formatCancellationCutoffDuration(pendingPayload.cutoffHoursBeforeEvent)} before event start. Existing bookings keep their frozen cutoff date.`
              : ""
        }
        cancelLabel="Cancel"
        confirmLabel={
          pendingPayload?.mode === "admin_default" ? "Apply Default" : "Save Custom Cutoff"
        }
        loadingLabel="Saving cancellation cutoff"
        loading={saving}
        onConfirm={confirmSave}
      />
    </section>
  );
}
