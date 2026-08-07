"use client";

import {
  CalendarCheck,
  CalendarClock,
  Eye,
  PhilippinePeso,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  loadAdminBookingsAction,
} from "@/app/admin/bookings/actions";
import {
  BookingDetailsDrawer,
} from "@/components/admin/bookings/booking-details-drawer";
import {
  BookingMobileCard,
} from "@/components/admin/bookings/booking-mobile-card";
import {
  BookingStatusBadge,
} from "@/components/admin/bookings/booking-status-badge";
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
import {
  PageHeading,
} from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type {
  AdminBooking,
  AdminBookingDateFilter,
  AdminBookingFilters,
  AdminBookingOverallPaymentStatus,
  AdminBookingPage,
  AdminBookingStatusFilter,
} from "@/lib/admin/bookings/admin-booking-types";

type BookingMonitoringClientProps = {
  initialPage: AdminBookingPage;
};

const FIRST_PAGE_CURSOR = "__first_page__";

const initialFilters: AdminBookingFilters = {
  search: "",
  status: "all",
  paymentStatus: "all",
  date: "all",
  sortField: "createdAt",
  sortDirection: "descending",
  pageSize: 10,
  cursor: null,
};

const currencyFormatter =
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  });

const dateFormatter =
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  });

function BookingMonitoringClient({
  initialPage,
}: BookingMonitoringClientProps) {
  const [page, setPage] =
    useState(initialPage);

  const [filters, setFilters] =
    useState(initialFilters);

  const [searchValue, setSearchValue] =
    useState("");

  const [cursorHistory, setCursorHistory] =
    useState<string[]>([]);

  const [pageNumber, setPageNumber] =
    useState(1);

  const [selectedBooking, setSelectedBooking] =
    useState<AdminBooking | null>(null);

  const [drawerOpen, setDrawerOpen] =
    useState(false);

  const [error, setError] =
    useState<string>();

  const [isPending, startTransition] =
    useTransition();

  const requestIdRef = useRef(0);

  const openBooking = useCallback(
    (booking: AdminBooking) => {
      setSelectedBooking(booking);
      setDrawerOpen(true);
    },
    [],
  );

  const columns = useMemo<
    readonly DataTableColumn<AdminBooking>[]
  >(
    () => [
      {
        id: "reference",
        header: "Booking",
        cell: (booking) => (
          <div className="min-w-[9rem]">
            <p className="font-bold text-primary-strong">
              {booking.reference}
            </p>

            <p className="mt-1 text-muted-foreground">
              {booking.eventType}
            </p>
          </div>
        ),
      },
      {
        id: "customer",
        header: "Customer",
        cell: (booking) => (
          <div className="min-w-[11rem]">
            <p className="font-semibold">
              {booking.customer.fullName}
            </p>

            <p className="mt-1 truncate text-muted-foreground">
              {booking.customer.email ||
                booking.customer.phoneNumber ||
                "No contact information"}
            </p>
          </div>
        ),
      },
      {
        id: "eventDate",
        header: "Event date",
        sortable: true,
        cell: (booking) => (
          <div className="min-w-[8rem]">
            <p className="font-semibold">
              {formatDate(
                booking.eventDate,
              )}
            </p>

            <p className="mt-1 text-muted-foreground">
              {booking.eventTime ||
                "Time not provided"}
            </p>
          </div>
        ),
      },
      {
        id: "providers",
        header: "Providers",
        cell: (booking) => (
          <div className="min-w-[7rem]">
            <p className="font-semibold">
              {booking.confirmedProviderRequestCount}
              {" / "}
              {booking.providerRequestCount}
              {" confirmed"}
            </p>

            {booking.pendingProviderRequestCount >
            0 ? (
              <p className="mt-1 text-warning">
                {
                  booking.pendingProviderRequestCount
                }{" "}
                pending
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                No pending requests
              </p>
            )}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (booking) => (
          <BookingStatusBadge
            status={booking.status}
          />
        ),
      },
      {
        id: "payment",
        header: "Payment",
        cell: (booking) => (
          <div className="min-w-[8rem]">
            <BookingStatusBadge
              status={booking.paymentStatus}
            />

            <p className="mt-2 font-semibold">
              {currencyFormatter.format(
                booking.totalPaidAmount,
              )}
            </p>
          </div>
        ),
      },
    ],
    [],
  );

  const loadPage = useCallback(
    (
      nextFilters: AdminBookingFilters,
      options?: {
        nextHistory?: string[];
        nextPageNumber?: number;
      },
    ) => {
      const requestId =
        requestIdRef.current + 1;

      requestIdRef.current = requestId;
      setError(undefined);

      startTransition(async () => {
        try {
          const result =
            await loadAdminBookingsAction(
              nextFilters,
            );

          if (
            requestId !== requestIdRef.current
          ) {
            return;
          }

          setPage(result);
          setFilters(nextFilters);

          if (options?.nextHistory) {
            setCursorHistory(
              options.nextHistory,
            );
          }

          if (options?.nextPageNumber) {
            setPageNumber(
              options.nextPageNumber,
            );
          }
        } catch (caughtError) {
          if (
            requestId !== requestIdRef.current
          ) {
            return;
          }

          setError(
            errorMessage(caughtError),
          );
        }
      });
    },
    [],
  );

  const updateFilters = useCallback(
    (
      updates: Partial<AdminBookingFilters>,
    ) => {
      const nextFilters = {
        ...filters,
        ...updates,
        cursor: null,
      };

      loadPage(nextFilters, {
        nextHistory: [],
        nextPageNumber: 1,
      });
    },
    [filters, loadPage],
  );

  const clearFilters = useCallback(() => {
    setSearchValue("");

    loadPage(initialFilters, {
      nextHistory: [],
      nextPageNumber: 1,
    });
  }, [loadPage]);

  const handleNextPage = useCallback(
    (cursor: string) => {
      const currentCursor =
        filters.cursor ??
        FIRST_PAGE_CURSOR;

      loadPage(
        {
          ...filters,
          cursor,
        },
        {
          nextHistory: [
            ...cursorHistory,
            currentCursor,
          ],
          nextPageNumber:
            pageNumber + 1,
        },
      );
    },
    [
      cursorHistory,
      filters,
      loadPage,
      pageNumber,
    ],
  );

  const handlePreviousPage =
    useCallback(
      (cursor: string) => {
        const nextHistory =
          cursorHistory.slice(0, -1);

        loadPage(
          {
            ...filters,
            cursor:
              cursor === FIRST_PAGE_CURSOR
                ? null
                : cursor,
          },
          {
            nextHistory,
            nextPageNumber:
              Math.max(1, pageNumber - 1),
          },
        );
      },
      [
        cursorHistory,
        filters,
        loadPage,
        pageNumber,
      ],
    );

  const handleSortChange = useCallback(
    (sort: DataTableSort) => {
      if (sort.columnId !== "eventDate") {
        return;
      }

      updateFilters({
        sortField: "eventDate",

        sortDirection:
          sort.direction,
      });
    },
    [updateFilters],
  );

  const activeFilters = useMemo(() => {
    const labels: string[] = [];

    if (filters.status !== "all") {
      labels.push(
        `Status: ${formatLabel(
          filters.status,
        )}`,
      );
    }

    if (filters.paymentStatus !== "all") {
      labels.push(
        `Payment: ${formatLabel(
          filters.paymentStatus,
        )}`,
      );
    }

    if (filters.date !== "all") {
      labels.push(
        `Date: ${formatLabel(
          filters.date,
        )}`,
      );
    }

    return labels;
  }, [filters]);

  const previousCursor =
    cursorHistory.at(-1) ?? null;

  const tableSort: DataTableSort = {
    columnId:
      filters.sortField === "eventDate"
        ? "eventDate"
        : "createdAt",

    direction:
      filters.sortDirection,
  };

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Booking Monitoring"
        description="Monitor customer events, provider responses, and payment progress across FEASTA."
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Booking statistics"
      >
        <SummaryCard
          label="Total bookings"
          value={page.statistics.totalBookings.toLocaleString(
            "en-PH",
          )}
          icon={
            <CalendarCheck className="size-5" />
          }
          loading={isPending}
        />

        <SummaryCard
          label="Pending approval"
          value={page.statistics.pendingApproval.toLocaleString(
            "en-PH",
          )}
          icon={
            <CalendarClock className="size-5" />
          }
          loading={isPending}
        />

        <SummaryCard
          label="Waiting for payment"
          value={page.statistics.waitingForPayment.toLocaleString(
            "en-PH",
          )}
          icon={
            <PhilippinePeso className="size-5" />
          }
          loading={isPending}
        />

        <SummaryCard
          label="Confirmed revenue"
          value={currencyFormatter.format(
            page.statistics.totalPaidAmount,
          )}
          icon={
            <PhilippinePeso className="size-5" />
          }
          loading={isPending}
        />
      </section>

      <FilterToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={(search) =>
          updateFilters({ search })
        }
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        searchLabel="Search by exact booking code"
        searchPlaceholder="Enter booking code, for example BK-123ABC"
        loading={isPending}
        filterControls={
          <>
            <FilterSelect
              label="Booking status"
              value={filters.status}
              disabled={isPending}
              onChange={(value) =>
                updateFilters({
                  status:
                    value as AdminBookingStatusFilter,
                })
              }
            >
              <option value="all">
                All booking statuses
              </option>
              <option value="pending_provider_approval">
                Pending provider approval
              </option>
              <option value="needs_provider_replacement">
                Needs provider replacement
              </option>
              <option value="waiting_for_down_payment">
                Waiting for payment
              </option>
              <option value="confirmed">
                Confirmed
              </option>
              <option value="in_progress">
                In progress
              </option>
              <option value="completed">
                Completed
              </option>
              <option value="cancelled">
                Cancelled
              </option>
              <option value="expired">
                Expired
              </option>
            </FilterSelect>

            <FilterSelect
              label="Payment status"
              value={filters.paymentStatus}
              disabled={isPending}
              onChange={(value) =>
                updateFilters({
                  paymentStatus:
                    value as
                      | "all"
                      | AdminBookingOverallPaymentStatus,
                })
              }
            >
              <option value="all">
                All payment statuses
              </option>
              <option value="unpaid">
                Unpaid
              </option>
              <option value="pending">
                Pending
              </option>
              <option value="processing">
                Processing
              </option>
              <option value="partially_paid">
                Partially paid
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
              label="Event date"
              value={filters.date}
              disabled={isPending}
              onChange={(value) =>
                updateFilters({
                  date:
                    value as AdminBookingDateFilter,
                })
              }
            >
              <option value="all">
                All event dates
              </option>
              <option value="today">
                Today
              </option>
              <option value="upcoming">
                Upcoming
              </option>
              <option value="past">
                Past
              </option>
            </FilterSelect>
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={page.bookings}
        getRowId={(booking) => booking.id}
        caption="FEASTA booking monitoring records"
        loading={isPending}
        error={error}
        errorKind="load"
        onRetry={() =>
          loadPage(filters)
        }
        emptyTitle="No bookings found"
        emptyDescription="No bookings match the current search and filters."
        sort={tableSort}
        onSortChange={handleSortChange}
        rowActionsLabel="View"
        rowActions={(booking) => (
          <Button
            variant="ghost"
            size="compact"
            onClick={() =>
              openBooking(booking)
            }
            aria-label={`View booking ${booking.reference}`}
          >
            <Eye
              aria-hidden="true"
              className="size-4"
            />
            View
          </Button>
        )}
        renderMobileRow={(booking) => (
          <BookingMobileCard
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

      <BookingDetailsDrawer
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
  children: React.ReactNode;
}) {
  const id = `booking-filter-${label
    .toLowerCase()
    .replaceAll(" ", "-")}`;

  return (
    <div className="grid min-w-0 gap-2 lg:min-w-[13rem]">
      <label
        htmlFor={id}
        className="text-sm font-bold"
      >
        {label}
      </label>

      <Select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.currentTarget.value)
        }
      >
        {children}
      </Select>
    </div>
  );
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Date not provided";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "Date not provided"
    : dateFormatter.format(date);
}

function formatLabel(
  value: string,
): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((word) =>
      `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");
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

  return (
    "Booking records could not be loaded. " +
    "Please try again."
  );
}

export {
  BookingMonitoringClient,
  type BookingMonitoringClientProps,
};