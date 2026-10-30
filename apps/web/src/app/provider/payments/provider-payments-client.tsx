"use client";

import {
  Eye,
  FileClock,
} from "lucide-react";

import {useEffect, useMemo, useRef, useState} from "react";

import {
  CursorPagination,
  DataTable,
  type DataTableColumn,
} from "@/components/data";
import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import type {
  ProviderFinanceOverview,
} from "@/lib/provider/payments/provider-finance-types";
import type {
  ProviderPayment,
  ProviderPaymentDetail,
  ProviderPaymentFilter,
  ProviderPaymentFilters,
  ProviderPaymentPage,
} from "@/lib/provider/payments/provider-payment-types";

import {
  loadProviderPaymentAction,
  loadProviderPaymentsAction,
} from "./actions";
import {ProviderFinancePanel} from "./provider-finance-panel";
import {ProviderPaymentDetailDrawer} from "./provider-payment-detail-drawer";

type ProviderPaymentsClientProps = {
  initialPage: ProviderPaymentPage;
  initialFilters: ProviderPaymentFilters;
  initialFinance?: ProviderFinanceOverview;
};

const EMPTY_PROVIDER_FINANCE: ProviderFinanceOverview = {
  payoutAccount: {
    setupStatus: "not_started",
    linkedAccountType: null,
    invitationStatus: null,
    activationStatus: null,
    payoutReady: false,
    relationshipStatus: null,
    settlementTransportMode: "disabled",
    settlementTransportReady: false,
    paymongoAccountId: null,
    childAccountPresent: false,
    activationProfileComplete: false,
    identityVerificationStatus: null,
    gatewayLastStatusCode: null,
    updatedAt: null,
  },
  earningSummary: {
    pendingAmountInCentavos: 0,
    availableAmountInCentavos: 0,
    paidAmountInCentavos: 0,
    reversedAmountInCentavos: 0,
  },
  earnings: [],
  settlementSummary: {
    awaitingAvailabilityAmountInCentavos: 0,
    readyAmountInCentavos: 0,
    reservedAmountInCentavos: 0,
    paidOutAmountInCentavos: 0,
    reconciliationRequiredCount: 0,
  },
  settlements: [],
};

const FIRST_PAGE_CURSOR = "__first_provider_payment_page__";

const filterOptions: readonly {
  value: ProviderPaymentFilter;
  label: string;
}[] = [
  {value: "all", label: "All"},
  {value: "pending", label: "Pending"},
  {value: "processing", label: "Processing"},
  {value: "paid", label: "Paid"},
  {value: "failed", label: "Failed"},
  {value: "expired", label: "Expired"},
  {value: "refunded", label: "Refunded"},
];

export function ProviderPaymentsClient({
  initialPage,
  initialFilters,
  initialFinance = EMPTY_PROVIDER_FINANCE,
}: ProviderPaymentsClientProps) {

  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState(initialFilters);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<ProviderPaymentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  useEffect(() => () => { detailRequestId.current += 1; listRequestId.current += 1; }, []);

  const columns = useMemo<readonly DataTableColumn<ProviderPayment>[]>(() => [
    {
      id: "customer",
      header: "Customer / Event",
      cell: (payment) => <span><span className="block font-semibold">{payment.customerDisplayName}</span><span className="text-muted-foreground">{formatLabel(payment.eventType)} / {formatDate(payment.eventDate)}</span></span>,
    },
    {
      id: "amount",
      header: "Payment amount",
      cell: (payment) => (
        <span className="font-semibold text-primary-strong">
          {formatCentavos(payment.amountInCentavos)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Payment status",
      cell: (payment) => <PaymentStatus payment={payment} />,
    },
    {
      id: "activity",
      header: "Activity date",
      cell: (payment) => (
        <span>
          <span className="block font-medium">{activityLabel(payment)}</span>
          <span className="text-muted-foreground">
            {formatDateTime(activityDate(payment))}
          </span>
        </span>
      ),
    },
  ], []);

  const loadPage = async (
    nextFilters: ProviderPaymentFilters,
    nextHistory: string[],
    nextPageNumber: number,
  ) => {
    const requestId = ++listRequestId.current;
    setFilters(nextFilters);
    setCursorHistory(nextHistory);
    setPageNumber(nextPageNumber);
    setLoading(true);
    setLoadError(null);

    try {
      const result = await loadProviderPaymentsAction(nextFilters);
      if (requestId !== listRequestId.current) return;
      setPage(current => ({...current, ...result, summary: current.summary}));
      setFilters(nextFilters);
      setCursorHistory(nextHistory);
      setPageNumber(nextPageNumber);
    } catch {
      if (requestId !== listRequestId.current) return;
      setLoadError("Payment activity could not be loaded. Please try again.");
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  };

  const selectFilter = (status: ProviderPaymentFilter) => {
    if (status === filters.status) return;
    const url = new URL(window.location.href);
    if (status === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", status);
    window.history.pushState(null, "", url);
    void loadPage({...filters, status, cursor: null}, [], 1);
  };

  useEffect(() => {
    const restore = () => {
      const requested = new URL(window.location.href).searchParams.get("status");
      const status = filterOptions.find(option => option.value === requested)?.value ?? "all";
      void loadPage({status, pageSize: initialFilters.pageSize, cursor: null}, [], 1);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [initialFilters.pageSize]);

  const openPayment = async (paymentId: string) => {
    const requestId = ++detailRequestId.current;
    setSelectedPaymentId(paymentId);
    setSelectedPayment(null);
    setDetailError(null);
    setDetailLoading(true);
    setDrawerOpen(true);

    try {
      const result = await loadProviderPaymentAction(paymentId);
      if (requestId !== detailRequestId.current) return;
      setSelectedPayment(result);
    } catch {
      if (requestId !== detailRequestId.current) return;
      setDetailError("The latest payment details could not be loaded. Please try again.");
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  };

  const previousCursor = cursorHistory.at(-1) ?? null;
  const emptyCopy = getEmptyCopy(filters.status);

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Provider finance"
        title="Payments"
        description="Track customer payments, manage your earnings, and check payout status."
      />

      <ProviderFinancePanel
        initialFinance={initialFinance}
      />

      {page.summary.refundAwaitingConfirmation > 0 ? (
        <p role="status" aria-label="Refunds awaiting confirmation" className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-sm">
          {page.summary.refundAwaitingConfirmation.toLocaleString("en-PH")}{" "}
          {page.summary.refundAwaitingConfirmation === 1 ? "refund is" : "refunds are"} awaiting confirmation.
        </p>
      ) : null}

      <p className="text-sm text-muted-foreground">Customer payments are separate from earnings and payouts. Reload the page to refresh all financial summaries.</p>

      <section
        className="rounded-card border border-border bg-card p-3 shadow-card"
        aria-labelledby="provider-payment-filter-heading"
      >
        <h2 id="provider-payment-filter-heading" className="sr-only">
          Filter booking payments
        </h2>
        <div
          className="flex max-w-full gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="Payment status filters"
        >
          {filterOptions.map((option) => (
            <Button
              key={option.value}
              variant={filters.status === option.value ? "primary" : "secondary"}
              size="compact"
              className="shrink-0"
              aria-pressed={filters.status === option.value}
              onClick={() => selectFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-4" aria-labelledby="payment-history-heading">
        <div>
          <h2 id="payment-history-heading" className="text-xl font-bold">
            Customer Payments
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer payment records linked to your provider requests.
          </p>
        </div>

        <p role="status" className={loading ? "sr-only" : "text-sm text-muted-foreground"}>{loading ? "" : loadError ? "Payment results unavailable." : `${page.payments.length} payments shown.`}</p>
        <DataTable
          columns={columns}
          rows={loading || loadError ? [] : page.payments}
          getRowId={(payment) => payment.paymentId}
          caption="Provider booking payment results"
          updating={loading}
          error={loadError ?? undefined}
          onRetry={() => void loadPage(filters, cursorHistory, pageNumber)}
          emptyTitle={emptyCopy.title}
          emptyDescription={emptyCopy.description}
          rowActionsLabel="View payment"
          rowActions={(payment) => (
            <Button
              variant="ghost"
              size="compact"
              aria-label={`View payment for ${payment.customerDisplayName}`}
              onClick={() => void openPayment(payment.paymentId)}
            >
              <Eye aria-hidden="true" className="size-4" />
              View
            </Button>
          )}
          renderMobileRow={(payment) => (
            <PaymentMobileCard
              payment={payment}
              onView={() => void openPayment(payment.paymentId)}
            />
          )}
        />
      </section>

      <CursorPagination
        previousCursor={previousCursor}
        nextCursor={page.nextCursor}
        loading={loading || loadError !== null}
        pageLabel={`Page ${pageNumber}`}
        onPrevious={(cursor) => {
          const nextHistory = cursorHistory.slice(0, -1);
          const nextCursor = cursor === FIRST_PAGE_CURSOR ? null : cursor;
          void loadPage(
            {...filters, cursor: nextCursor},
            nextHistory,
            Math.max(1, pageNumber - 1),
          );
        }}
        onNext={(cursor) => {
          const currentCursor = filters.cursor ?? FIRST_PAGE_CURSOR;
          void loadPage(
            {...filters, cursor},
            [...cursorHistory, currentCursor],
            pageNumber + 1,
          );
        }}
      />

      <ProviderPaymentDetailDrawer
        detail={selectedPayment}
        open={drawerOpen}
        loading={detailLoading}
        error={detailError}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            detailRequestId.current += 1;
            setDetailLoading(false);
            setSelectedPaymentId(null);
            setSelectedPayment(null);
            setDetailError(null);
          }
        }}
        onRetry={() => selectedPaymentId && void openPayment(selectedPaymentId)}
      />
    </div>
  );
}

function PaymentStatus({payment}: {payment: ProviderPayment}) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge status={payment.status} />
      {payment.status === "paid" && payment.refundStatus === "requested" ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
          <FileClock aria-hidden="true" className="size-3.5" />
          Refund pending
        </span>
      ) : null}
    </span>
  );
}

function PaymentMobileCard({
  payment,
  onView,
}: {
  payment: ProviderPayment;
  onView: () => void;
}) {
  return (
    <article className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{payment.customerDisplayName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatLabel(payment.eventType)}
          </p>
        </div>
        <PaymentStatus payment={payment} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Payment amount</dt>
          <dd className="mt-1 font-semibold text-primary-strong">
            {formatCentavos(payment.amountInCentavos)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Activity</dt>
          <dd className="mt-1 font-medium">{formatDateTime(activityDate(payment))}</dd>
        </div>
      </dl>
      <Button
        variant="secondary"
        size="compact"
        onClick={onView}
        aria-label={`View payment for ${payment.customerDisplayName}`}
      >
        <Eye aria-hidden="true" className="size-4" />
        View payment
      </Button>
    </article>
  );
}

function getEmptyCopy(status: ProviderPaymentFilter) {
  if (status === "all") {
    return {
      title: "No payment activity yet",
      description: "Customer payment activity for your booking requests will appear here.",
    };
  }

  return {
    title: "No payments match this status",
    description: `No ${formatLabel(status).toLowerCase()} payment records are available.`,
  };
}

function activityDate(payment: ProviderPayment): string {
  if (payment.status === "paid" && payment.paidAt) return payment.paidAt;
  if (payment.status === "failed" && payment.failedAt) return payment.failedAt;
  if (payment.status === "expired" && payment.expiredAt) return payment.expiredAt;
  if (payment.status === "refunded" && payment.refundedAt) return payment.refundedAt;
  return payment.updatedAt ?? payment.createdAt;
}

function activityLabel(payment: ProviderPayment): string {
  if (payment.status === "paid" && payment.paidAt) return "Paid";
  if (payment.status === "failed" && payment.failedAt) return "Failed";
  if (payment.status === "expired" && payment.expiredAt) return "Expired";
  if (payment.status === "refunded" && payment.refundedAt) return "Refunded";
  return payment.updatedAt ? "Updated" : "Created";
}

function formatCentavos(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}
