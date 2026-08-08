"use client";

import {
  CalendarCheck,
  CalendarDays,
  Clock3,
  Eye,
  PhilippinePeso,
} from "lucide-react";
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
      id: "provider",
      header: "Provider & package",
      cell: (booking) => (
        <div className="min-w-[11rem]">
          <p className="break-words font-semibold">
            {boundedText(booking.providerName, "Provider unavailable", 100)}
          </p>
          <p className="mt-1 break-words text-muted-foreground">
            {boundedText(booking.packageName, "Custom services", 100)}
          </p>
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
      header: "Status",
      cell: (booking) => (
        <div className="grid min-w-[10rem] justify-items-start gap-2">
          <StatusBadge status={booking.status} label={bookingStatusLabel(booking.status)} />
          <StatusBadge status={booking.paymentStatus} />
        </div>
      ),
    },
    {
      id: "total",
      header: "Totals",
      cell: (booking) => (
        <div className="min-w-[9rem]">
          <p className="font-black">{formatCurrency(booking.estimatedEventTotal)}</p>
          <p className="mt-1 text-muted-foreground">
            {formatCurrency(booking.downPaymentAmount)} down
          </p>
          <p className="mt-1 text-muted-foreground">
            {formatCurrency(booking.remainingBalance)} remaining
          </p>
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

        setPage(result);
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
  const filtered = Boolean(filters.search) || filters.status !== "all";

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Customer history"
        title="Bookings"
        description="Review your event schedule, provider requests, totals, and payment readiness."
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Booking summary"
      >
        <SummaryCard
          label="Total bookings"
          value={formatCount(page.statistics.total)}
          icon={<CalendarDays className="size-5" />}
          loading={isPending}
        />
        <SummaryCard
          label="Upcoming events"
          value={formatCount(page.statistics.upcoming)}
          icon={<CalendarCheck className="size-5" />}
          loading={isPending}
        />
        <SummaryCard
          label="Awaiting providers"
          value={formatCount(page.statistics.awaitingProvider)}
          icon={<Clock3 className="size-5" />}
          loading={isPending}
        />
        <SummaryCard
          label="Awaiting payment"
          value={formatCount(page.statistics.awaitingPayment)}
          icon={<PhilippinePeso className="size-5" />}
          loading={isPending}
        />
      </section>

      <FilterToolbar
        searchValue={searchValue}
        onSearchChange={(value) => setSearchValue(value.slice(0, MAX_SEARCH_LENGTH))}
        onSearchSubmit={(search) => updateFilters({search: search.slice(0, MAX_SEARCH_LENGTH)})}
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        searchLabel="Search by exact booking code or booking ID"
        searchPlaceholder="Enter an exact booking code or booking ID"
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
        emptyKind={filtered ? "search" : "bookings"}
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

export {CustomerBookingExperience, type CustomerBookingExperienceProps};
