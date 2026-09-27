"use client";

import {
  BadgeCheck,
  Banknote,
  CircleDollarSign,
  CircleOff,
  Clock3,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import {useState} from "react";

import {SummaryCard} from "@/components/data";
import {Button} from "@/components/ui/button";
import {
  refreshProviderPayoutSetup,
  startProviderPayoutSetup,
} from "@/lib/provider/payments/provider-payout-client";
import type {
  ProviderFinanceOverview,
  ProviderPayoutSetupStatus,
} from "@/lib/provider/payments/provider-finance-types";

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
              Connect your PayMongo payout account before accepting new paid bookings.
              FEASTA stores only payout status and safe account references.
            </p>
          </div>

          <PayoutReadyIndicator
            ready={payout.payoutReady}
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
        </dl>

        {error ? (
          <p
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
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
                "Eligible for payout",
              direction: "neutral",
            }}
            icon={
              <CircleDollarSign className="size-5" />
            }
          />

          <SummaryCard
            label="Paid"
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
  ready,
}: {
  ready: boolean;
}) {
  return ready ? (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-sm font-semibold text-success">
      <BadgeCheck
        aria-hidden="true"
        className="size-4"
      />
      Ready for payouts
    </span>
  ) : (
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