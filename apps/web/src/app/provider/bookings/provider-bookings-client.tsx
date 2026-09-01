"use client";

import {
  CalendarCheck2,
  CircleDollarSign,
  Clock3,
  Eye,
  ListChecks,
  PlayCircle,
} from "lucide-react";
import Link from "next/link";
import {usePathname, useRouter} from "next/navigation";
import {useMemo, useState} from "react";

import {
  CursorPagination,
  DataTable,
  SummaryCard,
  type DataTableColumn,
} from "@/components/data";
import {feastaToast} from "@/components/feedback/toast";
import {PageHeading} from "@/components/layout/page-heading";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {phpFormatter} from "@/components/shared/price-display";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {
  completeProviderBooking,
  markProviderBookingInProgress,
  markProviderPreparationStarted,
} from "@/lib/provider/bookings/provider-booking-client";
import type {
  ProviderBooking,
  ProviderBookingFilter,
  ProviderBookingFilters,
  ProviderBookingPage,
  ProviderBookingTimeline,
} from "@/lib/provider/bookings/provider-booking-types";
import {
  loadProviderBookingAction,
  loadProviderBookingsAction,
  loadProviderBookingTimelineAction,
} from "./actions";
import {ProviderBookingDetailDrawer} from "./provider-booking-detail-drawer";

type ProviderBookingsClientProps = {
  initialPage: ProviderBookingPage;
  initialFilters: ProviderBookingFilters;
};

type LifecycleAction = "prepare" | "start" | "complete";

const FIRST_PAGE_CURSOR = "__first_provider_booking_page__";

const filterOptions: readonly {
  value: ProviderBookingFilter;
  label: string;
}[] = [
  {value: "all", label: "All"},
  {value: "accepted", label: "Awaiting Payment"},
  {value: "confirmed", label: "Confirmed"},
  {value: "upcoming", label: "Upcoming"},
  {value: "in_progress", label: "In Progress"},
  {value: "completed", label: "Completed"},
  {value: "cancelled", label: "Cancelled"},
];

export function ProviderBookingsClient({
  initialPage,
  initialFilters,
}: ProviderBookingsClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState(initialFilters);
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<ProviderBooking | null>(null);
  const [timeline, setTimeline] = useState<ProviderBookingTimeline | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [preparationEvidence, setPreparationEvidence] = useState("");
  const [preparationKey, setPreparationKey] = useState<string | null>(null);

  const columns = useMemo<readonly DataTableColumn<ProviderBooking>[]>(() => [
    {
      id: "customer",
      header: "Customer",
      cell: (booking) => <span className="font-semibold">{booking.customerDisplayName}</span>,
    },
    {
      id: "event",
      header: "Event",
      cell: (booking) => formatLabel(booking.eventType),
    },
    {
      id: "date",
      header: "Date & Time",
      cell: (booking) => (
        <span>
          <span className="block font-medium">{formatDate(booking.eventDate)}</span>
          <span className="text-muted-foreground">{booking.eventTime ?? "Time not provided"}</span>
        </span>
      ),
    },
    {
      id: "service",
      header: "Service / Package",
      cell: (booking) => booking.serviceSummary,
    },
    {
      id: "amount",
      header: "Amount",
      cell: (booking) => (
        <span className="font-semibold text-primary-strong">
          {phpFormatter.format(booking.acceptedAmount ?? booking.requestedAmount)}
        </span>
      ),
    },
    {
      id: "payment",
      header: "Payment",
      cell: (booking) => booking.paymentStatus
        ? <StatusBadge status={booking.paymentStatus} />
        : <span className="text-muted-foreground">Not recorded</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (booking) => (
        <StatusBadge
          status={booking.providerRequestStatus}
          label={booking.providerRequestStatus === "pending" ? "Pending request" : undefined}
        />
      ),
    },
  ], []);

  const loadPage = async (
    nextFilters: ProviderBookingFilters,
    nextHistory: string[],
    nextPageNumber: number,
  ) => {
    setLoading(true);
    setLoadError(null);

    try {
      const result = await loadProviderBookingsAction(nextFilters);
      setPage(result);
      setFilters(nextFilters);
      setCursorHistory(nextHistory);
      setPageNumber(nextPageNumber);
    } catch {
      setLoadError("Bookings could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const selectFilter = (status: ProviderBookingFilter) => {
    if (loading || status === filters.status) return;

    const nextFilters = {...filters, status, cursor: null};
    const query = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
    router.replace(`${pathname}${query}`, {scroll: false});
    void loadPage(nextFilters, [], 1);
  };

  const openBooking = async (providerRequestId: string) => {
    setSelectedRequestId(providerRequestId);
    setSelectedBooking(null);
    setTimeline(null);
    setDetailError(null);
    setDetailLoading(true);
    setDrawerOpen(true);

    try {
      const [bookingResult, timelineResult] = await Promise.all([
        loadProviderBookingAction(providerRequestId),
        loadProviderBookingTimelineAction(providerRequestId),
      ]);
      setSelectedBooking(bookingResult);
      setTimeline(timelineResult);
    } catch {
      setDetailError("The latest booking details could not be loaded. Please try again.");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshSelectedBooking = async () => {
    if (!selectedRequestId) return;

    const [bookingResult, timelineResult] = await Promise.all([
      loadProviderBookingAction(selectedRequestId),
      loadProviderBookingTimelineAction(selectedRequestId),
    ]);
    setSelectedBooking(bookingResult);
    setTimeline(timelineResult);
  };

  const runLifecycleAction = async () => {
    if (!selectedRequestId || !lifecycleAction) return;

    setActionPending(true);

    try {
      if (lifecycleAction === "prepare") {
        const idempotencyKey = preparationKey ??
          `provider-preparation:${selectedRequestId}:${crypto.randomUUID()}`.slice(0, 200);
        setPreparationKey(idempotencyKey);
        await markProviderPreparationStarted({
          providerRequestId: selectedRequestId,
          evidence: preparationEvidence,
          idempotencyKey,
        });
      } else if (lifecycleAction === "start") {
        await markProviderBookingInProgress(selectedRequestId);
      } else {
        await completeProviderBooking(selectedRequestId);
      }

      const successMessage = lifecycleAction === "prepare"
        ? "Preparation has been recorded."
        : lifecycleAction === "start"
          ? "The event is now in progress."
          : "The booking has been marked completed.";
      setLifecycleAction(null);
      setPreparationEvidence("");
      setPreparationKey(null);
      await Promise.all([
        loadPage(filters, cursorHistory, pageNumber),
        refreshSelectedBooking(),
      ]);
      router.refresh();
      feastaToast.success(successMessage);
    } catch (error) {
      feastaToast.error(
        error instanceof Error
          ? error.message
          : "The booking could not be updated. Please try again.",
      );
    } finally {
      setActionPending(false);
    }
  };

  const emptyCopy = getEmptyCopy(filters.status);
  const previousCursor = cursorHistory.at(-1) ?? null;

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        title="Bookings"
        description="Manage accepted, confirmed, upcoming, in-progress, and completed event bookings."
        actions={(
          <Button asChild variant="secondary" size="compact">
            <Link href="/provider/requests">View pending requests</Link>
          </Button>
        )}
      />

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Booking summary">
        <Link href="/provider/requests" className="rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <SummaryCard
            label="Pending Requests"
            value={page.summary.pending}
            icon={<ListChecks className="size-5" />}
          />
        </Link>
        <SummaryCard
          label="Awaiting Payment"
          value={page.summary.awaitingPayment}
          icon={<CircleDollarSign className="size-5" />}
        />
        <SummaryCard
          label="Confirmed / Upcoming"
          value={page.summary.confirmed}
          trend={{label: `${page.summary.upcoming} upcoming`, direction: "neutral"}}
          icon={<CalendarCheck2 className="size-5" />}
        />
        <SummaryCard
          label="In Progress"
          value={page.summary.inProgress}
          icon={<PlayCircle className="size-5" />}
        />
        <SummaryCard
          label="Completed"
          value={page.summary.completed}
          icon={<Clock3 className="size-5" />}
        />
      </section>

      <section className="rounded-card border border-border bg-card p-3 shadow-card" aria-labelledby="provider-booking-filter-heading">
        <h2 id="provider-booking-filter-heading" className="sr-only">Filter bookings</h2>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Booking status filters">
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

      <DataTable
        columns={columns}
        rows={page.bookings}
        getRowId={(booking) => booking.providerRequestId}
        caption="Provider booking results"
        loading={loading}
        error={loadError ?? undefined}
        onRetry={() => void loadPage(filters, cursorHistory, pageNumber)}
        emptyTitle={emptyCopy.title}
        emptyDescription={emptyCopy.description}
        rowActionsLabel="View booking"
        rowActions={(booking) => (
          <Button
            variant="ghost"
            size="compact"
            aria-label={`View booking for ${booking.customerDisplayName}`}
            onClick={() => void openBooking(booking.providerRequestId)}
          >
            <Eye aria-hidden="true" className="size-4" />
            View
          </Button>
        )}
        renderMobileRow={(booking) => (
          <BookingMobileCard booking={booking} onView={() => void openBooking(booking.providerRequestId)} />
        )}
      />

      <CursorPagination
        previousCursor={previousCursor}
        nextCursor={page.nextCursor}
        loading={loading}
        pageLabel={`Page ${pageNumber}`}
        onPrevious={(cursor) => {
          const nextHistory = cursorHistory.slice(0, -1);
          const nextCursor = cursor === FIRST_PAGE_CURSOR ? null : cursor;
          void loadPage({...filters, cursor: nextCursor}, nextHistory, Math.max(1, pageNumber - 1));
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

      <ProviderBookingDetailDrawer
        booking={selectedBooking}
        timeline={timeline}
        open={drawerOpen}
        loading={detailLoading}
        error={detailError}
        actionPending={actionPending}
        onOpenChange={(open) => {
          if (!actionPending) {
            setDrawerOpen(open);
            if (!open) {
              setSelectedRequestId(null);
              setSelectedBooking(null);
              setTimeline(null);
              setDetailError(null);
            }
          }
        }}
        onRetry={() => selectedRequestId && void openBooking(selectedRequestId)}
        onStart={() => setLifecycleAction("start")}
        onComplete={() => setLifecycleAction("complete")}
        onPreparationStarted={() => setLifecycleAction("prepare")}
      />

      <ConfirmationDialog
        open={lifecycleAction !== null}
        onOpenChange={(open) => {
          if (!open && !actionPending) {
            setLifecycleAction(null);
            setPreparationEvidence("");
            setPreparationKey(null);
          }
        }}
        title={lifecycleAction === "prepare"
          ? "Record preparation started?"
          : lifecycleAction === "start" ? "Start this event?" : "Mark this event as completed?"}
        description={lifecycleAction === "prepare"
          ? "This forward-only factual stage can affect the frozen policy calculation if the Customer later requests cancellation."
          : lifecycleAction === "start"
            ? "This booking will be marked as in progress and the customer will be notified."
            : "This confirms that your service for this booking has been completed."}
        confirmLabel={lifecycleAction === "prepare" ? "Record preparation" : lifecycleAction === "start" ? "Start Event" : "Mark Completed"}
        loadingLabel={lifecycleAction === "prepare" ? "Recording preparation" : lifecycleAction === "start" ? "Starting event" : "Completing booking"}
        loading={actionPending}
        confirmDisabled={lifecycleAction === "prepare" && preparationEvidence.trim().length > 0 && preparationEvidence.trim().length < 3}
        onConfirm={runLifecycleAction}
      >
        {lifecycleAction === "prepare" ? (
          <label className="grid gap-2" htmlFor="provider-preparation-evidence">
            <span className="text-sm font-bold">Factual preparation note (optional)</span>
            <textarea
              id="provider-preparation-evidence"
              rows={4}
              maxLength={500}
              disabled={actionPending}
              value={preparationEvidence}
              placeholder="For example: ingredient purchasing began."
              className="w-full resize-y rounded-lg border border-input bg-card px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setPreparationEvidence(event.currentTarget.value)}
            />
            <span className="text-sm text-muted-foreground">Facts only. This does not set or approve a refund.</span>
          </label>
        ) : null}
      </ConfirmationDialog>
    </div>
  );
}

function BookingMobileCard({
  booking,
  onView,
}: {
  booking: ProviderBooking;
  onView: () => void;
}) {
  return (
    <article className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-bold">{booking.customerDisplayName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{formatLabel(booking.eventType)}</p>
        </div>
        <StatusBadge status={booking.providerRequestStatus} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Date & time</dt>
          <dd className="mt-1 font-medium">{formatDate(booking.eventDate)} · {booking.eventTime ?? "TBA"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Amount</dt>
          <dd className="mt-1 font-medium">{phpFormatter.format(booking.acceptedAmount ?? booking.requestedAmount)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Service / package</dt>
          <dd className="mt-1 font-medium">{booking.serviceSummary}</dd>
        </div>
      </dl>
      <Button variant="secondary" size="compact" onClick={onView} aria-label={`View booking for ${booking.customerDisplayName}`}>
        <Eye aria-hidden="true" className="size-4" />
        View booking
      </Button>
    </article>
  );
}

function getEmptyCopy(status: ProviderBookingFilter): {title: string; description: string} {
  if (status === "all") {
    return {
      title: "No bookings yet",
      description: "Accepted and confirmed bookings will appear here after you process customer requests.",
    };
  }

  const label = filterOptions.find((option) => option.value === status)?.label.toLowerCase() ?? "matching";
  return {
    title: `No ${label} bookings`,
    description: "No bookings currently match this status.",
  };
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
