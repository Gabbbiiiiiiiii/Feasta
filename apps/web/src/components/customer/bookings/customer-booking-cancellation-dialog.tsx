"use client";

import {
  CircleAlert,
  CircleCheckBig,
  FileText,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import {useCallback, useEffect, useRef, useState} from "react";

import {
  boundedText,
  providerRequestServiceLabel,
} from "@/components/customer/bookings/booking-formatters";
import {feastaToast} from "@/components/feedback/toast";
import {FormField} from "@/components/forms/form-field";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {
  createCustomerCancellationIdempotencyKey,
  getCustomerProviderRequestCancellationOptions,
  getCustomerProviderRequestCancellationStatus,
  submitCustomerProviderRequestCancellation,
  type CustomerCancellationOptions,
  type CustomerCancellationProjection,
  type CustomerCancellationStatusResult,
  type CustomerCancellationSubmissionResult,
} from "@/lib/customer/bookings/customer-cancellation-client";
import type {CustomerBookingProviderRequest} from "@/lib/customer/bookings/customer-booking-types";
import {cn} from "@/lib/utils";

type CustomerBookingCancellationDialogProps = {
  request: CustomerBookingProviderRequest;
  onClose: () => void;
  onStatusChanged?: (providerRequestId: string) => void;
  restoreFocusId?: string;
};

type SubmissionAttempt = {
  normalizedReason: string;
  idempotencyKey: string;
};

function CustomerBookingCancellationDialog({
  request,
  onClose,
  onStatusChanged,
  restoreFocusId,
}: CustomerBookingCancellationDialogProps) {
  const [options, setOptions] = useState<CustomerCancellationOptions | null>(null);
  const [statusResult, setStatusResult] =
    useState<CustomerCancellationStatusResult | null>(null);
  const [submissionResult, setSubmissionResult] =
    useState<CustomerCancellationSubmissionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonTouched, setReasonTouched] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mountedRef = useRef(true);
  const submittingRef = useRef(false);
  const attemptRef = useRef<SubmissionAttempt | null>(null);

  const providerName = boundedText(
    request.providerName,
    "this Provider",
    120,
  );
  const serviceName = providerRequestServiceLabel(request);
  const normalizedReason = reason.trim();
  const reasonError = reasonTouched
    ? cancellationReasonError(normalizedReason)
    : null;
  const currentCancellation =
    options?.activeCancellation ?? statusResult?.cancellation ?? null;
  const submissionComplete = submissionResult !== null;
  const canSubmit = Boolean(
    options?.cancellationAllowed &&
    !options.activeCancellation &&
    !submissionComplete &&
    normalizedReason.length >= 5 &&
    normalizedReason.length <= 1_000,
  );

  const fetchCancellationState = useCallback(
    () => Promise.all([
        getCustomerProviderRequestCancellationOptions(request.providerRequestId),
        getCustomerProviderRequestCancellationStatus(request.providerRequestId),
      ]),
    [request.providerRequestId],
  );

  async function retryCancellationState() {
    setLoading(true);
    setLoadError(null);
    try {
      const [nextOptions, nextStatus] = await fetchCancellationState();
      if (!mountedRef.current) return;
      setOptions(nextOptions);
      setStatusResult(nextStatus);
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      setOptions(null);
      setStatusResult(null);
      setLoadError(safeErrorMessage(
        error,
        "Cancellation information could not be loaded. Please try again or contact FEASTA support.",
      ));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    void fetchCancellationState()
      .then(([nextOptions, nextStatus]) => {
        if (!active) return;
        setOptions(nextOptions);
        setStatusResult(nextStatus);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setOptions(null);
        setStatusResult(null);
        setLoadError(safeErrorMessage(
          error,
          "Cancellation information could not be loaded. Please try again or contact FEASTA support.",
        ));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, [fetchCancellationState]);

  async function submitCancellation() {
    if (submittingRef.current || submissionComplete) return;

    setReasonTouched(true);
    setSubmissionError(null);
    const validationError = cancellationReasonError(normalizedReason);
    if (validationError || !options?.cancellationAllowed || options.activeCancellation) {
      return;
    }

    let attempt = attemptRef.current;
    try {
      if (!attempt || attempt.normalizedReason !== normalizedReason) {
        attempt = {
          normalizedReason,
          idempotencyKey: createCustomerCancellationIdempotencyKey(
            request.providerRequestId,
          ),
        };
        attemptRef.current = attempt;
      }

      submittingRef.current = true;
      setSubmitting(true);
      const submitted = await submitCustomerProviderRequestCancellation({
        providerRequestId: request.providerRequestId,
        reason: normalizedReason,
        idempotencyKey: attempt.idempotencyKey,
      });
      if (!mountedRef.current) return;
      setSubmissionResult(submitted);
      setStatusResult(null);

      try {
        const refreshed = await getCustomerProviderRequestCancellationStatus(
          request.providerRequestId,
        );
        if (mountedRef.current) setStatusResult(refreshed);
      } catch {
        /* The trusted submission response remains sufficient for immediate status. */
      }

      if (mountedRef.current) {
        onStatusChanged?.(request.providerRequestId);
        feastaToast.success(
          submitted.created
            ? "Cancellation request submitted."
            : "This cancellation request was already recorded.",
        );
      }
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      setSubmissionError(safeErrorMessage(
        error,
        "Your cancellation request could not be submitted. Please try again or contact FEASTA support.",
      ));
    } finally {
      submittingRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  }

  return (
    <ConfirmationDialog
      open
      onOpenChange={(open) => {
        if (!open && !submittingRef.current) onClose();
      }}
      title={`Cancel ${providerName}'s service?`}
      description={`This request affects only ${providerName}'s ${serviceName.toLowerCase()}. Other Provider services in this event are not automatically cancelled.`}
      confirmLabel="Submit cancellation request"
      loadingLabel="Submitting cancellation request"
      cancelLabel={submissionComplete || !options?.cancellationAllowed ? "Close" : "Keep service"}
      destructive
      loading={submitting}
      confirmDisabled={!canSubmit}
      onConfirm={submitCancellation}
      contentClassName="max-w-2xl"
      restoreFocusId={restoreFocusId}
    >
      <div className="grid gap-5">
        <ProviderContext providerName={providerName} serviceName={serviceName} />

        {loading ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4" role="status">
            <RotateCcw aria-hidden="true" className="size-5 animate-spin text-primary" />
            <p className="text-sm font-semibold">Loading trusted cancellation options…</p>
          </div>
        ) : null}

        {loadError ? (
          <div className="grid gap-3 rounded-xl border border-destructive/20 bg-destructive-subtle p-4" role="alert">
            <div className="flex items-start gap-3">
              <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
              <p className="text-sm font-semibold text-destructive">{loadError}</p>
            </div>
            <Button variant="secondary" size="compact" className="w-fit" onClick={() => void retryCancellationState()}>
              Try again
            </Button>
          </div>
        ) : null}

        {!loading && options ? (
          <>
            {currentCancellation ? (
              <CancellationStatusPanel
                cancellation={currentCancellation}
                historical={!options.activeCancellation && !submissionComplete}
              />
            ) : null}

            {submissionResult ? (
              <SubmissionStatusPanel
                result={submissionResult}
                projection={statusResult?.cancellation ?? null}
              />
            ) : null}

            {options.policy ? (
              <CancellationPolicyPanel
                policy={options.policy}
                preview={options.refundPreview}
              />
            ) : null}

            {options.reasonCode === "LEGACY_MANUAL_REVIEW" ? (
              <ManualReviewPanel />
            ) : null}

            {options.reasonCode === "PAYMENT_RECONCILIATION_REQUIRED" ? (
              <NoticePanel
                title="Payment resolution required"
                description="FEASTA will first resolve the current payment state. Any refund decision will follow the agreed policy and recorded service stage."
              />
            ) : null}

            {!options.cancellationAllowed ? (
              <UnavailablePanel reasonCode={options.reasonCode} />
            ) : null}

            {options.cancellationAllowed && !options.activeCancellation && !submissionComplete ? (
              <>
                <FormField
                  id="customer-cancellation-reason"
                  label="Cancellation reason"
                  required
                  description={`${reason.length.toLocaleString("en-PH")}/1,000 characters · Enter 5–1,000 characters. This reason does not determine a refund amount.`}
                  error={reasonError ?? undefined}
                >
                  <Textarea
                    value={reason}
                    rows={5}
                    placeholder="Explain why you need to cancel this Provider service."
                    onBlur={() => setReasonTouched(true)}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setReason(value);
                      setReasonTouched(true);
                      setSubmissionError(null);
                    }}
                  />
                </FormField>

                <div className="rounded-xl border border-warning/25 bg-warning-subtle p-4">
                  <p className="text-sm font-bold text-warning">Before you submit</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Your cancellation and any refund outcome follow FEASTA&apos;s recorded policy and workflow. Submitting does not mean a refund is approved or completed.
                  </p>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    Reason: {normalizedReason || "Enter your reason above."}
                  </p>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {submissionError ? (
          <p className="rounded-xl border border-destructive/20 bg-destructive-subtle p-4 text-sm font-semibold text-destructive" role="alert">
            {submissionError}
          </p>
        ) : null}
      </div>
    </ConfirmationDialog>
  );
}

function ProviderContext({providerName, serviceName}: {providerName: string; serviceName: string}) {
  return (
    <section aria-label="Selected Provider service" className="rounded-xl border border-primary/15 bg-primary-tint p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-primary-strong">Selected Provider service</p>
      <h3 className="mt-1 break-words text-lg font-black">{providerName}</h3>
      <p className="mt-1 break-words text-sm font-semibold text-muted-foreground">{serviceName}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Other Provider services attached to this event remain independent.
      </p>
    </section>
  );
}

function CancellationPolicyPanel({
  policy,
  preview,
}: {
  policy: NonNullable<CustomerCancellationOptions["policy"]>;
  preview: CustomerCancellationOptions["refundPreview"];
}) {
  return (
    <section aria-labelledby="customer-cancellation-policy-heading" className="grid gap-4 rounded-xl border border-border p-4">
      <div>
        <div className="flex items-start gap-2">
          <FileText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h3 id="customer-cancellation-policy-heading" className="font-black">Agreed refund policy</h3>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {policy.sourceKind === "package_override" ? "Package-specific policy" : "Provider default policy"} · Version {policy.policyVersion}
            </p>
          </div>
        </div>
      </div>

      <dl className="grid gap-2 sm:grid-cols-3">
        {policy.rules.map((rule) => {
          const current = preview?.frozenStage === rule.stage;
          return (
            <div
              key={rule.stage}
              className={cn(
                "rounded-xl border p-3",
                current ? "border-primary/30 bg-primary-tint" : "border-border bg-muted/20",
              )}
            >
              <dt className="text-xs font-bold text-muted-foreground">{refundStageLabel(rule.stage)}</dt>
              <dd className="mt-1 text-xl font-black">{formatBasisPoints(rule.refundBasisPoints)}%</dd>
              {current ? <dd className="mt-1 text-xs font-bold text-primary">Current recorded stage</dd> : null}
            </div>
          );
        })}
      </dl>

      {preview ? (
        <div className="rounded-xl border border-info/20 bg-info-subtle p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-info">Estimated refund under the agreed policy</p>
          <p className="mt-1 text-2xl font-black tabular-nums">
            {formatCentavos(preview.refundAmountInCentavos)}
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            Recorded stage: {refundStageLabel(preview.frozenStage)}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Based on the agreed policy and current recorded service stage. The final result remains subject to FEASTA&apos;s cancellation workflow.
          </p>
        </div>
      ) : null}

      {policy.terms ? (
        <div className="rounded-xl bg-muted/30 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Additional policy terms</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{policy.terms}</p>
        </div>
      ) : null}
    </section>
  );
}

function ManualReviewPanel() {
  return (
    <NoticePanel
      title="Manual review required"
      description="This booking was created without the newer refund-policy agreement record. FEASTA must review the cancellation request before any refund decision. No refund percentage or estimate is available."
    />
  );
}

function NoticePanel({title, description}: {title: string; description: string}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-warning/25 bg-warning-subtle p-4">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-warning" />
      <div>
        <p className="font-bold text-warning">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function UnavailablePanel({reasonCode}: {reasonCode: CustomerCancellationOptions["reasonCode"]}) {
  const description = reasonCode === "ROLLOUT_DISABLED"
    ? "Customer cancellation requests are not available right now. Your Provider services remain unchanged."
    : reasonCode === "ACTIVE_CANCELLATION_EXISTS"
      ? "Another cancellation request cannot be submitted while the current request is active."
      : "The trusted cancellation check says this Provider service is not eligible for an ordinary Customer cancellation request.";

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4" role="status">
      <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div>
        <p className="font-bold">Cancellation unavailable</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function CancellationStatusPanel({
  cancellation,
  historical,
}: {
  cancellation: CustomerCancellationProjection;
  historical: boolean;
}) {
  const status = cancellationStatusPresentation(cancellation.status);
  const refund = refundStatusPresentation(cancellation);

  return (
    <section aria-label={historical ? "Previous cancellation request" : "Current cancellation request"} className="grid gap-3 rounded-xl border border-info/20 bg-info-subtle p-4" role="status">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-info">
            {historical ? "Previous cancellation request" : "Current cancellation request"}
          </p>
          <h3 className="mt-1 font-black">{status.title}</h3>
        </div>
        <StatusBadge status={cancellation.status} label={status.title} />
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{status.description}</p>
      <div className="rounded-lg border border-info/15 bg-card/70 p-3">
        <p className="text-sm font-bold">{refund.title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{refund.description}</p>
        {refund.amountInCentavos !== null ? (
          <p className="mt-2 text-lg font-black tabular-nums">{formatCentavos(refund.amountInCentavos)}</p>
        ) : null}
      </div>
      {cancellation.manualReviewRequired ? (
        <p className="text-xs font-semibold text-muted-foreground">Manual FEASTA review is required before any refund decision.</p>
      ) : null}
    </section>
  );
}

function SubmissionStatusPanel({
  result,
  projection,
}: {
  result: CustomerCancellationSubmissionResult;
  projection: CustomerCancellationProjection | null;
}) {
  if (projection) return null;
  const status = cancellationStatusPresentation(result.status);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-success/20 bg-success-subtle p-4" role="status" aria-live="polite">
      <CircleCheckBig aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
      <div>
        <p className="font-bold text-success">{status.title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {status.description} This affects only the selected Provider service.
        </p>
        {result.manualReviewRequired ? (
          <p className="mt-2 text-sm font-semibold">Manual review is required before any refund decision.</p>
        ) : null}
      </div>
    </div>
  );
}

function cancellationStatusPresentation(status: CustomerCancellationProjection["status"]): {
  title: string;
  description: string;
} {
  switch (status) {
    case "submitted":
      return {title: "Cancellation request submitted", description: "FEASTA recorded the request and will process it using the applicable workflow."};
    case "awaiting_payment_resolution":
      return {title: "Waiting for payment resolution", description: "FEASTA must resolve the current payment state before the cancellation can continue."};
    case "under_review":
      return {title: "Under review", description: "FEASTA is reviewing the request before any refund decision is made."};
    case "approved":
      return {title: "Cancellation approved", description: "The cancellation was approved. Refund progress is shown separately when applicable."};
    case "rejected":
      return {title: "Cancellation request rejected", description: "The cancellation request was reviewed and was not approved."};
    case "refund_processing":
      return {title: "Refund processing", description: "An approved refund is being processed. Completion is not yet confirmed."};
    case "refund_failed":
      return {title: "Refund needs attention", description: "Refund processing did not complete and FEASTA is handling the next safe step."};
    case "refund_completed":
      return {title: "Refund completed", description: "The trusted refund record confirms completion."};
    case "cancelled_no_refund":
      return {title: "Service cancelled without refund", description: "The selected Provider service was cancelled and no refund was due under the workflow."};
  }
}

function refundStatusPresentation(cancellation: CustomerCancellationProjection): {
  title: string;
  description: string;
  amountInCentavos: number | null;
} {
  const refund = cancellation.refund;
  switch (refund.status) {
    case "none":
      return {title: "No refund progress yet", description: "No refund completion has been recorded.", amountInCentavos: null};
    case "manual_review":
      return {title: "Refund requires review", description: "No refund amount is promised while FEASTA reviews the request.", amountInCentavos: null};
    case "approved":
      return {title: "Refund approved", description: "The approved amount has not yet been confirmed as completed.", amountInCentavos: refund.amountInCentavos};
    case "processing":
      return {title: "Refund processing", description: "The refund is in progress and is not yet complete.", amountInCentavos: refund.amountInCentavos};
    case "failed_retry_pending":
      return {title: "Refund retry pending", description: "Refund processing was interrupted. FEASTA will continue the safe retry workflow.", amountInCentavos: refund.amountInCentavos};
    case "failed_reconciliation_required":
      return {title: "FEASTA support required", description: "Refund processing requires FEASTA support. No gateway details are exposed here.", amountInCentavos: refund.amountInCentavos};
    case "partial_completed":
      return {title: "Partial refund completed", description: "The trusted refund record confirms a partial refund.", amountInCentavos: refund.completedAmountInCentavos};
    case "full_completed":
      return {title: "Full refund completed", description: "The trusted refund record confirms the full eligible refund.", amountInCentavos: refund.completedAmountInCentavos};
  }
}

function cancellationReasonError(value: string): string | null {
  if (value.length < 5) return "Enter at least 5 characters.";
  if (value.length > 1_000) return "Keep the cancellation reason to 1,000 characters or fewer.";
  return null;
}

function refundStageLabel(stage: NonNullable<CustomerCancellationOptions["refundPreview"]>["frozenStage"]): string {
  if (stage === "preparation_not_started") return "Preparation Not Started";
  if (stage === "preparation_started") return "Preparation Started";
  return "Service Started";
}

function formatBasisPoints(value: number): string {
  const whole = Math.floor(value / 100);
  const decimal = String(value % 100).padStart(2, "0").replace(/0+$/u, "");
  return decimal ? `${whole}.${decimal}` : String(whole);
}

function formatCentavos(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value / 100);
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export {
  CustomerBookingCancellationDialog,
  type CustomerBookingCancellationDialogProps,
};
