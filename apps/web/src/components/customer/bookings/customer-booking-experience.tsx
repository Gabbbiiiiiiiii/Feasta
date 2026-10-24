"use client";
import {BookingLifecycleStatus} from "@/components/shared/booking-lifecycle-status";


import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  Eye,
  PhilippinePeso,
  SearchX,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";

import {loadCustomerBookingsAction, revalidateCustomerBookingPageAction} from "@/app/customer/bookings/actions";
import {useBookingChanges} from "@/lib/customer/bookings/use-booking-changes";
import {
  BOOKING_STATUS_OPTIONS,

  bookingStatusLabel,
  boundedText,
  formatBookingDate,
  formatBookingTimeRange,
  formatCount,
  formatCurrency,

} from "@/components/customer/bookings/booking-formatters";
import {CustomerBookingDetailsDrawer} from "@/components/customer/bookings/customer-booking-details-drawer";
import {CustomerBookingMobileCard} from "@/components/customer/bookings/customer-booking-mobile-card";
import {CursorPagination} from "@/components/data/cursor-pagination";
import {DataTable, type DataTableColumn} from "@/components/data/data-table";
import {SummaryCard} from "@/components/data/summary-card";
import {useLiveSearch} from "@/lib/search/use-live-search";
import {SearchInput} from "@/components/forms/search-input";
import {PageHeading} from "@/components/layout/page-heading";
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
  useEffect(() => () => { requestIdRef.current += 1; }, []);

  const realtime = useBookingChanges(page.bookings, async (statusChanged, bookingIds = page.bookings.map((booking) => booking.id)) => {
    const requestId = ++requestIdRef.current;
    const result = await revalidateCustomerBookingPageAction(filters, statusChanged, bookingIds);
    if (requestId !== requestIdRef.current) return;
    const affected = new Set(bookingIds);
    const refreshed = new Map(result.bookings.map((booking) => [booking.id, booking]));
    setPage((previous) => ({
      ...previous,
      ...result,
      bookings: previous.bookings.flatMap((booking) => affected.has(booking.id)
        ? refreshed.has(booking.id) ? [refreshed.get(booking.id)!] : []
        : [booking]),
    }));
  }, isPending);

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
      header: "Event date",
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
      id: "status",
      header: "Status",
      cell: (booking) => (
        <div className="grid min-w-[9rem] justify-items-start gap-1">
          <div className="flex flex-wrap gap-2">
            <BookingLifecycleStatus status={booking.status} evidence={booking.lifecycle} label={bookingStatusLabel(booking.status)} />
          </div>
          {booking.status === "needs_provider_replacement" ? (
            <p className="text-xs text-muted-foreground">
              {booking.pendingProviderRequestCount > 0
                ? "Other providers still responding"
                : "Review rejected request"}
            </p>
          ) : booking.status === "waiting_for_down_payment" ? (
            <p className="text-xs text-muted-foreground">
              Payment required
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "total",
      header: "Amount",
      cell: (booking) => (
        <div className="min-w-[9rem]">
          <p className="font-black">{formatCurrency(booking.estimatedEventTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Estimated total</p>
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
    filters.search ? `Search: ${boundedText(filters.search, "", 80)}` : "",
    filters.status !== "all" ? `Status: ${bookingStatusLabel(filters.status)}` : "",
  ].filter(Boolean);
  const previousCursor = cursorHistory.at(-1) ?? null;
  const emptyKind = filters.search ?
    "search" :
    filters.status !== "all" ?
      "filter" :
      "initial";
  const showEmptyState = !isPending && !error && page.bookings.length === 0;

  return (
    <div className="grid min-w-0 gap-5 lg:gap-4">
      <p className="sr-only" role="status" aria-live="polite">
        {isPending ?
          "Updating your booking history." :
          `${formatCount(page.bookings.length)} bookings shown on page ${pageNumber}.`}
      </p>
      <PageHeading
        eyebrow="Your celebrations"
        title="My Bookings"
        description="Keep track of your events, provider responses, and payments."
        className="pb-4"
      />
      <div className="flex items-center gap-2 text-sm">
        {realtime.unavailable ? <span role="status">Live updates unavailable.</span> : null}
        <Button variant="ghost" size="compact" disabled={isPending || realtime.refreshing} onClick={() => {
          if (realtime.unavailable) realtime.retry();
          const requestId = ++requestIdRef.current;
          startTransition(async () => {
            try {
              const result = await revalidateCustomerBookingPageAction(filters, true);
              if (requestId === requestIdRef.current) setPage((previous) => ({...previous, ...result}));
            } catch {
              if (requestId === requestIdRef.current) setError("Your booking history could not be updated. Please try again.");
            }
          });
        }}>Refresh bookings</Button>
      </div>

      {submittedBookingId ? (
        <section
          aria-labelledby="submitted-booking-title"
          className="relative overflow-hidden rounded-[24px] border border-success/20 bg-success/[0.055] p-5 shadow-[0_8px_28px_rgb(0_75_59/0.035)] sm:p-6"
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
        className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Booking summary"
      >
        <SummaryCard
          label="Total Bookings"
          supportingMetric="All your booking requests"
          value={formatCount(page.statistics.total)}
          icon={<SummaryIcon icon={<CalendarDays className="size-4" />} />}
          className="h-full p-4 shadow-none sm:p-4 [&>div]:items-center [&>div>p]:font-bold [&>div>p]:text-foreground [&>p]:mt-2 [&>p:nth-child(3)]:text-xs [&>p:nth-child(3)]:leading-5"
        />
        <SummaryCard
          label="Upcoming Events"
          supportingMetric="Scheduled events ahead"
          value={formatCount(page.statistics.upcoming)}
          icon={<SummaryIcon icon={<CalendarCheck className="size-4" />} />}
          className="h-full p-4 shadow-none sm:p-4 [&>div]:items-center [&>div>p]:font-bold [&>div>p]:text-foreground [&>p]:mt-2 [&>p:nth-child(3)]:text-xs [&>p:nth-child(3)]:leading-5"
        />
        <SummaryCard
          label="Pending Responses"
          value={formatCount(page.statistics.awaitingProvider)}
          icon={<SummaryIcon icon={<Clock3 className="size-4" />} />}
          className="h-full p-4 shadow-none sm:p-4 [&>div]:items-center [&>div>p]:font-bold [&>div>p]:text-foreground [&>p]:mt-2 [&>p:nth-child(3)]:text-xs [&>p:nth-child(3)]:leading-5"
        />
        <SummaryCard
          label="Payments Due"
          value={formatCount(page.statistics.awaitingPayment)}
          icon={<SummaryIcon icon={<PhilippinePeso className="size-4" />} />}
          className="h-full p-4 shadow-none sm:p-4 [&>div]:items-center [&>div>p]:font-bold [&>div>p]:text-foreground [&>p]:mt-2 [&>p:nth-child(3)]:text-xs [&>p:nth-child(3)]:leading-5"
        />
      </section>

      <CustomerBookingFilterToolbar
        onSearchInvalidate={() => {
          requestIdRef.current += 1;
        }}
        searchValue={searchValue}
        onSearchChange={(value) => setSearchValue(value.slice(0, MAX_SEARCH_LENGTH))}
        onSearchSubmit={(search) => updateFilters({search: search.slice(0, MAX_SEARCH_LENGTH)})}
        onClearSearch={clearSearch}
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        loading={isPending}
        status={filters.status}
        onStatusChange={(status) => updateFilters({status})}
      />

      {showEmptyState ? (
        <CustomerBookingEmptyState
          kind={emptyKind}
          onClearSearch={clearSearch}
          onClearFilters={clearFilters}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={page.bookings}
          getRowId={(booking) => booking.id}
          caption="Customer booking history"
          loading={isPending}
          error={error}
          onRetry={() => loadPage(filters)}
          rowActionsLabel="Action"
          rowActions={(booking) => (
            <Button
              variant="secondary"
              size="compact"
              className="min-w-[7rem] whitespace-nowrap border border-border shadow-sm"
              disabled={isPending}
              onClick={() => openBooking(booking)}
              aria-label={`View booking ${boundedText(booking.bookingCode, "details", 80)}`}
            >
              <Eye aria-hidden="true" className="size-4" />
              View details
            </Button>
          )}
          renderMobileRow={(booking) => (
            <CustomerBookingMobileCard
              booking={booking}
              onView={openBooking}
              loading={isPending}
            />
          )}
          className="[&_table]:text-[0.8125rem] [&_thead]:bg-muted/50 [&_th]:py-2.5 [&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_td]:py-3 [&_td]:align-middle [&_tr]:transition-colors"
        />
      )}

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

function SummaryIcon({icon}: {icon: ReactNode}) {
  return icon;
}

function CustomerBookingFilterToolbar({
  searchValue,
  onSearchInvalidate,
  onSearchChange,
  onSearchSubmit,
  onClearSearch,
  onClearFilters,
  activeFilters,
  loading,
  status,
  onStatusChange,
}: {
  searchValue: string;
  onSearchInvalidate?: () => void;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  onClearSearch: () => void;
  onClearFilters: () => void;
  activeFilters: readonly string[];
  loading: boolean;
  status: CustomerBookingStatusFilter;
  onStatusChange: (status: CustomerBookingStatusFilter) => void;
}) {
  const searchId = useId();
  const searchHintId = useId();
  const hasFilters = searchValue.trim().length > 0 || activeFilters.length > 0;
  const live = useLiveSearch(searchValue, onSearchSubmit, onSearchInvalidate);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    live.submit();
  };

  return (
    <section
      aria-label="Filter bookings"
      className="grid gap-3 rounded-card border border-border bg-card p-3 sm:p-4"
    >
      <form
        role="search"
        onSubmit={submit}
        className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      >
        <div className="grid min-w-0 gap-1.5">
          <label htmlFor={searchId} className="text-xs font-bold text-foreground">
            Find a booking
          </label>
          <SearchInput
            id={searchId}
            aria-label="Find a booking"
            aria-describedby={searchHintId}
            placeholder="Booking code or ID"
            value={searchValue}
            clearLabel="Clear booking search"
            className="min-h-12 rounded-xl py-2.5 text-sm"
            onChange={(event) => {
              live.change(event.currentTarget.value);
              onSearchChange(event.currentTarget.value);
            }}
            onClear={searchValue ? () => {
              live.beginClear();
              onClearSearch();
            } : undefined}
          />
          <p id={searchHintId} className="text-[0.6875rem] leading-4 text-muted-foreground">
            Enter the start of your booking code or the full booking ID.
          </p>
        </div>
        <Button
          type="submit"
          size="compact"
          className="w-full sm:w-auto"
          loading={loading}
          loadingLabel="Searching"
        >
          Search
        </Button>
      </form>

      <div className="grid min-w-0 gap-3 border-t border-border pt-3 md:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)_auto] md:items-end">
        <FilterSelect
          value={status}
          disabled={loading}
          onChange={onStatusChange}
        />
        <p className="min-w-0 break-words text-xs text-muted-foreground" aria-live="polite">
          {activeFilters.length > 0 ?
            `Active: ${activeFilters.join(", ")}` :
            "All statuses selected"}
        </p>
        <Button
          variant="ghost"
          size="compact"
          disabled={!hasFilters || loading}
          onClick={onClearFilters}
          className="w-full md:w-auto"
        >
          Clear filters
        </Button>
      </div>
    </section>
  );
}

function FilterSelect({
  value,
  disabled,
  onChange,
}: {
  value: CustomerBookingStatusFilter;
  disabled: boolean;
  onChange: (value: CustomerBookingStatusFilter) => void;
}) {
  const id = "customer-booking-filter-booking-status";

  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-xs font-bold">Filter by status</label>
      <Select
        id={id}
        value={value}
        disabled={disabled}
        className="min-h-12 rounded-xl py-2.5 text-sm"
        onChange={(event) => onChange(event.currentTarget.value as CustomerBookingStatusFilter)}
      >
        {BOOKING_STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </Select>
    </div>
  );
}

function CustomerBookingEmptyState({
  kind,
  onClearSearch,
  onClearFilters,
}: {
  kind: "initial" | "search" | "filter";
  onClearSearch: () => void;
  onClearFilters: () => void;
}) {
  const initial = kind === "initial";
  const search = kind === "search";
  const title = initial ?
    "No bookings yet" :
    search ?
      "No matching bookings" :
      "No bookings match this status";
  const description = initial ?
    "Your booking requests will appear here once submitted." :
    search ?
      "Check your booking code or ID, or try another status." :
      "Try another status or view all your bookings.";

  return (
    <section className="grid justify-items-center gap-3 rounded-card border border-border bg-card px-5 py-8 text-center sm:py-10">
      <span className="grid size-12 place-items-center rounded-full bg-primary-tint text-primary" aria-hidden="true">
        {initial ? <CalendarPlus className="size-6" /> : <SearchX className="size-6" />}
      </span>
      <div className="grid max-w-lg gap-1.5">
        <h2 className="text-xl font-black tracking-tight">{title}</h2>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {initial ? (
        <Button asChild size="compact">
          <Link href="/customer/providers">Browse event services</Link>
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="compact"
          onClick={search ? onClearSearch : onClearFilters}
        >
          {search ? "Clear search" : "Show all bookings"}
        </Button>
      )}
    </section>
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
