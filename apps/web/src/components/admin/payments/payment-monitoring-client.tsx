"use client";

import {
  ArrowUpRight,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  PhilippinePeso,
  RotateCcw,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  repairAmbiguousProviderPayoutSetup,
  retryFailedProviderDisbursement,
} from "@/lib/admin/payments/admin-payment-client";

import {
  loadAdminFinanceAttentionQueueAction,
  loadAdminPaymentDetailsAction,
  loadAdminPaymentsAction,
  loadAdminProviderPayoutBoardAction,
} from "@/app/admin/payments/actions";
import {
  PaymentDetailsDrawer,
} from "@/components/admin/payments/payment-details-drawer";
import {
  PaymentFinanceAttention,
  canRetryFailedDisbursement,
} from "@/components/admin/payments/payment-finance-attention";
import {
  ProviderPayoutBoard,
} from "@/components/admin/payments/provider-payout-board";
import {
  formatPaymentTableDateParts,
  formatAdminPaymentPurpose,
  formatPaymentType,
  paymentBookingLabel,
  paymentReferenceLabel,
} from "@/components/admin/payments/payment-formatters";
import {
  PaymentIssueBadges,
} from "@/components/admin/payments/payment-issue-badges";
import {
  PaymentMobileCard,
} from "@/components/admin/payments/payment-mobile-card";
import {
  PaymentStatusBadge,
} from "@/components/admin/payments/payment-status-badge";
import {
  CursorPagination,
} from "@/components/data/cursor-pagination";
import {
  DataTable,
  type DataTableColumn,
  type DataTableSort,
} from "@/components/data/data-table";
import {
  FilterToolbar,
} from "@/components/data/filter-toolbar";
import {
  SummaryCard,
} from "@/components/data/summary-card";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {PageHeading} from "@/components/layout/page-heading";
import {PaymentFlowOverview} from "@/components/shared/payment-flow-overview";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import type {
  AdminFinanceAttentionItem,
  AdminFinanceAttentionQueue,
  AdminPayment,
  AdminPaymentDateFilter,
  AdminPaymentDetails,
  AdminPaymentFilters,
  AdminPaymentPage,
  AdminPaymentSortDirection,
  AdminPaymentSortField,
  AdminPaymentStatusFilter,
  AdminPaymentTypeFilter,
  AdminProviderPayoutBoard,
} from "@/lib/admin/payments/admin-payment-types";
import {cn} from "@/lib/utils";

type PaymentMonitoringClientProps = {
  initialPage: AdminPaymentPage;

  initialAttention: AdminFinanceAttentionQueue;

  initialPayoutBoard: AdminProviderPayoutBoard;
};

type WorkspaceTabId = "payments" | "payouts";

const WORKSPACE_TABS: readonly {id: WorkspaceTabId; label: string}[] = [
  {id: "payments", label: "Customer payments"},
  {id: "payouts", label: "Provider payouts"},
];

const STATUS_FILTER_LABELS: Record<
  Exclude<AdminPaymentStatusFilter, "all">,
  string
> = {
  pending: "Pending",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  expired: "Expired",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
};

const DEFAULT_FILTERS: AdminPaymentFilters = {
  search: "",
  status: "all",
  paymentType: "all",
  date: "all",
  issue: "all",
  sortField: "createdAt",
  sortDirection: "descending",
  pageSize: 10,
  cursor: null,
};

const FIRST_PAGE_CURSOR = "__first_page__";

function PaymentMonitoringClient({
  initialPage,
  initialAttention,
  initialPayoutBoard,
}: PaymentMonitoringClientProps) {
  const [activeTab, setActiveTab] =
    useState<WorkspaceTabId>("payments");

  const [page, setPage] =
    useState<AdminPaymentPage>(initialPage);

  const [attentionQueue, setAttentionQueue] =
    useState<AdminFinanceAttentionQueue>(initialAttention);

  const [attentionLoading, setAttentionLoading] = useState(false);

  const [attentionError, setAttentionError] = useState<string>();

  const [payoutBoard, setPayoutBoard] =
    useState<AdminProviderPayoutBoard>(initialPayoutBoard);

  const [payoutBoardLoading, setPayoutBoardLoading] = useState(false);

  const [payoutBoardError, setPayoutBoardError] = useState<string>();

  const [releasingPayoutId, setReleasingPayoutId] =
    useState<string | null>(null);

  const [repairTarget, setRepairTarget] =
    useState<AdminFinanceAttentionItem | null>(null);

  const [repairingAttentionId, setRepairingAttentionId] =
    useState<string | null>(null);

  const [retryTarget, setRetryTarget] =
    useState<AdminFinanceAttentionItem | null>(null);
  const [retryingAttentionId, setRetryingAttentionId] =
    useState<string | null>(null);

  const [filters, setFilters] =
    useState<AdminPaymentFilters>(DEFAULT_FILTERS);

  const [searchValue, setSearchValue] = useState("");

  const [cursorHistory, setCursorHistory] =
    useState<(string | null)[]>([null]);

  const [pageError, setPageError] = useState<string>();

  const [selectedPayment, setSelectedPayment] =
    useState<AdminPayment | null>(null);

  const [paymentDetails, setPaymentDetails] =
    useState<AdminPaymentDetails | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [detailsLoading, setDetailsLoading] = useState(false);

  const [detailsError, setDetailsError] = useState<string>();

  const [isPending, startTransition] = useTransition();

  const pageRequestId = useRef(0);
  const detailsRequestId = useRef(0);
  const attentionRequestId = useRef(0);
  const payoutBoardRequestId = useRef(0);
  const tabRefs = useRef<Record<WorkspaceTabId, HTMLButtonElement | null>>({
    payments: null,
    payouts: null,
  });

  const hasUrgentAttention =
    attentionQueue.items.length > 0 ||
    Boolean(attentionError) ||
    attentionLoading;

  const loadPage = useCallback(
    (
      nextFilters: AdminPaymentFilters,
      cursor: string | null,
      history: (string | null)[],
    ) => {
      const requestId = ++pageRequestId.current;

      setPageError(undefined);

      const requestFilters = {
        ...nextFilters,
        cursor,
      };

      startTransition(async () => {
        try {
          const result = await loadAdminPaymentsAction(requestFilters);

          if (pageRequestId.current !== requestId) {
            return;
          }

          setPage(result);
          setFilters(requestFilters);
          setCursorHistory(history);
        } catch (error: unknown) {
          if (pageRequestId.current !== requestId) {
            return;
          }

          setPageError(errorMessage(error));
        }
      });
    },
    [],
  );

  const refreshFinanceAttention = useCallback(() => {
    const requestId = ++attentionRequestId.current;

    setAttentionLoading(true);
    setAttentionError(undefined);

    void loadAdminFinanceAttentionQueueAction()
      .then((result) => {
        if (attentionRequestId.current !== requestId) {
          return;
        }

        setAttentionQueue(result);
      })
      .catch((error: unknown) => {
        if (attentionRequestId.current !== requestId) {
          return;
        }

        setAttentionError(errorMessage(error));
      })
      .finally(() => {
        if (attentionRequestId.current === requestId) {
          setAttentionLoading(false);
        }
      });
  }, []);

  const refreshProviderPayoutBoard = useCallback(() => {
    const requestId = ++payoutBoardRequestId.current;

    setPayoutBoardLoading(true);
    setPayoutBoardError(undefined);

    void loadAdminProviderPayoutBoardAction()
      .then((result) => {
        if (payoutBoardRequestId.current !== requestId) {
          return;
        }

        setPayoutBoard(result);
      })
      .catch((error: unknown) => {
        if (payoutBoardRequestId.current !== requestId) {
          return;
        }

        setPayoutBoardError(errorMessage(error));
      })
      .finally(() => {
        if (payoutBoardRequestId.current === requestId) {
          setPayoutBoardLoading(false);
        }
      });
  }, []);

  const requestRepairPayoutSetup = useCallback(
    (item: AdminFinanceAttentionItem) => {
      if (
        item.kind !== "ambiguous_payout_setup" ||
        item.recordState !== "valid" ||
        !item.providerId ||
        !item.expectedUpdatedAtMillis
      ) {
        setAttentionError(
          "This payout setup issue is no longer safe to repair. Refresh Provider payout issues.",
        );
        return;
      }

      setAttentionError(undefined);
      setRepairTarget(item);
    },
    [],
  );

  const confirmRepairPayoutSetup = async () => {
    const current = attentionQueue.items.find(
      (item) => item.id === repairTarget?.id,
    );
    if (
      !current ||
      current.kind !== "ambiguous_payout_setup" ||
      current.recordState !== "valid" ||
      !current.providerId ||
      !current.expectedUpdatedAtMillis ||
      repairingAttentionId ||
      retryingAttentionId
    ) {
      setAttentionError(
        "This payout setup issue is no longer safe to repair. Refresh Provider payout issues.",
      );
      setRepairTarget(null);
      return;
    }

    const requestId = ++attentionRequestId.current;
    setRepairingAttentionId(current.id);
    setAttentionError(undefined);

    try {
      await repairAmbiguousProviderPayoutSetup({
        providerId: current.providerId,
        expectedUpdatedAtMillis: current.expectedUpdatedAtMillis,
      });

      const refreshed = await loadAdminFinanceAttentionQueueAction();
      if (attentionRequestId.current === requestId) {
        setAttentionQueue(refreshed);
      }
    } catch (error: unknown) {
      setAttentionError(errorMessage(error));
    } finally {
      setRepairingAttentionId(null);
      setRepairTarget(null);
    }
  };

  const retryFailedPayout = async () => {
    const current = attentionQueue.items.find(
      (item) => item.id === retryTarget?.id,
    );
    if (
      !current ||
      !canRetryFailedDisbursement(current) ||
      !current.providerDisbursementId ||
      repairingAttentionId ||
      retryingAttentionId
    ) {
      setAttentionError(
        "This payout changed or is no longer safe to retry. Refresh Provider payout issues.",
      );
      setRetryTarget(null);
      return;
    }
    const requestId = ++attentionRequestId.current;
    setAttentionLoading(false);
    setRetryingAttentionId(current.id);
    setAttentionError(undefined);
    try {
      await retryFailedProviderDisbursement({
        providerDisbursementId: current.providerDisbursementId,
      });
      const refreshed = await loadAdminFinanceAttentionQueueAction();
      if (attentionRequestId.current === requestId) {
        setAttentionQueue(refreshed);
      }
    } catch (error: unknown) {
      setAttentionError(errorMessage(error));
    } finally {
      setRetryingAttentionId(null);
      setRetryTarget(null);
    }
  };

  const applyFilters = useCallback(
    (changes: Partial<AdminPaymentFilters>) => {
      const nextFilters = {
        ...filters,
        ...changes,
        cursor: null,
      };

      loadPage(nextFilters, null, [null]);
    },
    [filters, loadPage],
  );

  const loadDetails = useCallback((payment: AdminPayment) => {
    const requestId = ++detailsRequestId.current;

    setDetailsLoading(true);
    setDetailsError(undefined);
    setPaymentDetails(null);

    void loadAdminPaymentDetailsAction(payment.id)
      .then((result) => {
        if (detailsRequestId.current !== requestId) {
          return;
        }

        setPaymentDetails(result.details);
      })
      .catch((error: unknown) => {
        if (detailsRequestId.current !== requestId) {
          return;
        }

        setDetailsError(errorMessage(error));
      })
      .finally(() => {
        if (detailsRequestId.current === requestId) {
          setDetailsLoading(false);
        }
      });
  }, []);

  const openPaymentDetails = useCallback(
    (payment: AdminPayment) => {
      setSelectedPayment(payment);
      setDrawerOpen(true);
      loadDetails(payment);
    },
    [loadDetails],
  );

  const handleDrawerOpenChange = useCallback((open: boolean) => {
    setDrawerOpen(open);

    if (!open) {
      detailsRequestId.current += 1;
      setDetailsLoading(false);
      setDetailsError(undefined);
      setPaymentDetails(null);
      setSelectedPayment(null);
    }
  }, []);

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % WORKSPACE_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = WORKSPACE_TABS.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextTab = WORKSPACE_TABS[nextIndex];
    setActiveTab(nextTab.id);
    tabRefs.current[nextTab.id]?.focus();
  };

  const columns = useMemo<readonly DataTableColumn<AdminPayment>[]>(
    () => [
      {
        id: "payment",
        header: "Payment",
        cell: (payment) => (
          <div className="min-w-0">
            <p className="whitespace-nowrap text-sm font-semibold text-foreground">
              {paymentReferenceLabel(payment)}
            </p>

            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatAdminPaymentPurpose(payment)}
            </p>
          </div>
        ),
      },
      {
        id: "booking",
        header: "Booking",
        cell: (payment) => (
          <p className="whitespace-nowrap font-semibold text-foreground">
            {paymentBookingLabel(payment)}
          </p>
        ),
      },
      {
        id: "customer",
        header: "Customer",
        cell: (payment) => (
          <p className="min-w-0 break-words font-semibold text-foreground">
            {payment.customerName}
          </p>
        ),
      },
      {
        id: "provider",
        header: "Provider",
        cell: (payment) => (
          <p className="min-w-0 break-words font-semibold text-foreground">
            {payment.providerName}
          </p>
        ),
      },
      {
        id: "amountInCentavos",
        header: "Original amount",
        sortable: true,
        cell: (payment) => (
          <div className="min-w-[7.5rem]">
            <span className="whitespace-nowrap font-bold tabular-nums text-primary">
              {payment.formattedAmount}
            </span>
            {payment.refundedAmountFormatted ? (
              <p className="mt-0.5 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                Refunded {payment.refundedAmountFormatted}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (payment) => <PaymentStatusBadge status={payment.status} />,
      },
      {
        id: "createdAt",
        header: "Date",
        sortable: true,
        cell: (payment) => {
          const timestamp = payment.paidAt ?? payment.createdAt;
          const parts = formatPaymentTableDateParts(timestamp);

          return parts ? (
            <time
              dateTime={timestamp ?? undefined}
              className="block whitespace-nowrap text-sm tabular-nums"
            >
              <span className="block font-medium">{parts.date}</span>
              <span className="block text-xs text-muted-foreground">
                {parts.time}
              </span>
            </time>
          ) : (
            <span className="text-sm text-muted-foreground">
              Not available
            </span>
          );
        },
      },
      {
        id: "issues",
        header: "Issue",
        cell: (payment) =>
          payment.issues.length > 0 ? (
            <PaymentIssueBadges issues={payment.issues} compact />
          ) : (
            <span className="whitespace-nowrap text-sm text-muted-foreground">
              No issues
            </span>
          ),
      },
    ],
    [],
  );

  const tableSort: DataTableSort = {
    columnId: filters.sortField,
    direction: filters.sortDirection,
  };

  const activeFilters = filterLabels(filters);

  const previousCursor =
    cursorHistory.length > 1
      ? cursorHistory.at(-2) ?? FIRST_PAGE_CURSOR
      : null;

  const currentCursor = cursorHistory.at(-1) ?? null;

  const clearFilters = () => {
    setSearchValue("");
    loadPage(DEFAULT_FILTERS, null, [null]);
  };

  const retryPage = () => {
    loadPage(filters, currentCursor, cursorHistory);
  };

  const attentionSection = (
    <PaymentFinanceAttention
      statistics={page.statistics}
      queue={attentionQueue}
      embedded={!hasUrgentAttention}
      retryingItemId={retryingAttentionId}
      onRetryFailedDisbursement={(item) => {
        if (canRetryFailedDisbursement(item)) setRetryTarget(item);
      }}
      loading={attentionLoading}
      error={attentionError}
      repairingItemId={repairingAttentionId}
      onRefresh={refreshFinanceAttention}
      onViewPayment={openPaymentDetails}
      onRepairPayoutSetup={requestRepairPayoutSetup}
    />
  );

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Payments"
        description="Monitor customer payments, refunds, and provider payouts."
        actions={
          <Button asChild variant="secondary" size="compact">
            <Link href="/admin/reports">
              <span>View revenue reports</span>
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        }
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Payment statistics"
      >
        <SummaryCard
          label="Net customer payments"
          tooltip="Customer funds kept after refunds — includes provider share and FEASTA fee."
          value={
            <span className="tabular-nums">
              {page.statistics.confirmedVolumeFormatted}
            </span>
          }
          icon={<PhilippinePeso className="size-5" />}
        />

        <SummaryCard
          label="Pending payments"
          tooltip="Awaiting checkout or gateway confirmation."
          value={
            <span className="tabular-nums">
              {page.statistics.pendingProcessingCount}
            </span>
          }
          icon={<Clock3 className="size-5" />}
        />

        <SummaryCard
          label="Failed payments"
          tooltip="Customer charges that did not complete."
          value={
            <span className="tabular-nums">
              {page.statistics.failedPaymentCount}
            </span>
          }
          icon={<CircleAlert className="size-5" />}
        />

        <SummaryCard
          label="Refunded amount"
          tooltip="Completed full and partial customer refunds."
          value={
            <span className="tabular-nums">
              {page.statistics.refundedAmountFormatted}
            </span>
          }
          icon={<RotateCcw className="size-5" />}
        />
      </section>

      <details className="group rounded-xl border border-border/80 bg-secondary/50 transition-colors duration-fast open:bg-secondary/35">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground sm:px-4 [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-primary transition-transform duration-fast group-open:rotate-90 motion-reduce:transition-none"
          />
          <span>How payments, earnings, and payouts work</span>
        </summary>
        <div className="px-3.5 pb-4 pt-1 sm:px-4">
          <PaymentFlowOverview embedded />
        </div>
      </details>

      {hasUrgentAttention ? attentionSection : null}

      <section
        className="min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card"
        aria-label="Payments operations workspace"
      >
        <div
          className="flex min-w-0 items-end gap-6 overflow-x-auto border-b border-border px-4 sm:px-5"
          role="tablist"
          aria-label="Payments workspace views"
        >
          {WORKSPACE_TABS.map((tab, index) => {
            const selected = activeTab === tab.id;
            const readyCount =
              tab.id === "payouts" ? payoutBoard.readyToPay.length : 0;
            const TabIcon = tab.id === "payments" ? CreditCard : Wallet;

            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[tab.id] = node;
                }}
                type="button"
                role="tab"
                id={`admin-payments-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`admin-payments-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  "relative inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap px-1 py-3 text-sm font-bold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  selected
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <TabIcon aria-hidden="true" className="size-4 shrink-0" />
                <span>{tab.label}</span>
                {readyCount > 0 ? (
                  <span className="rounded-pill bg-primary-tint px-2 py-0.5 text-xs font-bold tabular-nums text-primary-strong">
                    {readyCount} ready
                  </span>
                ) : null}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-t-full transition-colors duration-fast",
                    selected ? "bg-primary" : "bg-transparent",
                  )}
                />
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id="admin-payments-panel-payments"
          aria-labelledby="admin-payments-tab-payments"
          hidden={activeTab !== "payments"}
          className={cn(
            "min-w-0",
            activeTab === "payments" ? "grid gap-5 p-4 sm:p-5" : "hidden",
          )}
        >
          <FilterToolbar
            className="rounded-xl border-border/80 bg-secondary/35 shadow-none"
            onSearchInvalidate={() => {
              pageRequestId.current += 1;
            }}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            onSearchSubmit={(search) => applyFilters({search})}
            onClearFilters={clearFilters}
            activeFilters={activeFilters}
            loading={isPending}
            searchLabel="Search payment records"
            searchPlaceholder="Search payment or booking reference"
            filterControls={
              <>
                <FilterSelect
                  label="Payment status"
                  value={filters.status}
                  disabled={isPending}
                  onChange={(value) =>
                    applyFilters({
                      status: value as AdminPaymentStatusFilter,
                    })
                  }
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="expired">Expired</option>
                  <option value="refunded">Refunded</option>
                  <option value="partially_refunded">Partially refunded</option>
                </FilterSelect>

                <FilterSelect
                  label="Payment type"
                  value={filters.paymentType}
                  disabled={isPending}
                  onChange={(value) =>
                    applyFilters({
                      paymentType: value as AdminPaymentTypeFilter,
                    })
                  }
                >
                  <option value="all">All payment types</option>
                  <option value="provider_down_payment">Down payment</option>
                  <option value="full">Full payment</option>
                  <option value="provider_balance">Remaining balance</option>
                </FilterSelect>

                <FilterSelect
                  label="Transaction date"
                  value={filters.date}
                  disabled={isPending}
                  onChange={(value) =>
                    applyFilters({
                      date: value as AdminPaymentDateFilter,
                    })
                  }
                >
                  <option value="all">All dates</option>
                  <option value="today">Today</option>
                  <option value="last_7_days">Last 7 days</option>
                  <option value="last_30_days">Last 30 days</option>
                </FilterSelect>

                <FilterSelect
                  label="Review status"
                  value={filters.issue}
                  disabled={isPending}
                  onChange={(value) =>
                    applyFilters({
                      issue: value as AdminPaymentFilters["issue"],
                    })
                  }
                >
                  <option value="all">All</option>
                  <option value="with_issues">Needs review</option>
                  <option value="without_issues">No issues</option>
                </FilterSelect>
              </>
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
            <p className="tabular-nums">
              Showing {page.payments.length}{" "}
              {page.payments.length === 1 ? "payment" : "payments"} on page{" "}
              {cursorHistory.length}
            </p>
            <p>
              Sorted by{" "}
              {filters.sortField === "amountInCentavos"
                ? "original amount"
                : "date"}{" "}
              ({filters.sortDirection === "ascending" ? "lowest / oldest" : "highest / newest"})
            </p>
          </div>

          <DataTable
            columns={columns}
            rows={page.payments}
            getRowId={(payment) => payment.id}
            caption="Payment monitoring records"
            className={[
              "[&_table]:min-w-[56rem]",
              "[&_th]:px-3 [&_td]:px-3",
              "[&_th:last-child]:sticky",
              "[&_th:last-child]:right-0",
              "[&_th:last-child]:z-10",
              "[&_th:last-child]:bg-secondary",
              "[&_th:last-child]:min-w-[7rem]",
              "[&_td:last-child]:sticky",
              "[&_td:last-child]:right-0",
              "[&_td:last-child]:z-10",
              "[&_td:last-child]:bg-card",
              "[&_td:last-child]:whitespace-nowrap",
            ].join(" ")}
            updating={isPending}
            error={pageError}
            errorKind="load"
            onRetry={retryPage}
            emptyTitle="No payments found"
            emptyDescription="No payment records match the selected query and filters. Clear filters to view all payments."
            sort={tableSort}
            onSortChange={(sort) => {
              if (
                sort.columnId !== "createdAt" &&
                sort.columnId !== "amountInCentavos"
              ) {
                return;
              }

              applyFilters({
                sortField: sort.columnId as AdminPaymentSortField,
                sortDirection: sort.direction as AdminPaymentSortDirection,
              });
            }}
            rowActions={(payment) => (
              <Button
                type="button"
                variant="secondary"
                size="compact"
                className="whitespace-nowrap"
                onClick={() => openPaymentDetails(payment)}
              >
                View details
              </Button>
            )}
            renderMobileRow={(payment) => (
              <PaymentMobileCard
                payment={payment}
                onViewDetails={openPaymentDetails}
              />
            )}
          />

          <CursorPagination
            previousCursor={previousCursor}
            nextCursor={page.hasMore ? page.nextCursor : null}
            loading={isPending}
            pageLabel={`Page ${cursorHistory.length}`}
            onPrevious={() => {
              if (cursorHistory.length <= 1) {
                return;
              }

              const nextHistory = cursorHistory.slice(0, -1);

              loadPage(filters, nextHistory.at(-1) ?? null, nextHistory);
            }}
            onNext={(cursor) => {
              const nextHistory = [...cursorHistory, cursor];

              loadPage(filters, cursor, nextHistory);
            }}
          />
        </div>

        <div
          role="tabpanel"
          id="admin-payments-panel-payouts"
          aria-labelledby="admin-payments-tab-payouts"
          hidden={activeTab !== "payouts"}
          className={cn(
            "min-w-0",
            activeTab === "payouts" ? "grid gap-6 p-4 sm:p-5" : "hidden",
          )}
        >
          <ProviderPayoutBoard
            board={payoutBoard}
            loading={payoutBoardLoading}
            error={payoutBoardError}
            releasingId={releasingPayoutId}
            embedded
            onRefresh={refreshProviderPayoutBoard}
            onReleased={() => {
              refreshProviderPayoutBoard();
              refreshFinanceAttention();
            }}
            onReleaseStart={setReleasingPayoutId}
            onReleaseEnd={() => setReleasingPayoutId(null)}
          />

          {!hasUrgentAttention ? attentionSection : null}
        </div>
      </section>

      <ConfirmationDialog
        open={retryTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRetryTarget(null);
        }}
        title="Retry failed Provider payout?"
        description="This retry prepares financial revalidation. A new payout attempt is created only after financial revalidation succeeds."
        confirmLabel="Prepare payout retry"
        loading={retryingAttentionId !== null}
        onConfirm={retryFailedPayout}
      />

      <ConfirmationDialog
        open={repairTarget !== null}
        onOpenChange={(open) => {
          if (!open && repairingAttentionId === null) setRepairTarget(null);
        }}
        title="Repair this Provider payout setup?"
        description={
          repairTarget?.providerId
            ? `Continue only after confirming no matching PayMongo test payout account exists for provider ${repairTarget.providerId}. This does not make the provider payout-ready — it only allows a safe payout setup retry.`
            : "Continue only after confirming no matching PayMongo test payout account exists. This does not make the provider payout-ready — it only allows a safe payout setup retry."
        }
        confirmLabel={
          repairingAttentionId !== null
            ? "Repairing..."
            : "Repair payout setup"
        }
        loading={repairingAttentionId !== null}
        onConfirm={confirmRepairPayoutSetup}
      />

      <PaymentDetailsDrawer
        payment={selectedPayment}
        details={paymentDetails}
        open={drawerOpen}
        loading={detailsLoading}
        error={detailsError}
        onOpenChange={handleDrawerOpenChange}
        onRetry={() => {
          if (selectedPayment) {
            loadDetails(selectedPayment);
          }
        }}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-40 gap-1.5">
      <span className="text-xs font-bold text-foreground">{label}</span>

      <Select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {children}
      </Select>
    </label>
  );
}

function filterLabels(filters: AdminPaymentFilters): string[] {
  const labels: string[] = [];

  if (filters.status !== "all") {
    labels.push(`Status: ${STATUS_FILTER_LABELS[filters.status]}`);
  }

  if (filters.paymentType !== "all") {
    labels.push(
      `Type: ${
        filters.paymentType === "full"
          ? "Full payment"
          : formatPaymentType(filters.paymentType)
      }`,
    );
  }

  if (filters.date !== "all") {
    const dates: Record<Exclude<AdminPaymentDateFilter, "all">, string> = {
      today: "Today",
      last_7_days: "Last 7 days",
      last_30_days: "Last 30 days",
    };

    labels.push(`Date: ${dates[filters.date]}`);
  }

  if (filters.issue !== "all") {
    labels.push(
      filters.issue === "with_issues"
        ? "Review: Needs review"
        : "Review: No issues",
    );
  }

  return labels;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Payment records could not be loaded. Please try again.";
}

export {
  PaymentMonitoringClient,
  type PaymentMonitoringClientProps,
};
