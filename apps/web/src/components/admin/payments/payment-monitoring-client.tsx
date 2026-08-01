"use client";

import {
  CircleAlert,
  Clock3,
  PhilippinePeso,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  loadAdminPaymentDetailsAction,
  loadAdminPaymentsAction,
} from "@/app/admin/payments/actions";
import {
  PaymentDetailsDrawer,
} from "@/components/admin/payments/payment-details-drawer";
import {
  formatPaymentDate,
  formatPaymentType,
  paymentBookingLabel,
} from "@/components/admin/payments/payment-formatters";
import {
  PaymentIssueBadges,
} from "@/components/admin/payments/payment-issue-badges";
import {
  PaymentMobileCard,
} from "@/components/admin/payments/payment-mobile-card";

import {
  PaymentRefundDialog,
} from "@/components/admin/payments/payment-refund-dialog";

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
import {PageHeading} from "@/components/layout/page-heading";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import type {
  AdminPayment,
  AdminPaymentDateFilter,
  AdminPaymentDetails,
  AdminPaymentFilters,
  AdminPaymentPage,
  AdminPaymentSortDirection,
  AdminPaymentSortField,
  AdminPaymentStatusFilter,
  AdminPaymentTypeFilter,
} from "@/lib/admin/payments/admin-payment-types";

type PaymentMonitoringClientProps = {
  initialPage: AdminPaymentPage;
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
}: PaymentMonitoringClientProps) {
  const [page, setPage] =
    useState<AdminPaymentPage>(initialPage);

  const [filters, setFilters] =
    useState<AdminPaymentFilters>(
      DEFAULT_FILTERS,
    );

  const [searchValue, setSearchValue] =
    useState("");

  const [cursorHistory, setCursorHistory] =
    useState<(string | null)[]>([
      null,
    ]);

  const [pageError, setPageError] =
    useState<string>();

  const [selectedPayment, setSelectedPayment] =
    useState<AdminPayment | null>(null);

  const [paymentDetails, setPaymentDetails] =
    useState<AdminPaymentDetails | null>(
      null,
    );

  const [refundPayment, setRefundPayment] =
    useState<AdminPayment | null>(null);

  const [refundDialogOpen, setRefundDialogOpen] =
    useState(false);

  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const [detailsLoading, setDetailsLoading] =
    useState(false);

  const [detailsError, setDetailsError] =
    useState<string>();

  const [isPending, startTransition] =
    useTransition();

  const pageRequestId = useRef(0);
  const detailsRequestId = useRef(0);

  const loadPage = useCallback(
    (
      nextFilters: AdminPaymentFilters,
      cursor: string | null,
      history: (string | null)[],
    ) => {
      const requestId =
        ++pageRequestId.current;

      setPageError(undefined);

      const requestFilters = {
        ...nextFilters,
        cursor,
      };

      startTransition(async () => {
        try {
          const result =
            await loadAdminPaymentsAction(
              requestFilters,
            );

          if (
            pageRequestId.current !==
            requestId
          ) {
            return;
          }

          setPage(result);
          setFilters(requestFilters);
          setCursorHistory(history);
        } catch (error: unknown) {
          if (
            pageRequestId.current !==
            requestId
          ) {
            return;
          }

          setPageError(
            errorMessage(error),
          );
        }
      });
    },
    [],
  );

  const applyFilters = useCallback(
    (
      changes:
        Partial<AdminPaymentFilters>,
    ) => {
      const nextFilters = {
        ...filters,
        ...changes,
        cursor: null,
      };

      loadPage(nextFilters, null, [null]);
    },
    [filters, loadPage],
  );

  const loadDetails = useCallback(
    (payment: AdminPayment) => {
      const requestId =
        ++detailsRequestId.current;

      setDetailsLoading(true);
      setDetailsError(undefined);
      setPaymentDetails(null);

      void loadAdminPaymentDetailsAction(
        payment.id,
      )
        .then((result) => {
          if (
            detailsRequestId.current !==
            requestId
          ) {
            return;
          }

          setPaymentDetails(
            result.details,
          );
        })
        .catch((error: unknown) => {
          if (
            detailsRequestId.current !==
            requestId
          ) {
            return;
          }

          setDetailsError(
            errorMessage(error),
          );
        })
        .finally(() => {
          if (
            detailsRequestId.current ===
            requestId
          ) {
            setDetailsLoading(false);
          }
        });
    },
    [],
  );

  const openPaymentDetails =
    useCallback(
      (payment: AdminPayment) => {
        setSelectedPayment(payment);
        setDrawerOpen(true);
        loadDetails(payment);
      },
      [loadDetails],
    );

  const handleDrawerOpenChange =
    useCallback((open: boolean) => {
      setDrawerOpen(open);

      if (!open) {
        detailsRequestId.current += 1;
        setDetailsLoading(false);
        setDetailsError(undefined);
        setPaymentDetails(null);
        setSelectedPayment(null);
      }
    }, []);

    const openRefundDialog = useCallback(
  (payment: AdminPayment) => {
    if (
      !payment.refundEligibility
        .eligible
    ) {
      return;
    }

    setRefundPayment(payment);
    setRefundDialogOpen(true);
  },
  [],
);

const handleRefundDialogOpenChange =
  useCallback((open: boolean) => {
    setRefundDialogOpen(open);

    if (!open) {
      setRefundPayment(null);
    }
  }, []);

const handleRefundRequested =
  useCallback(
    (payment: AdminPayment) => {
      const requestId =
        ++detailsRequestId.current;

      setDetailsLoading(true);
      setDetailsError(undefined);

      void loadAdminPaymentDetailsAction(
        payment.id,
      )
        .then((result) => {
          if (
            detailsRequestId.current !==
            requestId
          ) {
            return;
          }

          const refreshedPayment =
            result.details.payment;

          setPaymentDetails(
            result.details,
          );

          setSelectedPayment(
            refreshedPayment,
          );

          setPage((currentPage) => ({
            ...currentPage,
            payments:
              currentPage.payments.map(
                (currentPayment) =>
                  currentPayment.id ===
                  refreshedPayment.id
                    ? refreshedPayment
                    : currentPayment,
              ),
          }));
        })
        .catch((caughtError: unknown) => {
          if (
            detailsRequestId.current !==
            requestId
          ) {
            return;
          }

          setDetailsError(
            errorMessage(
              caughtError,
            ),
          );
        })
        .finally(() => {
          if (
            detailsRequestId.current ===
            requestId
          ) {
            setDetailsLoading(false);
          }
        });
    },
    [],
  );

  const columns = useMemo<
    readonly DataTableColumn<AdminPayment>[]
  >(
    () => [
      {
        id: "payment",
        header: "Payment",
        cell: (payment) => (
          <div className="min-w-0">
            <p className="break-all font-mono text-xs font-bold">
              {payment.paymentId}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {formatPaymentType(
                payment.paymentType,
              )}
            </p>
          </div>
        ),
      },
      {
        id: "booking",
        header: "Booking",
        cell: (payment) => (
          <div className="min-w-0">
            <p className="break-words font-semibold">
              {paymentBookingLabel(
                payment,
              )}
            </p>

            {payment.providerRequestId ? (
              <p className="mt-1 max-w-48 truncate font-mono text-xs text-muted-foreground">
                {payment.providerRequestId}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        id: "parties",
        header: "Customer / Provider",
        cell: (payment) => (
          <div className="min-w-0">
            <p className="break-words font-semibold">
              {payment.customerName}
            </p>

            <p className="mt-1 break-words text-xs text-muted-foreground">
              {payment.providerName}
            </p>
          </div>
        ),
      },
      {
        id: "amountInCentavos",
        header: "Amount",
        sortable: true,
        cell: (payment) => (
          <span className="whitespace-nowrap font-bold">
            {payment.formattedAmount}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (payment) => (
          <PaymentStatusBadge
            status={payment.status}
          />
        ),
      },
      {
        id: "createdAt",
        header: "Transaction date",
        sortable: true,
        cell: (payment) => (
          <span className="whitespace-nowrap text-sm">
            {formatPaymentDate(
              payment.paidAt ??
                payment.createdAt,
            )}
          </span>
        ),
      },
      {
        id: "issues",
        header: "Review",
        cell: (payment) =>
          payment.issues.length > 0 ? (
            <PaymentIssueBadges
              issues={payment.issues}
            />
          ) : (
            <span className="text-sm text-muted-foreground">
              No detected issues
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
      ? cursorHistory.at(-2) ??
        FIRST_PAGE_CURSOR
      : null;

  const currentCursor =
    cursorHistory.at(-1) ?? null;

  const clearFilters = () => {
    setSearchValue("");
    loadPage(
      DEFAULT_FILTERS,
      null,
      [null],
    );
  };

  const retryPage = () => {
    loadPage(
      filters,
      currentCursor,
      cursorHistory,
    );
  };

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Payment Monitoring"
        description="Monitor booking payments, PayMongo activity, transaction issues, and refund eligibility."
        actions={
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={isPending}
            onClick={retryPage}
          >
            <RefreshCw
              aria-hidden="true"
              className={
                isPending
                  ? "animate-spin motion-reduce:animate-none"
                  : undefined
              }
            />
            Refresh
          </Button>
        }
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Payment statistics"
      >
        <SummaryCard
          label="Confirmed Payment Volume"
          value={
            page.statistics
              .confirmedVolumeFormatted
          }
          icon={
            <PhilippinePeso className="size-5" />
          }
          loading={isPending}
        />

        <SummaryCard
          label="Pending / Processing"
          value={
            page.statistics
              .pendingProcessingCount
          }
          icon={
            <Clock3 className="size-5" />
          }
          loading={isPending}
        />

        <SummaryCard
          label="Failed / Expired"
          value={
            page.statistics
              .failedExpiredCount
          }
          icon={
            <CircleAlert className="size-5" />
          }
          loading={isPending}
        />

        <SummaryCard
          label="Refunded Amount"
          value={
            page.statistics
              .refundedAmountFormatted
          }
          icon={
            <RotateCcw className="size-5" />
          }
          loading={isPending}
        />
      </section>

      <FilterToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={(search) =>
          applyFilters({search})
        }
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        loading={isPending}
        searchLabel="Search payment records"
        searchPlaceholder="Payment, booking, provider-request, or PayMongo ID"
        filterControls={
          <>
            <FilterSelect
              label="Payment status"
              value={filters.status}
              disabled={isPending}
              onChange={(value) =>
                applyFilters({
                  status:
                    value as AdminPaymentStatusFilter,
                })
              }
            >
              <option value="all">
                All statuses
              </option>
              <option value="pending">
                Pending
              </option>
              <option value="processing">
                Processing
              </option>
              <option value="paid">
                Paid
              </option>
              <option value="failed">
                Failed
              </option>
              <option value="expired">
                Expired
              </option>
              <option value="refunded">
                Refunded
              </option>
            </FilterSelect>

            <FilterSelect
              label="Payment type"
              value={filters.paymentType}
              disabled={isPending}
              onChange={(value) =>
                applyFilters({
                  paymentType:
                    value as AdminPaymentTypeFilter,
                })
              }
            >
              <option value="all">
                All payment types
              </option>
              <option value="provider_down_payment">
                Provider down payment
              </option>
              <option value="provider_balance">
                Provider balance
              </option>
              <option value="refund">
                Refund
              </option>
              <option value="adjustment">
                Adjustment
              </option>
            </FilterSelect>

            <FilterSelect
              label="Transaction date"
              value={filters.date}
              disabled={isPending}
              onChange={(value) =>
                applyFilters({
                  date:
                    value as AdminPaymentDateFilter,
                })
              }
            >
              <option value="all">
                All dates
              </option>
              <option value="today">
                Today
              </option>
              <option value="last_7_days">
                Last 7 days
              </option>
              <option value="last_30_days">
                Last 30 days
              </option>
            </FilterSelect>
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={page.payments}
        getRowId={(payment) =>
          payment.id
        }
        caption="Payment monitoring records"
        loading={isPending}
        error={pageError}
        errorKind="load"
        onRetry={retryPage}
        emptyTitle="No payments found"
        emptyDescription="No payment records match the selected query and filters."
        sort={tableSort}
        onSortChange={(
          sort,
        ) => {
          if (
            sort.columnId !==
              "createdAt" &&
            sort.columnId !==
              "amountInCentavos"
          ) {
            return;
          }

          applyFilters({
            sortField:
              sort.columnId as
                AdminPaymentSortField,
            sortDirection:
              sort.direction as
                AdminPaymentSortDirection,
          });
        }}
        rowActions={(payment) => (
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() =>
              openPaymentDetails(
                payment,
              )
            }
          >
            View details
          </Button>
        )}
        renderMobileRow={(payment) => (
          <PaymentMobileCard
            payment={payment}
            onViewDetails={
              openPaymentDetails
            }
          />
        )}
      />

      <CursorPagination
        previousCursor={previousCursor}
        nextCursor={
          page.hasMore
            ? page.nextCursor
            : null
        }
        loading={isPending}
        pageLabel={`Page ${cursorHistory.length}`}
        onPrevious={() => {
          if (
            cursorHistory.length <= 1
          ) {
            return;
          }

          const nextHistory =
            cursorHistory.slice(0, -1);

          loadPage(
            filters,
            nextHistory.at(-1) ??
              null,
            nextHistory,
          );
        }}
        onNext={(cursor) => {
          const nextHistory = [
            ...cursorHistory,
            cursor,
          ];

          loadPage(
            filters,
            cursor,
            nextHistory,
          );
        }}
      />

      <PaymentDetailsDrawer
        payment={selectedPayment}
        details={paymentDetails}
        open={drawerOpen}
        loading={detailsLoading}
        error={detailsError}
        onOpenChange={
          handleDrawerOpenChange
        }
        onRetry={() => {
          if (selectedPayment) {
            loadDetails(
              selectedPayment,
            );
          }
        }}
        onRequestRefund={
          openRefundDialog
        }
      />

      <PaymentRefundDialog
        payment={refundPayment}
        open={refundDialogOpen}
        onOpenChange={
          handleRefundDialogOpenChange
        }
        onRefundRequested={
          handleRefundRequested
        }
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
    <label className="grid min-w-44 gap-2">
      <span className="text-sm font-bold">
        {label}
      </span>

      <Select
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.currentTarget.value,
          )
        }
      >
        {children}
      </Select>
    </label>
  );
}

function filterLabels(
  filters: AdminPaymentFilters,
): string[] {
  const labels: string[] = [];

  if (filters.status !== "all") {
    labels.push(
      `Status: ${filters.status}`,
    );
  }

  if (filters.paymentType !== "all") {
    labels.push(
      `Type: ${formatPaymentType(
        filters.paymentType,
      )}`,
    );
  }

  if (filters.date !== "all") {
    const dates: Record<
      Exclude<
        AdminPaymentDateFilter,
        "all"
      >,
      string
    > = {
      today: "Today",
      last_7_days: "Last 7 days",
      last_30_days: "Last 30 days",
    };

    labels.push(
      `Date: ${dates[filters.date]}`,
    );
  }

  return labels;
}

function errorMessage(
  error: unknown,
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "Payment records could not be loaded. Please try again.";
}

export {
  PaymentMonitoringClient,
  type PaymentMonitoringClientProps,
};