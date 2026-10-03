"use client";

import {CircleAlert, Eye, RefreshCw} from "lucide-react";
import {useMemo, useRef, useState, type ReactNode} from "react";
import type {RefundReconciliationInspection} from "@feasta/shared-types";

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
} from "@/lib/admin/cancellations/admin-cancellation-client";
import type {
  AdminCancellationQueue,
  AdminCancellationQueueItem,
} from "@/lib/admin/cancellations/admin-cancellation-types";

type DecisionAction = "approve" | "reject" | "process" | "retry" | null;

export function CancellationManagementClient({
  initialQueue,
}: {
  initialQueue: AdminCancellationQueue;
}) {
  const [queue, setQueue] = useState(initialQueue);
  const [selected, setSelected] = useState<AdminCancellationQueueItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [action, setAction] = useState<DecisionAction>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [inspection, setInspection] = useState<RefundReconciliationInspection | null>(null);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const actionKeys = useRef(new Map<string, string>());

  const columns = useMemo<readonly DataTableColumn<AdminCancellationQueueItem>[]>(() => [
    {
      id: "booking",
      header: "Booking",
      cell: (item) => (
        <span>
          <span className="block font-semibold">{item.bookingCode}</span>
          <span className="text-xs text-muted-foreground">{item.providerRequestId}</span>
        </span>
      ),
    },
    {id: "provider", header: "Provider / service", cell: (item) => item.providerName},
    {id: "customer", header: "Customer", cell: (item) => item.customerName},
    {
      id: "evidence",
      header: "Policy evidence",
      cell: (item) => item.policyEvidenceStatus === "legacy"
        ? <StatusBadge status="warning" label="Manual review required" />
        : <StatusBadge status="verified" label="Policy-backed" />,
    },
    {
      id: "status",
      header: "Cancellation",
      cell: (item) => <StatusBadge status={item.cancellationStatus} />,
    },
    {
      id: "refund",
      header: "Refund",
      cell: (item) => <RefundSummary item={item} />,
    },
  ], []);

  const refresh = async (keepSelectedId?: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const next = await loadAdminCancellationQueueAction();
      setQueue(next);
      if (keepSelectedId) {
        setSelected(next.items.find((item) => item.cancellationRequestId === keepSelectedId) ?? null);
      }
      return next;
    } catch (caught) {
      const message = errorMessage(caught, "Cancellation requests could not be loaded.");
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  };

  const openDetails = (item: AdminCancellationQueueItem) => {
    setSelected(item);
    setInspection(null);
    setDrawerOpen(true);
  };

  const inspect = async () => {
    if (!selected || inspectionLoading) return;
    setInspectionLoading(true);
    try {
      const result = await inspectCancellationRefund(selected.cancellationRequestId);
      setInspection(result);
    } catch (caught) {
      feastaToast.error(errorMessage(caught, "Reconciliation status could not be inspected."));
    } finally {
      setInspectionLoading(false);
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
          ? "Cancellation approved. The trusted calculation found no refundable amount."
          : "Cancellation approved. The refund is ready for processing.");
      } else if (action === "reject") {
        await rejectCancellation(selected.cancellationRequestId, rejectionReason, idempotencyKey);
        feastaToast.success("Cancellation request rejected.");
      } else {
        const result = await executeCancellationRefund(selected.cancellationRequestId, idempotencyKey);
        feastaToast.success(result.status === "completed"
          ? "Refund completed."
          : "Refund execution was submitted to the trusted workflow.");
      }
      actionKeys.current.delete(keyName);
      setAction(null);
      setRejectionReason("");
      setInspection(null);
      await refresh(selected.cancellationRequestId);
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
          <p className="text-sm font-semibold text-primary">Provider-service cancellations</p>
          <h2 id="cancellation-queue-heading" className="text-2xl font-black">Cancellation decisions</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Review one Provider service at a time. Refund amounts and payment execution remain backend-controlled.
          </p>
        </div>
        <Button variant="secondary" size="compact" loading={loading} loadingLabel="Refreshing" onClick={() => void refresh(selected?.cancellationRequestId)}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Refresh queue
        </Button>
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
              <StatusBadge status={item.cancellationStatus} />
            </div>
            <RefundSummary item={item} />
            <Button variant="secondary" size="compact" onClick={() => openDetails(item)}>Review cancellation</Button>
          </article>
        )}
      />

      <CancellationDrawer
        item={selected}
        inspection={inspection}
        open={drawerOpen}
        busy={loading}
        inspectionLoading={inspectionLoading}
        onOpenChange={(open) => !loading && setDrawerOpen(open)}
        onInspect={() => void inspect()}
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
        loadingLabel="Submitting trusted action"
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
            <span className="text-sm text-muted-foreground">5–500 characters. This decision is recorded by the trusted backend.</span>
          </label>
        ) : action === "approve" ? (
          <div className="rounded-lg border border-info/30 bg-info-subtle p-4 text-sm" role="note">
            No refund percentage or amount can be entered here. The backend uses the frozen stage and recorded policy. A zero result completes as cancelled without refund.
          </div>
        ) : null}
      </ConfirmationDialog>
    </section>
  );
}

function CancellationDrawer({
  item,
  inspection,
  open,
  busy,
  inspectionLoading,
  onOpenChange,
  onInspect,
  onAction,
}: {
  item: AdminCancellationQueueItem | null;
  inspection: RefundReconciliationInspection | null;
  open: boolean;
  busy: boolean;
  inspectionLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onInspect: () => void;
  onAction: (action: DecisionAction) => void;
}) {
  const footer = item ? (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {item.canReject ? <Button variant="secondary" disabled={busy} onClick={() => onAction("reject")}>Reject cancellation</Button> : null}
      {item.canApprove ? <Button disabled={busy} onClick={() => onAction("approve")}>Approve cancellation</Button> : null}
      {item.canProcessRefund ? <Button variant="destructive" disabled={busy} onClick={() => onAction("process")}>Process refund</Button> : null}
      {item.canRetryRefund ? <Button variant="destructive" disabled={busy} onClick={() => onAction("retry")}>Retry refund</Button> : null}
    </div>
  ) : undefined;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Cancellation review"
      description="Trusted details for one Provider service and one canonical cancellation request."
      footer={footer}
    >
      {item ? (
        <div className="grid gap-5">
          <DrawerSection title="Scope">
            <DetailRow label="Booking code" value={item.bookingCode} />
            <DetailRow label="Provider / service" value={item.providerName} />
            <DetailRow label="Customer" value={item.customerEmail ? `${item.customerName} · ${item.customerEmail}` : item.customerName} />
            <DetailRow label="Provider request" value={item.providerRequestId} />
            <DetailRow label="Provider-request status" value={formatLabel(item.providerRequestStatus)} />
          </DrawerSection>

          <DrawerSection title="Cancellation evidence">
            <DetailRow label="Cancellation status" value={formatLabel(item.cancellationStatus)} />
            <DetailRow label="Policy evidence" value={item.policyEvidenceStatus === "legacy" ? "Manual review required" : "Policy-backed"} />
            <DetailRow label="Frozen factual stage" value={item.frozenStage ? formatLabel(item.frozenStage) : "Unavailable for legacy request"} />
            <DetailRow label="Customer reason" value={item.customerReason} />
            {item.decisionReason ? <DetailRow label="Admin rejection reason" value={item.decisionReason} /> : null}
          </DrawerSection>

          {item.policyEvidenceStatus === "legacy" ? (
            <div className="rounded-lg border border-warning bg-warning-subtle p-4" role="note">
              <p className="font-bold text-warning">Manual review required</p>
              <p className="mt-1 text-sm text-muted-foreground">No policy, percentage, or estimated refund has been fabricated. Automatic approval remains unavailable.</p>
            </div>
          ) : null}

          <DrawerSection title="System refund result">
            <DetailRow label="Calculation" value={calculationLabel(item)} />
            <DetailRow label="Refund amount" value={item.refundAmountInCentavos === null ? "Calculated by backend on approval" : formatCentavos(item.refundAmountInCentavos)} />
            <DetailRow label="Refund progress" value={refundLabel(item.refundProgress)} />
            <DetailRow label="Payment status" value={item.paymentStatus ? formatLabel(item.paymentStatus) : "No safe payment status available"} />
          </DrawerSection>

          {item.reconciliationRequired ? (
            <div className="rounded-lg border border-warning bg-warning-subtle p-4" role="alert">
              <p className="flex items-center gap-2 font-bold text-warning"><CircleAlert className="size-4" />Refund requires reconciliation review</p>
              <p className="mt-1 text-sm text-muted-foreground">Retry is withheld until the trusted payment state is reconciled.</p>
            </div>
          ) : null}

          <DrawerSection title="Reconciliation inspection">
            {inspection ? (
              <>
                <DetailRow label="Operation status" value={inspection.operationStatus ? formatLabel(inspection.operationStatus) : "No refund operation"} />
                <DetailRow label="Gateway progress" value={inspection.gatewayStatus ? formatLabel(inspection.gatewayStatus) : "No safe gateway status"} />
                <DetailRow label="Review required" value={inspection.reconciliationRequired ? "Refund requires reconciliation review" : "No reconciliation flag"} />
                <DetailRow label="Last updated" value={formatDate(inspection.updatedAt)} />
              </>
            ) : <p className="text-sm text-muted-foreground">Load the existing read-only safe reconciliation projection when operational inspection is needed.</p>}
            <Button variant="secondary" size="compact" loading={inspectionLoading} loadingLabel="Inspecting" onClick={onInspect}>
              Inspect reconciliation status
            </Button>
          </DrawerSection>
        </div>
      ) : null}
    </DetailDrawer>
  );
}

function RefundSummary({item}: {item: AdminCancellationQueueItem}) {
  if (item.reconciliationRequired) return <span className="font-semibold text-warning">Reconciliation review</span>;
  if (item.refundAmountInCentavos !== null) {
    return <span><span className="block font-semibold">{formatCentavos(item.refundAmountInCentavos)}</span><span className="text-xs text-muted-foreground">{refundLabel(item.refundProgress)}</span></span>;
  }
  return <span className="text-muted-foreground">{calculationLabel(item)}</span>;
}

function DrawerSection({title, children}: {title: string; children: ReactNode}) {
  return <section className="grid gap-3"><h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>{children}</section>;
}

function DetailRow({label, value}: {label: string; value: string}) {
  return <div className="rounded-lg border border-border p-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-medium">{value}</p></div>;
}

function actionTitle(action: DecisionAction): string {
  if (action === "approve") return "Approve this Provider-service cancellation?";
  if (action === "reject") return "Reject this cancellation request?";
  if (action === "retry") return "Retry this trusted refund?";
  return "Process this trusted refund?";
}

function actionLabel(action: DecisionAction): string {
  if (action === "approve") return "Approve cancellation";
  if (action === "reject") return "Reject cancellation";
  if (action === "retry") return "Retry refund";
  return "Process refund";
}

function actionDescription(action: DecisionAction, item: AdminCancellationQueueItem | null): string {
  const service = item?.providerName ?? "this Provider service";
  if (action === "approve") return `Approve cancellation of ${service}. This affects only its canonical Provider request.`;
  if (action === "reject") return `Reject the request to cancel ${service}. The backend clears only the matching active pointer.`;
  return `${action === "retry" ? "Retry" : "Process"} the system-calculated refund for ${service}. The browser sends no amount, currency, or gateway identifier.`;
}

function calculationLabel(item: AdminCancellationQueueItem): string {
  if (item.calculationStatus === "manual_review_required") return "Manual review required";
  if (item.calculationStatus === "nothing_refundable") return "No refundable amount";
  if (item.calculationStatus === "calculated") return "System-calculated";
  return "Calculated by backend on approval";
}

function refundLabel(status: AdminCancellationQueueItem["refundProgress"]): string {
  const labels: Record<AdminCancellationQueueItem["refundProgress"], string> = {
    none: "No refund workflow",
    manual_review: "Manual review required",
    approved: "Approved — ready to process",
    processing: "Refund processing",
    failed_retry_pending: "Refund failed — retry permitted",
    failed_reconciliation_required: "Refund requires reconciliation review",
    partial_completed: "Partial refund completed",
    full_completed: "Full refund completed",
  };
  return labels[status];
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatCentavos(value: number): string {
  return new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"}).format(value / 100);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-PH", {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila"}).format(date)
    : "Unavailable";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}
