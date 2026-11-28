import type {MainEventStatus} from "@feasta/shared-types";

export const ADMIN_REPORT_MODULE_IDS = [
  "service_fees",
  "fee_withdrawals",
  "bookings",
  "providers",
  "users",
] as const;

export type AdminReportModuleId = (typeof ADMIN_REPORT_MODULE_IDS)[number];

export const ADMIN_REPORT_MODULE_DATE_PRESETS = [
  "all_time",
  "today",
  "last_7_days",
  "last_30_days",
  "last_3_months",
  "this_year",
  "custom",
] as const;

export type AdminReportModuleDatePreset =
  (typeof ADMIN_REPORT_MODULE_DATE_PRESETS)[number];

export type DateFilterFields = {
  datePreset: AdminReportModuleDatePreset;
  startDate: string | null;
  endDate: string | null;
};

export type ServiceFeesReportFilters = DateFilterFields & {
  status: "all" | "paid" | "partially_refunded" | "refunded";
};

export type FeeWithdrawalsReportFilters = DateFilterFields & {
  method: "all" | "gcash" | "bank";
};

export type BookingsReportFilters = DateFilterFields & {
  status: "all" | MainEventStatus;
};

export type ProviderPerformanceSort =
  | "most_bookings"
  | "highest_rating"
  | "most_completed"
  | "highest_value";

export type ProviderPerformanceReportFilters = DateFilterFields & {
  serviceCategory: string;
  sortBy: ProviderPerformanceSort;
};

export type UsersDirectoryRoleFilter = "all" | "customer" | "provider";

export const USER_DIRECTORY_STATUSES = [
  "Active",
  "Inactive",
  "Blocked",
  "Pending Deletion",
  "Unknown",
] as const;

export type UserDirectoryStatus = (typeof USER_DIRECTORY_STATUSES)[number];

export type UsersDirectoryReportFilters = {
  role: UsersDirectoryRoleFilter;
  status: "all" | UserDirectoryStatus;
  municipality: string;
};

export type AdminReportModuleRequest =
  | {module: "service_fees"; filters: ServiceFeesReportFilters}
  | {module: "fee_withdrawals"; filters: FeeWithdrawalsReportFilters}
  | {module: "bookings"; filters: BookingsReportFilters}
  | {module: "providers"; filters: ProviderPerformanceReportFilters}
  | {module: "users"; filters: UsersDirectoryReportFilters};

export type ServiceFeeReportRow = {
  id: string;
  dateLabel: string;
  bookingCode: string;
  customerName: string;
  providerName: string;
  paymentTypeLabel: string;
  customerPaidFormatted: string;
  feeEarnedFormatted: string;
  feeRefundedFormatted: string;
  netFeeFormatted: string;
  statusLabel: string;
};

export type ServiceFeesReportPayload = {
  module: "service_fees";
  generatedAt: string;
  periodLabel: string;
  filters: ServiceFeesReportFilters;
  availableStatuses: Array<"paid" | "partially_refunded" | "refunded">;
  summary: {
    recordCount: number;
    grossFeeEarnedInCentavos: number;
    grossFeeEarnedFormatted: string;
    feeRefundedInCentavos: number;
    feeRefundedFormatted: string;
    netFeeInCentavos: number;
    netFeeFormatted: string;
  };
  rows: ServiceFeeReportRow[];
};

export type FeeWithdrawalReportRow = {
  id: string;
  dateLabel: string;
  reference: string;
  methodLabel: string;
  accountName: string;
  destination: string;
  amountFormatted: string;
  statusLabel: string;
};

export type FeeWithdrawalsReportPayload = {
  module: "fee_withdrawals";
  generatedAt: string;
  periodLabel: string;
  filters: FeeWithdrawalsReportFilters;
  availableMethods: Array<"gcash" | "bank">;
  summary: {
    withdrawalCount: number;
    totalWithdrawnInCentavos: number;
    totalWithdrawnFormatted: string;
    currentAvailableInCentavos: number;
    currentAvailableFormatted: string;
  };
  rows: FeeWithdrawalReportRow[];
};

export type BookingReportRow = {
  id: string;
  bookingCode: string;
  eventDateLabel: string;
  eventTypeLabel: string;
  customerName: string;
  providerNames: string;
  bookingStatusLabel: string;
  paymentStatusLabel: string;
  paidFormatted: string;
  refundedFormatted: string;
};

export type BookingsReportPayload = {
  module: "bookings";
  generatedAt: string;
  periodLabel: string;
  filters: BookingsReportFilters;
  availableStatuses: MainEventStatus[];
  summary: {
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    cancellationRateFormatted: string;
  };
  rows: BookingReportRow[];
};

export type ProviderPerformanceReportRow = {
  id: string;
  rank: number;
  providerName: string;
  serviceCategoryLabel: string;
  totalBookings: number;
  completedEvents: number;
  cancelledBookings: number;
  acceptanceRateFormatted: string;
  ratingLabel: string;
  ratingAverage: number;
  reviewCount: number;
  grossValueInCentavos: number;
  grossValueFormatted: string;
};

export type ProviderPerformanceReportPayload = {
  module: "providers";
  generatedAt: string;
  periodLabel: string;
  filters: ProviderPerformanceReportFilters;
  availableServiceCategories: Array<[string, string]>;
  summary: {
    providerCount: number;
    topByBookingsLabel: string;
    highestRatedLabel: string;
    totalCompletedEvents: number;
  };
  rows: ProviderPerformanceReportRow[];
};

export type UsersDirectoryReportRow = {
  id: string;
  fullName: string;
  roleLabel: string;
  email: string;
  phone: string;
  municipality: string;
  bookingsCount: number;
  dateJoinedLabel: string;
  status: UserDirectoryStatus;
};

export type UsersDirectoryReportPayload = {
  module: "users";
  generatedAt: string;
  periodLabel: string;
  filters: UsersDirectoryReportFilters;
  availableRoles: Array<"customer" | "provider">;
  availableStatuses: UserDirectoryStatus[];
  municipalities: Array<[string, string]>;
  summary: {
    totalUsers: number;
    customersCount: number;
    providersCount: number;
    activeCount: number;
  };
  rows: UsersDirectoryReportRow[];
};

export type AdminReportModulePayload =
  | ServiceFeesReportPayload
  | FeeWithdrawalsReportPayload
  | BookingsReportPayload
  | ProviderPerformanceReportPayload
  | UsersDirectoryReportPayload;

export type PrintableReportColumn = {
  key: string;
  header: string;
  weight: number;
  align?: "left" | "right";
};

export type PrintableReportSummaryItem = {
  label: string;
  value: string;
};

export type PrintableReportSpec = {
  module: AdminReportModuleId;
  fileSlug: string;
  title: string;
  subtitle: string;
  periodLabel: string;
  filterSummary: string;
  generatedAt: string;
  summary: PrintableReportSummaryItem[];
  columns: PrintableReportColumn[];
  rows: Array<Record<string, string>>;
};

export const DEFAULT_SERVICE_FEES_FILTERS: ServiceFeesReportFilters = {
  datePreset: "all_time",
  startDate: null,
  endDate: null,
  status: "all",
};

export const DEFAULT_FEE_WITHDRAWALS_FILTERS: FeeWithdrawalsReportFilters = {
  datePreset: "all_time",
  startDate: null,
  endDate: null,
  method: "all",
};

export const DEFAULT_BOOKINGS_REPORT_FILTERS: BookingsReportFilters = {
  datePreset: "all_time",
  startDate: null,
  endDate: null,
  status: "all",
};

export const DEFAULT_PROVIDER_PERFORMANCE_FILTERS: ProviderPerformanceReportFilters =
  {
    datePreset: "all_time",
    startDate: null,
    endDate: null,
    serviceCategory: "",
    sortBy: "most_bookings",
  };

export const DEFAULT_USERS_DIRECTORY_FILTERS: UsersDirectoryReportFilters = {
  role: "all",
  status: "all",
  municipality: "",
};

const SORT_LABELS: Record<ProviderPerformanceSort, string> = {
  most_bookings: "Most bookings",
  highest_rating: "Highest rating",
  most_completed: "Most completed",
  highest_value: "Highest gross value",
};

const FEE_STATUS_LABELS: Record<ServiceFeesReportFilters["status"], string> = {
  all: "All statuses",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
};

const WITHDRAWAL_METHOD_LABELS: Record<
  FeeWithdrawalsReportFilters["method"],
  string
> = {
  all: "All methods",
  gcash: "GCash",
  bank: "Bank transfer",
};

const USER_ROLE_LABELS: Record<UsersDirectoryRoleFilter, string> = {
  all: "All roles",
  customer: "Customers",
  provider: "Providers",
};

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-PH").format(value);
}

export function buildPrintableReportSpec(
  payload: AdminReportModulePayload,
): PrintableReportSpec {
  switch (payload.module) {
    case "service_fees":
      return {
        module: "service_fees",
        fileSlug: "feasta-service-fees-report",
        title: "FEASTA Service Fees Report",
        subtitle: "Service fee earnings, refunded fees, and net FEASTA fee per payment.",
        periodLabel: payload.periodLabel,
        filterSummary: `Status: ${FEE_STATUS_LABELS[payload.filters.status]}`,
        generatedAt: payload.generatedAt,
        summary: [
          {label: "Transactions", value: formatInteger(payload.summary.recordCount)},
          {label: "FEASTA fees earned", value: payload.summary.grossFeeEarnedFormatted},
          {label: "Refunded fees", value: payload.summary.feeRefundedFormatted},
          {label: "Net FEASTA fees", value: payload.summary.netFeeFormatted},
        ],
        columns: [
          {key: "dateLabel", header: "Date", weight: 1.1},
          {key: "bookingCode", header: "Booking", weight: 1.1},
          {key: "customerName", header: "Customer", weight: 1.25},
          {key: "providerName", header: "Provider", weight: 1.25},
          {key: "paymentTypeLabel", header: "Type", weight: 1.0},
          {key: "customerPaidFormatted", header: "Customer paid", weight: 1.05, align: "right"},
          {key: "feeEarnedFormatted", header: "FEASTA fee", weight: 0.95, align: "right"},
          {key: "feeRefundedFormatted", header: "Fee refunded", weight: 0.95, align: "right"},
          {key: "netFeeFormatted", header: "Net fee", weight: 0.95, align: "right"},
          {key: "statusLabel", header: "Status", weight: 0.95},
        ],
        rows: payload.rows.map((row) => ({
          dateLabel: row.dateLabel,
          bookingCode: row.bookingCode,
          customerName: row.customerName,
          providerName: row.providerName,
          paymentTypeLabel: row.paymentTypeLabel,
          customerPaidFormatted: row.customerPaidFormatted,
          feeEarnedFormatted: row.feeEarnedFormatted,
          feeRefundedFormatted: row.feeRefundedFormatted,
          netFeeFormatted: row.netFeeFormatted,
          statusLabel: row.statusLabel,
        })),
      };

    case "fee_withdrawals":
      return {
        module: "fee_withdrawals",
        fileSlug: "feasta-fee-withdrawals-report",
        title: "FEASTA Fee Withdrawals Report",
        subtitle: "Recorded withdrawals from the FEASTA service fee wallet.",
        periodLabel: payload.periodLabel,
        filterSummary: `Method: ${WITHDRAWAL_METHOD_LABELS[payload.filters.method]}`,
        generatedAt: payload.generatedAt,
        summary: [
          {label: "Withdrawals", value: formatInteger(payload.summary.withdrawalCount)},
          {label: "Total withdrawn", value: payload.summary.totalWithdrawnFormatted},
          {label: "Current available balance", value: payload.summary.currentAvailableFormatted},
        ],
        columns: [
          {key: "dateLabel", header: "Date withdrawn", weight: 1.2},
          {key: "reference", header: "Reference", weight: 1.7},
          {key: "methodLabel", header: "Method", weight: 0.95},
          {key: "accountName", header: "Account name", weight: 1.3},
          {key: "destination", header: "Destination", weight: 1.4},
          {key: "amountFormatted", header: "Amount", weight: 1.0, align: "right"},
          {key: "statusLabel", header: "Status", weight: 0.85},
        ],
        rows: payload.rows.map((row) => ({
          dateLabel: row.dateLabel,
          reference: row.reference,
          methodLabel: row.methodLabel,
          accountName: row.accountName,
          destination: row.destination,
          amountFormatted: row.amountFormatted,
          statusLabel: row.statusLabel,
        })),
      };

    case "bookings":
      return {
        module: "bookings",
        fileSlug: "feasta-bookings-report",
        title: "Bookings & Cancellations Report",
        subtitle: "Submitted bookings, event details, statuses, and recorded payments/refunds.",
        periodLabel: payload.periodLabel,
        filterSummary:
          payload.filters.status === "all"
            ? "Status: All statuses"
            : `Status: ${payload.filters.status.replace(/_/gu, " ")}`,
        generatedAt: payload.generatedAt,
        summary: [
          {label: "Total bookings", value: formatInteger(payload.summary.totalBookings)},
          {label: "Completed", value: formatInteger(payload.summary.completedBookings)},
          {label: "Cancelled", value: formatInteger(payload.summary.cancelledBookings)},
          {label: "Cancellation rate", value: payload.summary.cancellationRateFormatted},
        ],
        columns: [
          {key: "bookingCode", header: "Booking", weight: 1.1},
          {key: "eventDateLabel", header: "Event date", weight: 1.0},
          {key: "eventTypeLabel", header: "Event type", weight: 1.0},
          {key: "customerName", header: "Customer", weight: 1.2},
          {key: "providerNames", header: "Provider(s)", weight: 1.35},
          {key: "bookingStatusLabel", header: "Booking status", weight: 1.05},
          {key: "paymentStatusLabel", header: "Payment", weight: 0.95},
          {key: "paidFormatted", header: "Paid", weight: 0.95, align: "right"},
          {key: "refundedFormatted", header: "Refunded", weight: 0.95, align: "right"},
        ],
        rows: payload.rows.map((row) => ({
          bookingCode: row.bookingCode,
          eventDateLabel: row.eventDateLabel,
          eventTypeLabel: row.eventTypeLabel,
          customerName: row.customerName,
          providerNames: row.providerNames,
          bookingStatusLabel: row.bookingStatusLabel,
          paymentStatusLabel: row.paymentStatusLabel,
          paidFormatted: row.paidFormatted,
          refundedFormatted: row.refundedFormatted,
        })),
      };

    case "providers": {
      const categoryLabel = payload.filters.serviceCategory
        ? payload.availableServiceCategories.find(
            ([code]) => code === payload.filters.serviceCategory,
          )?.[1] ?? payload.filters.serviceCategory
        : "All service categories";
      return {
        module: "providers",
        fileSlug: "feasta-provider-performance-report",
        title: "Provider Performance & Ratings Report",
        subtitle: "Provider rankings by booking volume, completed events, ratings, and gross booking value.",
        periodLabel: payload.periodLabel,
        filterSummary: `Category: ${categoryLabel} | Sorted by: ${SORT_LABELS[payload.filters.sortBy]}`,
        generatedAt: payload.generatedAt,
        summary: [
          {label: "Providers listed", value: formatInteger(payload.summary.providerCount)},
          {label: "Most bookings", value: payload.summary.topByBookingsLabel},
          {label: "Highest rated", value: payload.summary.highestRatedLabel},
          {label: "Completed events", value: formatInteger(payload.summary.totalCompletedEvents)},
        ],
        columns: [
          {key: "rank", header: "#", weight: 0.45, align: "right"},
          {key: "providerName", header: "Provider", weight: 1.55},
          {key: "serviceCategoryLabel", header: "Service category", weight: 1.15},
          {key: "totalBookings", header: "Bookings", weight: 0.75, align: "right"},
          {key: "completedEvents", header: "Completed", weight: 0.8, align: "right"},
          {key: "cancelledBookings", header: "Cancelled", weight: 0.8, align: "right"},
          {key: "acceptanceRateFormatted", header: "Acceptance", weight: 0.85, align: "right"},
          {key: "ratingLabel", header: "Rating", weight: 1.05},
          {key: "grossValueFormatted", header: "Gross value", weight: 1.15, align: "right"},
        ],
        rows: payload.rows.map((row) => ({
          rank: String(row.rank),
          providerName: row.providerName,
          serviceCategoryLabel: row.serviceCategoryLabel,
          totalBookings: formatInteger(row.totalBookings),
          completedEvents: formatInteger(row.completedEvents),
          cancelledBookings: formatInteger(row.cancelledBookings),
          acceptanceRateFormatted: row.acceptanceRateFormatted,
          ratingLabel: row.ratingLabel,
          grossValueFormatted: row.grossValueFormatted,
        })),
      };
    }

    case "users": {
      const municipalityLabel = payload.filters.municipality
        ? payload.municipalities.find(([key]) => key === payload.filters.municipality)?.[1] ??
          payload.filters.municipality
        : "All municipalities";
      return {
        module: "users",
        fileSlug: "feasta-users-directory-report",
        title: "Users Directory Report",
        subtitle: "Registered FEASTA customer and provider accounts.",
        periodLabel: payload.periodLabel,
        filterSummary: `${USER_ROLE_LABELS[payload.filters.role]} | Status: ${payload.filters.status === "all" ? "All statuses" : payload.filters.status} | Municipality: ${municipalityLabel}`,
        generatedAt: payload.generatedAt,
        summary: [
          {label: "Total users", value: formatInteger(payload.summary.totalUsers)},
          {label: "Customers", value: formatInteger(payload.summary.customersCount)},
          {label: "Providers", value: formatInteger(payload.summary.providersCount)},
          {label: "Active accounts", value: formatInteger(payload.summary.activeCount)},
        ],
        columns: [
          {key: "fullName", header: "Full name", weight: 1.35},
          {key: "roleLabel", header: "Role", weight: 0.75},
          {key: "email", header: "Email", weight: 1.55},
          {key: "phone", header: "Phone", weight: 1.0},
          {key: "municipality", header: "Municipality", weight: 1.1},
          {key: "bookingsCount", header: "Bookings", weight: 0.7, align: "right"},
          {key: "dateJoinedLabel", header: "Date joined", weight: 0.95},
          {key: "status", header: "Status", weight: 0.85},
        ],
        rows: payload.rows.map((row) => ({
          fullName: row.fullName,
          roleLabel: row.roleLabel,
          email: row.email,
          phone: row.phone,
          municipality: row.municipality,
          bookingsCount: formatInteger(row.bookingsCount),
          dateJoinedLabel: row.dateJoinedLabel,
          status: row.status,
        })),
      };
    }
  }
}
