import {describe, expect, it} from "vitest";

import {
  createAdminReportMetric,
  createAdminReportMoneyMetric,
  createAdminReportRateMetric,
  deriveAdminPaymentFinancials,
  resolveAdminReportFilters,
} from "@/lib/admin/reports/admin-report-policy";
import {
  DEFAULT_ADMIN_REPORT_FILTERS,
  type AdminReportFilters,
} from "@/lib/admin/reports/admin-report-types";

const now = new Date("2026-08-01T04:30:00.000Z");

function filters(overrides: Partial<AdminReportFilters> = {}): AdminReportFilters {
  return {...DEFAULT_ADMIN_REPORT_FILTERS, ...overrides};
}

describe("admin report policy", () => {
  it("resolves the last 30 Manila calendar days with an exclusive end", () => {
    const result = resolveAdminReportFilters(filters(), now);
    expect(result.period.startAt).toBe("2026-07-02T16:00:00.000Z");
    expect(result.period.endAtExclusive).toBe("2026-08-01T16:00:00.000Z");
    expect(result.comparisonPeriod?.startAt).toBe("2026-06-02T16:00:00.000Z");
    expect(result.comparisonPeriod?.endAtExclusive).toBe(
      "2026-07-02T16:00:00.000Z",
    );
  });

  it("treats both custom dates as inclusive Manila dates", () => {
    const result = resolveAdminReportFilters(filters({
      datePreset: "custom",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      comparison: "none",
    }), now);
    expect(result.period.startAt).toBe("2026-06-30T16:00:00.000Z");
    expect(result.period.endAtExclusive).toBe("2026-07-31T16:00:00.000Z");
    expect(result.comparisonPeriod).toBeNull();
  });

  it("rejects invalid, reversed, and unbounded custom periods", () => {
    expect(() => resolveAdminReportFilters(filters({
      datePreset: "custom",
      startDate: "2026-02-30",
      endDate: "2026-03-01",
    }), now)).toThrow(/valid report start date/u);
    expect(() => resolveAdminReportFilters(filters({
      datePreset: "custom",
      startDate: "2026-08-02",
      endDate: "2026-08-01",
    }), now)).toThrow(/on or after/u);
    expect(() => resolveAdminReportFilters(filters({
      datePreset: "custom",
      startDate: "2025-01-01",
      endDate: "2026-08-01",
    }), now)).toThrow(/366 days/u);
  });

  it("resolves previous-year comparisons without rolling leap day into March", () => {
    const result = resolveAdminReportFilters(filters({
      datePreset: "custom",
      startDate: "2024-02-29",
      endDate: "2024-02-29",
      comparison: "previous_year",
    }), new Date("2024-03-01T00:00:00.000Z"));
    expect(result.comparisonPeriod?.startAt).toBe("2023-02-27T16:00:00.000Z");
    expect(result.comparisonPeriod?.endAtExclusive).toBe(
      "2023-02-28T16:00:00.000Z",
    );
  });

  it("calculates trends and reports zero baselines as not comparable", () => {
    expect(createAdminReportMetric(120, 100)).toMatchObject({
      percentageChange: 20,
      trend: "up",
      comparisonAvailable: true,
    });
    expect(createAdminReportMetric(12, 0)).toMatchObject({
      percentageChange: null,
      trend: "not_comparable",
      comparisonAvailable: false,
    });
  });

  it("keeps money in exact centavos and formats Philippine pesos", () => {
    expect(createAdminReportMoneyMetric(9850123, 8000000)).toMatchObject({
      value: 98501.23,
      valueInCentavos: 9850123,
      formattedValue: "₱98,501.23",
      currency: "PHP",
    });
  });

  it("creates zero-safe rate metrics", () => {
    expect(createAdminReportRateMetric(8, 10)).toMatchObject({
      value: 80,
      numerator: 8,
      denominator: 10,
      formattedValue: "80.0%",
    });
    expect(createAdminReportRateMetric(1, 0)).toMatchObject({
      value: 0,
      formattedValue: "0.0%",
    });
  });

  it("separates provider payment volume from unconfigured platform revenue", () => {
    const result = deriveAdminPaymentFinancials({
      paidCount: 8,
      paidAmountInCentavos: 800000,
      refundedCount: 2,
      refundedAmountInCentavos: 200000,
      failedCount: 1,
      expiredCount: 1,
    });
    expect(result).toEqual({
      successfulPaymentAttempts: 10,
      finalizedPaymentAttempts: 12,
      grossCollectedVolumeInCentavos: 1000000,
      confirmedPaymentVolumeInCentavos: 800000,
      providerAssociatedVolumeInCentavos: 800000,
      paymentSuccessRate: 10 / 12 * 100,
      refundRate: 20,
    });
  });
});