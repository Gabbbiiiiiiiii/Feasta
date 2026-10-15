"use client";

import {Eye} from "lucide-react";
import {useMemo, useRef, useState, type ReactNode} from "react";
import {refundCheckFeedback, refundInspectionFeedback, refundReviewFeedback, refundCheckFailedFeedback, RefundCheckNeedsReviewError, refundCheckScope, savedRefundPresentation, manualRefundStatusCheckAvailable, type RefundCheckFeedback} from "@/lib/admin/cancellations/admin-refund-check-presentation";

import {useAdminAutoRefresh} from "@/lib/admin/use-admin-auto-refresh";
import {adminBookingPaymentLabel, adminProviderRequestLabel} from "@/lib/admin/bookings/admin-booking-labels";
import {loadAdminCancellationQueueAction} from "@/app/admin/bookings/actions";
import {DataTable, DetailDrawer, type DataTableColumn} from "@/components/data";
import {feastaToast} from "@/components/feedback/toast";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {
  approveCancellation,
  createCancellationActionKey,
  executeCancellationRefund,
  inspectCancellationRefund,
  rejectCancellation,
  reconcileCancellationRefund,
} from "@/lib/admin/cancellations/admin-cancellation-client";
import type {
  AdminCancellationQueue,
  AdminCancellationQueueItem,
} from "@/lib/admin/cancellations/admin-cancellation-types";

type DecisionAction = "approve" | "reject" | "process" | "retry" | null;

export function CancellationManagementClient({
  initialQueue,
  onUpdated,
}: {
  initialQueue: AdminCancellationQueue;
  onUpdated?: () => Promise<void>;
}) {
  const [queue, setQueue] = useState(initialQueue);
  const [selected, setSelected] = useState<AdminCancellationQueueItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [action, setAction] = useState<DecisionAction>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [refundFeedback, setRefundFeedback] = useState<{scope: string; feedback: RefundCheckFeedback} | null>(null);
  const [checkingRefund, setCheckingRefund] = useState(false);
  const checkInFlight = useRef(false);
  const actionKeys = useRef(new Map<string, string>());

  useAdminAutoRefresh(async (isCurrent) => {
    const next = await loadAdminCancellationQueueAction();
    if (!isCurrent()) return;
    setQueue(next);
    setSelected(current => current ? next.items.find(item => item.cancellationRequestId === current.cancellationRequestId) ?? current : null);
  }, "cancellations", loading || checkingRefund);

  const columns = useMemo<readonly DataTableColumn<AdminCancellationQueueItem>[]>(() => [
    {
      id: "booking",
      header: "Booking",
      cell: (item) => (
        <span>
          <span className="block font-semibold">{item.bookingCode}</span>
        </span>
      ),
    },
    {id: "provider", header: "Provider / service", cell: (item) => item.providerName},
    {id: "customer", header: "Customer", cell: (item) => item.customerName},
    {
      id: "evidence",
      header: "Refund policy",
      cell: (item) => item.policyEvidenceStatus === "legacy"
        ? <StatusBadge status="warning" label="Manual review required" />
        : <StatusBadge status="verified" label="Policy recorded" />,
    },
    {
      id: "status",
      header: "Cancellation",
      cell: (item) => <StatusBadge status={item.cancellationStatus} label={cancellationLabel(item.cancellationStatus)} />,
    },
    {
      id: "refund",
      header: "Refund",
      cell: (item) => <RefundSummary item={item} />,
    },
  ], []);

  const refresh = async (keepSelectedId?: string, silent = false) => {
    if (!silent) {setLoading(true); setError(undefined);}
    try {
      const next = await loadAdminCancellationQueueAction();
      setQueue(next);
      if (keepSelectedId) {
        setSelected(current => next.items.find((item) => item.cancellationRequestId === keepSelectedId) ?? current);
      }
      return next;
    } catch (caught) {
      const message = errorMessage(caught, "Cancellation requests could not be loaded.");
      if (!silent) setError(message);
      throw caught;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const openDetails = (item: AdminCancellationQueueItem) => {
    if (checkingRefund) return;
    setSelected(item);
    setRefundFeedback(null);
    setDrawerOpen(true);
  };

  const checkRefundStatus = async () => {
    if (!selected || loading || checkInFlight.current) return;
    const current = selected;
    const id = current.cancellationRequestId;
    checkInFlight.current = true;
    setCheckingRefund(true);
    setRefundFeedback(null);
    try {
      const result = current.cancellationStatus === "refund_processing" || current.cancellationStatus === "refund_completed"
        ? {validated: await reconcileCancellationRefund(id)}
        : {inspection: await inspectCancellationRefund(id)};
      let refreshed = current;
      try {
        const next = await refresh(id, true);
        refreshed = next.items.find(item => item.cancellationRequestId === id) ?? current;
        await onUpdated?.();
      } catch {
        feastaToast.error("Refund status was checked, but the latest details could not be loaded. The list will retry automatically.");
      }
      const feedback = result.validated
        ? refundCheckFeedback(result.validated, refreshed.refundAmountInCentavos)
        : refundInspectionFeedback(result.inspection!);
      setRefundFeedback({scope: refundCheckScope(refreshed), feedback});
    } catch (caught) {
      const feedback = caught instanceof RefundCheckNeedsReviewError ? refundReviewFeedback : refundCheckFailedFeedback;
      setRefundFeedback({scope: refundCheckScope(current), feedback});
      if (feedback.status === "failed") feastaToast.error(feedback.title);
    } finally {
      checkInFlight.current = false;
      setCheckingRefund(false);
    }
  };

  const runAction = async () => {
    if (!selected || !action || loading) return;
    const keyName = `${action}:${selected.cancellationRequestId}`;
    const idempotencyKey = actionKeys.current.get(keyName) ??
      createCancellationActionKey(action, selected.cancellationRequestId);
    actionKeys.current.set(keyName, idempotencyKey);
    setLoading(true);
    setError(undefined);
    try {
      if (action === "approve") {
        const result = await approveCancellation(selected.cancellationRequestId, idempotencyKey);
        feastaToast.success(result.cancellationStatus === "cancelled_no_refund"
          ? "Cancellation approved. No refund is due."
          : "Cancellation approved. The refund is ready for processing.");
      } else if (action === "reject") {
        await rejectCancellation(selected.cancellationRequestId, rejectionReason, idempotencyKey);
        feastaToast.success("Cancellation request rejected.");
      } else {
        const result = await executeCancellationRefund(selected.cancellationRequestId, idempotencyKey);
        feastaToast.success(result.status === "completed"
          ? "Refund completed."
          : "Refund submitted for processing.");
      }
      actionKeys.current.delete(keyName);
      setAction(null);
      setRejectionReason("");
      setRefundFeedback(null);
      await refresh(selected.cancellationRequestId);
      await onUpdated?.();
    } catch (caught) {
      const message = errorMessage(caught, "The cancellation action could not be completed.");
      setError(message);
      feastaToast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const normalizedReason = rejectionReason.trim().replace(/\s+/gu, " ");

  return (
    <section className="grid min-w-0 gap-4" aria-labelledby="cancellation-queue-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="cancellation-queue-heading" className="text-2xl font-black">Cancellation requests</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Review cancellation requests and their refund results.
          </p>
        </div>
      </div>

      {queue.skippedMalformedCount > 0 ? (
        <p className="rounded-lg border border-warning bg-warning-subtle p-3 text-sm" role="status">
          {queue.skippedMalformedCount} malformed cancellation record(s) were withheld for safe review.
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={queue.items}
        getRowId={(item) => item.cancellationRequestId}
        caption="Provider-service cancellation queue"
        loading={loading}
        error={error}
        onRetry={() => void refresh(selected?.cancellationRequestId)}
        emptyTitle="No cancellation requests"
        emptyDescription="Provider-service cancellation requests will appear here for Admin review."
        rowActionsLabel="Review"
        rowActions={(item) => (
          <Button variant="ghost" size="compact" onClick={() => openDetails(item)} aria-label={`Review cancellation for ${item.providerName}`}>
            <Eye aria-hidden="true" className="size-4" /> Review
          </Button>
        )}
        renderMobileRow={(item) => (
          <article className="grid gap-3 rounded-card border border-border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-bold">{item.providerName}</p><p className="text-sm text-muted-foreground">{item.bookingCode}</p></div>
              <StatusBadge status={item.cancellationStatus} label={cancellationLabel(item.cancellationStatus)} />
            </div>
            <RefundSummary item={item} />
            <Button variant="secondary" size="compact" onClick={() => openDetails(item)}>Review cancellation</Button>
          </article>
        )}
      />

      <CancellationDrawer
        item={selected}
        open={drawerOpen}
        busy={loading || checkingRefund}
        checkingRefund={checkingRefund}
        feedback={selected && refundFeedback?.scope === refundCheckScope(selected) ? refundFeedback.feedback : null}
        onOpenChange={(open) => !loading && setDrawerOpen(open)}
        onCheckRefund={() => void checkRefundStatus()}
        onAction={setAction}
      />

      <ConfirmationDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !loading) {
            setAction(null);
            setRejectionReason("");
          }
        }}
        title={actionTitle(action)}
        description={actionDescription(action, selected)}
        confirmLabel={actionLabel(action)}
        loadingLabel="Saving"
        loading={loading}
        destructive={action === "reject" || action === "process" || action === "retry"}
        confirmDisabled={action === "reject" && (normalizedReason.length < 5 || normalizedReason.length > 500)}
        onConfirm={runAction}
      >
        {action === "reject" ? (
          <label className="grid gap-2" htmlFor="cancellation-rejection-reason">
            <span className="text-sm font-bold">Rejection reason</span>
            <Textarea
              id="cancellation-rejection-reason"
              value={rejectionReason}
              minLength={5}
              maxLength={500}
              rows={5}
              disabled={loading}
              onChange={(event) => setRejectionReason(event.currentTarget.value)}
            />
            <span className="text-sm text-muted-foreground">5–500 characters. Your reason is saved in the activity history.</span>
          </label>
        ) : action === "approve" ? (
          <div className="rounded-lg border border-info/30 bg-info-subtle p-4 text-sm" role="note">
            The refund is calculated using the booking’s refund policy. If no refund is due, the cancellation will be completed without a refund.
          </div>
        ) : null}
      </ConfirmationDialog>
    </section>
  );
}

function CancellationDrawer({
  item,
  open,
  busy,
  checkingRefund,
  feedback,
  onOpenChange,
  onCheckRefund,
  onAction,
}: {
  item: AdminCancellationQueueItem | null;
  open: boolean;
  busy: boolean;
  checkingRefund: boolean;
  feedback: RefundCheckFeedback | null;
  onOpenChange: (open: boolean) => void;
  onCheckRefund: () => void;
  onAction: (action: DecisionAction) => void;
}) {
  const footer = item ? (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {item.canReject ? <Button variant="secondary" disabled={busy} onClick={() => onAction("reject")}>Reject cancellation</Button> : null}
      {item.canApprove ? <Button disabled={busy} onClick={() => onAction("approve")}>Approve cancellation</Button> : null}
      {item.canProcessRefund && item.cancellationStatus === "approved" ? <Button variant="destructive" disabled={busy} onClick={() => onAction("process")}>Process refund</Button> : null}
      {item.canRetryRefund && item.cancellationStatus === "refund_failed" ? <Button variant="destructive" disabled={busy} onClick={() => onAction("retry")}>Retry refund</Button> : null}
    </div>
  ) : undefined;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Cancellation details"
      description="Review this cancellation request and its refund result."
      footer={footer}
    >
      {item ? (
        <div className="grid gap-5">
          <DrawerSection title="Booking">
            <DetailRow label="Booking code" value={item.bookingCode} />
            <DetailRow label="Provider / service" value={item.providerName} />
            <DetailRow label="Customer" value={item.customerEmail ? `${item.customerName} · ${item.customerEmail}` : item.customerName} />
            <DetailRow label="Provider response" value={adminProviderRequestLabel(item.providerRequestStatus)} />
          </DrawerSection>

          <DrawerSection title="Cancellation details">
            <DetailRow label="Cancellation status" value={cancellationLabel(item.cancellationStatus)} />
            <DetailRow label="Refund policy" value={item.policyEvidenceStatus === "legacy" ? "Manual review required" : "Policy recorded"} />
            <DetailRow label="Service status when cancelled" value={serviceStageLabel(item.frozenStage)} />
            <DetailRow label="Reason for cancellation" value={item.customerReason} />
            {item.decisionReason ? <DetailRow label="Admin rejection reason" value={item.decisionReason} /> : null}
          </DrawerSection>

          {item.policyEvidenceStatus === "legacy" ? (
            <div className="rounded-lg border border-warning bg-warning-subtle p-4" role="note">
              <p className="font-bold text-warning">Manual review required</p>
              <p className="mt-1 text-sm text-muted-foreground">The refund policy is unavailable for this request. Automatic approval is unavailable; review the booking before deciding.</p>
            </div>
          ) : null}

          <DrawerSection title="Refund summary">
            <DetailRow label="Refund amount" value={item.refundAmountInCentavos === null ? "Available after approval" : formatCentavos(item.refundAmountInCentavos)} />
            <DetailRow label="Refund status" value={refundStatusTitle(item)} />
            <DetailRow label="Payment status" value={item.paymentStatus ? adminBookingPaymentLabel(item.paymentStatus) : "Payment status unavailable"} />
            {refundStatusMessage(item, feedback) ? (
              <p className="text-sm text-muted-foreground" role="status">{refundStatusMessage(item, feedback)}</p>
            ) : null}
            {manualRefundStatusCheckAvailable(item) ? (
              <Button variant="ghost" size="compact" disabled={busy} loading={checkingRefund} loadingLabel="Checking refund status" onClick={onCheckRefund}>
                Try status check again
              </Button>
            ) : null}
          </DrawerSection>

          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Support references</summary>
            <div className="mt-3 grid gap-2">
              <DetailRow label="Cancellation reference" value={item.cancellationRequestId} />
              <DetailRow label="Provider service reference" value={item.providerRequestId} />
            </div>
          </details>
        </div>
      ) : null}
    </DetailDrawer>
  );
}

function cancellationLabel(status: string): string {
  const labels: Record<string, string> = {requested: "Cancellation requested", submitted: "Cancellation requested", awaiting_payment_resolution: "Waiting for payment result", under_review: "Under review", approved: "Cancellation approved", rejected: "Cancellation rejected", cancelled_no_refund: "Cancelled — no refund", refund_processing: "Cancelled", refund_completed: "Cancelled", refund_failed: "Cancelled"};
  return labels[status] ?? "Unknown cancellation status";
}

function RefundSummary({item}: {item: AdminCancellationQueueItem}) {
  if (item.refundAmountInCentavos !== null) {
    return <span><span className="block font-semibold">{formatCentavos(item.refundAmountInCentavos)}</span><span className="text-xs text-muted-foreground">{refundStatusTitle(item)}</span></span>;
  }
  return <span className="text-muted-foreground">{refundStatusTitle(item)}</span>;
}

function refundStatusTitle(item: AdminCancellationQueueItem): string {
  return savedRefundPresentation(item)?.title ?? (item.refundAmountInCentavos === null ? calculationLabel(item) : refundLabel(item.refundProgress));
}

function refundStatusMessage(item: AdminCancellationQueueItem, feedback: RefundCheckFeedback | null): string {
  if (feedback?.status === "failed") return feedback.title;
  return savedRefundPresentation(item)?.message ?? "";
}

function DrawerSection({title, children}: {title: string; children: ReactNode}) {
  return <section className="grid gap-3"><h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>{children}</section>;
}

function DetailRow({label, value}: {label: string; value: string}) {
  return <div className="rounded-lg border border-border p-3"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>;
}

function actionTitle(action: DecisionAction): string {
  if (action === "approve") return "Approve this cancellation request?";
  if (action === "reject") return "Reject this cancellation request?";
  if (action === "retry") return "Retry this refund?";
  return "Process this refund?";
}

function actionLabel(action: DecisionAction): string {
  if (action === "approve") return "Approve cancellation";
  if (action === "reject") return "Reject cancellation";
  if (action === "retry") return "Retry refund";
  return "Process refund";
}

function actionDescription(action: DecisionAction, item: AdminCancellationQueueItem | null): string {
  const service = item?.providerName ?? "this Provider service";
  if (action === "approve") return `Approve cancellation of ${service}. This cancels only this provider’s service.`;
  if (action === "reject") return `Reject the request to cancel ${service}. The provider’s service remains booked.`;
  return `${action === "retry" ? "Retry" : "Process"} the saved refund for ${service}. The saved refund amount will be used.`;
}

function calculationLabel(item: AdminCancellationQueueItem): string {
  if (item.calculationStatus === "manual_review_required") return "Manual review required";
  if (item.calculationStatus === "nothing_refundable") return "No refundable amount";
  if (item.calculationStatus === "calculated") return "Refund ready for processing";
  return "Available after approval";
}

function refundLabel(status: AdminCancellationQueueItem["refundProgress"]): string {
  const labels: Record<AdminCancellationQueueItem["refundProgress"], string> = {
    none: "No refund",
    manual_review: "Manual review required",
    approved: "Approved — ready to process",
    processing: "Refund pending",
    failed_retry_pending: "Refund failed",
    failed_reconciliation_required: "Refund needs review",
    partial_completed: "Refund confirmed",
    full_completed: "Refund confirmed",
  };
  return labels[status];
}

function serviceStageLabel(stage: AdminCancellationQueueItem["frozenStage"]): string {
  if (stage === "preparation_not_started") return "Preparation had not started";
  if (stage === "preparation_started") return "Preparation had started";
  if (stage === "service_started") return "Service had started";
  return "Not recorded";
}

function formatCentavos(value: number): string {
  return new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(value / 100);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
