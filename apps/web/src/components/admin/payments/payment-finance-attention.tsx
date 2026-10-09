"use client";

import {
  formatPaymentDate,
  paymentBookingLabel,
  paymentReferenceLabel,
} from "@/components/admin/payments/payment-formatters";
import {Button} from "@/components/ui/button";
import type {
  AdminFinanceAttentionQueue,
  AdminPayment,
  AdminPaymentStatistics,
} from "@/lib/admin/payments/admin-payment-types";

type FinanceAttentionItem =
  AdminFinanceAttentionQueue[
    "items"
  ][number];

type PaymentFinanceAttentionProps = {
  queue: AdminFinanceAttentionQueue;
  statistics?: Pick<AdminPaymentStatistics, "failedPayoutCount" | "reconciliationRequiredCount">;

  loading: boolean;
  error?: string;

  repairingItemId:
    string | null;

  onRefresh: () => void;

  onViewPayment: (
    payment: AdminPayment,
  ) => void;

  onRepairPayoutSetup: (
    item: FinanceAttentionItem,
  ) => void;
};

function PaymentFinanceAttention({
  queue,
  statistics,
  loading,
  error,
  repairingItemId,
  onRefresh,
  onViewPayment,
  onRepairPayoutSetup,
}: PaymentFinanceAttentionProps) {
  return (
    <section
      className="rounded-card border border-border bg-card p-4 sm:p-5"
      aria-labelledby="finance-attention-heading"
      aria-busy={
        loading ||
        repairingItemId !== null
      }
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="finance-attention-heading"
            className="text-lg font-black"
          >
            Provider payout issues
          </h2>

          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Review provider payouts that failed or need attention.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={
            loading ||
            repairingItemId !== null
          }
          onClick={onRefresh}
        >
          {loading
            ? "Refreshing..."
            : "Refresh"}
        </Button>
      </div>

      {statistics ? (
        <dl className="mt-4 flex flex-wrap gap-6 text-sm">
          <AttentionField label="Failed provider payouts" value={String(statistics.failedPayoutCount)} />
          <AttentionField label="Payouts needing review" value={String(statistics.reconciliationRequiredCount)} />
        </dl>
      ) : null}

      {error ? (
        <div
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive-subtle p-4"
          role="alert"
        >
          <p className="font-bold text-destructive">
            Provider payout issues could not be refreshed
          </p>

          <p className="mt-1 text-sm text-destructive">
            {error}
          </p>
        </div>
      ) : null}

      {queue.items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-4">
          <p className="font-bold">
            No provider payout issues require attention
          </p>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            No provider payouts currently need review.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {queue.items.map((item) => {
            const linkedPayment =
              item.payment;

            const isPayoutSetupRecovery =
              item.kind ===
                "ambiguous_payout_setup";

            const title =
              item.kind ===
                "failed_payout"
                ? "Failed Provider payout"
                : item.kind ===
                    "reconciliation_required"
                  ? "Payout to review"
                  : "Payout setup issue";

            return (
              <article
                key={item.id}
                className={[
                  "min-w-0 rounded-lg border p-4",
                  item.recordState ===
                    "invalid"
                    ? [
                        "border-destructive/30",
                        "bg-destructive-subtle",
                      ].join(" ")
                    : [
                        "border-warning/30",
                        "bg-warning-subtle",
                      ].join(" "),
                ].join(" ")}
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-black">
                      {title}
                    </p>

                    <p className="mt-1 break-words text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {item.recordState ===
                        "invalid"
                        ? "Problem found"
                        : isPayoutSetupRecovery
                          ? "Setup needs attention"
                          : "Needs review"}
                    </p>
                  </div>

                  <p className="text-sm font-black">
                    {isPayoutSetupRecovery
                      ? "No payment involved"
                      : item.formattedAmount ??
                        "Amount unavailable"}
                  </p>
                </div>

                <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
                  <AttentionField
                    label="Payment"
                    value={
                      isPayoutSetupRecovery
                        ? "Not applicable"
                        : linkedPayment
                          ? paymentBookingLabel(
                              linkedPayment,
                            )
                          : item.paymentId
                            ? paymentReferenceLabel({paymentId: item.paymentId})
                            : "Payment not found"
                    }
                  />

                  <AttentionField
                    label="Provider"
                    value={
                      linkedPayment
                        ?.providerName ??
                      "Provider information unavailable"
                    }
                  />





                  <AttentionField
                    label="Last updated"
                    value={formatPaymentDate(
                      item.updatedAt,
                    )}
                  />

                  <AttentionField
                    label="Status"
                    value={
                      item.kind ===
                        "failed_payout"
                        ? "Failed payout"
                        : item.kind ===
                            "reconciliation_required"
                          ? "Needs review"
                          : "Payout setup needs review"
                    }
                  />
                </dl>

                <div className="mt-4 rounded-lg border border-border/70 bg-background/70 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Reason
                  </p>

                  <p className="mt-1 break-words text-sm leading-6">
                    {item.recordState === "invalid"
                      ? "The provider payout information could not be verified."
                      : isPayoutSetupRecovery
                        ? "The provider payout account setup could not be confirmed."
                        : item.kind === "failed_payout"
                          ? "The payment to the provider failed."
                          : "The provider payout needs review before continuing."}
                  </p>
                </div>

                <details className="mt-4 rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Additional details</summary>
                  <dl className="mt-3 grid gap-3 text-sm">
                    <AttentionField label="Provider reference" value={item.providerId ?? "Not recorded"} code />
                    <AttentionField label="Payment reference" value={item.paymentId ?? "Not applicable"} code />
                    <AttentionField label="Recorded reason" value={item.reason ?? "No additional reason was recorded."} />
                  </dl>
                </details>

                {isPayoutSetupRecovery ? (
                  item.recordState === "valid" &&
                  item.providerId &&
                  item.expectedUpdatedAtMillis ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      className="mt-4"
                      disabled={
                        loading ||
                        repairingItemId !== null
                      }
                      onClick={() =>
                        onRepairPayoutSetup(
                          item,
                        )
                      }
                    >
                      {repairingItemId ===
                      item.id
                        ? "Repairing..."
                        : "Repair payout setup"}
                    </Button>
                  ) : (
                    <p className="mt-4 text-sm font-semibold text-destructive">
                      This payout recovery case
                      did not pass validation.
                      Refresh Provider payout issues
                      before taking any action.
                    </p>
                  )
                ) : linkedPayment ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    className="mt-4"
                    onClick={() =>
                      onViewPayment(
                        linkedPayment,
                      )
                    }
                  >
                    View payment details
                  </Button>
                ) : (
                  <p className="mt-4 text-sm font-semibold text-destructive">
                    The payment details do not match this record. Refresh and review the issue before continuing.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}


    </section>
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
  return (
    <div className="min-w-0">
      <dt className="font-semibold text-muted-foreground">
        {label}
      </dt>

      <dd
        className={[
          "mt-1 break-words font-medium",
          code
            ? "break-all font-mono text-xs"
            : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

export {
  PaymentFinanceAttention,
  type PaymentFinanceAttentionProps,
};
