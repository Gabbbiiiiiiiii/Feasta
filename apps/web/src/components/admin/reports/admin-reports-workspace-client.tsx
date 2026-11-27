"use client";

import {
  ArrowDownToLine,
  Award,
  CalendarDays,
  FileDown,
  Printer,
  ReceiptText,
  RotateCcw,
  Star,
  Users,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {MainEventStatus} from "@feasta/shared-types";

import {loadAdminReportModuleAction} from "@/app/admin/reports/actions";
import {CursorPagination} from "@/components/data/cursor-pagination";
import {DataTable, type DataTableColumn} from "@/components/data/data-table";
import {TableLoadingSkeleton} from "@/components/feedback/application-states";
import {PhilippineDateInput} from "@/components/forms/philippine-date-input";
import {PageHeading} from "@/components/layout/page-heading";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {filledRatingStarClassName} from "@/components/ui/rating-styles";
import {Select} from "@/components/ui/select";
import {adminBookingStatusLabel} from "@/lib/admin/bookings/admin-booking-labels";
import {
  buildPrintableReportSpec,
  DEFAULT_BOOKINGS_REPORT_FILTERS,
  DEFAULT_FEE_WITHDRAWALS_FILTERS,
  DEFAULT_PROVIDER_PERFORMANCE_FILTERS,
  DEFAULT_SERVICE_FEES_FILTERS,
  DEFAULT_USERS_DIRECTORY_FILTERS,
  type AdminReportModuleDatePreset,
  type AdminReportModuleId,
  type AdminReportModulePayload,
  type AdminReportModuleRequest,
  type BookingReportRow,
  type BookingsReportFilters,
  type BookingsReportPayload,
  type DateFilterFields,
  type FeeWithdrawalReportRow,
  type FeeWithdrawalsReportFilters,
  type FeeWithdrawalsReportPayload,
  type ProviderPerformanceReportFilters,
  type ProviderPerformanceReportPayload,
  type ProviderPerformanceReportRow,
  type ProviderPerformanceSort,
  type ServiceFeeReportRow,
  type ServiceFeesReportFilters,
  type ServiceFeesReportPayload,
  type UserDirectoryStatus,
  type UsersDirectoryReportFilters,
  type UsersDirectoryReportPayload,
  type UsersDirectoryReportRow,
  type UsersDirectoryRoleFilter,
} from "@/lib/admin/reports/admin-report-modules-types";
import {downloadSubModuleReportPdf} from "@/lib/admin/reports/admin-report-pdf";
import {printSubModuleReport} from "@/lib/admin/reports/admin-report-print";
import {computeTotalPages, formatPageLabel} from "@/lib/pagination";
import {cn} from "@/lib/utils";

const PAGE_SIZE = 10;

type ReportTabMeta = {
  id: AdminReportModuleId;
  label: string;
  description: string;
  Icon: typeof ReceiptText;
};

const REPORT_TABS: readonly ReportTabMeta[] = [
  {
    id: "service_fees",
    label: "FEASTA Service Fees",
    description:
      "History of FEASTA service fees earned, refunded fees, and net FEASTA fees per payment.",
    Icon: ReceiptText,
  },
  {
    id: "fee_withdrawals",
    label: "Fee Withdrawals",
    description:
      "History of admin withdrawals recorded from the FEASTA service fee wallet.",
    Icon: ArrowDownToLine,
  },
  {
    id: "bookings",
    label: "Bookings & Cancellations",
    description:
      "Submitted platform bookings, event dates, statuses, payments, and cancellations.",
    Icon: CalendarDays,
  },
  {
    id: "providers",
    label: "Provider Performance",
    description:
      "Providers ranked by booking volume, highest ratings, completed events, and gross value.",
    Icon: Award,
  },
  {
    id: "users",
    label: "Users Directory",
    description:
      "Registered FEASTA customer and provider accounts with activity and status.",
    Icon: Users,
  },
];

const DATE_PRESET_OPTIONS: readonly (readonly [
  AdminReportModuleDatePreset,
  string,
])[] = [
  ["all_time", "All time"],
  ["today", "Today"],
  ["last_7_days", "Last 7 days"],
  ["last_30_days", "Last 30 days"],
  ["last_3_months", "Last 3 calendar months"],
  ["this_year", "This year"],
  ["custom", "Custom dates"],
];

const FEE_STATUS_OPTION_LABELS: Record<
  Exclude<ServiceFeesReportFilters["status"], "all">,
  string
> = {
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

const WITHDRAWAL_METHOD_OPTION_LABELS: Record<
  Exclude<FeeWithdrawalsReportFilters["method"], "all">,
  string
> = {
  gcash: "GCash",
  bank: "Bank transfer",
};

const USER_ROLE_OPTION_LABELS: Record<
  Exclude<UsersDirectoryRoleFilter, "all">,
  string
> = {
  customer: "Customers",
  provider: "Providers",
};

type ModulePayloadMap = {
  service_fees?: ServiceFeesReportPayload;
  fee_withdrawals?: FeeWithdrawalsReportPayload;
  bookings?: BookingsReportPayload;
  providers?: ProviderPerformanceReportPayload;
  users?: UsersDirectoryReportPayload;
};

type AdminReportsWorkspaceClientProps = {
  initialServiceFees: ServiceFeesReportPayload;
};

export function AdminReportsWorkspaceClient({
  initialServiceFees,
}: AdminReportsWorkspaceClientProps) {
  const [activeTab, setActiveTab] =
    useState<AdminReportModuleId>("service_fees");
  const [payloads, setPayloads] = useState<ModulePayloadMap>({
    service_fees: initialServiceFees,
  });

  const [serviceFeesFilters, setServiceFeesFilters] =
    useState<ServiceFeesReportFilters>(initialServiceFees.filters);
  const [feeWithdrawalsFilters, setFeeWithdrawalsFilters] =
    useState<FeeWithdrawalsReportFilters>(DEFAULT_FEE_WITHDRAWALS_FILTERS);
  const [bookingsFilters, setBookingsFilters] =
    useState<BookingsReportFilters>(DEFAULT_BOOKINGS_REPORT_FILTERS);
  const [providersFilters, setProvidersFilters] =
    useState<ProviderPerformanceReportFilters>(
      DEFAULT_PROVIDER_PERFORMANCE_FILTERS,
    );
  const [usersFilters, setUsersFilters] =
    useState<UsersDirectoryReportFilters>(DEFAULT_USERS_DIRECTORY_FILTERS);

  const [pageIndexByTab, setPageIndexByTab] = useState<
    Record<AdminReportModuleId, number>
  >({
    service_fees: 0,
    fee_withdrawals: 0,
    bookings: 0,
    providers: 0,
    users: 0,
  });

  const [errorByTab, setErrorByTab] = useState<
    Partial<Record<AdminReportModuleId, string>>
  >({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [loadingTab, setLoadingTab] = useState<AdminReportModuleId | null>(
    null,
  );
  const isPending = loadingTab === activeTab;

  const requestCounter = useRef<Record<AdminReportModuleId, number>>({
    service_fees: 0,
    fee_withdrawals: 0,
    bookings: 0,
    providers: 0,
    users: 0,
  });
  const tabRefs = useRef<
    Record<AdminReportModuleId, HTMLButtonElement | null>
  >({
    service_fees: null,
    fee_withdrawals: null,
    bookings: null,
    providers: null,
    users: null,
  });

  const fetchModule = useCallback((request: AdminReportModuleRequest) => {
    const tab = request.module;
    const reqId = ++requestCounter.current[tab];
    setErrorByTab((current) => ({...current, [tab]: undefined}));
    setActionError(null);
    setLoadingTab(tab);

    void loadAdminReportModuleAction(request)
      .then((result) => {
        if (requestCounter.current[tab] !== reqId) return;

        setPayloads((current) => ({
          ...current,
          [tab]: result,
        }));
        setPageIndexByTab((current) => ({...current, [tab]: 0}));
      })
      .catch((err: unknown) => {
        if (requestCounter.current[tab] !== reqId) return;
        setErrorByTab((current) => ({
          ...current,
          [tab]:
            err instanceof Error
              ? err.message
              : "This report could not be loaded. Please try again.",
        }));
      })
      .finally(() => {
        if (requestCounter.current[tab] === reqId) {
          setLoadingTab((current) => (current === tab ? null : current));
        }
      });
  }, []);

  const currentRequestForTab = useCallback(
    (tab: AdminReportModuleId): AdminReportModuleRequest => {
      switch (tab) {
        case "service_fees":
          return {module: "service_fees", filters: serviceFeesFilters};
        case "fee_withdrawals":
          return {module: "fee_withdrawals", filters: feeWithdrawalsFilters};
        case "bookings":
          return {module: "bookings", filters: bookingsFilters};
        case "providers":
          return {module: "providers", filters: providersFilters};
        case "users":
          return {module: "users", filters: usersFilters};
      }
    },
    [
      bookingsFilters,
      feeWithdrawalsFilters,
      providersFilters,
      serviceFeesFilters,
      usersFilters,
    ],
  );

  const selectTab = useCallback(
    (tab: AdminReportModuleId) => {
      setActiveTab(tab);
      setActionError(null);
      if (!payloads[tab]) {
        fetchModule(currentRequestForTab(tab));
      }
    },
    [currentRequestForTab, fetchModule, payloads],
  );

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % REPORT_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + REPORT_TABS.length) % REPORT_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = REPORT_TABS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = REPORT_TABS[nextIndex];
    selectTab(nextTab.id);
    tabRefs.current[nextTab.id]?.focus();
  };

  const applyActiveFilters = () => {
    const request = currentRequestForTab(activeTab);
    if (
      request.module !== "users" &&
      request.filters.datePreset === "custom" &&
      (!request.filters.startDate || !request.filters.endDate)
    ) {
      setErrorByTab((current) => ({
        ...current,
        [activeTab]:
          "Choose both a start date and an end date for a custom report.",
      }));
      return;
    }
    fetchModule(request);
  };

  const resetActiveFilters = () => {
    switch (activeTab) {
      case "service_fees":
        setServiceFeesFilters(DEFAULT_SERVICE_FEES_FILTERS);
        fetchModule({
          module: "service_fees",
          filters: DEFAULT_SERVICE_FEES_FILTERS,
        });
        break;
      case "fee_withdrawals":
        setFeeWithdrawalsFilters(DEFAULT_FEE_WITHDRAWALS_FILTERS);
        fetchModule({
          module: "fee_withdrawals",
          filters: DEFAULT_FEE_WITHDRAWALS_FILTERS,
        });
        break;
      case "bookings":
        setBookingsFilters(DEFAULT_BOOKINGS_REPORT_FILTERS);
        fetchModule({
          module: "bookings",
          filters: DEFAULT_BOOKINGS_REPORT_FILTERS,
        });
        break;
      case "providers":
        setProvidersFilters(DEFAULT_PROVIDER_PERFORMANCE_FILTERS);
        fetchModule({
          module: "providers",
          filters: DEFAULT_PROVIDER_PERFORMANCE_FILTERS,
        });
        break;
      case "users":
        setUsersFilters(DEFAULT_USERS_DIRECTORY_FILTERS);
        fetchModule({
          module: "users",
          filters: DEFAULT_USERS_DIRECTORY_FILTERS,
        });
        break;
    }
  };

  const activeMeta =
    REPORT_TABS.find((tab) => tab.id === activeTab) ?? REPORT_TABS[0];
  const activePayload: AdminReportModulePayload | undefined =
    payloads[activeTab];
  const activeError = errorByTab[activeTab];
  const activePageIndex = pageIndexByTab[activeTab];

  const printableSpec = useMemo(
    () => (activePayload ? buildPrintableReportSpec(activePayload) : null),
    [activePayload],
  );

  const handleExportPdf = async () => {
    if (!printableSpec) return;
    setActionError(null);
    setIsExportingPdf(true);
    try {
      await downloadSubModuleReportPdf(printableSpec);
    } catch {
      setActionError("The PDF report could not be generated. Please try again.");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintValues = () => {
    if (!printableSpec) return;
    setActionError(null);
    try {
      printSubModuleReport(printableSpec);
    } catch {
      setActionError("Print preview could not be opened. Please try again.");
    }
  };

  const setActivePageIndex = (nextIndex: number) => {
    setPageIndexByTab((current) => ({...current, [activeTab]: nextIndex}));
  };

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Reports"
        description="Generate, export to PDF, and print structured FEASTA administrative reports."
      />

      <section
        className="min-w-0 overflow-hidden rounded-card border border-border bg-card shadow-card"
        aria-label="Reports workspace"
      >
        <div
          className="flex min-w-0 items-end gap-5 overflow-x-auto border-b border-border px-4 sm:px-5"
          role="tablist"
          aria-label="Report sub-modules"
        >
          {REPORT_TABS.map((tab, index) => {
            const selected = activeTab === tab.id;
            const TabIcon = tab.Icon;

            return (
              <button
                key={tab.id}
                ref={(node) => {
                  tabRefs.current[tab.id] = node;
                }}
                type="button"
                role="tab"
                id={`admin-reports-tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`admin-reports-panel-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  "relative inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap px-1 py-3 text-sm font-bold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  selected
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <TabIcon aria-hidden="true" className="size-4 shrink-0" />
                <span>{tab.label}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-t-full transition-colors duration-fast",
                    selected ? "bg-primary" : "bg-transparent",
                  )}
                />
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`admin-reports-panel-${activeTab}`}
          aria-labelledby={`admin-reports-tab-${activeTab}`}
          className="grid min-w-0 gap-5 p-4 sm:p-5"
        >
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-black tracking-tight text-foreground">
                {activeMeta.label}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeMeta.description}
              </p>
              {activePayload ? (
                <p className="mt-1.5 text-xs font-semibold text-primary-strong">
                  Period: {activePayload.periodLabel}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                size="compact"
                disabled={!printableSpec || isPending || isExportingPdf}
                onClick={() => {
                  void handleExportPdf();
                }}
              >
                <FileDown aria-hidden="true" className="size-4" />
                {isExportingPdf ? "Exporting PDF..." : "Export PDF"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="compact"
                disabled={!printableSpec || isPending}
                onClick={handlePrintValues}
              >
                <Printer aria-hidden="true" className="size-4" />
                Print
              </Button>
            </div>
          </div>

          <section
            aria-label={`${activeMeta.label} filters`}
            className="grid gap-4 rounded-xl border border-border/80 bg-secondary/35 p-4"
          >
            {activeTab === "service_fees" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DatePresetSelect
                  value={serviceFeesFilters.datePreset}
                  disabled={isPending}
                  onChange={(datePreset) =>
                    setServiceFeesFilters((current) => ({
                      ...current,
                      datePreset,
                      ...(datePreset !== "custom"
                        ? {startDate: null, endDate: null}
                        : {}),
                    }))
                  }
                />
                <FilterField label="Payment status">
                  <Select
                    aria-label="Payment status"
                    value={serviceFeesFilters.status}
                    disabled={isPending}
                    onChange={(event) =>
                      setServiceFeesFilters((current) => ({
                        ...current,
                        status: event.target
                          .value as ServiceFeesReportFilters["status"],
                      }))
                    }
                  >
                    <option value="all">All statuses</option>
                    {serviceFeesFilters.status !== "all" &&
                    !(payloads.service_fees?.availableStatuses ?? []).includes(
                      serviceFeesFilters.status,
                    ) ? (
                      <option value={serviceFeesFilters.status} disabled>
                        {FEE_STATUS_OPTION_LABELS[serviceFeesFilters.status]} (no records)
                      </option>
                    ) : null}
                    {(payloads.service_fees?.availableStatuses ?? []).map(
                      (status) => (
                        <option key={status} value={status}>
                          {FEE_STATUS_OPTION_LABELS[status]}
                        </option>
                      ),
                    )}
                  </Select>
                </FilterField>
                <FilterActions
                  loading={isPending}
                  onApply={applyActiveFilters}
                  onReset={resetActiveFilters}
                />
              </div>
            ) : null}

            {activeTab === "fee_withdrawals" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DatePresetSelect
                  value={feeWithdrawalsFilters.datePreset}
                  disabled={isPending}
                  onChange={(datePreset) =>
                    setFeeWithdrawalsFilters((current) => ({
                      ...current,
                      datePreset,
                      ...(datePreset !== "custom"
                        ? {startDate: null, endDate: null}
                        : {}),
                    }))
                  }
                />
                <FilterField label="Method">
                  <Select
                    aria-label="Withdrawal method"
                    value={feeWithdrawalsFilters.method}
                    disabled={isPending}
                    onChange={(event) =>
                      setFeeWithdrawalsFilters((current) => ({
                        ...current,
                        method: event.target
                          .value as FeeWithdrawalsReportFilters["method"],
                      }))
                    }
                  >
                    <option value="all">All methods</option>
                    {feeWithdrawalsFilters.method !== "all" &&
                    !(payloads.fee_withdrawals?.availableMethods ?? []).includes(
                      feeWithdrawalsFilters.method,
                    ) ? (
                      <option value={feeWithdrawalsFilters.method} disabled>
                        {WITHDRAWAL_METHOD_OPTION_LABELS[feeWithdrawalsFilters.method]} (no records)
                      </option>
                    ) : null}
                    {(payloads.fee_withdrawals?.availableMethods ?? []).map(
                      (method) => (
                        <option key={method} value={method}>
                          {WITHDRAWAL_METHOD_OPTION_LABELS[method]}
                        </option>
                      ),
                    )}
                  </Select>
                </FilterField>
                <FilterActions
                  loading={isPending}
                  onApply={applyActiveFilters}
                  onReset={resetActiveFilters}
                />
              </div>
            ) : null}

            {activeTab === "bookings" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DatePresetSelect
                  value={bookingsFilters.datePreset}
                  disabled={isPending}
                  onChange={(datePreset) =>
                    setBookingsFilters((current) => ({
                      ...current,
                      datePreset,
                      ...(datePreset !== "custom"
                        ? {startDate: null, endDate: null}
                        : {}),
                    }))
                  }
                />
                <FilterField label="Booking status">
                  <Select
                    aria-label="Booking status"
                    value={bookingsFilters.status}
                    disabled={isPending}
                    onChange={(event) =>
                      setBookingsFilters((current) => ({
                        ...current,
                        status: event.target.value as "all" | MainEventStatus,
                      }))
                    }
                  >
                    <option value="all">All statuses</option>
                    {bookingsFilters.status !== "all" &&
                    !(payloads.bookings?.availableStatuses ?? []).includes(
                      bookingsFilters.status,
                    ) ? (
                      <option value={bookingsFilters.status} disabled>
                        {adminBookingStatusLabel(bookingsFilters.status)} (no records)
                      </option>
                    ) : null}
                    {(payloads.bookings?.availableStatuses ?? []).map(
                      (status) => (
                        <option key={status} value={status}>
                          {adminBookingStatusLabel(status)}
                        </option>
                      ),
                    )}
                  </Select>
                </FilterField>
                <FilterActions
                  loading={isPending}
                  onApply={applyActiveFilters}
                  onReset={resetActiveFilters}
                />
              </div>
            ) : null}

            {activeTab === "providers" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DatePresetSelect
                  value={providersFilters.datePreset}
                  disabled={isPending}
                  onChange={(datePreset) =>
                    setProvidersFilters((current) => ({
                      ...current,
                      datePreset,
                      ...(datePreset !== "custom"
                        ? {startDate: null, endDate: null}
                        : {}),
                    }))
                  }
                />
                <FilterField label="Service category">
                  <Select
                    aria-label="Service category"
                    value={providersFilters.serviceCategory}
                    disabled={isPending}
                    onChange={(event) =>
                      setProvidersFilters((current) => ({
                        ...current,
                        serviceCategory: event.target.value,
                      }))
                    }
                  >
                    <option value="">All service categories</option>
                    {providersFilters.serviceCategory &&
                    !(payloads.providers?.availableServiceCategories ?? []).some(
                      ([code]) => code === providersFilters.serviceCategory,
                    ) ? (
                      <option value={providersFilters.serviceCategory} disabled>
                        Selected category (no records)
                      </option>
                    ) : null}
                    {(payloads.providers?.availableServiceCategories ?? []).map(
                      ([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ),
                    )}
                  </Select>
                </FilterField>
                <FilterField label="Rank / Sort by">
                  <Select
                    aria-label="Rank providers by"
                    value={providersFilters.sortBy}
                    disabled={isPending}
                    onChange={(event) =>
                      setProvidersFilters((current) => ({
                        ...current,
                        sortBy: event.target.value as ProviderPerformanceSort,
                      }))
                    }
                  >
                    <option value="most_bookings">Most bookings</option>
                    <option value="highest_rating">Highest rating</option>
                    <option value="most_completed">Most completed</option>
                    <option value="highest_value">Highest gross value</option>
                  </Select>
                </FilterField>
                <FilterActions
                  loading={isPending}
                  onApply={applyActiveFilters}
                  onReset={resetActiveFilters}
                />
              </div>
            ) : null}

            {activeTab === "users" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FilterField label="Role">
                  <Select
                    aria-label="User role"
                    value={usersFilters.role}
                    disabled={isPending}
                    onChange={(event) =>
                      setUsersFilters((current) => ({
                        ...current,
                        role: event.target.value as UsersDirectoryRoleFilter,
                      }))
                    }
                  >
                    <option value="all">All roles</option>
                    {usersFilters.role !== "all" &&
                    !(payloads.users?.availableRoles ?? []).includes(
                      usersFilters.role,
                    ) ? (
                      <option value={usersFilters.role} disabled>
                        {USER_ROLE_OPTION_LABELS[usersFilters.role]} (no records)
                      </option>
                    ) : null}
                    {(payloads.users?.availableRoles ?? []).map((role) => (
                      <option key={role} value={role}>
                        {USER_ROLE_OPTION_LABELS[role]}
                      </option>
                    ))}
                  </Select>
                </FilterField>
                <FilterField label="Account status">
                  <Select
                    aria-label="Account status"
                    value={usersFilters.status}
                    disabled={isPending}
                    onChange={(event) =>
                      setUsersFilters((current) => ({
                        ...current,
                        status: event.target.value as
                          | "all"
                          | UserDirectoryStatus,
                      }))
                    }
                  >
                    <option value="all">All statuses</option>
                    {usersFilters.status !== "all" &&
                    !(payloads.users?.availableStatuses ?? []).includes(
                      usersFilters.status,
                    ) ? (
                      <option value={usersFilters.status} disabled>
                        {usersFilters.status} (no records)
                      </option>
                    ) : null}
                    {(payloads.users?.availableStatuses ?? []).map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                </FilterField>
                <FilterField label="Municipality">
                  <Select
                    aria-label="Municipality"
                    value={usersFilters.municipality}
                    disabled={isPending}
                    onChange={(event) =>
                      setUsersFilters((current) => ({
                        ...current,
                        municipality: event.target.value,
                      }))
                    }
                  >
                    <option value="">All municipalities</option>
                    {(payloads.users?.municipalities ?? []).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ),
                    )}
                  </Select>
                </FilterField>
                <FilterActions
                  loading={isPending}
                  onApply={applyActiveFilters}
                  onReset={resetActiveFilters}
                />
              </div>
            ) : null}

            {activeTab !== "users" &&
            getDateFilters(
              activeTab,
              serviceFeesFilters,
              feeWithdrawalsFilters,
              bookingsFilters,
              providersFilters,
            ).datePreset === "custom" ? (
              <CustomDateRangeRow
                filters={getDateFilters(
                  activeTab,
                  serviceFeesFilters,
                  feeWithdrawalsFilters,
                  bookingsFilters,
                  providersFilters,
                )}
                disabled={isPending}
                onChange={(patch) => {
                  if (activeTab === "service_fees") {
                    setServiceFeesFilters((current) => ({...current, ...patch}));
                  } else if (activeTab === "fee_withdrawals") {
                    setFeeWithdrawalsFilters((current) => ({
                      ...current,
                      ...patch,
                    }));
                  } else if (activeTab === "bookings") {
                    setBookingsFilters((current) => ({...current, ...patch}));
                  } else if (activeTab === "providers") {
                    setProvidersFilters((current) => ({...current, ...patch}));
                  }
                }}
              />
            ) : null}
          </section>

          {actionError ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive-subtle px-4 py-3 text-sm font-semibold text-destructive"
            >
              {actionError}
            </div>
          ) : null}

          {activeError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive-subtle px-4 py-3 text-sm text-destructive"
            >
              <span className="font-semibold">{activeError}</span>
              <Button
                type="button"
                size="compact"
                variant="secondary"
                onClick={applyActiveFilters}
              >
                Try again
              </Button>
            </div>
          ) : null}

          {!activePayload ? (
            <TableLoadingSkeleton caption={`Loading ${activeMeta.label}`} />
          ) : (
            <>
              {printableSpec ? (
                <dl
                  aria-label={`${activeMeta.label} summary`}
                  className={cn(
                    "grid gap-3 sm:grid-cols-2",
                    printableSpec.summary.length === 3
                      ? "lg:grid-cols-3"
                      : "lg:grid-cols-4",
                  )}
                >
                  {printableSpec.summary.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl border border-border bg-secondary/25 px-4 py-3"
                    >
                      <dt className="text-xs font-semibold text-muted-foreground">
                        {item.label}
                      </dt>
                      <dd className="mt-1 truncate text-lg font-black tabular-nums text-primary-strong">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <SubModuleTableView
                payload={activePayload}
                pageIndex={activePageIndex}
                onPageChange={setActivePageIndex}
                updating={isPending}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function SubModuleTableView({
  payload,
  pageIndex,
  onPageChange,
  updating,
}: {
  payload: AdminReportModulePayload;
  pageIndex: number;
  onPageChange: (nextIndex: number) => void;
  updating: boolean;
}) {
  switch (payload.module) {
    case "service_fees":
      return (
        <PaginatedReportTable
          rows={payload.rows}
          pageIndex={pageIndex}
          onPageChange={onPageChange}
          updating={updating}
          caption="FEASTA service fees report records"
          emptyTitle="No service fee records found"
          emptyDescription="No paid or refunded fee records match the selected period and status."
          columns={SERVICE_FEE_COLUMNS}
          renderMobileRow={(row) => (
            <MobileReportCard
              title={row.bookingCode}
              subtitle={`${row.dateLabel} · ${row.paymentTypeLabel}`}
              badge={row.statusLabel}
              highlight={row.netFeeFormatted}
              highlightLabel="Net FEASTA fee"
              fields={[
                ["Customer", row.customerName],
                ["Provider", row.providerName],
                ["Customer paid", row.customerPaidFormatted],
                ["FEASTA fee", row.feeEarnedFormatted],
                ["Fee refunded", row.feeRefundedFormatted],
              ]}
            />
          )}
        />
      );

    case "fee_withdrawals":
      return (
        <PaginatedReportTable
          rows={payload.rows}
          pageIndex={pageIndex}
          onPageChange={onPageChange}
          updating={updating}
          caption="FEASTA fee withdrawals report records"
          emptyTitle="No fee withdrawals found"
          emptyDescription="No FEASTA service fee withdrawals match the selected period and method."
          columns={FEE_WITHDRAWAL_COLUMNS}
          renderMobileRow={(row) => (
            <MobileReportCard
              title={row.accountName}
              subtitle={row.dateLabel}
              badge={row.statusLabel}
              highlight={row.amountFormatted}
              highlightLabel="Withdrawn"
              fields={[
                ["Method", row.methodLabel],
                ["Destination", row.destination],
                ["Reference", row.reference],
              ]}
            />
          )}
        />
      );

    case "bookings":
      return (
        <PaginatedReportTable
          rows={payload.rows}
          pageIndex={pageIndex}
          onPageChange={onPageChange}
          updating={updating}
          caption="Bookings and cancellations report records"
          emptyTitle="No bookings found"
          emptyDescription="No submitted bookings match the selected period and status."
          columns={BOOKING_COLUMNS}
          renderMobileRow={(row) => (
            <MobileReportCard
              title={row.bookingCode}
              subtitle={`${row.eventDateLabel} · ${row.eventTypeLabel}`}
              badge={row.bookingStatusLabel}
              highlight={row.paidFormatted}
              highlightLabel="Paid"
              fields={[
                ["Customer", row.customerName],
                ["Provider(s)", row.providerNames],
                ["Payment", row.paymentStatusLabel],
                ["Refunded", row.refundedFormatted],
              ]}
            />
          )}
        />
      );

    case "providers":
      return (
        <PaginatedReportTable
          rows={payload.rows}
          pageIndex={pageIndex}
          onPageChange={onPageChange}
          updating={updating}
          caption="Provider performance and ratings report records"
          emptyTitle="No providers found"
          emptyDescription="No providers match the selected service category filter."
          columns={PROVIDER_COLUMNS}
          renderMobileRow={(row) => (
            <MobileReportCard
              title={`#${row.rank} ${row.providerName}`}
              subtitle={row.serviceCategoryLabel}
              badge={row.ratingLabel}
              highlight={row.grossValueFormatted}
              highlightLabel="Gross value"
              fields={[
                ["Bookings", String(row.totalBookings)],
                ["Completed", String(row.completedEvents)],
                ["Cancelled", String(row.cancelledBookings)],
                ["Acceptance", row.acceptanceRateFormatted],
              ]}
            />
          )}
        />
      );

    case "users":
      return (
        <PaginatedReportTable
          rows={payload.rows}
          pageIndex={pageIndex}
          onPageChange={onPageChange}
          updating={updating}
          caption="Users directory report records"
          emptyTitle="No users found"
          emptyDescription="No registered accounts match the selected filters."
          columns={USER_COLUMNS}
          renderMobileRow={(row) => (
            <MobileReportCard
              title={row.fullName}
              subtitle={`${row.roleLabel} · Joined ${row.dateJoinedLabel}`}
              badge={row.status}
              highlight={String(row.bookingsCount)}
              highlightLabel="Bookings"
              fields={[
                ["Email", row.email],
                ["Phone", row.phone],
                ["Municipality", row.municipality],
              ]}
            />
          )}
        />
      );
  }
}

function PaginatedReportTable<T extends {id: string}>({
  rows,
  pageIndex,
  onPageChange,
  updating,
  caption,
  emptyTitle,
  emptyDescription,
  columns,
  renderMobileRow,
}: {
  rows: T[];
  pageIndex: number;
  onPageChange: (nextIndex: number) => void;
  updating: boolean;
  caption: string;
  emptyTitle: string;
  emptyDescription: string;
  columns: readonly DataTableColumn<T>[];
  renderMobileRow: (row: T) => React.ReactNode;
}) {
  const totalPages = computeTotalPages(rows.length, PAGE_SIZE) ?? 1;
  const safePageIndex = Math.min(pageIndex, Math.max(0, totalPages - 1));
  const start = safePageIndex * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="grid min-w-0 gap-4">
      <DataTable
        columns={columns}
        rows={pageRows}
        getRowId={(row) => row.id}
        caption={caption}
        className="[&_table]:min-w-[54rem] [&_th]:px-3 [&_td]:px-3"
        updating={updating}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        renderMobileRow={renderMobileRow}
      />
      <CursorPagination
        previousCursor={safePageIndex > 0 ? String(safePageIndex - 1) : null}
        nextCursor={
          safePageIndex + 1 < totalPages ? String(safePageIndex + 1) : null
        }
        loading={updating}
        pageLabel={formatPageLabel(safePageIndex + 1, totalPages)}
        onPrevious={() => onPageChange(Math.max(0, safePageIndex - 1))}
        onNext={() =>
          onPageChange(Math.min(totalPages - 1, safePageIndex + 1))
        }
      />
    </div>
  );
}

const SERVICE_FEE_COLUMNS: readonly DataTableColumn<ServiceFeeReportRow>[] = [
  {
    id: "date",
    header: "Date",
    cell: (row) => (
      <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
        {row.dateLabel}
      </span>
    ),
  },
  {
    id: "booking",
    header: "Booking",
    cell: (row) => (
      <div className="min-w-0">
        <p className="whitespace-nowrap font-semibold text-foreground">
          {row.bookingCode}
        </p>
        <p className="text-xs text-muted-foreground">{row.paymentTypeLabel}</p>
      </div>
    ),
  },
  {
    id: "customer",
    header: "Customer",
    cell: (row) => <span className="font-medium">{row.customerName}</span>,
  },
  {
    id: "provider",
    header: "Provider",
    cell: (row) => <span className="font-medium">{row.providerName}</span>,
  },
  {
    id: "customerPaid",
    header: "Customer paid",
    cell: (row) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.customerPaidFormatted}
      </span>
    ),
  },
  {
    id: "feeEarned",
    header: "FEASTA fee",
    cell: (row) => (
      <span className="whitespace-nowrap tabular-nums">
        {row.feeEarnedFormatted}
      </span>
    ),
  },
  {
    id: "feeRefunded",
    header: "Fee refunded",
    cell: (row) => (
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        {row.feeRefundedFormatted}
      </span>
    ),
  },
  {
    id: "netFee",
    header: "Net fee",
    cell: (row) => (
      <span className="whitespace-nowrap font-bold tabular-nums text-primary">
        {row.netFeeFormatted}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <Badge
        tone={row.statusLabel === "Paid" ? "success" : "warning"}
        shape="rounded"
        size="compact"
      >
        {row.statusLabel}
      </Badge>
    ),
  },
];

const FEE_WITHDRAWAL_COLUMNS: readonly DataTableColumn<FeeWithdrawalReportRow>[] =
  [
    {
      id: "date",
      header: "Date withdrawn",
      cell: (row) => (
        <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
          {row.dateLabel}
        </span>
      ),
    },
    {
      id: "reference",
      header: "Reference",
      cell: (row) => (
        <span className="break-all font-mono text-xs text-muted-foreground">
          {row.reference}
        </span>
      ),
    },
    {
      id: "method",
      header: "Method",
      cell: (row) => (
        <span className="whitespace-nowrap font-semibold">
          {row.methodLabel}
        </span>
      ),
    },
    {
      id: "accountName",
      header: "Account name",
      cell: (row) => <span className="font-medium">{row.accountName}</span>,
    },
    {
      id: "destination",
      header: "Destination",
      cell: (row) => (
        <span className="text-muted-foreground">{row.destination}</span>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      cell: (row) => (
        <span className="whitespace-nowrap font-bold tabular-nums text-primary">
          {row.amountFormatted}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <Badge tone="success" shape="rounded" size="compact">
          {row.statusLabel}
        </Badge>
      ),
    },
  ];

const BOOKING_COLUMNS: readonly DataTableColumn<BookingReportRow>[] = [
  {
    id: "booking",
    header: "Booking",
    cell: (row) => (
      <span className="whitespace-nowrap font-semibold text-foreground">
        {row.bookingCode}
      </span>
    ),
  },
  {
    id: "eventDate",
    header: "Event date",
    cell: (row) => (
      <div className="min-w-0">
        <p className="whitespace-nowrap text-sm tabular-nums">
          {row.eventDateLabel}
        </p>
        <p className="text-xs text-muted-foreground">{row.eventTypeLabel}</p>
      </div>
    ),
  },
  {
    id: "customer",
    header: "Customer",
    cell: (row) => <span className="font-medium">{row.customerName}</span>,
  },
  {
    id: "providers",
    header: "Provider(s)",
    cell: (row) => <span className="font-medium">{row.providerNames}</span>,
  },
  {
    id: "bookingStatus",
    header: "Booking status",
    cell: (row) => (
      <Badge
        tone={
          row.bookingStatusLabel === "Completed" ||
          row.bookingStatusLabel === "Confirmed"
            ? "success"
            : row.bookingStatusLabel === "Cancelled" ||
                row.bookingStatusLabel === "Rejected"
              ? "destructive"
              : "neutral"
        }
        shape="rounded"
        size="compact"
      >
        {row.bookingStatusLabel}
      </Badge>
    ),
  },
  {
    id: "paymentStatus",
    header: "Payment",
    cell: (row) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {row.paymentStatusLabel}
      </span>
    ),
  },
  {
    id: "paid",
    header: "Paid",
    cell: (row) => (
      <span className="whitespace-nowrap font-bold tabular-nums text-primary">
        {row.paidFormatted}
      </span>
    ),
  },
  {
    id: "refunded",
    header: "Refunded",
    cell: (row) => (
      <span className="whitespace-nowrap tabular-nums text-muted-foreground">
        {row.refundedFormatted}
      </span>
    ),
  },
];

const PROVIDER_COLUMNS: readonly DataTableColumn<ProviderPerformanceReportRow>[] =
  [
    {
      id: "rank",
      header: "#",
      cell: (row) => (
        <span className="font-bold tabular-nums text-muted-foreground">
          {row.rank}
        </span>
      ),
    },
    {
      id: "provider",
      header: "Provider",
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{row.providerName}</p>
          <p className="text-xs text-muted-foreground">
            {row.serviceCategoryLabel}
          </p>
        </div>
      ),
    },
    {
      id: "totalBookings",
      header: "Bookings",
      cell: (row) => (
        <span className="font-bold tabular-nums text-foreground">
          {row.totalBookings}
        </span>
      ),
    },
    {
      id: "completedEvents",
      header: "Completed",
      cell: (row) => (
        <span className="tabular-nums">{row.completedEvents}</span>
      ),
    },
    {
      id: "cancelledBookings",
      header: "Cancelled",
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {row.cancelledBookings}
        </span>
      ),
    },
    {
      id: "acceptanceRate",
      header: "Acceptance",
      cell: (row) => (
        <span className="tabular-nums">{row.acceptanceRateFormatted}</span>
      ),
    },
    {
      id: "rating",
      header: "Rating",
      cell: (row) =>
        row.reviewCount > 0 ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm tabular-nums">
            <Star
              aria-hidden="true"
              className={cn("size-3.5", filledRatingStarClassName)}
            />
            <strong>{row.ratingAverage.toFixed(1)}</strong>
            <span className="text-xs text-muted-foreground">
              ({row.reviewCount})
            </span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No reviews</span>
        ),
    },
    {
      id: "grossValue",
      header: "Gross value",
      cell: (row) => (
        <span className="whitespace-nowrap font-bold tabular-nums text-primary">
          {row.grossValueFormatted}
        </span>
      ),
    },
  ];

const USER_COLUMNS: readonly DataTableColumn<UsersDirectoryReportRow>[] = [
  {
    id: "fullName",
    header: "Full name",
    cell: (row) => (
      <span className="font-semibold text-foreground">{row.fullName}</span>
    ),
  },
  {
    id: "role",
    header: "Role",
    cell: (row) => (
      <Badge tone="neutral" shape="rounded" size="compact">
        {row.roleLabel}
      </Badge>
    ),
  },
  {
    id: "contact",
    header: "Email / Phone",
    cell: (row) => (
      <div className="min-w-0">
        <p className="break-all text-sm">{row.email}</p>
        <p className="text-xs text-muted-foreground">{row.phone}</p>
      </div>
    ),
  },
  {
    id: "municipality",
    header: "Municipality",
    cell: (row) => <span>{row.municipality}</span>,
  },
  {
    id: "bookings",
    header: "Bookings",
    cell: (row) => (
      <span className="font-semibold tabular-nums">{row.bookingsCount}</span>
    ),
  },
  {
    id: "joined",
    header: "Date joined",
    cell: (row) => (
      <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
        {row.dateJoinedLabel}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => (
      <Badge
        tone={
          row.status === "Active"
            ? "success"
            : row.status === "Blocked"
              ? "destructive"
              : "warning"
        }
        shape="rounded"
        size="compact"
      >
        {row.status}
      </Badge>
    ),
  },
];

function DatePresetSelect({
  value,
  disabled,
  onChange,
}: {
  value: AdminReportModuleDatePreset;
  disabled: boolean;
  onChange: (value: AdminReportModuleDatePreset) => void;
}) {
  return (
    <FilterField label="Date range">
      <Select
        aria-label="Date range"
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value as AdminReportModuleDatePreset)
        }
      >
        {DATE_PRESET_OPTIONS.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </Select>
    </FilterField>
  );
}

function CustomDateRangeRow({
  filters,
  disabled,
  onChange,
}: {
  filters: DateFilterFields;
  disabled: boolean;
  onChange: (patch: Partial<DateFilterFields>) => void;
}) {
  return (
    <div className="grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-2">
      <FilterField label="Start date">
        <PhilippineDateInput
          plain
          aria-label="Start date"
          value={filters.startDate ?? ""}
          disabled={disabled}
          onChange={(event) =>
            onChange({startDate: event.target.value || null})
          }
          displayClassName="left-3 right-10 text-sm"
          className="min-h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
      </FilterField>
      <FilterField label="End date">
        <PhilippineDateInput
          plain
          aria-label="End date"
          value={filters.endDate ?? ""}
          disabled={disabled}
          onChange={(event) => onChange({endDate: event.target.value || null})}
          displayClassName="left-3 right-10 text-sm"
          className="min-h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
      </FilterField>
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-xs font-bold text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FilterActions({
  loading,
  onApply,
  onReset,
}: {
  loading: boolean;
  onApply: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <Button
        type="button"
        size="compact"
        className="flex-1"
        disabled={loading}
        onClick={onApply}
      >
        Apply filters
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="compact"
        disabled={loading}
        onClick={onReset}
        aria-label="Reset filters"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        Reset
      </Button>
    </div>
  );
}

function MobileReportCard({
  title,
  subtitle,
  badge,
  highlight,
  highlightLabel,
  fields,
}: {
  title: string;
  subtitle: string;
  badge: string;
  highlight: string;
  highlightLabel: string;
  fields: readonly (readonly [string, string])[];
}) {
  return (
    <article className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Badge tone="neutral" shape="rounded" size="compact">
          {badge}
        </Badge>
      </div>
      <div className="border-y border-border/70 py-2">
        <p className="text-xs text-muted-foreground">{highlightLabel}</p>
        <p className="text-lg font-black tabular-nums text-primary">
          {highlight}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="font-semibold text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function getDateFilters(
  tab: Exclude<AdminReportModuleId, "users">,
  serviceFees: ServiceFeesReportFilters,
  feeWithdrawals: FeeWithdrawalsReportFilters,
  bookings: BookingsReportFilters,
  providers: ProviderPerformanceReportFilters,
): DateFilterFields {
  switch (tab) {
    case "service_fees":
      return serviceFees;
    case "fee_withdrawals":
      return feeWithdrawals;
    case "bookings":
      return bookings;
    case "providers":
      return providers;
  }
}
