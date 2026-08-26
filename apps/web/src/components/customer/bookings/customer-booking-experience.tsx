"use client";

import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  PhilippinePeso,
  X,
} from "lucide-react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {loadCustomerBookingsAction} from "@/app/customer/bookings/actions";
import {
  BOOKING_STATUS_OPTIONS,
  bookingNextStep,
  bookingStatusLabel,
  boundedText,
  formatBookingDate,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,
  providerResponseSummary,
} from "@/components/customer/bookings/booking-formatters";
import {CustomerBookingDetailsDrawer} from "@/components/customer/bookings/customer-booking-details-drawer";
import {CustomerBookingMobileCard} from "@/components/customer/bookings/customer-booking-mobile-card";
import {CursorPagination} from "@/components/data/cursor-pagination";
import {DataTable, type DataTableColumn} from "@/components/data/data-table";
import {FilterToolbar} from "@/components/data/filter-toolbar";
import {SummaryCard} from "@/components/data/summary-card";
import {PageHeading} from "@/components/layout/page-heading";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import type {
  CustomerBooking,
  CustomerBookingFilters,
  CustomerBookingPage,
  CustomerBookingStatusFilter,
} from "@/lib/customer/bookings/customer-booking-types";

type CustomerBookingExperienceProps = {
  initialPage: CustomerBookingPage;
};

const FIRST_PAGE_CURSOR = "__customer_bookings_first_page__";
const MAX_SEARCH_LENGTH = 160;

const initialFilters: CustomerBookingFilters = {
  search: "",
  status: "all",
  pageSize: 10,
  cursor: null,
};


function CustomerBookingExperience({initialPage}: CustomerBookingExperienceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const submittedBookingId =
    normalizeSubmittedBookingId(
      searchParams.get("submitted"),
    );

  const submittedBooking =
    submittedBookingId
      ? initialPage.bookings.find(
          (booking) =>
            booking.id ===
              submittedBookingId ||
            booking.bookingId ===
              submittedBookingId,
        ) ?? null
      : null;
  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState<CustomerBookingFilters>(initialFilters);
  const [searchValue, setSearchValue] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [selectedBooking, setSelectedBooking] = useState<CustomerBooking | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);

  const openBooking = useCallback((booking: CustomerBooking) => {
      setSelectedBooking(booking);
      setDrawerOpen(true);
    }, []);

    const dismissSubmittedState =
    useCallback(() => {
      router.replace(
        "/customer/bookings",
        {
          scroll: false,
        },
      );
    }, [router]);

  const openSubmittedBooking =
    useCallback(() => {
      if (!submittedBooking) {
        return;
      }

      setSelectedBooking(
        submittedBooking,
      );

      setDrawerOpen(true);
    }, [submittedBooking]);

  const columns = useMemo<readonly DataTableColumn<CustomerBooking>[]>(() => [
    {
      id: "booking",
      header: "Booking",
      cell: (booking) => (
        <div className="min-w-[10rem]">
          <p className="font-bold text-primary-strong">
            {boundedText(booking.bookingCode, "Booking", 80)}
          </p>
          <p className="mt-1 break-words text-muted-foreground">
            {boundedText(booking.eventType, "Unspecified event", 100)}
          </p>
        </div>
      ),
    },
    {
      id: "schedule",
      header: "Event schedule",
      cell: (booking) => (
        <div className="min-w-[10rem]">
          <p className="font-semibold">{formatBookingDate(booking.eventDate)}</p>
          <p className="mt-1 text-muted-foreground">
            {formatBookingTimeRange(booking.eventTime, booking.eventEndTime)}
          </p>
        </div>
      ),
    },
    {
      id: "provider-responses",
      header: "Provider responses",
      cell: (booking) => (
        <div className="min-w-[11rem]">
          <p className="break-words font-semibold">
            {providerResponseSummary(booking)}
          </p>
          <p className="mt-1 text-muted-foreground">Open details for each provider.</p>
        </div>
      ),
    },
    {
      id: "party",
      header: "Party",
      cell: (booking) => (
        <div className="min-w-[8rem]">
          <p className="font-semibold">{formatCount(booking.guestCount)} guests</p>
          <p className="mt-1 text-muted-foreground">
            {formatCount(booking.providerRequestCount)} provider {booking.providerRequestCount === 1 ? "request" : "requests"}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status & next step",
      cell: (booking) => (
        <div className="grid min-w-[13rem] justify-items-start gap-2">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={booking.status} label={bookingStatusLabel(booking.status)} />
          </div>
          <p className="max-w-[16rem] text-xs leading-5 text-muted-foreground">
            {bookingNextStep(booking)}
          </p>
        </div>
      ),
    },
    {
      id: "total",
      header: "Event estimate",
      cell: (booking) => (
        <div className="min-w-[9rem]">
          <p className="font-black">{formatCurrency(booking.estimatedEventTotal)}</p>
          <p className="mt-1 text-muted-foreground">Payments shown per request</p>
        </div>
      ),
    },
  ], []);

  const loadPage = useCallback((
    nextFilters: CustomerBookingFilters,
    options?: {nextHistory?: string[]; nextPageNumber?: number},
  ) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setError(undefined);

    startTransition(async () => {
      try {
        const result = await loadCustomerBookingsAction(nextFilters);
        if (requestId !== requestIdRef.current) return;

        setPage((currentPage) => ({
          ...result,
          statistics: currentPage.statistics,
        }));
        setFilters(nextFilters);
        if (options?.nextHistory) setCursorHistory(options.nextHistory);
        if (options?.nextPageNumber !== undefined) setPageNumber(options.nextPageNumber);
      } catch {
        if (requestId !== requestIdRef.current) return;
        setError("Your booking history could not be updated. Please try again.");
      }
    });
  }, []);

  const updateFilters = useCallback((updates: Partial<CustomerBookingFilters>) => {
    const nextFilters: CustomerBookingFilters = {
      ...filters,
      ...updates,
      cursor: null,
    };

    loadPage(nextFilters, {nextHistory: [], nextPageNumber: 1});
  }, [filters, loadPage]);

  const clearFilters = useCallback(() => {
    setSearchValue("");
    loadPage(initialFilters, {nextHistory: [], nextPageNumber: 1});
  }, [loadPage]);

  const clearSearch = useCallback(() => {
    setSearchValue("");
    updateFilters({search: ""});
  }, [updateFilters]);

  const handleNextPage = useCallback((cursor: string) => {
    const currentCursor = filters.cursor ?? FIRST_PAGE_CURSOR;
    loadPage(
      {...filters, cursor},
      {
        nextHistory: [...cursorHistory, currentCursor],
        nextPageNumber: pageNumber + 1,
      },
    );
  }, [cursorHistory, filters, loadPage, pageNumber]);

  const handlePreviousPage = useCallback((cursor: string) => {
    loadPage(
      {...filters, cursor: cursor === FIRST_PAGE_CURSOR ? null : cursor},
      {
        nextHistory: cursorHistory.slice(0, -1),
        nextPageNumber: Math.max(1, pageNumber - 1),
      },
    );
  }, [cursorHistory, filters, loadPage, pageNumber]);

  const activeFilters = [
    filters.search ? `Exact booking: ${boundedText(filters.search, "", 80)}` : "",
    filters.status !== "all" ? `Status: ${bookingStatusLabel(filters.status)}` : "",
  ].filter(Boolean);
  const previousCursor = cursorHistory.at(-1) ?? null;
  const emptyState = filters.search ? {
    title: "No booking found in your account",
    description:
      "Check the exact booking code or booking ID, then search again.",
  } : filters.status !== "all" ? {
    title: "No bookings match this status",
    description:
      "Choose another status or show all bookings.",
  } : {
    title: "No bookings yet",
    description:
      "Your submitted event requests will appear here.",
  };

  return (
    <div className="grid min-w-0 gap-6">
      <p className="sr-only" role="status" aria-live="polite">
        {isPending ?
          "Updating your booking history." :
          `${formatCount(page.bookings.length)} bookings shown on page ${pageNumber}.`}
      </p>
      <PageHeading
        eyebrow="Your celebrations"
        title="Bookings"
        description="Track provider responses, event schedules, booking totals, and payment readiness in one place."
      />

      {submittedBookingId ? (
        <section
          aria-labelledby="submitted-booking-title"
          className="relative overflow-hidden rounded-[24px] border border-success/20 bg-success/[0.055] p-5 shadow-[0_8px_28px_rgb(43_33_29/0.035)] sm:p-6"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 size-48 rounded-full bg-success/[0.07] blur-3xl"
          />

          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success text-success-foreground shadow-sm">
                <CheckCircle2
                  aria-hidden="true"
                  className="size-5"
                />
              </span>

              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-success">
                  Booking submitted
                </p>

                <h2
                  id="submitted-booking-title"
                  className="mt-1.5 text-xl font-extrabold tracking-[-0.025em] text-foreground sm:text-2xl"
                >
                  Your request is awaiting provider review.
                </h2>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-feasta-text-secondary">
                  FEASTA sent your event request
                  to the selected provider
                  {submittedBooking &&
                  submittedBooking.providerRequestCount >
                    1
                    ? "s"
                    : ""}
                  . You&apos;ll see the booking
                  status change as each provider
                  reviews the request.
                </p>

                {submittedBooking ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-success/15 bg-white px-3 py-1.5 text-xs font-bold text-foreground">
                      {
                        submittedBooking.bookingCode
                      }
                    </span>

                    <span className="rounded-full border border-success/15 bg-white px-3 py-1.5 text-xs font-semibold text-feasta-text-secondary">
                      {bookingStatusLabel(
                        submittedBooking.status,
                      )}
                    </span>

                    {submittedBooking
                      .pendingProviderRequestCount >
                    0 ? (
                      <span className="rounded-full border border-success/15 bg-white px-3 py-1.5 text-xs font-semibold text-feasta-text-secondary">
                        {
                          submittedBooking
                            .pendingProviderRequestCount
                        }{" "}
                        {submittedBooking
                          .pendingProviderRequestCount ===
                        1
                          ? "provider response"
                          : "provider responses"}{" "}
                        pending
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 break-all rounded-[12px] bg-white/80 px-3 py-2 text-xs font-semibold text-feasta-text-secondary">
                    Booking reference:{" "}
                    {submittedBookingId}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              aria-label="Dismiss booking submitted message"
              onClick={
                dismissSubmittedState
              }
              className="absolute right-0 top-0 grid size-10 place-items-center rounded-full text-feasta-text-tertiary transition-colors hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X
                aria-hidden="true"
                className="size-4"
              />
            </button>
          </div>

          <div className="relative mt-5 flex flex-col gap-3 border-t border-success/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-bold text-foreground">
                What happens next?
              </p>

              <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">
                Providers review availability,
                capacity, and the services you
                requested. Payment is not required
                until the applicable provider
                requests have been accepted.
              </p>
            </div>

            {submittedBooking ? (
              <Button
                type="button"
                variant="secondary"
                size="compact"
                onClick={
                  openSubmittedBooking
                }
                className="shrink-0"
              >
                <Eye
                  aria-hidden="true"
                  className="size-4"
                />

                View booking details
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Booking summary"
      >
        <SummaryCard
          label="Total bookings"
          value={formatCount(page.statistics.total)}
          icon={<CalendarDays className="size-5" />}
        />
        <SummaryCard
          label="Upcoming events"
          value={formatCount(page.statistics.upcoming)}
          icon={<CalendarCheck className="size-5" />}
        />
        <SummaryCard
          label="Awaiting providers"
          value={formatCount(page.statistics.awaitingProvider)}
          icon={<Clock3 className="size-5" />}
        />
        <SummaryCard
          label="Awaiting payment"
          value={formatCount(page.statistics.awaitingPayment)}
          icon={<PhilippinePeso className="size-5" />}
        />
      </section>

      <FilterToolbar
        searchValue={searchValue}
        onSearchChange={(value) => setSearchValue(value.slice(0, MAX_SEARCH_LENGTH))}
        onSearchSubmit={(search) => updateFilters({search: search.slice(0, MAX_SEARCH_LENGTH)})}
        onClearSearch={clearSearch}
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        searchLabel="Search by exact booking code or booking ID"
        searchPlaceholder="Enter an exact booking code or booking ID"
        searchHint="Searches only your bookings using an exact booking code or booking ID."
        loading={isPending}
        filterControls={
          <FilterSelect
            label="Booking status"
            value={filters.status}
            disabled={isPending}
            onChange={(value) => updateFilters({status: value as CustomerBookingStatusFilter})}
          >
            {BOOKING_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </FilterSelect>
        }
      />

      <DataTable
        columns={columns}
        rows={page.bookings}
        getRowId={(booking) => booking.id}
        caption="Customer booking history"
        loading={isPending}
        error={error}
        onRetry={() => loadPage(filters)}
        emptyTitle={emptyState.title}
        emptyDescription={emptyState.description}
        rowActionsLabel="Details"
        rowActions={(booking) => (
          <Button
            variant="ghost"
            size="compact"
            disabled={isPending}
            onClick={() => openBooking(booking)}
            aria-label={`View booking ${boundedText(booking.bookingCode, "details", 80)}`}
          >
            <Eye aria-hidden="true" className="size-4" />
            View
          </Button>
        )}
        renderMobileRow={(booking) => (
          <CustomerBookingMobileCard
            booking={booking}
            onView={openBooking}
            loading={isPending}
          />
        )}
      />

      {!error && page.bookings.length > 0 ? (
        <CursorPagination
          previousCursor={previousCursor}
          nextCursor={page.nextCursor}
          onPrevious={handlePreviousPage}
          onNext={handleNextPage}
          pageLabel={`Page ${pageNumber}`}
          loading={isPending}
        />
      ) : null}

      <CustomerBookingDetailsDrawer
        booking={selectedBooking}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
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
  const id = `customer-booking-filter-${label.toLowerCase().replaceAll(" ", "-")}`;

  return (
    <div className="grid min-w-0 gap-2 lg:min-w-[15rem]">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <Select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {children}
      </Select>
    </div>
  );
}

function normalizeSubmittedBookingId(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  const normalized =
    value.trim();

  return /^[A-Za-z0-9_-]{1,160}$/u.test(
    normalized,
  )
    ? normalized
    : null;
}

export {CustomerBookingExperience, type CustomerBookingExperienceProps};
