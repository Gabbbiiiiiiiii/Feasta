"use client";

import {
  BadgeCheck,
  Banknote,
  CircleDollarSign,
  CircleOff,
  Clock3,
  ExternalLink,
  FileText,
  RefreshCw,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import {useState} from "react";

import {SummaryCard} from "@/components/data";
import {Button} from "@/components/ui/button";
import {
  refreshProviderPayoutSetup,
  startProviderPayoutSetup,
} from "@/lib/provider/payments/provider-payout-client";
import {ProviderPayoutActivationForm} from "./provider-payout-activation-form";
import type {
  ProviderFinanceOverview,
  ProviderPayoutSetupStatus,
  ProviderSettlementStatus,
} from "@/lib/provider/payments/provider-finance-types";
import {payoutSetupGuidance} from "@/lib/provider/payments/provider-payout-status";

import {
  loadProviderFinanceOverviewAction,
} from "./actions";

type ProviderFinancePanelProps = {
  initialFinance: ProviderFinanceOverview;
};

export function ProviderFinancePanel({
  initialFinance,
}: ProviderFinancePanelProps) {
  const [finance, setFinance] =
    useState(initialFinance);

  const [working, setWorking] =
    useState<
      "setup" |
      "refresh" |
      null
    >(null);

  const [error, setError] =
    useState<string | null>(null);

  const reload =
    async () => {
      setFinance(
        await loadProviderFinanceOverviewAction(),
      );
    };

  const startSetup =
    async () => {
      if (working) return;

      setWorking("setup");
      setError(null);

      try {
        const result =
          await startProviderPayoutSetup();

        await reload();

        if (result.onboardingUrl) {
          window.location.assign(
            result.onboardingUrl,
          );
        }
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Payout setup could not be started.",
        );
      } finally {
        setWorking(null);
      }
    };

  const refresh =
    async () => {
      if (working) return;

      setWorking("refresh");
      setError(null);

      try {
        await refreshProviderPayoutSetup();
        await reload();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Payout status could not be refreshed.",
        );
      } finally {
        setWorking(null);
      }
    };

  const payout =
    finance.payoutAccount;

  const setupGuidance =
    payoutSetupGuidance(payout);

  return (
    <div className="grid min-w-0 gap-6">
      <section
        className="rounded-card border border-border bg-card p-5 shadow-card"
        aria-labelledby="payout-account-heading"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <WalletCards
                aria-hidden="true"
                className="size-5 text-primary"
              />
              <h2
                id="payout-account-heading"
                className="text-xl font-bold"
              >
                Payout account
              </h2>
            </div>

            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Complete your PayMongo linked-account setup before accepting new paid
              bookings. Account readiness and settlement transport readiness are
              tracked separately.
            </p>
          </div>

          <PayoutReadyIndicator
            accountReady={payout.payoutReady}
            transportReady={
              payout.settlementTransportReady
            }
          />
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FinanceDetail
            label="Setup status"
            value={formatLabel(
              payout.setupStatus,
            )}
          />

          <FinanceDetail
            label="Linked account"
            value={
              payout.linkedAccountType
                ? formatLinkedAccount(
                  payout.linkedAccountType,
                )
                : "Not connected"
            }
          />

          <FinanceDetail
            label="Invitation"
            value={
              payout.invitationStatus
                ? formatLabel(
                  payout.invitationStatus,
                )
                : "Not started"
            }
          />

          <FinanceDetail
            label="Activation"
            value={
              payout.activationStatus
                ? formatLabel(
                  payout.activationStatus,
                )
                : "Not available"
            }
          />

          <FinanceDetail
            label="Relationship"
            value={
              payout.relationshipStatus
                ? formatLabel(
                  payout.relationshipStatus,
                )
                : "Not verified"
            }
          />

          <FinanceDetail
            label="Settlement transport"
            value={formatSettlementTransport(
              payout.settlementTransportMode,
              payout.settlementTransportReady,
            )}
          />
        </dl>

        {error ? (
          <p
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        ) : setupGuidance ? (
          <p
            className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
            role="status"
          >
            {setupGuidance}
          </p>
        ) : null}

        {payout.childAccountPresent &&
        !payout.activationProfileComplete &&
        !payout.payoutReady &&
        payout.linkedAccountType ? (
          <ProviderPayoutActivationForm
            linkedAccountType={payout.linkedAccountType}
            onSaved={async () => {
              await reload();
              setError(null);
            }}
          />
        ) : null}

        {payout.childAccountPresent &&
        payout.activationProfileComplete &&
        !payout.payoutReady ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Activation details are saved. Refresh status to continue
            verification and activation.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {!payout.payoutReady ? (
            <Button
              type="button"
              onClick={() =>
                void startSetup()
              }
              disabled={working !== null}
            >
              <ExternalLink
                aria-hidden="true"
                className="size-4"
              />
              {setupButtonLabel(
                payout.setupStatus,
                working === "setup",
              )}
            </Button>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              void refresh()
            }
            disabled={working !== null}
          >
            <RefreshCw
              aria-hidden="true"
              className={
                working === "refresh"
                  ? "size-4 animate-spin"
                  : "size-4"
              }
            />
            {working === "refresh"
              ? "Refreshing..."
              : "Refresh status"}
          </Button>
        </div>
      </section>

      <section
        className="grid gap-4"
        aria-labelledby="provider-earnings-heading"
      >
        <div>
          <h2
            id="provider-earnings-heading"
            className="text-xl font-bold"
          >
            Provider earnings
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Earnings are calculated from customer payments after FEASTA commission
            and applicable withholding. Provider VAT remains part of the provider
            service gross and is not deducted again here.
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            asChild
            variant="secondary"
            size="compact"
          >
            <Link href="/provider/payments/statements">
              <FileText
                aria-hidden="true"
                className="size-4"
              />
              View earnings statement
            </Link>
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Pending"
            value={formatCentavos(
              finance.earningSummary
                .pendingAmountInCentavos,
            )}
            trend={{
              label:
                "Awaiting payout availability",
              direction: "neutral",
            }}
            icon={
              <Clock3 className="size-5" />
            }
          />

          <SummaryCard
            label="Available"
            value={formatCentavos(
              finance.earningSummary
                .availableAmountInCentavos,
            )}
            trend={{
              label:
                "Available for settlement",
              direction: "neutral",
            }}
            icon={
              <CircleDollarSign className="size-5" />
            }
          />

          <SummaryCard
            label="Paid out"
            value={formatCentavos(
              finance.earningSummary
                .paidAmountInCentavos,
            )}
            trend={{
              label:
                "Already paid out",
              direction: "neutral",
            }}
            icon={
              <BadgeCheck className="size-5" />
            }
          />

          <SummaryCard
            label="Reversed"
            value={formatCentavos(
              finance.earningSummary
                .reversedAmountInCentavos,
            )}
            trend={{
              label:
                "Adjusted by completed refunds",
              direction: "neutral",
            }}
            icon={
              <RotateCcw className="size-5" />
            }
          />
        </div>
      </section>

      <section
        className="grid gap-4"
        aria-labelledby="earning-history-heading"
      >
        <div>
          <h2
            id="earning-history-heading"
            className="text-xl font-bold"
          >
            Earnings history
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Latest provider earning records created from successfully settled
            customer payments.
          </p>
        </div>

        {finance.earnings.length === 0 ? (
          <div className="rounded-card border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
            No provider earnings have been recorded yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      Date
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Status
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Gross earning
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Pending
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Available
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Paid
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      Reversed
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {finance.earnings.map(
                    (earning) => (
                      <tr
                        key={earning.earningId}
                        className="align-top"
                      >
                        <td className="px-4 py-3">
                          {formatDateTime(
                            earning.createdAt,
                          )}
                          <p>{earning.economicSource === "payment_default_reservation_compensation" ? "Reservation compensation" : "Service earnings"}</p>
                        </td>

                        <td className="px-4 py-3">
                          <EarningStatus
                            status={
                              earning.status
                            }
                          />
                        </td>

                        <td className="px-4 py-3 font-semibold">
                          {formatCentavos(
                            earning
                              .earningAmountInCentavos,
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {formatCentavos(
                            earning
                              .pendingAmountInCentavos,
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {formatCentavos(
                            earning
                              .availableAmountInCentavos,
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {formatCentavos(
                            earning
                              .paidAmountInCentavos,
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {formatCentavos(
                            earning
                              .reversedAmountInCentavos,
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section
        className="grid gap-4"
        aria-labelledby="provider-settlements-heading"
      >
        <div>
          <h2
            id="provider-settlements-heading"
            className="text-xl font-bold"
          >
            Provider settlements
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Settlement status is separate from customer payment status and
            Provider earning availability. A customer may be fully paid while
            Provider settlement is still pending.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Awaiting availability"
            value={formatCentavos(
              finance.settlementSummary
                .awaitingAvailabilityAmountInCentavos,
            )}
            trend={{
              label:
                "Customer paid; settlement not released yet",
              direction: "neutral",
            }}
            icon={
              <Clock3 className="size-5" />
            }
          />

          <SummaryCard
            label="Ready for settlement"
            value={formatCentavos(
              finance.settlementSummary
                .readyAmountInCentavos,
            )}
            trend={{
              label:
                "Earning cleared for settlement",
              direction: "neutral",
            }}
            icon={
              <CircleDollarSign className="size-5" />
            }
          />

          <SummaryCard
            label="Reserved / processing"
            value={formatCentavos(
              finance.settlementSummary
                .reservedAmountInCentavos,
            )}
            trend={{
              label:
                "Locked by settlement state",
              direction: "neutral",
            }}
            icon={
              <WalletCards className="size-5" />
            }
          />

          <SummaryCard
            label="Paid out"
            value={formatCentavos(
              finance.settlementSummary
                .paidOutAmountInCentavos,
            )}
            trend={{
              label:
                "Confirmed Provider settlement",
              direction: "neutral",
            }}
            icon={
              <BadgeCheck className="size-5" />
            }
          />
        </div>

        {finance.settlementSummary
          .reconciliationRequiredCount > 0 ? (
          <div
            className="rounded-card border border-warning/30 bg-warning/5 p-4"
            role="status"
          >
            <div className="flex items-start gap-3">
              <CircleOff
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-warning"
              />

              <div>
                <p className="font-semibold">
                  Settlement review required
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {
                    finance.settlementSummary
                      .reconciliationRequiredCount
                  } settlement {
                    finance.settlementSummary
                      .reconciliationRequiredCount === 1
                      ? "record requires"
                      : "records require"
                  } reconciliation before another payout or refund operation.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {finance.settlements.length === 0 ? (
          <div className="rounded-card border border-border bg-card p-6 text-sm text-muted-foreground shadow-card">
            No Provider settlement records have been created yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="border-b border-border bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-semibold">
                      Created
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Status
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Settlement
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Reserved
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Paid out
                    </th>

                    <th className="px-4 py-3 font-semibold">
                      Reconciliation
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {finance.settlements.map(
                    (settlement) => (
                      <tr
                        key={settlement.settlementId}
                        className="align-top"
                      >
                        <td className="px-4 py-3">
                          {formatDateTime(
                            settlement.createdAt,
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <SettlementStatus
                            status={settlement.status}
                          />
                        </td>

                        <td className="px-4 py-3 font-semibold">
                          {formatCentavos(
                            settlement
                              .netSettlementAmountInCentavos,
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {formatCentavos(
                            settlement
                              .reservedAmountInCentavos,
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {formatCentavos(
                            settlement
                              .paidOutAmountInCentavos,
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {settlement.reconciliationRequired ? (
                            <span className="font-semibold text-warning">
                              Review required
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              No issue
                            </span>
                          )}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2">
          <Banknote
            aria-hidden="true"
            className="size-5 text-primary"
          />

          <div>
            <h2 className="text-xl font-bold">
              Customer booking payments
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Customer payment records are shown separately from provider earnings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function FinanceDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>

      <dd className="mt-1 font-semibold">
        {value}
      </dd>
    </div>
  );
}

function PayoutReadyIndicator({
  accountReady,
  transportReady,
}: {
  accountReady: boolean;
  transportReady: boolean;
}) {
  if (transportReady) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-sm font-semibold text-success">
        <BadgeCheck
          aria-hidden="true"
          className="size-4"
        />
        Settlement transport verified
      </span>
    );
  }

  if (accountReady) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-sm font-semibold text-warning">
        <Clock3
          aria-hidden="true"
          className="size-4"
        />
        Account linked - settlement transport unavailable
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-sm font-semibold text-warning">
      <CircleOff
        aria-hidden="true"
        className="size-4"
      />
      Payout setup required
    </span>
  );
}

function EarningStatus({
  status,
}: {
  status:
    | "pending"
    | "available"
    | "paid"
    | "reversed";
}) {
  return (
    <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold">
      {formatLabel(status)}
    </span>
  );
}

function SettlementStatus({
  status,
}: {
  status:
    ProviderSettlementStatus;
}) {
  return (
    <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold">
      {formatLabel(status)}
    </span>
  );
}

function formatSettlementTransport(
  mode:
    "disabled" |
    "wallet_transfer" |
    "workflow",

  ready: boolean,
): string {
  if (!ready) {
    return mode === "disabled"
      ? "Not configured"
      : `${formatLabel(mode)} - not verified`;
  }

  return `${formatLabel(mode)} - verified`;
}
function setupButtonLabel(
  status: ProviderPayoutSetupStatus,
  loading: boolean,
): string {
  if (loading) {
    return "Opening PayMongo...";
  }

  if (
    status === "onboarding" ||
    status === "action_required"
  ) {
    return "Continue payout setup";
  }

  return "Set up payouts";
}

function formatLinkedAccount(
  value: "consumer" | "merchant",
): string {
  return value === "merchant"
    ? "Business / Merchant"
    : "Individual / Consumer";
}

function formatCentavos(
  value: number,
): string {
  return new Intl.NumberFormat(
    "en-PH",
    {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(value / 100);
}

function formatLabel(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(
      /\b\w/gu,
      (character) =>
        character.toUpperCase(),
    );
}

function formatDateTime(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(
    "en-PH",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Manila",
    },
  ).format(date);
}
