"use client";

import {AlertTriangle, CheckCircle2, ChevronRight, RefreshCw} from "lucide-react";

import {
  DetailFieldItem,
  DetailFieldList,
} from "@/components/data/detail-field-list";
import {
  formatPaymentDate,
  paymentBookingLabel,
  paymentReferenceLabel,
} from "@/components/admin/payments/payment-formatters";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {payoutBlockMessage} from "@/lib/payments/payout-block-message";
import type {
  AdminFinanceAttentionQueue,
  AdminPayment,
  AdminPaymentStatistics,
} from "@/lib/admin/payments/admin-payment-types";
import {cn} from "@/lib/utils";

type FinanceAttentionItem =
  AdminFinanceAttentionQueue["items"][number];

type PaymentFinanceAttentionProps = {
  queue: AdminFinanceAttentionQueue;
  statistics?: Pick<
    AdminPaymentStatistics,
    "failedPayoutCount" | "reconciliationRequiredCount"
  >;

  loading: boolean;
  error?: string;
  embedded?: boolean;

  repairingItemId: string | null;

  retryingItemId?: string | null;
  onRetryFailedDisbursement?: (item: FinanceAttentionItem) => void;

  onRefresh: () => void;

  onViewPayment: (payment: AdminPayment) => void;

  onRepairPayoutSetup: (item: FinanceAttentionItem) => void;
};

function PaymentFinanceAttention({
  queue,
  statistics,
  loading,
  error,
  embedded = false,
  repairingItemId,
  retryingItemId = null,
  onRetryFailedDisbursement,
  onRefresh,
  onViewPayment,
  onRepairPayoutSetup,
}: PaymentFinanceAttentionProps) {
  const blockedCount = queue.items.filter(
    (item) => item.canonicalDisbursementStatus === "ready",
  ).length;
  const hasCriticalItem = queue.items.some(
    (item) =>
      item.recordState === "invalid" || item.kind === "failed_payout",
  );
  const busy =
    loading || repairingItemId !== null || retryingItemId !== null;

  return (
    <section
      className={cn(
        "min-w-0",
        embedded
          ? "grid gap-4 border-t border-border pt-6"
          : cn(
              "grid gap-4 rounded-card border border-border bg-card p-4 shadow-card sm:p-5",
              queue.items.length > 0 &&
                (hasCriticalItem
                  ? "border-l-4 border-l-destructive"
                  : "border-l-4 border-l-warning"),
            ),
      )}
      aria-labelledby="finance-attention-heading"
      aria-busy={busy}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {queue.items.length > 0 ? (
              <AlertTriangle
                aria-hidden="true"
                className={cn(
                  "size-5 shrink-0",
                  hasCriticalItem ? "text-destructive" : "text-warning",
                )}
              />
            ) : (
              <CheckCircle2
                aria-hidden="true"
                className="size-5 shrink-0 text-success"
              />
            )}
            <h2
              id="finance-attention-heading"
              className="text-lg font-black tracking-tight"
            >
              Provider payout issues
            </h2>
            {queue.items.length > 0 ? (
              <Badge
                tone={hasCriticalItem ? "destructive" : "warning"}
                shape="rounded"
                size="compact"
                className={cn(
                  "whitespace-nowrap",
                  hasCriticalItem
                    ? "border-destructive/25"
                    : "border-warning/25",
                )}
              >
                {queue.items.length}{" "}
                {queue.items.length === 1 ? "case" : "cases"}
              </Badge>
            ) : null}
          </div>

          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Eligible earnings, blocked transfers and failed payouts are
            different states. Review the reason before taking action.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={busy}
          onClick={onRefresh}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn(
              "size-4",
              loading && "animate-spin motion-reduce:animate-none",
            )}
          />
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {statistics ? (
        <dl className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-border/80 bg-secondary/50 px-4 py-3 text-sm">
          <AttentionMetric
            label="Failed provider payouts"
            value={String(statistics.failedPayoutCount)}
            highlight={statistics.failedPayoutCount > 0 ? "destructive" : undefined}
          />
          <AttentionMetric
            label="Financial reconciliation cases"
            value={String(statistics.reconciliationRequiredCount)}
            highlight={
              statistics.reconciliationRequiredCount > 0 ? "warning" : undefined
            }
          />
          <AttentionMetric
            label="Eligible payouts blocked (shown)"
            value={String(blockedCount)}
            highlight={blockedCount > 0 ? "warning" : undefined}
          />
        </dl>
      ) : null}

      {error ? (
        <div
          className="rounded-xl border border-destructive/30 bg-destructive-subtle p-4"
          role="alert"
        >
          <p className="font-bold text-destructive">
            Provider payout issues could not be refreshed
          </p>

          <p className="mt-1 text-sm text-destructive">{error}</p>
        </div>
      ) : null}

      {queue.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-4">
          <p className="font-bold text-foreground">
            No provider payout issues require attention
          </p>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            No provider payouts currently need review.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {queue.items.map((item) => {
            const linkedPayment = item.payment;
            const isPayoutSetupRecovery =
              item.kind === "ambiguous_payout_setup";
            const isBlockedEligible =
              item.canonicalDisbursementStatus === "ready";
            const isInvalid = item.recordState === "invalid";
            const isFailed = item.kind === "failed_payout";

            const title = isBlockedEligible
              ? "Eligible earnings — transfer blocked"
              : isFailed
                ? "Failed Provider payout"
                : item.kind === "reconciliation_required"
                  ? "Payout to review"
                  : "Payout setup issue";

            const badgeTone =
              isInvalid || isFailed ? "destructive" : "warning";
            const badgeText = isInvalid
              ? "Problem found"
              : isPayoutSetupRecovery
                ? "Setup needs attention"
                : isBlockedEligible
                  ? "Not transferred"
                  : "Needs review";

            return (
              <article
                key={item.id}
                className={cn(
                  "flex min-w-0 flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-xs",
                  isInvalid || isFailed
                    ? "border-l-4 border-l-destructive"
                    : "border-l-4 border-l-warning",
                )}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-foreground">{title}</p>
                      <div className="mt-1.5">
                        <Badge
                          tone={badgeTone}
                          shape="rounded"
                          size="compact"
                          className={cn(
                            "whitespace-nowrap",
                            badgeTone === "destructive"
                              ? "border-destructive/25"
                              : "border-warning/25",
                          )}
                        >
                          {badgeText}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-base font-black tabular-nums text-primary">
                      {isPayoutSetupRecovery
                        ? "No payment involved"
                        : item.formattedAmount ?? "Amount unavailable"}
                    </p>
                  </div>

                  <DetailFieldList className="mt-4 border-t border-border/70 pt-3">
                    <AttentionField
                      label="Payment"
                      value={
                        isPayoutSetupRecovery
                          ? "Not applicable"
                          : linkedPayment
                            ? paymentBookingLabel(linkedPayment)
                            : item.paymentId
                              ? paymentReferenceLabel({
                                  paymentId: item.paymentId,
                                })
                              : "Payment not found"
                      }
                    />

                    <AttentionField
                      label="Provider"
                      value={
                        linkedPayment?.providerName ??
                        "Provider information unavailable"
                      }
                    />

                    <AttentionField
                      label="Last updated"
                      value={formatPaymentDate(item.updatedAt)}
                    />

                    <AttentionField
                      label="Status"
                      value={
                        isBlockedEligible
                          ? "Transfer unavailable"
                          : isFailed
                            ? "Failed payout"
                            : item.kind === "reconciliation_required"
                              ? "Needs review"
                              : "Payout setup needs review"
                      }
                    />
                  </DetailFieldList>

                  <div className="mt-3 rounded-lg bg-secondary/60 px-3 py-2.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Reason
                    </p>

                    <p className="mt-1 break-words text-sm leading-5 text-foreground">
                      {isInvalid
                        ? "The provider payout information could not be verified."
                        : isBlockedEligible
                          ? payoutBlockMessage(item.dispatchBlockReason)
                          : isPayoutSetupRecovery
                            ? "The provider payout account setup could not be confirmed."
                            : isFailed
                              ? "The payment to the provider failed."
                              : "The provider payout needs review before continuing."}
                    </p>
                  </div>

                  <details className="group mt-3 rounded-lg bg-secondary/50 px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <ChevronRight
                        aria-hidden="true"
                        className="size-3.5 shrink-0 text-primary transition-transform duration-fast group-open:rotate-90 motion-reduce:transition-none"
                      />
                      <span>Additional details</span>
                    </summary>
                    <DetailFieldList columns={1} className="mt-2.5 border-t border-border/60 pt-2.5">
                      <AttentionField
                        label="Provider reference"
                        value={item.providerId ?? "Not recorded"}
                        code
                      />
                      <AttentionField
                        label="Payment reference"
                        value={item.paymentId ?? "Not applicable"}
                        code
                      />
                      <AttentionField
                        label="Recorded reason"
                        value={
                          item.reason ?? "No additional reason was recorded."
                        }
                      />
                    </DetailFieldList>
                  </details>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                  {canRetryFailedDisbursement(item) &&
                  onRetryFailedDisbursement ? (
                    <Button
                      type="button"
                      variant="primary"
                      size="compact"
                      disabled={busy}
                      onClick={() => onRetryFailedDisbursement(item)}
                    >
                      {retryingItemId === item.id
                        ? "Preparing retry..."
                        : "Retry failed payout"}
                    </Button>
                  ) : null}

                  {isPayoutSetupRecovery ? (
                    item.recordState === "valid" &&
                    item.providerId &&
                    item.expectedUpdatedAtMillis ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        disabled={busy}
                        onClick={() => onRepairPayoutSetup(item)}
                      >
                        {repairingItemId === item.id
                          ? "Repairing..."
                          : "Repair payout setup"}
                      </Button>
                    ) : (
                      <p className="text-sm font-semibold text-destructive">
                        This payout recovery case did not pass validation.
                        Refresh Provider payout issues before taking any action.
                      </p>
                    )
                  ) : linkedPayment ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      onClick={() => onViewPayment(linkedPayment)}
                    >
                      View payment details
                    </Button>
                  ) : (
                    <p className="text-sm font-semibold text-destructive">
                      The payment details do not match this record. Refresh and
                      review the issue before continuing.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AttentionMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "warning" | "destructive";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-base font-black tabular-nums",
          highlight === "destructive" && "text-destructive",
          highlight === "warning" && "text-warning",
          !highlight && "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function AttentionField({
  label,
  value,
  code = false,
}: {
  label: string;
  value: string;
  code?: boolean;
}) {
  return <DetailFieldItem label={label} value={value} code={code} />;
}

export {
  PaymentFinanceAttention,
  type PaymentFinanceAttentionProps,
};

export function canRetryFailedDisbursement(
  item: FinanceAttentionItem,
): boolean {
  return (
    item.recordState === "valid" &&
    item.kind === "failed_payout" &&
    item.status === "failed" &&
    item.canonicalDisbursementStatus === "failed" &&
    item.failedDisbursementRetryEligible === true &&
    typeof item.providerDisbursementId === "string" &&
    /^[A-Za-z0-9_-]{1,220}$/u.test(item.providerDisbursementId)
  );
}
