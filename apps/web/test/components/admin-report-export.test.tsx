import {describe, expect, it} from "vitest";

import {
  createAdminReportCsv,
  escapeCsvCell,
  reportFileName,
} from "@/lib/admin/reports/admin-report-export";
import type {AdminReportResult} from "@/lib/admin/reports/admin-report-types";

describe("admin report CSV export", () => {
  it("protects spreadsheet formulas and escapes CSV quotes", () => {
    expect(escapeCsvCell("=2+2")).toBe('"\'=2+2"');
    expect(escapeCsvCell('+SUM(A1:A2)')).toBe('"\'+SUM(A1:A2)"');
    expect(escapeCsvCell('Provider "One"')).toBe('"Provider ""One"""');
  });

  it("uses inclusive Manila dates in a deterministic filename", () => {
    expect(reportFileName(reportFixture())).toBe(
      "feasta-admin-report-2026-07-03-to-2026-08-01.csv",
    );
  });

  it("exports audit metadata and keeps payment terminology accurate", () => {
    const exported = createAdminReportCsv(reportFixture());
    expect(exported.content.startsWith("\uFEFF")).toBe(true);
    expect(exported.content).toContain('"Reporting period","Jul 3, 2026 – Aug 1, 2026"');
    expect(exported.content).toContain('"Data source","Authorized server-generated bounded operational data"');
    expect(exported.content).toContain('"Provider-associated volume (PHP)","100.00"');
    expect(exported.content).toContain('"FEASTA platform revenue","Not configured"');
    expect(exported.content).not.toContain('"FEASTA revenue (PHP)"');
  });

  it("exports provider details and rating qualification", () => {
    const exported = createAdminReportCsv(reportFixture());
    expect(exported.content).toContain('"provider-1","Provider One"');
    expect(exported.content).toContain('"4.80","3","Yes","100.00"');
  });
});

function reportFixture(): AdminReportResult {
  const metric = {value: 1, previousValue: 0, percentageChange: null, comparisonAvailable: false, trend: "not_comparable" as const};
  const money = {...metric, valueInCentavos: 10000, previousValueInCentavos: 0, formattedValue: "₱100.00", formattedPreviousValue: "₱0.00", currency: "PHP" as const};
  const rate = {...metric, numerator: 1, denominator: 1, formattedValue: "100.0%"};
  return {
    generatedAt: "2026-08-01T07:00:00.000Z",
    currency: "PHP",
    timeZone: "Asia/Manila",
    filters: {
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
      period: {
        startAt: "2026-07-02T16:00:00.000Z",
        endAtExclusive: "2026-08-01T16:00:00.000Z",
        label: "Jul 3, 2026 – Aug 1, 2026",
        timeZone: "Asia/Manila",
      },
      comparisonPeriod: null,
    },
    executive: {
      totalBookings: metric,
      confirmedBookings: metric,
      completedEvents: metric,
      cancellationRate: rate,
      activeCustomers: metric,
      activeProviders: metric,
      confirmedPaymentVolume: money,
      averagePaidPayment: money,
    },
    bookings: {
      statusDistribution: [],
      trend: [],
      funnel: [],
      providerRequests: {
        totalRequests: 1,
        byStatus: [],
        acceptanceRate: rate,
        rejectionRate: {...rate, value: 0, numerator: 0, formattedValue: "0.0%"},
        averageResponseTimeInMinutes: 15,
      },
      averageLeadTimeInDays: 30,
    },
    payments: {
      createdPayments: metric,
      currentlyPaidPayments: metric,
      successfulPaymentAttempts: metric,
      grossCollectedVolume: money,
      confirmedPaymentVolume: money,
      providerAssociatedVolume: money,
      refundedAmount: {...money, value: 0, valueInCentavos: 0, formattedValue: "₱0.00"},
      averagePaidPayment: money,
      pendingOrProcessing: {...metric, value: 0},
      failedOrExpired: {...metric, value: 0},
      awaitingWebhookConfirmation: {...metric, value: 0},
      paymentSuccessRate: rate,
      refundRate: {...rate, value: 0, numerator: 0, formattedValue: "0.0%"},
      byStatus: [],
      byType: [],
      trend: [],
      platformRevenue: {
        status: "not_configured",
        grossPlatformFeeInCentavos: null,
        processingFeeInCentavos: null,
        netPlatformRevenueInCentavos: null,
        explanation: "Not configured.",
      },
    },
    providers: {
      minimumReviewsForRatingRanking: 3,
      providers: [{
        providerId: "provider-1",
        providerName: "Provider One",
        serviceType: "catering",
        providerCategory: "catering_service",
        requestsReceived: 1,
        acceptedRequests: 1,
        rejectedRequests: 0,
        confirmedBookings: 1,
        completedEvents: 1,
        cancelledRequests: 0,
        acceptanceRate: 100,
        rejectionRate: 0,
        cancellationRate: 0,
        averageResponseTimeInMinutes: 15,
        averageRating: 4.8,
        publishedReviewCount: 3,
        confirmedPaymentVolumeInCentavos: 10000,
        formattedConfirmedPaymentVolume: "₱100.00",
      }],
    },
    definitions: [],
  };
}