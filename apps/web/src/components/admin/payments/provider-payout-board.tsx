"use client";

import {Info, RefreshCw} from "lucide-react";
import {useMemo, useState} from "react";

import {AdminCommissionWithdrawDialog} from "@/components/admin/payments/admin-commission-withdraw-dialog";
import {
  BOARD_TABLE_PAGE_SIZE,
  paginateBoardRows,
} from "@/components/admin/payments/board-table-pagination";
import {formatPaymentDate} from "@/components/admin/payments/payment-formatters";
import {CursorPagination} from "@/components/data/cursor-pagination";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  approveCompanyAdvanceRequest,
  fundCompanyFloat,
  rejectCompanyAdvanceRequest,
  releaseMockProviderDisbursement,
  transferCompanyCommissionToFloat,
} from "@/lib/admin/payments/admin-payment-client";
import type {
  AdminCompanyAdvanceRequestItem,
  AdminProviderPayoutBoard,
  AdminReadyProviderPayoutItem,
} from "@/lib/admin/payments/admin-payment-types";
import {payoutBlockMessage} from "@/lib/payments/payout-block-message";
import {cn} from "@/lib/utils";

const RELEASE_CONFIRMATION_PHRASE = "RELEASE";
const FUND_CONFIRMATION_PHRASE = "FUND";
const ADVANCE_CONFIRMATION_PHRASE = "ADVANCE";
const FLOAT_CONFIRMATION_PHRASE = "FLOAT";

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

type ConfirmState =
  | {kind: "release"; item: AdminReadyProviderPayoutItem}
  | {kind: "advance"; item: AdminCompanyAdvanceRequestItem}
  | {kind: "reject"; item: AdminCompanyAdvanceRequestItem}
  | {kind: "fund"}
  | {kind: "transferCommission"}
  | null;

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
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [fundAmountPesos, setFundAmountPesos] = useState("1000");
  const [transferAmountPesos, setTransferAmountPesos] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [pendingAdvancePage, setPendingAdvancePage] = useState(0);
  const [advanceHistoryPage, setAdvanceHistoryPage] = useState(0);
  const [readyToPayPage, setReadyToPayPage] = useState(0);
  const [payoutHistoryPage, setPayoutHistoryPage] = useState(0);
  const [commissionWithdrawalPage, setCommissionWithdrawalPage] = useState(0);

  const rejectedAdvanceRequests = board.rejectedAdvanceRequests ?? [];
  const commissionWithdrawals = board.commissionWithdrawals ?? [];

  const advanceHistoryRows = useMemo(
    () =>
      [
        ...board.advanceHistory.map((item) => ({
          key: `advance_${item.advanceId}`,
          providerName: item.providerName,
          providerId: item.providerId,
          providerRequestId: item.providerRequestId,
          amount: item.formattedAmount,
          decidedAt: item.issuedAt,
          status: item.status,
          tone:
            item.status === "repaid"
              ? ("success" as const)
              : ("warning" as const),
        })),
        ...rejectedAdvanceRequests.map((item) => ({
          key: `rejected_${item.advanceRequestId}`,
          providerName: item.providerName,
          providerId: item.providerId,
          providerRequestId: item.providerRequestId,
          amount: item.formattedProviderNetAmount,
          decidedAt: item.rejectedAt,
          status: item.status,
          tone: "destructive" as const,
        })),
      ].sort((left, right) => {
        const leftMillis = new Date(left.decidedAt ?? 0).getTime();
        const rightMillis = new Date(right.decidedAt ?? 0).getTime();
        return rightMillis - leftMillis;
      }),
    [board.advanceHistory, rejectedAdvanceRequests],
  );

  const pendingAdvancePagination = paginateBoardRows(
    board.advanceRequests,
    pendingAdvancePage,
  );
  const advanceHistoryPagination = paginateBoardRows(
    advanceHistoryRows,
    advanceHistoryPage,
  );
  const readyToPayPagination = paginateBoardRows(
    board.readyToPay,
    readyToPayPage,
  );
  const payoutHistoryPagination = paginateBoardRows(
    board.history,
    payoutHistoryPage,
  );
  const commissionWithdrawalPagination = paginateBoardRows(
    commissionWithdrawals,
    commissionWithdrawalPage,
  );

  const busy = loading || releasingId !== null;
  const requiredPhrase =
    confirmState?.kind === "fund"
      ? FUND_CONFIRMATION_PHRASE
      : confirmState?.kind === "transferCommission"
        ? FLOAT_CONFIRMATION_PHRASE
        : confirmState?.kind === "advance"
          ? ADVANCE_CONFIRMATION_PHRASE
          : confirmState?.kind === "reject"
            ? ""
            : RELEASE_CONFIRMATION_PHRASE;

  const canConfirm =
    confirmState !== null &&
    password.length > 0 &&
    releasingId === null &&
    (confirmState.kind === "reject" ||
      confirmationPhrase === requiredPhrase) &&
    (confirmState.kind !== "fund" || Number(fundAmountPesos) > 0) &&
    (confirmState.kind !== "transferCommission" ||
      Number(transferAmountPesos) > 0);

  const readyTotalInCentavos = board.readyToPay.reduce(
    (sum, item) => sum + item.amountInCentavos,
    0,
  );
  const readyTotalFormatted = phpCurrencyFormatter.format(
    readyTotalInCentavos / 100,
  );

  const hasLegacyEscrowItems =
    board.readyToPay.length > 0 ||
    board.advanceRequests.length > 0 ||
    board.history.length > 0 ||
    advanceHistoryRows.length > 0 ||
    board.companyFloat.availableBalanceInCentavos > 0 ||
    board.companyFloat.outstandingAdvanceInCentavos > 0;

  const openConfirmDialog = (state: ConfirmState) => {
    setActionError(null);
    setPassword("");
    setConfirmationPhrase("");
    if (state?.kind === "transferCommission") {
      const availablePesos =
        board.companyCommission.availableBalanceInCentavos / 100;
      setTransferAmountPesos(
        availablePesos > 0 ? availablePesos.toFixed(2) : "",
      );
    }
    setConfirmState(state);
  };

  const closeConfirmDialog = () => {
    setPassword("");
    setConfirmationPhrase("");
    setConfirmState(null);
  };

  const confirmAction = async () => {
    if (!confirmState || releasingId || !canConfirm) {
      return;
    }

    const actionId =
      confirmState.kind === "fund"
        ? "company-float"
        : confirmState.kind === "transferCommission"
          ? "company-commission-transfer"
          : confirmState.kind === "release"
            ? confirmState.item.providerDisbursementId
            : confirmState.item.advanceRequestId;

    onReleaseStart(actionId);
    setActionError(null);

    try {
      if (confirmState.kind === "fund") {
        const pesos = Number(fundAmountPesos);
        if (!Number.isFinite(pesos) || pesos <= 0) {
          throw new Error("Enter a valid funding amount in pesos.");
        }
        await fundCompanyFloat({
          amountInCentavos: Math.round(pesos * 100),
          password,
          confirmationPhrase,
        });
      } else if (confirmState.kind === "transferCommission") {
        const pesos = Number(transferAmountPesos);
        if (!Number.isFinite(pesos) || pesos <= 0) {
          throw new Error("Enter a valid transfer amount in pesos.");
        }
        await transferCompanyCommissionToFloat({
          amountInCentavos: Math.round(pesos * 100),
          clientRequestId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `commission_float_${Date.now()}_${Math.random()
                  .toString(36)
                  .slice(2, 10)}`,
          password,
          confirmationPhrase,
        });
      } else if (confirmState.kind === "advance") {
        await approveCompanyAdvanceRequest({
          advanceRequestId: confirmState.item.advanceRequestId,
          password,
          confirmationPhrase,
        });
      } else if (confirmState.kind === "reject") {
        await rejectCompanyAdvanceRequest({
          advanceRequestId: confirmState.item.advanceRequestId,
          password,
        });
      } else {
        await releaseMockProviderDisbursement({
          providerDisbursementId: confirmState.item.providerDisbursementId,
          password,
          confirmationPhrase,
        });
      }
      closeConfirmDialog();
      onReleased();
    } catch (releaseError) {
      setActionError(
        releaseError instanceof Error
          ? releaseError.message
          : "The admin finance action could not be completed.",
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
            FEASTA service fees &amp; direct splits
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Customer payments route 100% of the listed package price directly to
            the provider&apos;s linked payout account upon confirmation (0-day
            hold). FEASTA does not hold provider funds—this workspace tracks
            only FEASTA&apos;s platform service fee wallet and withdrawals.
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
        className="flex items-start gap-2.5 rounded-xl border border-primary/25 bg-primary-tint/50 px-3.5 py-2.5 text-sm text-foreground"
        role="status"
      >
        <Info
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-primary"
        />
        <p className="leading-5">
          <span className="font-bold text-primary-strong">Direct-to-provider split active:</span>{" "}
          Provider shares settle directly at checkout confirmation with no Admin
          custody or 3-day payout hold. Only FEASTA&apos;s dynamic service fee
          accrues here.
        </p>
      </div>

      {error && confirmState === null ? (
        <div
          className="rounded-xl border border-destructive/30 bg-destructive-subtle p-4"
          role="alert"
        >
          <p className="font-bold text-destructive">
            FEASTA service fee workspace could not load
          </p>
          <p className="mt-1 text-sm text-destructive">
            {error}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border bg-secondary/30 p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">FEASTA service fee wallet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Accrued from customer-paid FEASTA service fees on confirmed
              bookings.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="compact"
              variant="secondary"
              disabled={
                busy ||
                board.companyCommission.availableBalanceInCentavos <= 0
              }
              onClick={() => setWithdrawOpen(true)}
            >
              Withdraw service fee
            </Button>
            {hasLegacyEscrowItems ? (
              <Button
                type="button"
                size="compact"
                disabled={
                  busy ||
                  board.companyCommission.availableBalanceInCentavos <= 0
                }
                onClick={() => openConfirmDialog({kind: "transferCommission"})}
              >
                Add to company float
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <p className="text-sm">
            Available:{" "}
            <strong className="tabular-nums">
              {board.companyCommission.formattedAvailableBalance}
            </strong>
          </p>
          {board.companyCommission.transferredToFloatInCentavos > 0 ||
          hasLegacyEscrowItems ? (
            <p className="text-sm">
              Moved to float:{" "}
              <strong className="tabular-nums">
                {board.companyCommission.formattedTransferredToFloat}
              </strong>
            </p>
          ) : null}
          <p className="text-sm">
            Withdrawn:{" "}
            <strong className="tabular-nums">
              {board.companyCommission.formattedWithdrawn}
            </strong>
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold">Service fee withdrawal history</h3>
          <span className="rounded-pill bg-secondary px-2.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
            {commissionWithdrawals.length}
          </span>
        </div>
        {commissionWithdrawals.length === 0 ? (
          <p
            className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-5 text-sm text-muted-foreground"
            role="status"
          >
            No FEASTA service fee withdrawals recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                FEASTA service fee withdrawal history
              </caption>
              <thead className="border-b border-border bg-secondary text-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Destination
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Withdrawn
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
                {commissionWithdrawalPagination.pageRows.map((item) => (
                  <tr key={item.withdrawalId} className="hover:bg-table-hover">
                    <td className="whitespace-nowrap px-4 py-3.5 font-bold tabular-nums text-primary">
                      {item.formattedAmount}
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-semibold">
                        {item.destinationType === "gcash"
                          ? "GCash"
                          : "Bank transfer"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.accountName}
                      </p>
                      <p className="mt-0.5 break-all text-xs text-muted-foreground">
                        {item.destinationSummary}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                      {item.completedAt
                        ? formatPaymentDate(item.completedAt)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <Badge
                        tone="success"
                        shape="rounded"
                        size="compact"
                        className="border-success/25"
                      >
                        {item.status}
                      </Badge>
                    </td>
                    <td className="break-all px-4 py-3.5 font-mono text-xs text-muted-foreground">
                      {item.withdrawalId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {commissionWithdrawals.length > BOARD_TABLE_PAGE_SIZE ? (
              <div className="border-t border-border px-4 py-3">
                <CursorPagination
                  previousCursor={
                    commissionWithdrawalPagination.previousCursor
                  }
                  nextCursor={commissionWithdrawalPagination.nextCursor}
                  onPrevious={setCommissionWithdrawalPage}
                  onNext={setCommissionWithdrawalPage}
                  pageLabel={commissionWithdrawalPagination.pageLabel}
                  loading={loading}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {hasLegacyEscrowItems ? (
        <details className="grid gap-5 rounded-xl border border-border bg-secondary/20 p-4">
          <summary className="cursor-pointer text-sm font-bold text-foreground">
            {`Legacy escrow payouts & company float (${board.readyToPay.length} ready · ${board.advanceRequests.length} pending advances)`}
          </summary>
          <div className="mt-4 grid gap-5">
            <div
              className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-subtle/70 px-3.5 py-2.5 text-sm text-foreground"
              role="status"
            >
              <Info
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-warning"
              />
              <p className="leading-5">
                <span className="font-bold text-warning">Legacy escrow records only:</span>{" "}
                New bookings route directly to providers without company float
                or 3-day payout holds. Re-authentication is still required for
                historical releases below.
              </p>
            </div>

      <div className="grid gap-3 rounded-xl border border-border bg-secondary/30 p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Company float</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Separate company working capital used only for historical provider advances.
            </p>
          </div>
          <Button
            type="button"
            size="compact"
            disabled={busy}
            onClick={() => openConfirmDialog({kind: "fund"})}
          >
            Fund company float
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="text-sm">
            Available:{" "}
            <strong className="tabular-nums">
              {board.companyFloat.formattedAvailableBalance}
            </strong>
          </p>
          <p className="text-sm">
            Outstanding advances:{" "}
            <strong className="tabular-nums">
              {board.companyFloat.formattedOutstandingAdvance}
            </strong>
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold">Pending advance requests</h3>
          <span className="rounded-pill bg-secondary px-2.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
            {board.advanceRequests.length}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Historical immediate-funding requests from pre-direct escrow bookings.
        </p>

        {board.advanceRequests.length === 0 ? (
          <p
            className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-5 text-sm text-muted-foreground"
            role="status"
          >
            No pending immediate-funding requests.
          </p>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <caption className="sr-only">
                Pending company advance requests
              </caption>
              <thead className="border-b border-border bg-secondary text-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Provider
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Provider release
                  </th>
                  <th scope="col" className="px-4 py-3 font-bold">
                    Requested
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {pendingAdvancePagination.pageRows.map((item) => {
                  const isBusy = releasingId === item.advanceRequestId;
                  return (
                    <tr key={item.advanceRequestId} className="hover:bg-table-hover">
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-semibold text-foreground">
                          {item.providerName ?? item.providerId}
                        </p>
                        <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                          {item.providerRequestId}
                        </p>
                        {item.providerNote ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.providerNote}
                          </p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 align-top">
                        <p className="font-bold tabular-nums text-primary">
                          {item.formattedProviderNetAmount}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Commission {item.formattedCommissionAmount}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 align-top text-muted-foreground">
                        {item.requestedAt
                          ? formatPaymentDate(item.requestedAt)
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right align-top">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            size="compact"
                            disabled={busy}
                            onClick={() =>
                              openConfirmDialog({kind: "advance", item})
                            }
                          >
                            {isBusy ? "Working..." : "Approve advance"}
                          </Button>
                          <Button
                            type="button"
                            size="compact"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              openConfirmDialog({kind: "reject", item})
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {board.advanceRequests.length > BOARD_TABLE_PAGE_SIZE ? (
              <div className="border-t border-border px-4 py-3">
                <CursorPagination
                  previousCursor={pendingAdvancePagination.previousCursor}
                  nextCursor={pendingAdvancePagination.nextCursor}
                  onPrevious={setPendingAdvancePage}
                  onNext={setPendingAdvancePage}
                  pageLabel={pendingAdvancePagination.pageLabel}
                  loading={loading}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold">Company advance history</h3>
          <span className="rounded-pill bg-secondary px-2.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
            {advanceHistoryRows.length}
          </span>
        </div>
        {advanceHistoryRows.length === 0 ? (
          <p
            className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-5 text-sm text-muted-foreground"
            role="status"
          >
            No company advances issued or rejected yet.
          </p>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <caption className="sr-only">Company advance history</caption>
              <thead className="border-b border-border bg-secondary text-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-bold">Provider</th>
                  <th scope="col" className="px-4 py-3 font-bold">Amount</th>
                  <th scope="col" className="px-4 py-3 font-bold">Decided</th>
                  <th scope="col" className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {advanceHistoryPagination.pageRows.map((item) => (
                  <tr key={item.key} className="hover:bg-table-hover">
                    <td className="px-4 py-3.5 align-top">
                      <p className="font-semibold">
                        {item.providerName ?? item.providerId}
                      </p>
                      <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                        {item.providerRequestId}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 font-bold tabular-nums text-primary">
                      {item.amount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">
                      {item.decidedAt
                        ? formatPaymentDate(item.decidedAt)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <Badge
                        tone={item.tone}
                        shape="rounded"
                        size="compact"
                      >
                        {item.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {advanceHistoryRows.length > BOARD_TABLE_PAGE_SIZE ? (
              <div className="border-t border-border px-4 py-3">
                <CursorPagination
                  previousCursor={advanceHistoryPagination.previousCursor}
                  nextCursor={advanceHistoryPagination.nextCursor}
                  onPrevious={setAdvanceHistoryPage}
                  onNext={setAdvanceHistoryPage}
                  pageLabel={advanceHistoryPagination.pageLabel}
                  loading={loading}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

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
                {readyToPayPagination.pageRows.map((item) => {
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
                          onClick={() =>
                            openConfirmDialog({kind: "release", item})
                          }
                        >
                          {isReleasing ? "Releasing..." : "Release mock payout"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {board.readyToPay.length > BOARD_TABLE_PAGE_SIZE ? (
              <div className="border-t border-border px-4 py-3">
                <CursorPagination
                  previousCursor={readyToPayPagination.previousCursor}
                  nextCursor={readyToPayPagination.nextCursor}
                  onPrevious={setReadyToPayPage}
                  onNext={setReadyToPayPage}
                  pageLabel={readyToPayPagination.pageLabel}
                  loading={loading}
                />
              </div>
            ) : null}
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
                {payoutHistoryPagination.pageRows.map((item) => (
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
            {board.history.length > BOARD_TABLE_PAGE_SIZE ? (
              <div className="border-t border-border px-4 py-3">
                <CursorPagination
                  previousCursor={payoutHistoryPagination.previousCursor}
                  nextCursor={payoutHistoryPagination.nextCursor}
                  onPrevious={setPayoutHistoryPage}
                  onNext={setPayoutHistoryPage}
                  pageLabel={payoutHistoryPagination.pageLabel}
                  loading={loading}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
          </div>
        </details>
      ) : null}

      <ConfirmationDialog
        open={confirmState !== null}
        onOpenChange={(open) => {
          if (!open && releasingId === null) {
            closeConfirmDialog();
          }
        }}
        title={
          confirmState?.kind === "fund"
            ? "Fund company float?"
            : confirmState?.kind === "transferCommission"
              ? "Add commission to company float?"
              : confirmState?.kind === "advance"
                ? "Approve company advance?"
                : confirmState?.kind === "reject"
                  ? "Reject advance request?"
                  : "Release mock provider payout?"
        }
        description={
          confirmState?.kind === "fund"
            ? "This adds mock company working capital used for provider advances. Re-enter your admin password and type FUND to continue."
            : confirmState?.kind === "transferCommission"
              ? `Move available FEASTA commission into company float for provider advances. Available now: ${board.companyCommission.formattedAvailableBalance}. Re-enter your admin password and type FLOAT to continue.`
              : confirmState?.kind === "advance"
                ? `Release ${confirmState.item.formattedProviderNetAmount} to ${confirmState.item.providerName ?? confirmState.item.providerId} from company float. FEASTA commission ${confirmState.item.formattedCommissionAmount} stays in the commission wallet. Type ADVANCE to continue.`
                : confirmState?.kind === "reject"
                  ? `Reject the immediate-funding request from ${confirmState.item.providerName ?? confirmState.item.providerId}. Re-enter your admin password to continue.`
                  : confirmState?.kind === "release"
                    ? `This will mark ${confirmState.item.formattedAmount} as paid for ${confirmState.item.providerName ?? confirmState.item.providerId} using simulated payout settlement. Re-enter your admin password and type RELEASE to continue.`
                    : "Confirm admin finance action."
        }
        confirmLabel={
          releasingId
            ? "Working..."
            : confirmState?.kind === "fund"
              ? "Fund company float"
              : confirmState?.kind === "transferCommission"
                ? "Add to company float"
                : confirmState?.kind === "advance"
                  ? "Approve advance"
                  : confirmState?.kind === "reject"
                    ? "Reject request"
                    : "Release mock payout"
        }
        cancelLabel="Cancel"
        onConfirm={() => {
          void confirmAction();
        }}
        confirmDisabled={!canConfirm}
        loading={releasingId !== null}
        error={actionError}
      >
        <div className="grid gap-4">
          {confirmState?.kind === "fund" ? (
            <div className="grid gap-2">
              <label
                className="text-sm font-medium"
                htmlFor="admin-company-float-amount"
              >
                Amount (PHP)
              </label>
              <Input
                id="admin-company-float-amount"
                type="number"
                min="1"
                step="0.01"
                value={fundAmountPesos}
                onChange={(event) => setFundAmountPesos(event.target.value)}
                disabled={releasingId !== null}
              />
            </div>
          ) : null}
          {confirmState?.kind === "transferCommission" ? (
            <div className="grid gap-2">
              <label
                className="text-sm font-medium"
                htmlFor="admin-commission-to-float-amount"
              >
                Amount (PHP)
              </label>
              <Input
                id="admin-commission-to-float-amount"
                type="number"
                min="0.01"
                step="0.01"
                max={board.companyCommission.availableBalanceInCentavos / 100}
                value={transferAmountPesos}
                onChange={(event) => setTransferAmountPesos(event.target.value)}
                disabled={releasingId !== null}
              />
            </div>
          ) : null}
          {confirmState?.kind === "advance" ? (
            <div className="grid gap-2 rounded-xl border border-border bg-secondary/40 px-3.5 py-3 text-sm">
              <p>
                Provider release amount:{" "}
                <strong className="tabular-nums text-primary">
                  {confirmState.item.formattedProviderNetAmount || "₱0.00"}
                </strong>
              </p>
              <p className="text-muted-foreground">
                Gross{" "}
                <span className="tabular-nums text-foreground">
                  {confirmState.item.formattedGrossAmount || "₱0.00"}
                </span>
                {" − "}
                commission{" "}
                <span className="tabular-nums text-foreground">
                  {confirmState.item.formattedCommissionAmount || "₱0.00"}
                </span>{" "}
                (kept in commission wallet)
              </p>
            </div>
          ) : null}
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
              name="feasta-admin-reauth-password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={releasingId !== null}
            />
          </div>
          {confirmState?.kind !== "reject" ? (
            <div className="grid gap-2">
              <label
                className="text-sm font-medium"
                htmlFor="admin-payout-release-phrase"
              >
                {`Type ${requiredPhrase} to confirm`}
              </label>
              <Input
                id="admin-payout-release-phrase"
                value={confirmationPhrase}
                onChange={(event) => setConfirmationPhrase(event.target.value)}
                placeholder={requiredPhrase}
                autoComplete="off"
                spellCheck={false}
                disabled={releasingId !== null}
                aria-describedby="admin-payout-release-phrase-help"
              />
              <p
                id="admin-payout-release-phrase-help"
                className="text-xs text-muted-foreground"
              >
                {`Confirmation is case-sensitive and must match ${requiredPhrase} exactly.`}
              </p>
            </div>
          ) : null}
        </div>
      </ConfirmationDialog>

      <AdminCommissionWithdrawDialog
        open={withdrawOpen}
        availableAmountInCentavos={
          board.companyCommission.availableBalanceInCentavos
        }
        onOpenChange={setWithdrawOpen}
        onCompleted={onReleased}
      />
    </section>
  );
}

export {ProviderPayoutBoard};
