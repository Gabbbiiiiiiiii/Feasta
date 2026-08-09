"use client";

import {Banknote, CircleCheckBig, Clock3, CreditCard, ReceiptText} from "lucide-react";
import {useEffect, useMemo, useState, useTransition} from "react";

import {loadCustomerPaymentsAction} from "@/app/customer/payments/actions";
import {CursorPagination} from "@/components/data/cursor-pagination";
import {FilterToolbar} from "@/components/data/filter-toolbar";
import {SummaryCard} from "@/components/data/summary-card";
import {ApplicationEmptyState} from "@/components/feedback/application-states";
import {feastaToast} from "@/components/feedback/toast";
import {PageHeading} from "@/components/layout/page-heading";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {StatusBadge, humanize} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {
  createCustomerPaymentCheckout,
  redirectToCustomerPaymentCheckout,
} from "@/lib/customer/payments/customer-payment-client";
import type {
  CustomerPayment,
  CustomerPaymentPage,
  CustomerPaymentStatusFilter,
} from "@/lib/customer/payments/customer-payment-types";

const PAGE_SIZE = 10;

export function CustomerPaymentsClient({initialPage}: {initialPage: CustomerPaymentPage}) {
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [status, setStatus] = useState<CustomerPaymentStatusFilter>("all");
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [selectedPayment, setSelectedPayment] = useState<CustomerPayment | null>(null);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("payment");
    if (result === "success") {
      feastaToast.success("Payment received. Its status will update after PayMongo confirms it.");
    } else if (result === "cancelled" || result === "canceled") {
      feastaToast.info("Checkout was cancelled. No payment was completed.");
    }
  }, []);

  const activeFilters = useMemo(
    () => [
      submittedSearch ? `Search: ${submittedSearch}` : "",
      status !== "all" ? `Status: ${humanize(status)}` : "",
    ].filter(Boolean),
    [status, submittedSearch],
  );

  function load(nextSearch: string, nextStatus: CustomerPaymentStatusFilter, cursor: string | null, history: (string | null)[]) {
    startTransition(async () => {
      try {
        const nextPage = await loadCustomerPaymentsAction({
          search: nextSearch,
          status: nextStatus,
          pageSize: PAGE_SIZE,
          cursor,
        });
        setPage(nextPage);
        setCursorHistory(history);
      } catch {
        feastaToast.error("Your payments could not be loaded. Please try again.");
      }
    });
  }

  function applySearch(value: string) {
    setSubmittedSearch(value);
    load(value, status, null, [null]);
  }

  function changeStatus(value: CustomerPaymentStatusFilter) {
    setStatus(value);
    load(submittedSearch, value, null, [null]);
  }

  function clearFilters() {
    setSearch("");
    setSubmittedSearch("");
    setStatus("all");
    load("", "all", null, [null]);
  }

  async function beginCheckout() {
    if (!selectedPayment) return;
    setCheckoutPending(true);
    try {
      const result = await createCustomerPaymentCheckout(selectedPayment.providerRequestId);
      redirectToCustomerPaymentCheckout(result);
    } catch (error: unknown) {
      feastaToast.error(error instanceof Error ? error.message : "Checkout could not be started.");
      setCheckoutPending(false);
      setSelectedPayment(null);
    }
  }

  const currentIndex = cursorHistory.length - 1;
  const previousCursor = currentIndex > 0 ? cursorHistory[currentIndex - 1] ?? "__first__" : null;

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="My payments"
        title="Payments"
        description="Track booking payments and continue a secure PayMongo checkout when payment is due."
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Payment summary">
        <SummaryCard label="Awaiting payment" value={page.statistics.awaitingPayment} icon={<Clock3 className="size-5" />} />
        <SummaryCard label="Processing" value={page.statistics.processing} icon={<CreditCard className="size-5" />} />
        <SummaryCard label="Paid" value={page.statistics.paid} icon={<CircleCheckBig className="size-5" />} />
        <SummaryCard label="Total paid" value={page.statistics.totalPaidFormatted} icon={<Banknote className="size-5" />} />
      </section>

      <FilterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={applySearch}
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        searchLabel="Search payments by payment or booking ID"
        searchPlaceholder="Payment or booking ID"
        loading={isPending}
        filterControls={(
          <label className="grid gap-2 text-sm font-semibold">
            Payment status
            <Select
              aria-label="Payment status"
              value={status}
              disabled={isPending}
              onChange={(event) => changeStatus(event.currentTarget.value as CustomerPaymentStatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="expired">Expired</option>
              <option value="refunded">Refunded</option>
            </Select>
          </label>
        )}
      />

      {page.payments.length === 0 ? (
        <ApplicationEmptyState kind={activeFilters.length ? "search" : "payments"} />
      ) : (
        <section className="grid gap-4" aria-label="Payment records" aria-busy={isPending}>
          {page.payments.map((payment) => (
            <PaymentCard key={payment.id} payment={payment} disabled={isPending} onCheckout={setSelectedPayment} />
          ))}
        </section>
      )}

      <CursorPagination
        previousCursor={previousCursor}
        nextCursor={page.nextCursor}
        loading={isPending}
        pageLabel={`Page ${currentIndex + 1}`}
        onPrevious={() => {
          const history = cursorHistory.slice(0, -1);
          load(submittedSearch, status, history.at(-1) ?? null, history);
        }}
        onNext={(cursor) => load(submittedSearch, status, cursor, [...cursorHistory, cursor])}
      />

      <ConfirmationDialog
        open={selectedPayment !== null}
        onOpenChange={(open) => !open && setSelectedPayment(null)}
        title="Continue to secure checkout?"
        description={selectedPayment ? `You will continue to PayMongo to pay ${selectedPayment.formattedAmount} for ${selectedPayment.providerName}.` : "Continue to PayMongo checkout."}
        confirmLabel="Continue to PayMongo"
        loadingLabel="Starting checkout"
        loading={checkoutPending}
        onConfirm={beginCheckout}
      />
    </div>
  );
}

function PaymentCard({payment, disabled, onCheckout}: {
  payment: CustomerPayment;
  disabled: boolean;
  onCheckout: (payment: CustomerPayment) => void;
}) {
  return (
    <article className="grid min-w-0 gap-4 rounded-card border border-border bg-card p-4 shadow-card sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ReceiptText aria-hidden="true" className="size-5 shrink-0 text-primary-strong" />
          <h2 className="min-w-0 break-words text-lg font-black">{payment.providerName}</h2>
          <StatusBadge status={payment.status} />
        </div>
        <dl className="grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <PaymentDetail label="Amount" value={payment.formattedAmount} strong />
          <PaymentDetail label="Booking" value={payment.bookingCode || payment.bookingId} />
          <PaymentDetail
            label="Payment type"
            value={paymentTypeLabel(payment.paymentType)}
          />
          <PaymentDetail label="Created" value={formatDate(payment.createdAt)} />
        </dl>
      </div>
      {payment.canStartCheckout ? (
        <Button className="w-full lg:w-auto" disabled={disabled} onClick={() => onCheckout(payment)}>
          <CreditCard aria-hidden="true" className="size-5" />
          Pay now
        </Button>
      ) : null}
    </article>
  );
}

function PaymentDetail({label, value, strong = false}: {label: string; value: string; strong?: boolean}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words ${strong ? "font-black text-foreground" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}
function paymentTypeLabel(
  value: CustomerPayment["paymentType"],
): string {
  switch (value) {
    case "provider_down_payment":
      return "Booking down payment";

    case "provider_balance":
      return "Remaining booking balance";

    case "refund":
      return "Refund";

    case "adjustment":
      return "Payment adjustment";

    default:
      return "Booking payment";
  }
}