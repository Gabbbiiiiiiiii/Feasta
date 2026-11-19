"use client";

import {useEffect, useState} from "react";

import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {releaseMockProviderDisbursement} from "@/lib/admin/payments/admin-payment-client";
import type {
  AdminProviderPayoutBoard,
  AdminProviderPayoutHistoryItem,
  AdminReadyProviderPayoutItem,
} from "@/lib/admin/payments/admin-payment-types";
import {formatPaymentDate} from "@/components/admin/payments/payment-formatters";

const RELEASE_CONFIRMATION_PHRASE = "RELEASE";

type ProviderPayoutBoardProps = {
  board: AdminProviderPayoutBoard;
  loading: boolean;
  error?: string;
  releasingId: string | null;
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

  useEffect(() => {
    if (confirmItem === null) {
      setPassword("");
      setConfirmationPhrase("");
    }
  }, [confirmItem]);

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
      setConfirmItem(null);
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
      className="rounded-card border border-border bg-card p-4 sm:p-5"
      aria-labelledby="provider-payout-board-heading"
      aria-busy={busy}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="provider-payout-board-heading"
            className="text-lg font-black"
          >
            Provider payouts
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Release ready provider obligations with a simulated payout. Amounts
            come from trusted disbursement records, are not editable, and reduce
            that provider&apos;s available earnings. Admin releases are recorded
            in this board&apos;s history, not the provider self-withdrawal list.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          disabled={busy}
          onClick={onRefresh}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div
        className="mt-4 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-sm text-muted-foreground"
        role="status"
      >
        Mock payout mode — no real bank or GCash transfer is sent. Release still
        requires admin password re-authentication and typing RELEASE.
      </div>

      {error || actionError ? (
        <div
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive-subtle p-4"
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

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div className="grid gap-3">
          <h3 className="text-base font-bold">Ready to pay</h3>
          {board.readyToPay.length === 0 ? (
            <p
              className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
              role="status"
            >
              No ready provider payout obligations right now.
            </p>
          ) : (
            board.readyToPay.map((item) => (
              <ReadyPayoutCard
                key={item.providerDisbursementId}
                item={item}
                disabled={busy}
                releasing={releasingId === item.providerDisbursementId}
                onRelease={() => {
                  setActionError(null);
                  setConfirmItem(item);
                }}
              />
            ))
          )}
        </div>

        <div className="grid gap-3">
          <h3 className="text-base font-bold">Admin payout history</h3>
          {board.history.length === 0 ? (
            <p
              className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground"
              role="status"
            >
              No admin mock releases recorded yet. Successful releases appear here.
            </p>
          ) : (
            board.history.map((item) => (
              <HistoryPayoutCard key={item.withdrawalId} item={item} />
            ))
          )}
        </div>
      </div>

      <ConfirmationDialog
        open={confirmItem !== null}
        onOpenChange={(open) => {
          if (!open && releasingId === null) {
            setConfirmItem(null);
          }
        }}
        title="Release mock provider payout?"
        description={
          confirmItem
            ? `This will mark ${confirmItem.formattedAmount} as paid for ${confirmItem.providerName ?? confirmItem.providerId} using simulated payout settlement. Re-enter your admin password and type RELEASE to continue.`
            : "Confirm mock provider payout release."
        }
        confirmLabel={
          releasingId ? "Releasing..." : "Release mock payout"
        }
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

function ReadyPayoutCard({
  item,
  disabled,
  releasing,
  onRelease,
}: {
  item: AdminReadyProviderPayoutItem;
  disabled: boolean;
  releasing: boolean;
  onRelease: () => void;
}) {
  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{item.formattedAmount}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.providerName ?? item.providerId}
          </p>
          {item.providerRequestId ? (
            <p className="mt-1 break-all text-xs text-muted-foreground">
              Request: {item.providerRequestId}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          size="compact"
          disabled={disabled}
          onClick={onRelease}
        >
          {releasing ? "Releasing..." : "Release mock payout"}
        </Button>
      </div>
      <dl className="mt-3 grid gap-2 text-sm text-muted-foreground">
        <div>
          Eligible: {item.eligibleAt ? formatPaymentDate(item.eligibleAt) : "—"}
        </div>
        <div>
          Transport: {item.transportReady ? "Ready" : "Not verified"}
          {item.dispatchBlockReason ? ` (${item.dispatchBlockReason})` : ""}
        </div>
      </dl>
    </article>
  );
}

function HistoryPayoutCard({
  item,
}: {
  item: AdminProviderPayoutHistoryItem;
}) {
  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{item.formattedAmount}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.providerName ?? item.providerId}
          </p>
        </div>
        <p className="text-sm font-semibold text-success">Released</p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {item.completedAt ? formatPaymentDate(item.completedAt) : "Date unavailable"}
      </p>
      <p className="mt-2 break-all text-xs text-muted-foreground">
        Reference: {item.withdrawalId}
      </p>
    </article>
  );
}

export {ProviderPayoutBoard};
