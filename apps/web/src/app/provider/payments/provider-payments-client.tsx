"use client";

import {
  CircleCheckBig,
  CircleX,
  Clock3,
  Eye,
  FileClock,
  RotateCcw,
} from "lucide-react";
import {usePathname, useRouter} from "next/navigation";
import {useMemo, useState} from "react";

import {
  CursorPagination,
  DataTable,
  SummaryCard,
  type DataTableColumn,
} from "@/components/data";
import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
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
import {ProviderPaymentDetailDrawer} from "./provider-payment-detail-drawer";

type ProviderPaymentsClientProps = {
  initialPage: ProviderPaymentPage;
  initialFilters: ProviderPaymentFilters;
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
}: ProviderPaymentsClientProps) {
  const pathname = usePathname();
  const router = useRouter();
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

  const columns = useMemo<readonly DataTableColumn<ProviderPayment>[]>(() => [
    {
      id: "customer",
      header: "Customer",
      cell: (payment) => (
        <span className="font-semibold">{payment.customerDisplayName}</span>
      ),
    },
    {
      id: "event",
      header: "Event",
      cell: (payment) => (
        <span>
          <span className="block font-medium">{formatLabel(payment.eventType)}</span>
          <span className="text-muted-foreground">{formatDate(payment.eventDate)}</span>
        </span>
      ),
    },
    {
      id: "service",
      header: "Service / Package",
      cell: (payment) => payment.serviceSummary,
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
    setLoading(true);
    setLoadError(null);

    try {
      const result = await loadProviderPaymentsAction(nextFilters);
      setPage(result);
      setFilters(nextFilters);
      setCursorHistory(nextHistory);
      setPageNumber(nextPageNumber);
    } catch {
      setLoadError("Payment activity could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const selectFilter = (status: ProviderPaymentFilter) => {
    if (loading || status === filters.status) return;

    const nextFilters = {...filters, status, cursor: null};
    const query = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
    router.replace(`${pathname}${query}`, {scroll: false});
    void loadPage(nextFilters, [], 1);
  };

  const openPayment = async (paymentId: string) => {
    setSelectedPaymentId(paymentId);
    setSelectedPayment(null);
    setDetailError(null);
    setDetailLoading(true);
    setDrawerOpen(true);

    try {
      setSelectedPayment(await loadProviderPaymentAction(paymentId));
    } catch {
      setDetailError("The latest payment details could not be loaded. Please try again.");
    } finally {
      setDetailLoading(false);
    }
  };

  const failedOrExpiredCount = page.summary.failedPayments.count +
    page.summary.expiredPayments.count;
  const failedOrExpiredAmount = page.summary.failedPayments.totalAmountInCentavos +
    page.summary.expiredPayments.totalAmountInCentavos;
  const previousCursor = cursorHistory.at(-1) ?? null;
  const emptyCopy = getEmptyCopy(filters.status);

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Provider finance"
        title="Booking Payments"
        description="Track customer payments associated with your FEASTA booking requests."
      />

      <aside
        className="rounded-card border border-primary/20 bg-primary-soft/40 px-4 py-3 text-sm text-muted-foreground"
        role="note"
        aria-label="About booking payment amounts"
      >
        Payment amounts shown here are customer payments recorded for your booking requests.
        They do not represent an available provider balance or payout.
      </aside>

      <section
        className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Payment summary"
      >
        <SummaryCard
          label="Confirmed Customer Payments"
          value={formatCentavos(page.summary.confirmedCustomerPayments.totalAmountInCentavos)}
          trend={paymentCountTrend(page.summary.confirmedCustomerPayments.count)}
          icon={<CircleCheckBig className="size-5" />}
        />
        <SummaryCard
          label="Processing Payments"
          value={formatCentavos(page.summary.processingPayments.totalAmountInCentavos)}
          trend={paymentCountTrend(page.summary.processingPayments.count)}
          icon={<Clock3 className="size-5" />}
        />
        <SummaryCard
          label="Failed / Expired"
          value={formatCentavos(failedOrExpiredAmount)}
          trend={paymentCountTrend(failedOrExpiredCount)}
          icon={<CircleX className="size-5" />}
        />
        <SummaryCard
          label="Fully Refunded"
          value={formatCentavos(page.summary.fullyRefundedPayments.totalAmountInCentavos)}
          trend={paymentCountTrend(page.summary.fullyRefundedPayments.count)}
          icon={<RotateCcw className="size-5" />}
        />
      </section>

      <section
        className="flex flex-col gap-2 rounded-card border border-border bg-card px-4 py-3 text-sm shadow-card sm:flex-row sm:items-center sm:justify-between"
        aria-label="Payment record information"
      >
        <p>
          <span className="font-semibold">{page.summary.paymentRecords.toLocaleString("en-PH")}</span>{" "}
          payment {page.summary.paymentRecords === 1 ? "record" : "records"}
        </p>
        <p className="text-muted-foreground">
          Refund awaiting confirmation:{" "}
          <span className="font-semibold text-foreground">
            {page.summary.refundAwaitingConfirmation.toLocaleString("en-PH")}
          </span>
        </p>
      </section>

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
              disabled={loading}
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
            Payment history
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Customer payment records linked to your provider requests.
          </p>
        </div>

        <DataTable
          columns={columns}
          rows={page.payments}
          getRowId={(payment) => payment.paymentId}
          caption="Provider booking payment results"
          loading={loading}
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
        loading={loading}
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
        <div className="col-span-2">
          <dt className="text-muted-foreground">Service / package</dt>
          <dd className="mt-1 font-medium">{payment.serviceSummary}</dd>
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

function paymentCountTrend(count: number) {
  return {
    label: `${count.toLocaleString("en-PH")} ${count === 1 ? "payment" : "payments"}`,
    direction: "neutral" as const,
  };
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
