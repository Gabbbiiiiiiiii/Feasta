"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Info,
  Lock,
  Pencil,
  Plus,
} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState} from "react";

import {
  DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS,
  formatCancellationCutoffDuration,
  REFUND_POLICY_TERMS_MAX_LENGTH,
} from "@feasta/shared-types";

import {FormField} from "@/components/forms/form-field";
import {PageHeading} from "@/components/layout/page-heading";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {
  publishProviderRefundPolicy,
  type RefundPolicyDraftPayload,
} from "@/lib/provider/refund-policy/provider-refund-policy-client";
import type {
  ProviderRefundPolicyDto,
  ProviderRefundPolicyPageDto,
} from "@/lib/provider/refund-policy/provider-refund-policy-types";
import {
  formatBasisPoints,
  validateUnifiedRefundPolicy,
} from "@/lib/provider/refund-policy/provider-refund-policy-validation";
import {ProviderCancellationCutoffSection} from "./provider-cancellation-cutoff-section";

type Feedback = {tone: "success" | "error"; message: string} | null;

export function ProviderRefundPolicyClient({data}: {
  data: ProviderRefundPolicyPageDto;
}) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const effectiveCutoffHours =
    data.providerCancellationPolicy?.mode === "provider_custom" &&
    data.providerCancellationPolicy.cutoffHoursBeforeEvent !== null
      ? data.providerCancellationPolicy.cutoffHoursBeforeEvent
      : data.adminDefaultCancellationPolicy?.defaultCutoffHoursBeforeEvent ??
        DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS;
  const cutoffDuration = formatCancellationCutoffDuration(effectiveCutoffHours);

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex items-center">
        <Button asChild variant="secondary" size="compact">
          <Link href="/provider/payments">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to payments
          </Link>
        </Button>
      </div>
      <PageHeading
        eyebrow="Provider management"
        title="Cancellation & Refund Policy"
        description="Set one cancellation cutoff and refund policy for all your future bookings."
      />

      {feedback ? (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={feedback.tone === "error"
            ? "flex items-start gap-3 rounded-xl border border-destructive bg-destructive-subtle p-4 text-destructive"
            : "flex items-start gap-3 rounded-xl border border-success bg-success-subtle p-4 text-success"}
        >
          {feedback.tone === "error"
            ? <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            : <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />}
          <p className="font-semibold">{feedback.message}</p>
        </div>
      ) : null}

      <ProviderCancellationCutoffSection
        adminDefault={data.adminDefaultCancellationPolicy}
        providerPolicy={data.providerCancellationPolicy}
        onSaved={(message) => {
          setFeedback({tone: "success", message});
          router.refresh();
        }}
      />

      <section aria-labelledby="provider-refund-policy" className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="provider-refund-policy" className="text-2xl font-black tracking-tight">
              Refund Policy
            </h2>
            <p className="mt-1 text-muted-foreground">
              Applies to all future bookings across your packages and services.
            </p>
          </div>
        </div>

        {data.providerPolicy ? (
          <PolicyCard
            policy={data.providerPolicy}
            cutoffDuration={cutoffDuration}
            action={
              <Button
                variant="secondary"
                size="compact"
                onClick={() => {
                  setFeedback(null);
                  setEditorOpen(true);
                }}
              >
                <Pencil aria-hidden="true" className="size-4" />
                Edit Policy
              </Button>
            }
          />
        ) : (
          <div className="rounded-xl border border-dashed border-input bg-card p-6 sm:p-8">
            <FileText aria-hidden="true" className="size-9 text-primary" />
            <h3 className="mt-4 text-xl font-bold">Set up your Refund Policy</h3>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              A Refund Policy is required before refund-policy-backed bookings can be enforced. Choose how much customers receive if they cancel before your cancellation cutoff ({cutoffDuration} before event).
            </p>
            <Button
              className="mt-5"
              onClick={() => {
                setFeedback(null);
                setEditorOpen(true);
              }}
            >
              <Plus aria-hidden="true" className="size-5" />
              Create Policy
            </Button>
          </div>
        )}
      </section>

      {editorOpen ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setEditorOpen(false);
          }}
        >
          <DialogContent aria-labelledby="policy-editor-heading" className="max-w-3xl overflow-y-hidden p-0">
            <div className="min-h-0 max-h-[min(90vh,48rem)] overflow-y-auto">
              <PolicyEditor
                key={`provider-${data.providerPolicy?.version ?? "new"}-${effectiveCutoffHours}`}
                policy={data.providerPolicy}
                effectiveCutoffHours={effectiveCutoffHours}
                cutoffDuration={cutoffDuration}
                onCancel={() => setEditorOpen(false)}
                onPublished={(message) => {
                  setEditorOpen(false);
                  setFeedback({tone: "success", message});
                  router.refresh();
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <section aria-labelledby="important-refund-information" className="rounded-xl border border-info bg-info-subtle p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Info aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-info" />
          <div>
            <h2 id="important-refund-information" className="text-lg font-bold">
              Good to Know
            </h2>
            <p className="mt-2 text-sm leading-6">
              Changes apply to future bookings across all your packages and services. Existing bookings always keep their agreed cancellation cutoff and refund policy. Additional notes do not change the refund percentage.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function PolicyEditor({
  policy,
  effectiveCutoffHours,
  cutoffDuration,
  onCancel,
  onPublished,
}: {
  policy: ProviderRefundPolicyDto | null;
  effectiveCutoffHours: number;
  cutoffDuration: string;
  onCancel: () => void;
  onPublished: (message: string) => void;
}) {
  const [beforeCutoffPercent, setBeforeCutoffPercent] = useState(() =>
    beforeCutoffPercentValue(policy));
  const [terms, setTerms] = useState(policy?.terms ?? "");
  const [errors, setErrors] = useState<
    ReturnType<typeof validateUnifiedRefundPolicy>["errors"]
  >({});
  const [draft, setDraft] = useState<RefundPolicyDraftPayload | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const editing = policy !== null;

  const previewPercent = beforeCutoffPercent.trim() || "—";

  function preparePublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    const result = validateUnifiedRefundPolicy({
      beforeCutoffPercent,
      terms,
      effectiveCutoffHoursBeforeEvent: effectiveCutoffHours,
    });
    setErrors(result.errors);
    if (!result.draft) return;
    setDraft(result.draft);
    setConfirmOpen(true);
  }

  async function publish() {
    if (!draft || submitting) return;
    setSubmitting(true);
    try {
      await publishProviderRefundPolicy(draft);
      onPublished("Refund policy published.");
      setConfirmOpen(false);
    } catch (caught) {
      setConfirmOpen(false);
      setSaveError(refundPolicyErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  const submitLabel = editing ? "Publish Updated Policy" : "Publish Policy";

  return (
    <section className="min-w-0 p-5 sm:p-6">
      <form onSubmit={preparePublish} noValidate className="grid min-w-0 gap-6">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-primary-strong">
            Provider refund policy
          </p>
          <DialogTitle asChild>
            <h2 id="policy-editor-heading" className="mt-1 pr-10 text-2xl font-black tracking-tight">
              {editing ? "Edit Refund Policy" : "Create Refund Policy"}
            </h2>
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm">
            Set the refund percentage customers receive if they cancel before your cancellation cutoff ({cutoffDuration} before event start).
          </DialogDescription>
        </div>

        <fieldset className="grid gap-4">
          <legend className="text-lg font-bold">Customer refund rule</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              id="refund-percent-before-cutoff"
              label="Before Cancellation Cutoff"
              description={`Cancelled more than ${cutoffDuration} before event start (0% to 100%).`}
              error={errors.beforeCutoffPercent}
              required
            >
              <div className="relative">
                <Input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={beforeCutoffPercent}
                  onChange={(event) => {
                    setBeforeCutoffPercent(event.target.value);
                    setErrors((current) => ({...current, beforeCutoffPercent: undefined}));
                  }}
                  className="pr-14"
                />
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-bold text-muted-foreground">%</span>
                <span className="sr-only">Enter a percentage from zero to one hundred.</span>
              </div>
            </FormField>

            <div className="flex flex-col justify-between rounded-xl border border-border bg-muted/60 p-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-foreground">After Cancellation Cutoff</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    <Lock aria-hidden="true" className="size-3" />
                    Locked
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Within {cutoffDuration} of event start. New cancellation requests are closed once your cutoff passes.
                </p>
              </div>
              <p className="mt-3 text-xl font-black text-foreground">0% · Cancellation closed</p>
            </div>
          </div>
        </fieldset>

        <FormField
          id="refund-policy-terms"
          label="Additional notes (optional)"
          description="Add details customers should know. These notes do not change the refund percentage."
          error={errors.terms}
        >
          <Textarea
            value={terms}
            maxLength={REFUND_POLICY_TERMS_MAX_LENGTH}
            onChange={(event) => {
              setTerms(event.target.value);
              setErrors((current) => ({...current, terms: undefined}));
            }}
          />
          <p className="text-right text-sm text-muted-foreground" aria-live="polite">
            {terms.length.toLocaleString()} / {REFUND_POLICY_TERMS_MAX_LENGTH.toLocaleString()} characters
          </p>
        </FormField>

        <div className="rounded-xl bg-muted p-4 sm:p-5">
          <h3 className="font-bold">Refund preview</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-card p-3">
              <dt className="text-sm text-muted-foreground">
                Before cutoff (more than {cutoffDuration} before event):
              </dt>
              <dd className="mt-1 font-bold">Customer refund: {previewPercent}%</dd>
            </div>
            <div className="rounded-lg bg-card p-3">
              <dt className="text-sm text-muted-foreground">
                After cutoff (within {cutoffDuration} of event):
              </dt>
              <dd className="mt-1 font-bold">Cancellation closed · 0% refund</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            This is a preview. FEASTA calculates refunds using the published policy.
          </p>
        </div>

        <div className="rounded-xl border border-warning bg-warning-subtle p-4 text-sm">
          <p className="font-bold">Updates apply to future bookings only.</p>
          <p className="mt-1">Existing bookings keep the refund policy they agreed to when booking.</p>
        </div>

        {saveError ? (
          <p role="alert" className="rounded-lg border border-destructive bg-destructive-subtle p-3 text-sm text-destructive">
            {saveError}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit">{submitLabel}</Button>
        </div>
      </form>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Publish refund policy?"
        description="This creates a new policy version for future bookings across all your packages and services. Existing bookings keep their original agreed policy."
        cancelLabel="Cancel"
        confirmLabel={submitLabel}
        loadingLabel="Publishing policy"
        loading={submitting}
        onConfirm={publish}
      />
    </section>
  );
}

function PolicyCard({
  policy,
  cutoffDuration,
  action,
}: {
  policy: ProviderRefundPolicyDto;
  cutoffDuration: string;
  action?: React.ReactNode;
}) {
  const beforeRule = policy.rules.find((rule) => rule.stage === "preparation_not_started");
  const beforeBps = beforeRule?.refundBasisPoints ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status="published" />
          <span className="text-sm font-semibold text-muted-foreground">Version {policy.version}</span>
          <span className="text-sm text-muted-foreground">Updated {formatEffectiveAt(policy.effectiveAt)}</span>
        </div>
        {action}
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-primary/20 bg-primary-tint/40 p-4">
          <dt className="text-sm font-bold text-foreground">
            Before Cancellation Cutoff
          </dt>
          <dd className="mt-1 text-xs text-muted-foreground">
            Cancelled more than {cutoffDuration} before event start
          </dd>
          <dd className="mt-2 text-2xl font-black text-primary-strong">
            {formatBasisPoints(beforeBps)}%
          </dd>
          <dd className="mt-1 text-xs font-semibold text-muted-foreground">
            {beforeBps === 0 ? "Non-refundable" : "Refundable to customer"}
          </dd>
        </div>

        <div className="min-w-0 rounded-lg border border-border bg-muted p-4">
          <dt className="text-sm font-bold text-foreground">
            After Cancellation Cutoff
          </dt>
          <dd className="mt-1 text-xs text-muted-foreground">
            Within {cutoffDuration} of event start
          </dd>
          <dd className="mt-2 text-2xl font-black text-foreground">
            0%
          </dd>
          <dd className="mt-1 text-xs font-semibold text-muted-foreground">
            Cancellation closed
          </dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-sm font-bold">Additional Policy Terms</h3>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {policy.terms || "No additional terms."}
        </p>
      </div>
    </div>
  );
}

function beforeCutoffPercentValue(policy: ProviderRefundPolicyDto | null): string {
  const beforeRule = policy?.rules.find((rule) => rule.stage === "preparation_not_started");
  if (!beforeRule) return "100";
  return formatBasisPoints(beforeRule.refundBasisPoints);
}

function formatEffectiveAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

export function refundPolicyErrorMessage(caught: unknown, packageAction = false): string {
  const code = typeof caught === "object" && caught && "code" in caught
    ? String((caught as {code?: unknown}).code).replace(/^functions\//u, "")
    : caught instanceof Error ? caught.message : "";
  if (code === "permission-denied") {
    return packageAction
      ? "This package is not available for your Provider account."
      : "You don't have permission to manage this refund policy.";
  }
  if (code === "not-found" || code === "invalid-package-id") {
    return "This package is not available for your Provider account.";
  }
  if (code === "invalid-argument") {
    return "Check the refund percentages and try again.";
  }
  if (code === "failed-precondition") {
    return "This refund policy can’t be updated right now.";
  }
  if (code === "unauthenticated" || code === "session-expired") {
    return "Your session has expired. Sign in again to continue.";
  }
  return "We couldn't update the refund policy. Please try again.";
}
