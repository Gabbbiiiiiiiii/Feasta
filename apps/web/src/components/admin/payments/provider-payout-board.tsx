"use client";

import {RefreshCw} from "lucide-react";
import {useState} from "react";

import {AdminCommissionWithdrawDialog} from "@/components/admin/payments/admin-commission-withdraw-dialog";
import {
  BOARD_TABLE_PAGE_SIZE,
  paginateBoardRows,
} from "@/components/admin/payments/board-table-pagination";
import {formatPaymentDate} from "@/components/admin/payments/payment-formatters";
import {CursorPagination} from "@/components/data/cursor-pagination";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {SensitiveAmount} from "@/components/ui/sensitive-amount";
import type {AdminProviderPayoutBoard} from "@/lib/admin/payments/admin-payment-types";
import {cn} from "@/lib/utils";

type ProviderPayoutBoardProps = {
  board: AdminProviderPayoutBoard;
  loading: boolean;
  error?: string;
  releasingId?: string | null;
  embedded?: boolean;
  onRefresh: () => void;
  onReleased: () => void;
  onReleaseStart?: (providerDisbursementId: string) => void;
  onReleaseEnd?: () => void;
};

function ProviderPayoutBoard({
  board,
  loading,
  error,
  releasingId = null,
  embedded = false,
  onRefresh,
  onReleased,
}: ProviderPayoutBoardProps) {
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [commissionWithdrawalPage, setCommissionWithdrawalPage] = useState(0);

  const commissionWithdrawals = board.commissionWithdrawals ?? [];
  const commissionWithdrawalPagination = paginateBoardRows(
    commissionWithdrawals,
    commissionWithdrawalPage,
  );

  const busy = loading || releasingId !== null;

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
            FEASTA service fees
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            100% of each booking&apos;s listed package price settles directly to
            the provider. This workspace manages FEASTA&apos;s service fee
            balance and withdrawals.
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

      {error ? (
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
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Available:</span>
            <strong className="font-bold text-foreground">
              <SensitiveAmount
                label="wallet available balance"
                value={board.companyCommission.formattedAvailableBalance}
              />
            </strong>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Withdrawn:</span>
            <strong className="font-bold text-foreground">
              <SensitiveAmount
                label="wallet withdrawn total"
                value={board.companyCommission.formattedWithdrawn}
              />
            </strong>
          </div>
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
