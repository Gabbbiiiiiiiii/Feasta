"use client";

import type {
  ReactNode,
} from "react";

import {
  PaymentIssueBadges,
} from "@/components/admin/payments/payment-issue-badges";
import {
  formatPaymentDate,
  formatPaymentType,
  paymentBookingLabel,
} from "@/components/admin/payments/payment-formatters";
import {
  PaymentStatusBadge,
} from "@/components/admin/payments/payment-status-badge";
import {
  DetailDrawer,
} from "@/components/data/detail-drawer";
import {
  LoadingSkeleton,
} from "@/components/feedback/loading";
import {Button} from "@/components/ui/button";
import type {
  AdminPayment,
  AdminPaymentDetails,
} from "@/lib/admin/payments/admin-payment-types";

type PaymentDetailsDrawerProps = {
  payment: AdminPayment | null;
  details: AdminPaymentDetails | null;

  open: boolean;
  loading: boolean;
  error?: string;

  onOpenChange: (open: boolean) => void;
  onRetry: () => void;

  onRequestRefund: (
    payment: AdminPayment,
  ) => void;
};

function PaymentDetailsDrawer({
  payment,
  details,
  open,
  loading,
  error,
  onOpenChange,
  onRetry,
  onRequestRefund,
}: PaymentDetailsDrawerProps) {
  const visiblePayment =
    details?.payment ?? payment;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Payment details"
      description={
        visiblePayment
          ? `Review transaction ${visiblePayment.paymentId}.`
          : "Review payment transaction information."
      }
      footer={
        <>
          {details?.payment
            .refundEligibility.eligible ? (
            <Button
              type="button"
              variant="destructive"
              size="compact"
              onClick={() =>
                onRequestRefund(
                  details.payment,
                )
              }
            >
              Request refund
            </Button>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() =>
              onOpenChange(false)
            }
          >
            Close
          </Button>
        </>
      }
    >
      {loading ? (
        <PaymentDetailsLoading />
      ) : error ? (
        <div
          className="rounded-lg border border-destructive bg-destructive-subtle p-4"
          role="alert"
        >
          <p className="font-bold text-destructive">
            Payment details could not be loaded
          </p>

          <p className="mt-2 text-sm text-destructive">
            {error}
          </p>

          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="mt-4"
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      ) : details ? (
        <PaymentDetailsContent
          details={details}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a payment to review its details.
        </p>
      )}
    </DetailDrawer>
  );
}

function PaymentDetailsContent({
  details,
}: {
  details: AdminPaymentDetails;
}) {
  const {payment} = details;

  const timeline = [
    {
      label: "Created",
      value: payment.createdAt,
    },
    {
      label: "Paid",
      value: payment.paidAt,
    },
    {
      label: "Failed",
      value: payment.failedAt,
    },
    {
      label: "Expired",
      value: payment.expiredAt,
    },
    {
      label: "Refunded",
      value: payment.refundedAt,
    },
  ].filter(
    (
      entry,
    ): entry is {
      label: string;
      value: string;
    } => Boolean(entry.value),
  );

  return (
    <div className="grid min-w-0 gap-6">
      <section
        className="rounded-card border border-border bg-card p-4"
        aria-labelledby="payment-summary-heading"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="payment-summary-heading"
              className="break-words text-lg font-black"
            >
              Payment summary
            </h2>

            <p className="mt-1 break-words text-sm text-muted-foreground">
              {paymentBookingLabel(payment)}
            </p>
          </div>

          <PaymentStatusBadge
            status={payment.status}
          />
        </div>

        <p className="mt-4 break-words text-3xl font-black tracking-tight">
          {payment.formattedAmount}
        </p>

        <p className="mt-1 text-sm font-medium text-muted-foreground">
          {formatPaymentType(
            payment.paymentType,
          )}
        </p>

        {payment.issues.length > 0 ? (
          <div className="mt-4">
            <PaymentIssueBadges
              issues={payment.issues}
            />
          </div>
        ) : null}
      </section>

      <DetailsSection
        title="Payment summary"
      >
        <DetailsGrid>
          <DetailField
            label="Payment type"
            value={formatPaymentType(
              payment.paymentType,
            )}
          />

          <DetailField
            label="Currency"
            value={payment.currency}
          />

          <DetailField
            label="Last updated"
            value={formatPaymentDate(
              payment.updatedAt,
            )}
          />
        </DetailsGrid>
      </DetailsSection>

      <DetailsSection
        title="Booking"
      >
        <DetailsGrid>
          <DetailField
            label="Booking"
            value={paymentBookingLabel(
              payment,
            )}
          />

          <DetailField
            label="Booking status"
            value={
              details.booking.status ??
              "Not available"
            }
          />

          <DetailField
            label="Booking payment status"
            value={
              details.booking
                .paymentStatus ??
              "Not available"
            }
          />

          <DetailField
            label="Provider response"
            value={
              details.providerRequest
                .status ??
              "Not available"
            }
          />

          <DetailField
            label="Event type"
            value={
              details.booking.eventType ??
              "Not available"
            }
          />

          <DetailField
            label="Event date"
            value={formatPaymentDate(
              details.booking.eventDate,
            )}
          />
        </DetailsGrid>
      </DetailsSection>

      <DetailsSection
        title="Customer and provider"
      >
        <DetailsGrid>
          <DetailField
            label="Customer"
            value={payment.customerName}
          />

          <DetailField
            label="Customer email"
            value={
              payment.customerEmail ??
              "Not available"
            }
          />

          <DetailField
            label="Provider"
            value={payment.providerName}
          />
        </DetailsGrid>
      </DetailsSection>

      <DetailsSection
        title="Transaction timeline"
      >
        {timeline.length > 0 ? (
          <ol className="grid gap-3">
            {timeline.map((entry) => (
              <li
                key={entry.label}
                className="rounded-lg border border-border p-3"
              >
                <p className="font-bold">
                  {entry.label}
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {formatPaymentDate(
                    entry.value,
                  )}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyDetailMessage>
            No transaction timestamps are available.
          </EmptyDetailMessage>
        )}
      </DetailsSection>

      <DetailsSection
        title="Refund information"
      >
        <div
          className={[
            "rounded-lg border p-4",
            payment.refundEligibility
              .eligible
              ? [
                  "border-success",
                  "bg-success-subtle",
                ].join(" ")
              : [
                  "border-border",
                  "bg-muted/50",
                ].join(" "),
          ].join(" ")}
        >
          <p className="font-bold">
            {payment.refundEligibility
              .eligible
              ? "Eligible for refund request"
              : "Not eligible for refund"}
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            {refundEligibilityMessage(
              payment.refundEligibility
                .reason,
            )}
          </p>
        </div>
      </DetailsSection>

      <DetailsSection title="Provider payout">
        <DetailsGrid>
          <DetailField
            label="Provider earning"
            value={
              details.providerFinance.earning.formattedEarningAmount ??
              "Not recorded"
            }
          />
          <DetailField
            label="Provider paid out"
            value={
              details.providerFinance.settlement.formattedPaidOutAmount ??
              "Not recorded"
            }
          />
        </DetailsGrid>
      </DetailsSection>

      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer font-semibold">
          Additional payment details
        </summary>
        <div className="mt-4 grid gap-6">
          <DetailsSection title="Payment update history">
            {details.webhooks.length > 0 ? (
              <ol className="grid gap-3">
                {details.webhooks.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <p className="break-words font-bold">{event.eventType}</p>
                      <span className="text-sm font-semibold text-muted-foreground">
                        {event.status}
                      </span>
                    </div>
                    <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                      {event.eventId}
                    </p>
                    {event.reason ? (
                      <p className="mt-2 text-sm text-destructive">{event.reason}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatPaymentDate(event.processedAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyDetailMessage>
                No payment updates were found.
              </EmptyDetailMessage>
            )}
          </DetailsSection>

          <DetailsSection title="Support references">
            <DetailsGrid>
              <DetailField label="Payment reference" value={payment.paymentId} code />
              <DetailField
                label="Payment service reference"
                value={payment.gatewayResourceId ?? "Not available"}
                code
              />
              <DetailField
                label="Checkout reference"
                value={payment.gatewayCheckoutId ?? "Not available"}
                code
              />
              <DetailField
                label="Last payment update"
                value={payment.lastWebhookEventId ?? "Not available"}
                code
              />
              <DetailField label="Event reference" value={payment.mainEventId} code />
              <DetailField
                label="Provider request reference"
                value={payment.providerRequestId ?? "Not available"}
                code
              />
              <DetailField label="Customer reference" value={payment.customerId} code />
              <DetailField label="Provider reference" value={payment.providerId} code />
            </DetailsGrid>
          </DetailsSection>

          <AdminFinancialOverview details={details} />
          <ProviderFinanceDetails details={details} />
        </div>
      </details>

      <DetailsSection
        title="Activity history"
      >
        {details.auditHistory.length >
        0 ? (
          <ol className="grid gap-3">
            {details.auditHistory.map(
              (entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="break-words font-bold">
                    {entry.action}
                  </p>

                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {entry.actorRole} - {entry.actorId}
                  </p>

                  {entry.beforeStatus ||
                  entry.afterStatus ? (
                    <p className="mt-2 text-sm">
                      {entry.beforeStatus ?? "Unknown"}
                      {" to "}
                      {entry.afterStatus ?? "Unknown"}
                    </p>
                  ) : null}

                  {entry.reason ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Reason: {entry.reason}
                    </p>
                  ) : null}

                  <p className="mt-2 text-sm text-muted-foreground">
                    {formatPaymentDate(
                      entry.createdAt,
                    )}
                  </p>
                </li>
              ),
            )}
          </ol>
        ) : (
          <EmptyDetailMessage>
            No payment activities have been recorded yet.
          </EmptyDetailMessage>
        )}
      </DetailsSection>
    </div>
  );
}

function AdminFinancialOverview({
  details,
}: {
  details: AdminPaymentDetails;
}) {
  const summary =
    details.financialSummary;

  const payout =
    details.payoutAccount;

  return (
    <>
      <DetailsSection
        title="Booking financial summary"
      >
        {summary.recordState ===
        "valid" ? (
          <div className="grid gap-3">
            <DetailsGrid>
              <DetailField
                label="Booking value"
                value={
                  summary
                    .formattedBookingValue ??
                  "Not recorded"
                }
              />

              <DetailField
                label="Total customer payments"
                value={
                  summary
                    .formattedCollectedAmount ??
                  "Not recorded"
                }
              />

              <DetailField
                label="Remaining customer balance"
                value={
                  summary
                    .formattedRemainingCustomerBalance ??
                  "Not recorded"
                }
              />

              <DetailField
                label="Remaining balance status"
                value={financeStatusLabel(
                  summary
                    .remainingBalanceStatus,
                )}
              />

              <DetailField
                label="Balance due"
                value={formatPaymentDate(
                  summary
                    .remainingBalanceDueAt,
                )}
              />

              <DetailField
                label="Grace period ends"
                value={formatPaymentDate(
                  summary
                    .remainingBalanceGraceEndsAt,
                )}
              />

              <DetailField
                label="Customer fully settled"
                value={booleanFinanceLabel(
                  summary.fullySettled,
                )}
              />

              <DetailField
                label="Financial policy version"
                value={
                  summary
                    .financialPolicyVersion ??
                  "Not recorded"
                }
              />
            </DetailsGrid>

            <p className="text-xs leading-5 text-muted-foreground">
              Booking value comes from the saved booking total. Customer payments and the remaining balance come from recorded payment totals.
            </p>
          </div>
        ) : (
          <AdminFinanceProjectionNotice
            kind={summary.recordState}
            label="booking financial summary"
          />
        )}
      </DetailsSection>

      <DetailsSection
        title="Tax details"
      >
        {summary.recordState ===
        "valid" ? (
          <div className="grid gap-3">
            <DetailsGrid>
              <DetailField
                label="Provider tax classification"
                value={financeStatusLabel(
                  summary.providerTaxType,
                )}
              />

              <DetailField
                label="Tax verification"
                value={financeStatusLabel(
                  summary
                    .providerTaxVerificationStatus,
                )}
              />

              <DetailField
                label="Provider VAT accrued"
                value={
                  summary
                    .formattedProviderVatAccrued ??
                  "Not recorded"
                }
              />

              <DetailField
                label="Provider VAT reversed"
                value={
                  summary
                    .formattedProviderVatReversed ??
                  "Not recorded"
                }
              />

              <DetailField
                label="Provider VAT net"
                value={
                  summary
                    .formattedProviderVatNet ??
                  "Not recorded"
                }
              />
            </DetailsGrid>

            <p className="text-xs leading-5 text-muted-foreground">
              Provider tax classification is separate from the business registration type. Tax amounts use the saved booking record when the provider tax profile was verified.
            </p>
          </div>
        ) : (
          <AdminFinanceProjectionNotice
            kind={summary.recordState}
            label="Provider tax projection"
          />
        )}
      </DetailsSection>

      <DetailsSection
        title="FEASTA fees and tax"
      >
        {summary.recordState ===
        "valid" ? (
          <div className="grid gap-3">
            <DetailsGrid>
              <DetailField
                label="FEASTA fee rate"
                value={basisPointsLabel(
                  summary
                    .platformCommissionRateBps,
                )}
              />

              <DetailField
                label="FEASTA fees before refunds"
                value={
                  summary
                    .formattedCommissionAccrued ??
                  "Not recorded"
                }
              />

              <DetailField
                label="Refunded FEASTA fees"
                value={
                  summary
                    .formattedCommissionReversed ??
                  "Not recorded"
                }
              />

              <DetailField
                label="Recorded FEASTA fees"
                value={
                  summary
                    .formattedCommissionEarned ??
                  "Not recorded"
                }
              />

              <DetailField
                label="FEASTA tax status"
                value={financeStatusLabel(
                  summary.platformTaxStatus,
                )}
              />

              <DetailField
                label="FEASTA VAT rate"
                value={basisPointsLabel(
                  summary
                    .platformVatRateBps,
                )}
              />

              <DetailField
                label="FEASTA VAT accrued"
                value={
                  summary
                    .formattedPlatformVatAccrued ??
                  "Not recorded"
                }
              />

              <DetailField
                label="FEASTA VAT reversed"
                value={
                  summary
                    .formattedPlatformVatReversed ??
                  "Not recorded"
                }
              />

              <DetailField
                label="FEASTA VAT net"
                value={
                  summary
                    .formattedPlatformVatNet ??
                  "Not recorded"
                }
              />
            </DetailsGrid>

            <p className="text-xs leading-5 text-muted-foreground">
              FEASTA fees reflect saved charges and completed refunds.
            </p>
          </div>
        ) : (
          <AdminFinanceProjectionNotice
            kind={summary.recordState}
            label="FEASTA financial projection"
          />
        )}
      </DetailsSection>

      <DetailsSection
        title="Payout account"
      >
        {payout.recordState ===
        "valid" ? (
          <div className="grid gap-3">
            {!payout
              .settlementTransportReady ? (
              <div
                className="rounded-lg border border-warning/30 bg-warning-subtle p-4"
                role="status"
              >
                <p className="font-bold text-warning">
                  Payout account not ready
                </p>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Completing account setup does not mean a provider payout can be sent yet.
                </p>
              </div>
            ) : null}

            <DetailsGrid>
              <DetailField
                label="Payout setup"
                value={financeStatusLabel(
                  payout.setupStatus,
                )}
              />

              <DetailField
                label="Linked account type"
                value={financeStatusLabel(
                  payout.linkedAccountType,
                )}
              />

              <DetailField
                label="Invitation status"
                value={financeStatusLabel(
                  payout.invitationStatus,
                )}
              />

              <DetailField
                label="Activation status"
                value={financeStatusLabel(
                  payout.activationStatus,
                )}
              />

              <DetailField
                label="Account onboarding ready"
                value={booleanFinanceLabel(
                  payout.payoutReady,
                )}
              />

              <DetailField
                label="Payment service relationship"
                value={financeStatusLabel(
                  payout.relationshipStatus,
                )}
              />

              <DetailField
                label="Settlement transport mode"
                value={financeStatusLabel(
                  payout
                    .settlementTransportMode,
                )}
              />

              <DetailField
                label="Settlement transport ready"
                value={booleanFinanceLabel(
                  payout
                    .settlementTransportReady,
                )}
              />

              <DetailField
                label="Last updated"
                value={formatPaymentDate(
                  payout.updatedAt,
                )}
              />
            </DetailsGrid>

            <p className="text-xs leading-5 text-muted-foreground">
              This payout account information is read-only.
            </p>
          </div>
        ) : (
          <AdminFinanceProjectionNotice
            kind={payout.recordState}
            label="Provider payout account"
          />
        )}
      </DetailsSection>
    </>
  );
}

function AdminFinanceProjectionNotice({
  kind,
  label,
}: {
  kind:
    AdminPaymentDetails[
      "financialSummary"
    ]["recordState"];

  label: string;
}) {
  if (kind === "not_available") {
    return (
      <EmptyDetailMessage>
        No {label} is available for this
        payment.
      </EmptyDetailMessage>
    );
  }

  if (kind === "invalid") {
    return (
      <p
        className="rounded-lg border border-destructive/30 bg-destructive-subtle p-4 text-sm font-semibold text-destructive"
        role="alert"
      >
        The {label} failed FEASTA&apos;s
        finance validation. No financial
        value is being inferred.
      </p>
    );
  }

  return null;
}

function basisPointsLabel(
  value: number | null,
): string {
  if (value === null) {
    return "Not recorded";
  }

  return `${value / 100}%`;
}

function booleanFinanceLabel(
  value: boolean | null,
): string {
  if (value === null) {
    return "Not recorded";
  }

  return value
    ? "Yes"
    : "No";
}

function ProviderFinanceDetails({
  details,
}: {
  details: AdminPaymentDetails;
}) {
  const {
    earning,
    settlement,
  } = details.providerFinance;

  return (
    <>
      <DetailsSection
        title="Provider earning"
      >
        {earning.recordState ===
        "valid" ? (
          <DetailsGrid>
            <DetailField
              label="Earning ID"
              value={
                earning.earningId ??
                "Not recorded"
              }
              code
            />

            <DetailField
              label="Status"
              value={financeStatusLabel(
                earning.status,
              )}
            />

            <DetailField
              label="Provider earning"
              value={
                earning.formattedEarningAmount ??
                "Not recorded"
              }
            />

            <DetailField
              label="Pending"
              value={
                earning.formattedPendingAmount ??
                "Not recorded"
              }
            />

            <DetailField
              label="Available for settlement"
              value={
                earning.formattedAvailableAmount ??
                "Not recorded"
              }
            />

            <DetailField
              label="Paid out"
              value={
                earning.formattedPaidAmount ??
                "Not recorded"
              }
            />

            <DetailField
              label="Reversed"
              value={
                earning.formattedReversedAmount ??
                "Not recorded"
              }
            />

            <DetailField
              label="Last updated"
              value={formatPaymentDate(
                earning.updatedAt ??
                  earning.createdAt,
              )}
            />
          </DetailsGrid>
        ) : (
          <FinanceRecordNotice
            kind={earning.recordState}
            recordLabel="Provider earning"
          />
        )}
      </DetailsSection>

      <DetailsSection
        title="Provider settlement"
      >
        {settlement.recordState ===
        "valid" ? (
          <div className="grid gap-3">
            {settlement.reconciliationRequired ? (
              <div
                className="rounded-lg border border-warning/30 bg-warning-subtle p-4"
                role="status"
              >
                <p className="font-bold text-warning">
                  Review needed
                </p>

                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Provider settlement requires review.
                  This does not change the Customer
                  payment status.
                </p>

                {settlement.reconciliationReason ? (
                  <p className="mt-2 break-words text-sm font-semibold">
                    Reason:{" "}
                    {settlement.reconciliationReason}
                  </p>
                ) : null}
              </div>
            ) : null}

            <DetailsGrid>
              <DetailField
                label="Settlement ID"
                value={
                  settlement.settlementId ??
                  "Not recorded"
                }
                code
              />

              <DetailField
                label="Settlement status"
                value={financeStatusLabel(
                  settlement.status,
                )}
              />

              <DetailField
                label="Net settlement"
                value={
                  settlement.formattedNetSettlementAmount ??
                  "Not recorded"
                }
              />

              <DetailField
                label="Reserved"
                value={
                  settlement.formattedReservedAmount ??
                  "Not recorded"
                }
              />

              <DetailField
                label="Provider paid out"
                value={
                  settlement.formattedPaidOutAmount ??
                  "Not recorded"
                }
              />

              <DetailField
                label="Reconciliation"
                value={
                  settlement.reconciliationRequired
                    ? "Required"
                    : "Not required"
                }
              />

              <DetailField
                label="Active payout attempt"
                value={
                  settlement.activePayoutAttemptId ??
                  "None"
                }
                code
              />

              <DetailField
                label="Last payout attempt"
                value={
                  settlement.lastPayoutAttemptId ??
                  "None"
                }
                code
              />

              <DetailField
                label="Paid out at"
                value={formatPaymentDate(
                  settlement.paidOutAt,
                )}
              />

              <DetailField
                label="Last updated"
                value={formatPaymentDate(
                  settlement.updatedAt ??
                    settlement.createdAt,
                )}
              />
            </DetailsGrid>

            <p className="text-xs leading-5 text-muted-foreground">
              Customer collection and Provider
              settlement are separate financial
              states. A paid Customer transaction
              does not by itself mean the Provider
              has been paid.
            </p>
          </div>
        ) : (
          <FinanceRecordNotice
            kind={settlement.recordState}
            recordLabel="Provider settlement"
          />
        )}
      </DetailsSection>
      <PayoutAttemptEvidence details={details} />

    </>
  );
}

function PayoutAttemptEvidence({
  details,
}: {
  details: AdminPaymentDetails;
}) {
  const {
    active,
    last,
  } =
    details.providerFinance
      .payoutAttempts;

  const hasActive =
    active.recordState !==
      "not_referenced";

  const hasLast =
    last.recordState !==
      "not_referenced";

  const sameAttempt =
    active.payoutAttemptId !== null &&
    active.payoutAttemptId ===
      last.payoutAttemptId;

  return (
    <DetailsSection
      title="Payout attempt evidence"
    >
      {!hasActive && !hasLast ? (
        <EmptyDetailMessage>
          No payout attempt is referenced by
          this Provider settlement.
        </EmptyDetailMessage>
      ) : (
        <div className="grid gap-3">
          {hasActive ? (
            <PayoutAttemptCard
              title="Active payout attempt"
              attempt={active}
            />
          ) : (
            <EmptyDetailMessage>
              No active payout attempt is
              currently referenced.
            </EmptyDetailMessage>
          )}

          {hasLast && !sameAttempt ? (
            <PayoutAttemptCard
              title="Last payout attempt"
              attempt={last}
            />
          ) : null}

          <p className="text-xs leading-5 text-muted-foreground">
            This information is read-only.
          </p>
        </div>
      )}
    </DetailsSection>
  );
}

function PayoutAttemptCard({
  title,
  attempt,
}: {
  title: string;

  attempt:
    AdminPaymentDetails[
      "providerFinance"
    ]["payoutAttempts"]["active"];
}) {
  if (
    attempt.recordState ===
      "not_found"
  ) {
    return (
      <p
        className="rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm font-semibold text-warning"
        role="status"
      >
        {title}: the referenced payout
        attempt record was not found.
      </p>
    );
  }

  if (
    attempt.recordState ===
      "invalid"
  ) {
    return (
      <p
        className="rounded-lg border border-destructive/30 bg-destructive-subtle p-4 text-sm font-semibold text-destructive"
        role="alert"
      >
        {title}: the payout attempt
        failed FEASTA&apos;s finance
        validation.
      </p>
    );
  }

  if (
    attempt.recordState !==
      "valid"
  ) {
    return null;
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border p-4">
      <p className="font-black">
        {title}
      </p>

      <DetailsGrid>
        <DetailField
          label="Attempt ID"
          value={
            attempt.payoutAttemptId ??
            "Not recorded"
          }
          code
        />

        <DetailField
          label="Status"
          value={financeStatusLabel(
            attempt.status,
          )}
        />

        <DetailField
          label="Amount"
          value={
            attempt.formattedAmount ??
            "Not recorded"
          }
        />

        <DetailField
          label="Payment service"
          value={
            attempt.gateway ===
              "paymongo"
              ? "Payment service"
              : "Not recorded"
          }
        />

        <DetailField
          label="Payment service reference"
          value={
            attempt.gatewayResourceId ??
            "Not recorded"
          }
          code
        />

        <DetailField
          label="Failure code"
          value={
            attempt.failureCode ??
            "None"
          }
          code
        />

        <DetailField
          label="Failure message"
          value={
            attempt.failureMessage ??
            "None"
          }
        />

        <DetailField
          label="Created"
          value={formatPaymentDate(
            attempt.createdAt,
          )}
        />

        <DetailField
          label="Submitted"
          value={formatPaymentDate(
            attempt.submittedAt,
          )}
        />

        <DetailField
          label="Completed"
          value={formatPaymentDate(
            attempt.completedAt,
          )}
        />

        <DetailField
          label="Last updated"
          value={formatPaymentDate(
            attempt.updatedAt,
          )}
        />
      </DetailsGrid>
    </div>
  );
}
function FinanceRecordNotice({
  kind,
  recordLabel,
}: {
  kind:
    AdminPaymentDetails[
      "providerFinance"
    ]["earning"]["recordState"];
  recordLabel: string;
}) {
  switch (kind) {
    case "not_found":
      return (
        <EmptyDetailMessage>
          No {recordLabel} record exists for
          this payment. This can be expected
          until a successful Customer payment
          creates Provider finance records.
        </EmptyDetailMessage>
      );

    case "ambiguous":
      return (
        <p
          className="rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm font-semibold text-warning"
          role="status"
        >
          Multiple {recordLabel.toLowerCase()} records
          matched this payment. The financial state
          is not being inferred automatically.
        </p>
      );

    case "invalid":
      return (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive-subtle p-4 text-sm font-semibold text-destructive"
          role="alert"
        >
          The {recordLabel.toLowerCase()} record
          failed FEASTA&apos;s finance validation.
          Review the payment record.
        </p>
      );

    case "valid":
      return null;
  }
}

function financeStatusLabel(
  value: string | null,
): string {
  if (!value) {
    return "Not recorded";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}
function DetailsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <h2 className="text-base font-black">
        {title}
      </h2>

      <div className="mt-3">
        {children}
      </div>
    </section>
  );
}

function DetailsGrid({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      {children}
    </dl>
  );
}

function DetailField({
  label,
  value,
  code = false,
}: {
  label: string;
  value: ReactNode;
  code?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-3">
      <dt className="text-sm font-semibold text-muted-foreground">
        {label}
      </dt>

      <dd
        className={[
          "mt-1 break-words text-sm font-medium",
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

function EmptyDetailMessage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function PaymentDetailsLoading() {
  return (
    <div className="grid gap-4">
      <LoadingSkeleton
        className="h-32 w-full"
        label="Loading payment summary"
      />

      <LoadingSkeleton
        className="h-48 w-full"
        label="Loading transaction details"
      />

      <LoadingSkeleton
        className="h-40 w-full"
        label="Loading payment history"
      />
    </div>
  );
}

function refundEligibilityMessage(
  reason:
    AdminPayment["refundEligibility"]["reason"],
): string {
  const messages: Record<
    AdminPayment["refundEligibility"]["reason"],
    string
  > = {
    eligible:
      "This paid transaction can proceed to the secured refund workflow.",

    refund_pending:
      "A refund has already been requested and is awaiting confirmation from the payment service.",

    not_paid:
      "Only successfully paid transactions can be refunded.",

    already_refunded:
      "This transaction has already been refunded.",

    missing_gateway_reference:
      "The payment service reference is missing.",

    invalid_amount:
      "The payment amount is invalid.",

    invalid_currency:
      "Only Philippine peso payments are currently supported.",
  };

  return messages[reason];
}

export {
  PaymentDetailsDrawer,
  type PaymentDetailsDrawerProps,
};