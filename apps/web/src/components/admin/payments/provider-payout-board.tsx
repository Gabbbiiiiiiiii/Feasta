"use client";

import {Info, RefreshCw} from "lucide-react";
import {useState} from "react";

import {formatPaymentDate} from "@/components/admin/payments/payment-formatters";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {releaseMockProviderDisbursement} from "@/lib/admin/payments/admin-payment-client";
import type {
  AdminProviderPayoutBoard,
  AdminReadyProviderPayoutItem,
} from "@/lib/admin/payments/admin-payment-types";
import {payoutBlockMessage} from "@/lib/payments/payout-block-message";
import {cn} from "@/lib/utils";

const RELEASE_CONFIRMATION_PHRASE = "RELEASE";

const phpCurrencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type ProviderPayoutBoardProps = {
  board: AdminProviderPayoutBoard;
  loading: boolean;
  error?: string;
  releasingId: string | null;
  embedded?: boolean;
  onRefresh: () => void;
  onReleased: () => void;
  onReleaseStart: (providerDisbursementId: string) => void;
  onReleaseEnd: () => void;
};

function ProviderPayoutBoard({
  board,
  loading,
  error,
  releasingId,
  embedded = false,
  onRefresh,
  onReleased,
  onReleaseStart,
  onReleaseEnd,
}: ProviderPayoutBoardProps) {
  const [confirmItem, setConfirmItem] =
    useState<AdminReadyProviderPayoutItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");

  const busy = loading || releasingId !== null;
  const canConfirm =
    confirmItem !== null &&
    password.length > 0 &&
    confirmationPhrase === RELEASE_CONFIRMATION_PHRASE &&
    releasingId === null;

  const readyTotalInCentavos = board.readyToPay.reduce(
    (sum, item) => sum + item.amountInCentavos,
    0,
  );
  const readyTotalFormatted = phpCurrencyFormatter.format(
    readyTotalInCentavos / 100,
  );

  const openConfirmDialog = (item: AdminReadyProviderPayoutItem) => {
    setActionError(null);
    setPassword("");
    setConfirmationPhrase("");
    setConfirmItem(item);
  };

  const closeConfirmDialog = () => {
    setPassword("");
    setConfirmationPhrase("");
    setConfirmItem(null);
  };

  const confirmRelease = async () => {
    if (!confirmItem || releasingId || !canConfirm) {
      return;
    }

    onReleaseStart(confirmItem.providerDisbursementId);
    setActionError(null);

    try {
      await releaseMockProviderDisbursement({
        providerDisbursementId: confirmItem.providerDisbursementId,
        password,
        confirmationPhrase,
      });
      closeConfirmDialog();
      onReleased();
    } catch (releaseError) {
      setActionError(
        releaseError instanceof Error
          ? releaseError.message
          : "The mock provider payout could not be completed.",
      );
    } finally {
      onReleaseEnd();
    }
  };

  return (
    <section
      className={cn(
        "min-w-0",
        embedded
          ? "grid gap-5"
          : "grid gap-5 rounded-card border border-border bg-card p-4 shadow-card sm:p-5",
      )}
      aria-labelledby="provider-payout-board-heading"
      aria-busy={busy}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="provider-payout-board-heading"
            className="text-lg font-black tracking-tight"
          >
            Provider payouts
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Release ready provider obligations using trusted disbursement amounts.
            Admin releases reduce the provider&apos;s available earnings and are
            logged in admin payout history.
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
            className={cn("size-4", loading && "animate-spin motion-reduce:animate-none")}
          />
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div
        className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-subtle/70 px-3.5 py-2.5 text-sm text-foreground"
        role="status"
      >
        <Info
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-warning"
        />
        <p className="leading-5">
          <span className="font-bold text-warning">Mock payout mode:</span>{" "}
          No real bank or GCash transfer is sent. Release still requires admin
          password re-authentication and typing{" "}
          <span className="font-mono font-semibold">RELEASE</span>.
        </p>
      </div>

      {error || actionError ? (
        <div
          className="rounded-xl border border-destructive/30 bg-destructive-subtle p-4"
          role="alert"
        >
          <p className="font-bold text-destructive">
            Provider payout board could not complete an action
          </p>
          <p className="mt-1 text-sm text-destructive">
            {actionError ?? error}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold">Ready to pay</h3>
            <span className="rounded-pill bg-primary-tint px-2.5 py-0.5 text-xs font-bold tabular-nums text-primary-strong">
              {board.readyToPay.length}
            </span>
          </div>
          {board.readyToPay.length > 0 ? (
            <p className="text-sm font-semibold tabular-nums text-muted-foreground">
              {`Total ready: ${readyTotalFormatted}`}
            </p>
          ) : null}
        </div>

        {board.readyToPay.length === 0 ? (
          <p
            className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-5 text-sm text-muted-foreground"
            role="status"
          >
            No ready provider payout obligations right now.
          </p>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Ready provider payout obligations
              </caption>
              <thead className="border-b border-border bg-secondary text-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Provider
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Eligible
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Transfer readiness
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {board.readyToPay.map((item) => {
                  const isReleasing =
                    releasingId === item.providerDisbursementId;
                  return (
                    <tr
                      key={item.providerDisbursementId}
                      className={cn(
                        "hover:bg-table-hover",
                        !item.transportReady && "bg-warning-subtle/30",
                      )}
                    >
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-semibold text-foreground">
                          {item.providerName ?? item.providerId}
                        </p>
                        {item.providerRequestId ? (
                          <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                            {item.providerRequestId}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 align-top font-bold tabular-nums text-primary">
                        {item.formattedAmount}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 align-top text-muted-foreground">
                        {item.eligibleAt
                          ? formatPaymentDate(item.eligibleAt)
                          : "—"}
                      </td>
                      <td className="max-w-xs px-4 py-3.5 align-top">
                        <Badge
                          tone={item.transportReady ? "success" : "warning"}
                          shape="rounded"
                          size="compact"
                          className={cn(
                            "whitespace-nowrap",
                            item.transportReady
                              ? "border-success/25"
                              : "border-warning/25",
                          )}
                        >
                          {item.transportReady ? "Ready" : "Not verified"}
                        </Badge>
                        {!item.transportReady && item.dispatchBlockReason ? (
                          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                            {payoutBlockMessage(item.dispatchBlockReason)}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right align-top">
                        <Button
                          type="button"
                          size="compact"
                          disabled={busy}
                          onClick={() => openConfirmDialog(item)}
                        >
                          {isReleasing ? "Releasing..." : "Release mock payout"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold">Admin payout history</h3>
          <span className="rounded-pill bg-secondary px-2.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
            {board.history.length}
          </span>
        </div>

        {board.history.length === 0 ? (
          <p
            className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-5 text-sm text-muted-foreground"
            role="status"
          >
            No admin mock releases recorded yet. Successful releases appear here.
          </p>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Admin mock payout release history
              </caption>
              <thead className="border-b border-border bg-secondary text-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Provider
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Released
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Reference
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {board.history.map((item) => (
                  <tr
                    key={item.withdrawalId}
                    className="hover:bg-table-hover"
                  >
                    <td className="px-4 py-3.5 align-top font-semibold text-foreground">
                      {item.providerName ?? item.providerId}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 align-top font-bold tabular-nums text-primary">
                      {item.formattedAmount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 align-top text-muted-foreground">
                      {item.completedAt
                        ? formatPaymentDate(item.completedAt)
                        : "Date unavailable"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 align-top">
                      <Badge
                        tone="success"
                        shape="rounded"
                        size="compact"
                        className="whitespace-nowrap border-success/25"
                      >
                        Released
                      </Badge>
                    </td>
                    <td className="break-all px-4 py-3.5 align-top font-mono text-xs text-muted-foreground">
                      Reference: {item.withdrawalId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={confirmItem !== null}
        onOpenChange={(open) => {
          if (!open && releasingId === null) {
            closeConfirmDialog();
          }
        }}
        title="Release mock provider payout?"
        description={
          confirmItem
            ? `This will mark ${confirmItem.formattedAmount} as paid for ${confirmItem.providerName ?? confirmItem.providerId} using simulated payout settlement. Re-enter your admin password and type RELEASE to continue.`
            : "Confirm mock provider payout release."
        }
        confirmLabel={releasingId ? "Releasing..." : "Release mock payout"}
        cancelLabel="Cancel"
        onConfirm={() => {
          void confirmRelease();
        }}
        confirmDisabled={!canConfirm}
        loading={releasingId !== null}
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <label
              className="text-sm font-medium"
              htmlFor="admin-payout-release-password"
            >
              Admin password
            </label>
            <Input
              id="admin-payout-release-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={releasingId !== null}
            />
          </div>
          <div className="grid gap-2">
            <label
              className="text-sm font-medium"
              htmlFor="admin-payout-release-phrase"
            >
              Type RELEASE to confirm
            </label>
            <Input
              id="admin-payout-release-phrase"
              value={confirmationPhrase}
              onChange={(event) => setConfirmationPhrase(event.target.value)}
              placeholder="RELEASE"
              autoComplete="off"
              spellCheck={false}
              disabled={releasingId !== null}
              aria-describedby="admin-payout-release-phrase-help"
            />
            <p
              id="admin-payout-release-phrase-help"
              className="text-xs text-muted-foreground"
            >
              Confirmation is case-sensitive and must match RELEASE exactly.
            </p>
          </div>
        </div>
      </ConfirmationDialog>
    </section>
  );
}

export {ProviderPayoutBoard};
