"use client";

import {ArrowUpRight, ChevronRight} from "lucide-react";
import Link from "next/link";
import type {
  ReactNode,
} from "react";
import {BookingPolicySummary} from "@/components/shared/booking-policy-summary";

import {
  PaymentIssueBadges,
} from "@/components/admin/payments/payment-issue-badges";
import {
  formatPaymentDate,
  formatPaymentMethod,
  formatAdminPaymentPurpose,
  paymentBookingLabel,
} from "@/components/admin/payments/payment-formatters";
import {
  PaymentStatusBadge,
} from "@/components/admin/payments/payment-status-badge";
import {
  DetailDrawer,
} from "@/components/data/detail-drawer";
import {
  DetailFieldItem,
  DetailFieldList,
} from "@/components/data/detail-field-list";
import {
  LoadingSkeleton,
} from "@/components/feedback/loading";
import {Button} from "@/components/ui/button";
import {
  adminBookingPaymentLabel,
  adminBookingStatusLabel,
  adminProviderRequestLabel,
} from "@/lib/admin/bookings/admin-booking-labels";
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
};

function PaymentDetailsDrawer({
  payment,
  details,
  open,
  loading,
  error,
  onOpenChange,
  onRetry,
}: PaymentDetailsDrawerProps) {
  const visiblePayment = details?.payment ?? payment;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Payment details"
      description={
        visiblePayment?.bookingCode
          ? `View payment information for ${visiblePayment.bookingCode}.`
          : "View payment information."
      }
      footer={
        <>
          {visiblePayment?.bookingCode ? (
            <Button asChild variant="secondary" size="compact">
              <Link
                href={`/admin/bookings?search=${encodeURIComponent(visiblePayment.bookingCode)}`}
              >
                <span>Open booking</span>
                <ArrowUpRight aria-hidden="true" className="size-4" />
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </>
      }
    >
      <BookingPolicySummary policy={visiblePayment?.bookingPolicy} audience="admin" />
      {loading ? (
        <PaymentDetailsLoading />
      ) : error ? (
        <div
          className="rounded-xl border border-destructive/30 bg-destructive-subtle p-4"
          role="alert"
        >
          <p className="font-bold text-destructive">
            Payment details could not be loaded
          </p>

          <p className="mt-2 text-sm text-destructive">{error}</p>

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
        <PaymentDetailsContent details={details} />
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
  const paymentMethodLabel = formatPaymentMethod(payment.paymentMethodType);

  const timeline = [
    {label: "Created", value: payment.createdAt},
    {label: "Paid", value: payment.paidAt},
    {label: "Failed", value: payment.failedAt},
    {label: "Expired", value: payment.expiredAt},
    {label: "Refunded", value: payment.refundedAt},
  ].filter(
    (entry): entry is {label: string; value: string} =>
      Boolean(entry.value),
  );

  return (
    <div className="grid min-w-0 gap-5">
      <section
        className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"
        aria-labelledby="payment-summary-heading"
      >
        <div className="border-b border-border/70 bg-primary-tint/35 px-4 py-3.5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="payment-summary-heading"
                className="break-words text-base font-black text-primary-strong"
              >
                Payment overview
              </h2>

              <p className="mt-0.5 break-words text-xs font-semibold text-muted-foreground">
                {paymentBookingLabel(payment)}
              </p>
            </div>

            <PaymentStatusBadge status={payment.status} />
          </div>

          <p className="mt-3 break-words text-3xl font-black tracking-tight tabular-nums text-primary">
            {payment.formattedAmount}
          </p>

          {payment.formattedCommissionAmount ? (
            <p className="mt-1 text-sm font-semibold tabular-nums text-muted-foreground">
              FEASTA fee {payment.formattedCommissionAmount}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="rounded-md bg-card px-2 py-0.5 font-semibold text-foreground ring-1 ring-border">
              {formatAdminPaymentPurpose(payment)}
            </span>
            {paymentMethodLabel ? (
              <span className="rounded-md bg-card px-2 py-0.5 font-semibold text-foreground ring-1 ring-border">
                {paymentMethodLabel}
              </span>
            ) : null}
            <span>
              Last updated: {formatPaymentDate(payment.updatedAt)}
            </span>
          </div>
        </div>

        {payment.issues.length > 0 ? (
          <div className="px-4 py-3">
            <PaymentIssueBadges issues={payment.issues} showDescriptions />
          </div>
        ) : null}
      </section>

      <DetailsSection title="Booking">
        <DetailsGrid>
          <DetailField
            label="Booking status"
            value={
              details.booking.status
                ? adminBookingStatusLabel(details.booking.status)
                : "Not available"
            }
          />

          <DetailField
            label="Event type"
            value={formatEventTypeLabel(details.booking.eventType)}
          />

          <DetailField
            label="Event date"
            value={formatPaymentDate(details.booking.eventDate)}
            wide
          />
        </DetailsGrid>
      </DetailsSection>

      <DetailsSection title="Customer and provider">
        <DetailsGrid>
          <DetailField label="Customer" value={payment.customerName} />

          <DetailField
            label="Customer email"
            value={payment.customerEmail ?? "Not available"}
          />

          <DetailField label="Provider" value={payment.providerName} wide />
        </DetailsGrid>
      </DetailsSection>

      <DetailsSection title="Payment timeline">
        {timeline.length > 0 ? (
          <ol className="divide-y divide-border/70 px-4">
            {timeline.map((entry) => (
              <li
                key={entry.label}
                className="flex items-baseline justify-between gap-3 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2 font-semibold text-foreground">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full bg-primary"
                  />
                  {entry.label}
                </span>

                <span className="text-right text-xs font-medium tabular-nums text-muted-foreground">
                  {formatPaymentDate(entry.value)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyDetailMessage>
            No transaction timestamps are available.
          </EmptyDetailMessage>
        )}
      </DetailsSection>

      <DetailsSection title="Refund information">
        <p className="px-4 py-3 text-sm font-bold text-foreground">
          {refundMonitoringLabel(payment)}
        </p>
      </DetailsSection>

      <DetailsSection title="Provider share">
        <DetailsGrid>
          <DetailField
            label="Provider share"
            value={
              details.providerFinance.earning.formattedEarningAmount ??
              "Not recorded"
            }
            numeric
          />
          <DetailField
            label="Settled to provider"
            value={
              details.providerFinance.settlement.formattedPaidOutAmount ??
              "Not recorded"
            }
            numeric
          />
        </DetailsGrid>
      </DetailsSection>

      <details className="group rounded-xl border border-border/80 bg-secondary/50 transition-colors duration-fast open:bg-secondary/35">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-sm font-bold text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-primary transition-transform duration-fast group-open:rotate-90 motion-reduce:transition-none"
          />
          <span>Additional details</span>
        </summary>
        <div className="grid gap-5 px-3.5 pb-4 pt-1">
          <DetailsSection title="Payment update history">
            {details.webhooks.length > 0 ? (
              <ol className="divide-y divide-border/70">
                {details.webhooks.map((event) => (
                  <li key={event.id} className="px-4 py-3">
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <p className="break-words text-sm font-bold">
                        {event.eventType}
                      </p>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {event.status}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {event.eventId}
                    </p>
                    {event.reason ? (
                      <p className="mt-1.5 text-xs font-medium text-destructive">
                        {event.reason}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted-foreground">
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

          <DetailsSection title="Linked record statuses">
            <DetailsGrid>
              <DetailField
                label="Booking payment status"
                value={
                  details.booking.paymentStatus
                    ? adminBookingPaymentLabel(details.booking.paymentStatus)
                    : "Not available"
                }
              />
              <DetailField
                label="Provider service status"
                value={
                  details.providerRequest.status
                    ? adminProviderRequestLabel(details.providerRequest.status)
                    : "Not available"
                }
              />
            </DetailsGrid>
          </DetailsSection>

          <DetailsSection title="Support references">
            <DetailsGrid>
              <DetailField
                label="Payment reference"
                value={payment.paymentId}
                code
              />
              {payment.id !== payment.paymentId ? (
                <DetailField
                  label="Payment record reference"
                  value={payment.id}
                  code
                />
              ) : null}
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
              <DetailField
                label="Event reference"
                value={payment.mainEventId}
                code
              />
              <DetailField
                label="Provider request reference"
                value={payment.providerRequestId ?? "Not available"}
                code
              />
              <DetailField
                label="Customer reference"
                value={payment.customerId}
                code
              />
              <DetailField
                label="Provider reference"
                value={payment.providerId}
                code
              />
            </DetailsGrid>
          </DetailsSection>

          <DetailsSection title="Activity history">
            {details.auditHistory.length > 0 ? (
              <ol className="divide-y divide-border/70">
                {details.auditHistory.map((entry) => (
                  <li key={entry.id} className="px-4 py-3">
                    <p className="break-words text-sm font-bold">
                      {entry.action}
                    </p>

                    <p className="mt-0.5 break-words text-xs text-muted-foreground">
                      {entry.actorRole} - {entry.actorId}
                    </p>

                    {entry.beforeStatus || entry.afterStatus ? (
                      <p className="mt-1.5 text-xs font-medium text-foreground">
                        {entry.beforeStatus ?? "Unknown"}
                        {" to "}
                        {entry.afterStatus ?? "Unknown"}
                      </p>
                    ) : null}

                    {entry.reason ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Reason: {entry.reason}
                      </p>
                    ) : null}

                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatPaymentDate(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyDetailMessage>
                No payment activities have been recorded yet.
              </EmptyDetailMessage>
            )}
          </DetailsSection>
          <AdminFinancialOverview details={details} />
          <ProviderFinanceDetails details={details} />
        </div>
      </details>
    </div>
  );
}

function AdminFinancialOverview({
  details,
}: {
  details: AdminPaymentDetails;
}) {
  const summary = details.financialSummary;
  const payout = details.payoutAccount;

  return (
    <>
      <DetailsSection title="Booking financial summary">
        {summary.recordState === "valid" ? (
          <div>
            <DetailsGrid>
              <DetailField
                label="Booking value"
                value={summary.formattedBookingValue ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="Total customer payments"
                value={summary.formattedCollectedAmount ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="Remaining customer balance"
                value={
                  summary.formattedRemainingCustomerBalance ?? "Not recorded"
                }
                numeric
              />

              <DetailField
                label="Remaining balance status"
                value={financeStatusLabel(summary.remainingBalanceStatus)}
              />

              <DetailField
                label="Balance due"
                value={formatPaymentDate(summary.remainingBalanceDueAt)}
              />

              <DetailField
                label="Grace period ends"
                value={formatPaymentDate(summary.remainingBalanceGraceEndsAt)}
              />

              <DetailField
                label="Customer fully settled"
                value={booleanFinanceLabel(summary.fullySettled)}
              />

              <DetailField
                label="Financial policy version"
                value={summary.financialPolicyVersion ?? "Not recorded"}
              />
            </DetailsGrid>

            <p className="border-t border-border/70 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
              Booking value comes from the saved booking total. Customer
              payments and the remaining balance come from recorded payment
              totals.
            </p>
          </div>
        ) : (
          <AdminFinanceProjectionNotice
            kind={summary.recordState}
            label="booking financial summary"
          />
        )}
      </DetailsSection>

      <DetailsSection title="Tax details">
        {summary.recordState === "valid" ? (
          <div>
            <DetailsGrid>
              <DetailField
                label="Provider tax classification"
                value={financeStatusLabel(summary.providerTaxType)}
              />

              <DetailField
                label="Tax verification"
                value={financeStatusLabel(
                  summary.providerTaxVerificationStatus,
                )}
              />

              <DetailField
                label="Provider VAT accrued"
                value={summary.formattedProviderVatAccrued ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="Provider VAT reversed"
                value={summary.formattedProviderVatReversed ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="Provider VAT net"
                value={summary.formattedProviderVatNet ?? "Not recorded"}
                numeric
              />
            </DetailsGrid>

            <p className="border-t border-border/70 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
              Provider tax classification is separate from the business
              registration type. Tax amounts use the saved booking record when
              the provider tax profile was verified.
            </p>
          </div>
        ) : (
          <AdminFinanceProjectionNotice
            kind={summary.recordState}
            label="Provider tax projection"
          />
        )}
      </DetailsSection>

      <DetailsSection title="FEASTA fees and tax">
        {summary.recordState === "valid" ? (
          <div>
            <DetailsGrid>
              <DetailField
                label="FEASTA fee rate"
                value={basisPointsLabel(summary.platformCommissionRateBps)}
                numeric
              />

              <DetailField
                label="FEASTA fees before refunds"
                value={summary.formattedCommissionAccrued ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="Refunded FEASTA fees"
                value={summary.formattedCommissionReversed ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="Recorded FEASTA fees"
                value={summary.formattedCommissionEarned ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="FEASTA tax status"
                value={financeStatusLabel(summary.platformTaxStatus)}
              />

              <DetailField
                label="FEASTA VAT rate"
                value={basisPointsLabel(summary.platformVatRateBps)}
                numeric
              />

              <DetailField
                label="FEASTA VAT accrued"
                value={summary.formattedPlatformVatAccrued ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="FEASTA VAT reversed"
                value={summary.formattedPlatformVatReversed ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="FEASTA VAT net"
                value={summary.formattedPlatformVatNet ?? "Not recorded"}
                numeric
              />
            </DetailsGrid>

            <p className="border-t border-border/70 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
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

      <DetailsSection title="Payout account">
        {payout.recordState === "valid" ? (
          <div>
            {!payout.settlementTransportReady ? (
              <div
                className="border-b border-warning/30 bg-warning-subtle/70 px-4 py-3"
                role="status"
              >
                <p className="text-sm font-bold text-warning">
                  Payout account not ready
                </p>

                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Completing account setup does not mean a provider payout can
                  be sent yet.
                </p>
              </div>
            ) : null}

            <DetailsGrid>
              <DetailField
                label="Payout setup"
                value={financeStatusLabel(payout.setupStatus)}
              />

              <DetailField
                label="Linked account type"
                value={financeStatusLabel(payout.linkedAccountType)}
              />

              <DetailField
                label="Invitation status"
                value={financeStatusLabel(payout.invitationStatus)}
              />

              <DetailField
                label="Activation status"
                value={financeStatusLabel(payout.activationStatus)}
              />

              <DetailField
                label="Account onboarding ready"
                value={booleanFinanceLabel(payout.payoutReady)}
              />

              <DetailField
                label="Payment service relationship"
                value={financeStatusLabel(payout.relationshipStatus)}
              />

              <DetailField
                label="Settlement transport mode"
                value={financeStatusLabel(payout.settlementTransportMode)}
              />

              <DetailField
                label="Settlement transport ready"
                value={booleanFinanceLabel(payout.settlementTransportReady)}
              />

              <DetailField
                label="Last updated"
                value={formatPaymentDate(payout.updatedAt)}
              />
            </DetailsGrid>

            <p className="border-t border-border/70 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
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
  kind: AdminPaymentDetails["financialSummary"]["recordState"];
  label: string;
}) {
  if (kind === "not_available") {
    return (
      <EmptyDetailMessage>
        No {label} is available for this payment.
      </EmptyDetailMessage>
    );
  }

  if (kind === "invalid") {
    return (
      <p
        className="bg-destructive-subtle px-4 py-3 text-sm font-semibold text-destructive"
        role="alert"
      >
        The {label} failed FEASTA&apos;s finance validation. No financial value
        is being inferred.
      </p>
    );
  }

  return null;
}

function basisPointsLabel(value: number | null): string {
  if (value === null) {
    return "Not recorded";
  }

  return `${value / 100}%`;
}

function booleanFinanceLabel(value: boolean | null): string {
  if (value === null) {
    return "Not recorded";
  }

  return value ? "Yes" : "No";
}

function ProviderFinanceDetails({
  details,
}: {
  details: AdminPaymentDetails;
}) {
  const {earning, settlement} = details.providerFinance;

  return (
    <>
      <DetailsSection title="Provider earning">
        {earning.recordState === "valid" ? (
          <DetailsGrid>
            <DetailField
              label="Status"
              value={financeStatusLabel(earning.status)}
            />

            <DetailField
              label="Provider earning"
              value={earning.formattedEarningAmount ?? "Not recorded"}
              numeric
            />

            <DetailField
              label="Pending"
              value={earning.formattedPendingAmount ?? "Not recorded"}
              numeric
            />

            <DetailField
              label="Available for settlement"
              value={earning.formattedAvailableAmount ?? "Not recorded"}
              numeric
            />

            <DetailField
              label="Paid out"
              value={earning.formattedPaidAmount ?? "Not recorded"}
              numeric
            />

            <DetailField
              label="Reversed"
              value={earning.formattedReversedAmount ?? "Not recorded"}
              numeric
            />

            <DetailField
              label="Last updated"
              value={formatPaymentDate(earning.updatedAt ?? earning.createdAt)}
            />
          </DetailsGrid>
        ) : (
          <FinanceRecordNotice
            kind={earning.recordState}
            recordLabel="Provider earning"
          />
        )}
      </DetailsSection>

      <DetailsSection title="Provider settlement">
        {settlement.recordState === "valid" ? (
          <div>
            {settlement.reconciliationRequired ? (
              <div
                className="border-b border-warning/30 bg-warning-subtle/70 px-4 py-3"
                role="status"
              >
                <p className="text-sm font-bold text-warning">Review needed</p>

                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Provider settlement requires review. This does not change the
                  Customer payment status.
                </p>

                {settlement.reconciliationReason ? (
                  <p className="mt-1.5 break-words text-xs font-semibold text-foreground">
                    Reason: {settlement.reconciliationReason}
                  </p>
                ) : null}
              </div>
            ) : null}

            <DetailsGrid>
              <DetailField
                label="Settlement status"
                value={financeStatusLabel(settlement.status)}
              />

              <DetailField
                label="Net settlement"
                value={
                  settlement.formattedNetSettlementAmount ?? "Not recorded"
                }
                numeric
              />

              <DetailField
                label="Reserved"
                value={settlement.formattedReservedAmount ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="Provider paid out"
                value={settlement.formattedPaidOutAmount ?? "Not recorded"}
                numeric
              />

              <DetailField
                label="Review status"
                value={
                  settlement.reconciliationRequired
                    ? "Needs review"
                    : "No issues"
                }
              />

              <DetailField
                label="Active payout attempt"
                value={settlement.activePayoutAttemptId ?? "None"}
                code
              />

              <DetailField
                label="Last payout attempt"
                value={settlement.lastPayoutAttemptId ?? "None"}
                code
              />

              <DetailField
                label="Paid out at"
                value={formatPaymentDate(settlement.paidOutAt)}
              />

              <DetailField
                label="Last updated"
                value={formatPaymentDate(
                  settlement.updatedAt ?? settlement.createdAt,
                )}
              />
            </DetailsGrid>

            <p className="border-t border-border/70 px-4 py-2.5 text-xs leading-5 text-muted-foreground">
              Customer collection and Provider settlement are separate financial
              states. A paid Customer transaction does not by itself mean the
              Provider has been paid.
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
  const {active, last} = details.providerFinance.payoutAttempts;

  const hasActive = active.recordState !== "not_referenced";
  const hasLast = last.recordState !== "not_referenced";
  const sameAttempt =
    active.payoutAttemptId !== null &&
    active.payoutAttemptId === last.payoutAttemptId;

  return (
    <DetailsSection title="Payout attempt evidence">
      {!hasActive && !hasLast ? (
        <EmptyDetailMessage>
          No payout attempt is referenced by this Provider settlement.
        </EmptyDetailMessage>
      ) : (
        <div className="divide-y divide-border/70">
          {hasActive ? (
            <PayoutAttemptCard title="Active payout attempt" attempt={active} />
          ) : (
            <EmptyDetailMessage>
              No active payout attempt is currently referenced.
            </EmptyDetailMessage>
          )}

          {hasLast && !sameAttempt ? (
            <PayoutAttemptCard title="Last payout attempt" attempt={last} />
          ) : null}

          <p className="px-4 py-2.5 text-xs leading-5 text-muted-foreground">
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
  attempt: AdminPaymentDetails["providerFinance"]["payoutAttempts"]["active"];
}) {
  if (attempt.recordState === "not_found") {
    return (
      <p
        className="bg-warning-subtle/70 px-4 py-3 text-sm font-semibold text-warning"
        role="status"
      >
        {title}: the referenced payout attempt record was not found.
      </p>
    );
  }

  if (attempt.recordState === "invalid") {
    return (
      <p
        className="bg-destructive-subtle px-4 py-3 text-sm font-semibold text-destructive"
        role="alert"
      >
        {title}: the payout attempt failed FEASTA&apos;s finance validation.
      </p>
    );
  }

  if (attempt.recordState !== "valid") {
    return null;
  }

  return (
    <div>
      <p className="border-b border-border/60 bg-secondary/40 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>

      <DetailsGrid>
        <DetailField
          label="Status"
          value={financeStatusLabel(attempt.status)}
        />

        <DetailField
          label="Amount"
          value={attempt.formattedAmount ?? "Not recorded"}
          numeric
        />

        <DetailField
          label="Payment service"
          value={
            attempt.gateway === "paymongo" ? "Payment service" : "Not recorded"
          }
        />

        <DetailField
          label="Payment service reference"
          value={attempt.gatewayResourceId ?? "Not recorded"}
          code
        />

        <DetailField
          label="Failure code"
          value={attempt.failureCode ?? "None"}
          code
        />

        <DetailField
          label="Failure message"
          value={attempt.failureMessage ?? "None"}
        />

        <DetailField
          label="Created"
          value={formatPaymentDate(attempt.createdAt)}
        />

        <DetailField
          label="Submitted"
          value={formatPaymentDate(attempt.submittedAt)}
        />

        <DetailField
          label="Completed"
          value={formatPaymentDate(attempt.completedAt)}
        />

        <DetailField
          label="Last updated"
          value={formatPaymentDate(attempt.updatedAt)}
        />
      </DetailsGrid>
    </div>
  );
}

function FinanceRecordNotice({
  kind,
  recordLabel,
}: {
  kind: AdminPaymentDetails["providerFinance"]["earning"]["recordState"];
  recordLabel: string;
}) {
  switch (kind) {
    case "not_found":
      return (
        <EmptyDetailMessage>
          No {recordLabel} record exists for this payment. This can be expected
          until a successful Customer payment creates Provider finance records.
        </EmptyDetailMessage>
      );

    case "ambiguous":
      return (
        <p
          className="bg-warning-subtle/70 px-4 py-3 text-sm font-semibold text-warning"
          role="status"
        >
          Multiple {recordLabel.toLowerCase()} records matched this payment. The
          financial state is not being inferred automatically.
        </p>
      );

    case "invalid":
      return (
        <p
          className="bg-destructive-subtle px-4 py-3 text-sm font-semibold text-destructive"
          role="alert"
        >
          The {recordLabel.toLowerCase()} record failed FEASTA&apos;s finance
          validation. Review the payment record.
        </p>
      );

    case "valid":
      return null;
  }
}

function formatEventTypeLabel(value: string | null): string {
  if (!value) {
    return "Not available";
  }

  return value
    .trim()
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function financeStatusLabel(value: string | null): string {
  if (!value) {
    return "Not recorded";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
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
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>

      <div className="mt-2 overflow-hidden rounded-xl border border-border bg-card">
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
    <DetailFieldList className="p-3.5">
      {children}
    </DetailFieldList>
  );
}

function DetailField({
  label,
  value,
  code = false,
  numeric = false,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  code?: boolean;
  numeric?: boolean;
  wide?: boolean;
}) {
  return (
    <DetailFieldItem
      label={label}
      value={value}
      code={code}
      numeric={numeric}
      wide={wide}
    />
  );
}

function EmptyDetailMessage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p className="px-4 py-3.5 text-sm text-muted-foreground">{children}</p>
  );
}

function PaymentDetailsLoading() {
  return (
    <div className="grid gap-4">
      <LoadingSkeleton
        className="h-32 w-full rounded-xl"
        label="Loading payment summary"
      />

      <LoadingSkeleton
        className="h-48 w-full rounded-xl"
        label="Loading transaction details"
      />

      <LoadingSkeleton
        className="h-40 w-full rounded-xl"
        label="Loading payment history"
      />
    </div>
  );
}

export function refundMonitoringLabel(payment: AdminPayment): string {
  if (payment.refundPending) return "Refund pending";
  if (payment.refundedAmountFormatted) {
    return `${payment.status === "refunded" ? "Refunded" : "Partially refunded"}: ${payment.refundedAmountFormatted}`;
  }
  if (payment.status === "refunded") return "Refunded";
  if (payment.status === "partially_refunded") {
    return "Partially refunded — amount unavailable";
  }
  if (payment.refundEligibility.reason === "refund_pending") {
    return "Refund pending";
  }
  return "No refund recorded";
}

export {
  PaymentDetailsDrawer,
  type PaymentDetailsDrawerProps,
};
