import type {
  MainEventStatus,
  PaymentStatus,
  PaymentType,
  ProviderRequestStatus,
  ProviderRequestType,
  ProviderServiceType,
} from "@feasta/shared-types";

export const ADMIN_REPORT_TIME_ZONE = "Asia/Manila" as const;
export const ADMIN_REPORT_CURRENCY = "PHP" as const;

export type AdminReportDatePreset =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "last_3_months"
  | "this_year"
  | "custom";

export type AdminReportGrouping = "day" | "week" | "month";

export type AdminReportComparison =
  | "none"
  | "previous_period"
  | "previous_year";

export type AdminReportFilters = {
  datePreset: AdminReportDatePreset;
  startDate: string | null;
  endDate: string | null;
  comparison: AdminReportComparison;
  grouping: AdminReportGrouping;

  providerServiceType: "all" | ProviderServiceType;
  providerRequestType: "all" | ProviderRequestType;
  eventType: "all" | string;
  city: "all" | string;
  bookingStatus: "all" | MainEventStatus;
  paymentStatus: "all" | PaymentStatus;
};

export type AdminReportResolvedPeriod = {
  startAt: string;
  endAtExclusive: string;
  label: string;
  timeZone: typeof ADMIN_REPORT_TIME_ZONE;
};

export type AdminReportResolvedFilters = AdminReportFilters & {
  period: AdminReportResolvedPeriod;
  comparisonPeriod: AdminReportResolvedPeriod | null;
};

export type AdminReportTrendDirection =
  | "up"
  | "down"
  | "unchanged"
  | "not_comparable";

export type AdminReportMetric = {
  value: number;
  previousValue: number | null;
  percentageChange: number | null;
  comparisonAvailable: boolean;
  trend: AdminReportTrendDirection;
};

export type AdminReportMoneyMetric = AdminReportMetric & {
  valueInCentavos: number;
  previousValueInCentavos: number | null;
  formattedValue: string;
  formattedPreviousValue: string | null;
  currency: typeof ADMIN_REPORT_CURRENCY;
};

export type AdminReportRateMetric = AdminReportMetric & {
  numerator: number;
  denominator: number;
  formattedValue: string;
};

export type AdminExecutiveSummary = {
  totalBookings: AdminReportMetric;
  confirmedBookings: AdminReportMetric;
  completedEvents: AdminReportMetric;
  cancellationRate: AdminReportRateMetric;

  activeCustomers: AdminReportMetric;
  activeProviders: AdminReportMetric;

  confirmedPaymentVolume: AdminReportMoneyMetric;
  averagePaidPayment: AdminReportMoneyMetric;
};

export type AdminBookingStatusPoint = {
  status: MainEventStatus;
  count: number;
  percentage: number;
};

export type AdminBookingTrendPoint = {
  periodStart: string;
  periodEndExclusive: string;
  label: string;
  created: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  expired: number;
};

export type AdminBookingFunnelStage = {
  id:
    | "booking_created"
    | "provider_accepted"
    | "waiting_for_payment"
    | "payment_completed"
    | "booking_confirmed"
    | "event_completed";
  label: string;
  count: number;
  conversionFromPrevious: number | null;
  conversionFromCreated: number;
};

export type AdminProviderRequestSummary = {
  totalRequests: number;
  byStatus: Array<{
    status: ProviderRequestStatus;
    count: number;
    percentage: number;
  }>;
  acceptanceRate: AdminReportRateMetric;
  rejectionRate: AdminReportRateMetric;
  averageResponseTimeInMinutes: number | null;
};

export type AdminBookingPerformance = {
  statusDistribution: AdminBookingStatusPoint[];
  trend: AdminBookingTrendPoint[];
  funnel: AdminBookingFunnelStage[];
  providerRequests: AdminProviderRequestSummary;
  averageLeadTimeInDays: number | null;
};

export type AdminPaymentStatusPoint = {
  status: PaymentStatus;
  count: number;
  amountInCentavos: number;
  formattedAmount: string;
};

export type AdminPaymentTypePoint = {
  paymentType: PaymentType;
  count: number;
  amountInCentavos: number;
  formattedAmount: string;
};

export type AdminPaymentTrendPoint = {
  periodStart: string;
  periodEndExclusive: string;
  label: string;
  createdPayments: number;
  successfulPayments: number;
  failedOrExpiredPayments: number;
  refundedPayments: number;
  collectedVolumeInCentavos: number;
  currentlyPaidVolumeInCentavos: number;
  refundedAmountInCentavos: number;
  netProviderAssociatedVolumeInCentavos: number;
};

export type AdminPlatformRevenue = {
  status: "not_configured";
  grossPlatformFeeInCentavos: null;
  processingFeeInCentavos: null;
  netPlatformRevenueInCentavos: null;
  explanation: string;
};

export type AdminPaymentPerformance = {
  createdPayments: AdminReportMetric;
  currentlyPaidPayments: AdminReportMetric;
  successfulPaymentAttempts: AdminReportMetric;

  grossCollectedVolume: AdminReportMoneyMetric;
  confirmedPaymentVolume: AdminReportMoneyMetric;
  providerAssociatedVolume: AdminReportMoneyMetric;
  refundedAmount: AdminReportMoneyMetric;
  averagePaidPayment: AdminReportMoneyMetric;

  pendingOrProcessing: AdminReportMetric;
  failedOrExpired: AdminReportMetric;
  awaitingWebhookConfirmation: AdminReportMetric;

  paymentSuccessRate: AdminReportRateMetric;
  refundRate: AdminReportRateMetric;

  byStatus: AdminPaymentStatusPoint[];
  byType: AdminPaymentTypePoint[];
  trend: AdminPaymentTrendPoint[];

  platformRevenue: AdminPlatformRevenue;
};

export type AdminProviderPerformanceRow = {
  providerId: string;
  providerName: string;
  serviceType: ProviderServiceType;
  providerCategory: string | null;

  requestsReceived: number;
  acceptedRequests: number;
  rejectedRequests: number;
  confirmedBookings: number;
  completedEvents: number;
  cancelledRequests: number;

  acceptanceRate: number;
  rejectionRate: number;
  cancellationRate: number;
  averageResponseTimeInMinutes: number | null;

  averageRating: number;
  publishedReviewCount: number;

  confirmedPaymentVolumeInCentavos: number;
  formattedConfirmedPaymentVolume: string;
};

export type AdminProviderPerformance = {
  providers: AdminProviderPerformanceRow[];
  minimumReviewsForRatingRanking: number;
};

export type AdminReportDefinition = {
  id:
    | "confirmed_payment_volume"
    | "gross_collected_volume"
    | "provider_associated_volume"
    | "platform_revenue"
    | "payment_success_rate"
    | "refund_rate"
    | "cancellation_rate"
    | "active_customer"
    | "active_provider";
  label: string;
  description: string;
};

export type AdminReportResult = {
  generatedAt: string;
  currency: typeof ADMIN_REPORT_CURRENCY;
  timeZone: typeof ADMIN_REPORT_TIME_ZONE;
  filters: AdminReportResolvedFilters;
  executive: AdminExecutiveSummary;
  bookings: AdminBookingPerformance;
  payments: AdminPaymentPerformance;
  providers: AdminProviderPerformance;
  definitions: AdminReportDefinition[];
};

export const DEFAULT_ADMIN_REPORT_FILTERS: AdminReportFilters = {
  datePreset: "last_30_days",
  startDate: null,
  endDate: null,
  comparison: "previous_period",
  grouping: "day",
  providerServiceType: "all",
  providerRequestType: "all",
  eventType: "all",
  city: "all",
  bookingStatus: "all",
  paymentStatus: "all",
};

export const ADMIN_REPORT_DEFINITIONS: readonly AdminReportDefinition[] = [
  {
    id: "confirmed_payment_volume",
    label: "Confirmed Payment Volume",
    description:
      "The value of payments that currently have paid status. Fully refunded payments are excluded because their status becomes refunded.",
  },
  {
    id: "gross_collected_volume",
    label: "Gross Collected Volume",
    description:
      "Payments currently marked paid plus payments that were paid and later fully refunded.",
  },
  {
    id: "provider_associated_volume",
    label: "Provider-Associated Volume",
    description:
      "Collected customer payments attributable to provider services, less completed full refunds. No FEASTA commission is deducted.",
  },
  {
    id: "platform_revenue",
    label: "FEASTA Platform Revenue",
    description:
      "Not configured. FEASTA does not yet persist commission, processing-fee allocation, or provider-payout records.",
  },
  {
    id: "payment_success_rate",
    label: "Payment Success Rate",
    description:
      "Paid or subsequently refunded payment attempts divided by finalized attempts: successful, failed, or expired. Pending and processing attempts are excluded.",
  },
  {
    id: "refund_rate",
    label: "Refund Rate",
    description:
      "Fully refunded payments divided by all successful payment attempts, including payments that remain paid.",
  },
  {
    id: "cancellation_rate",
    label: "Booking Cancellation Rate",
    description:
      "Cancelled main events divided by non-draft main events created in the selected reporting period.",
  },
  {
    id: "active_customer",
    label: "Active Customer",
    description:
      "A unique customer who created a non-draft main event during the selected reporting period.",
  },
  {
    id: "active_provider",
    label: "Active Provider",
    description:
      "A unique provider who received a provider request during the selected reporting period.",
  },
];