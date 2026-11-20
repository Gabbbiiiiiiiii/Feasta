"use client";

import {formatEventTime} from "@/lib/presentation/event-time";

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
  type ReactNode,
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
import {PhilippineDateInput} from "@/components/forms/philippine-date-input";
import {useAdminAutoRefresh} from "@/lib/admin/use-admin-auto-refresh";
import {CancellationManagementClient} from "@/components/admin/bookings/cancellation-management-client";
import type {AdminCancellationQueue} from "@/lib/admin/cancellations/admin-cancellation-types";
import {adminBookingNumber, adminBookingStatusLabels, adminBookingPaymentLabels, adminBookingStatusLabel, adminBookingPaymentLabel} from "@/lib/admin/bookings/admin-booking-labels";
import {
  formatPhilippineDate,
} from "@/lib/dates/philippine-date";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type {
  AdminBooking,
  AdminBookingFilters,
  AdminBookingPaymentFilter,
  AdminBookingPage,
  AdminBookingStatusFilter,
} from "@/lib/admin/bookings/admin-booking-types";

type BookingMonitoringClientProps = {
  initialPage: AdminBookingPage;
  initialEventDateFrom?: string;
  initialEventDateTo?: string;
  supplementalContent?: ReactNode;
  initialCancellationQueue?: AdminCancellationQueue;
};

const FIRST_PAGE_CURSOR = "__first_page__";

const providerRequestStatusLabels: Record<
  AdminBooking["providerRequests"][number]["status"],
  string
> = {
  pending: "Awaiting response",
  accepted: "Accepted",
  waiting_for_down_payment: "Awaiting payment",
  payment_processing: "Payment processing",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired",
};

function describeAdminBookingProviders(booking: AdminBooking): {
  title: string;
  detail: string;
} {
  const requests = booking.providerRequests;

  const providerIds = new Set(
    requests
      .map((request) => request.providerId)
      .filter((id) => id.trim().length > 0),
  );

  const hasResolvedProviders = providerIds.size > 0;

  const count = hasResolvedProviders
    ? providerIds.size
    : requests.length > 0
      ? requests.length
      : booking.providerRequestCount;

  if (count === 0) {
    return {
      title: "No providers",
      detail: "No provider requests",
    };
  }

  const title = hasResolvedProviders
    ? `${count} provider${count === 1 ? "" : "s"}`
    : `${count} provider request${count === 1 ? "" : "s"}`;

  if (requests.length === 0) {
    return {
      title,
      detail: "Status unavailable",
    };
  }

  if (requests.length === 1) {
    return {
      title,
      detail: providerRequestStatusLabels[requests[0].status],
    };
  }

  const counts = new Map<string, number>();

  for (const request of requests) {
    counts.set(
      request.status,
      (counts.get(request.status) ?? 0) + 1,
    );
  }

  const details = (
    Object.keys(providerRequestStatusLabels) as Array<
      keyof typeof providerRequestStatusLabels
    >
  )
    .filter((status) => (counts.get(status) ?? 0) > 0)
    .map((status) => {
      const amount = counts.get(status) ?? 0;
      const label = providerRequestStatusLabels[status];
      return `${amount} ${label.toLowerCase()}`;
    });

  return {
    title,
    detail: details.join(" · ") || "Status unavailable",
  };
}


const clearedFilters: AdminBookingFilters = {
  search: "",
  status: "all",
  paymentStatus: "all",
  eventDateFrom: "",
  eventDateTo: "",
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
  initialEventDateFrom,
  initialEventDateTo,
  supplementalContent,
  initialCancellationQueue,
}: BookingMonitoringClientProps) {
  const [page, setPage] =
    useState(initialPage);

  const [filters, setFilters] = useState<AdminBookingFilters>(() => ({
    ...clearedFilters,
    eventDateFrom: initialEventDateFrom ?? "",
    eventDateTo: initialEventDateTo ?? "",
  }));

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

  const refreshBookings = useAdminAutoRefresh(async (isCurrent, afterMutation) => {
    const requestId = requestIdRef.current;
    const result = afterMutation
      ? await loadAdminBookingsAction(filters, {freshStatistics: true})
      : await loadAdminBookingsAction(filters);
    if (!isCurrent() || requestId !== requestIdRef.current) return;
    setPage(result);
    setSelectedBooking(current => current ? result.bookings.find(booking => booking.id === current.id) ?? current : null);
  }, JSON.stringify(filters), isPending || searchValue.trim() !== filters.search.trim());

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
              {adminBookingNumber(booking) ?? "Booking number unavailable"}
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
              {formatEventTime(booking.eventTime) ||
                "Time not provided"}
            </p>
          </div>
        ),
      },
      {
        id: "providers",
        header: "Providers",
        cell: (booking) => {
          const summary = describeAdminBookingProviders(booking);

          return (
            <div className="min-w-[8rem]">
              <p className="font-semibold">
                {summary.title}
              </p>
              <p className="mt-1 text-muted-foreground">
                {summary.detail}
              </p>
            </div>
          );
        },
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
              kind="payment" status={booking.paymentStatus}
            />

            <p className="mt-1 text-xs text-muted-foreground">
              Net amount paid
            </p>
            <p className="mt-1 font-semibold">
              {(booking.totalPaidAmount === null ? "Unavailable" : currencyFormatter.format(booking.totalPaidAmount))}
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

    loadPage(clearedFilters, {
      nextHistory: [],
      nextPageNumber: 1,
    });
  }, [loadPage]);

  const handleEventDateFromChange = useCallback(
    (eventDateFrom: string) => {
      const nextTo =
        eventDateFrom &&
        filters.eventDateTo &&
        eventDateFrom > filters.eventDateTo
          ? eventDateFrom
          : filters.eventDateTo;

      updateFilters({
        eventDateFrom,
        eventDateTo: nextTo,
      });
    },
    [filters.eventDateTo, updateFilters],
  );

  const handleEventDateToChange = useCallback(
    (eventDateTo: string) => {
      const nextFrom =
        eventDateTo &&
        filters.eventDateFrom &&
        eventDateTo < filters.eventDateFrom
          ? eventDateTo
          : filters.eventDateFrom;

      updateFilters({
        eventDateFrom: nextFrom,
        eventDateTo,
      });
    },
    [filters.eventDateFrom, updateFilters],
  );

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
        `Status: ${adminBookingStatusLabel(
          filters.status,
        )}`,
      );
    }

    if (filters.paymentStatus !== "all") {
      labels.push(
        `Payment: ${adminBookingPaymentLabel(
          filters.paymentStatus,
        )}`,
      );
    }

    if (filters.eventDateFrom && filters.eventDateTo) {
      labels.push(
        filters.eventDateFrom === filters.eventDateTo
          ? `Event date: ${formatPhilippineDate(filters.eventDateFrom)}`
          : `Event date: ${formatPhilippineDate(filters.eventDateFrom)} – ${formatPhilippineDate(filters.eventDateTo)}`,
      );
    } else if (filters.eventDateFrom) {
      labels.push(
        `Event date: From ${formatPhilippineDate(filters.eventDateFrom)}`,
      );
    } else if (filters.eventDateTo) {
      labels.push(
        `Event date: Until ${formatPhilippineDate(filters.eventDateTo)}`,
      );
    }

    return labels;
  }, [filters]);

  const previousCursor =
    cursorHistory.at(-1) ?? null;

  const hasDateFilter = Boolean(
    filters.eventDateFrom || filters.eventDateTo,
  );

  const tableSort: DataTableSort = {
    columnId:
      hasDateFilter || filters.sortField === "eventDate"
        ? "eventDate"
        : "createdAt",

    direction:
      filters.sortDirection,
  };

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Bookings"
        description="Monitor customer events, provider responses, and payment progress across FEASTA."
      />

      {supplementalContent}
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
          label={adminBookingStatusLabels.pending_provider_approval}
          value={page.statistics.pendingApproval.toLocaleString(
            "en-PH",
          )}
          icon={
            <CalendarClock className="size-5" />
          }
          loading={isPending}
        />

        <SummaryCard
          label={adminBookingStatusLabels.waiting_for_down_payment}
          value={page.statistics.waitingForPayment.toLocaleString(
            "en-PH",
          )}
          icon={
            <PhilippinePeso className="size-5" />
          }
          loading={isPending}
        />

        <SummaryCard
          label="Net amount paid"
          supportingMetric={page.statistics.totalPaidAmount === null ? "See booking details for completed refund accounting" : "Settled payments less completed refunds"}
          value={(page.statistics.totalPaidAmount === null ? "Unavailable" : currencyFormatter.format(page.statistics.totalPaidAmount))}
          icon={
            <PhilippinePeso className="size-5" />
          }
          loading={isPending}
        />
      </section>

      <FilterToolbar
        onSearchInvalidate={() => {
          requestIdRef.current += 1;
        }}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={(search) =>
          updateFilters({ search })
        }
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        searchLabel="Search by booking code prefix"
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
              <option value="all" hidden>
                All booking statuses
              </option>
              {filters.status !== "all" && !page.statistics.availableStatuses.includes(filters.status) && (
                <option value={filters.status} disabled>Selected status no longer available</option>
              )}
              {page.statistics.availableStatuses.map((status) => (
                <option key={status} value={status}>{adminBookingStatusLabels[status]}</option>
              ))}
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
                      | AdminBookingPaymentFilter,
                })
              }
            >
              <option value="all">
                All payment statuses
              </option>
              {filters.paymentStatus !== "all" &&
                !page.statistics.availablePaymentStatuses.includes(
                  filters.paymentStatus,
                ) && (
                  <option value={filters.paymentStatus} disabled>
                    Selected payment status no longer available
                  </option>
                )}
              {page.statistics.availablePaymentStatuses.map((status) => (
                <option key={status} value={status}>
                  {adminBookingPaymentLabels[status]}
                </option>
              ))}
            </FilterSelect>

            <FilterDateInput
              label="Event date from"
              value={filters.eventDateFrom}
              disabled={isPending}
              onChange={handleEventDateFromChange}
            />

            <FilterDateInput
              label="Event date to"
              value={filters.eventDateTo}
              disabled={isPending}
              onChange={handleEventDateToChange}
            />
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
            aria-label={`View booking ${adminBookingNumber(booking) ?? `for ${booking.customer.fullName}`}`}
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

      {initialCancellationQueue ? <CancellationManagementClient initialQueue={initialCancellationQueue} onUpdated={() => refreshBookings(true)} /> : null}

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

function FilterDateInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
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

      <PhilippineDateInput
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.currentTarget.value)
        }
      />
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
