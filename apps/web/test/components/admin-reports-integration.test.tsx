import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  AdminReportMetric,
  AdminReportMoneyMetric,
  AdminReportRateMetric,
  AdminReportResult,
} from "@/lib/admin/reports/admin-report-types";

const mocks = vi.hoisted(() => ({
  createExcel: vi.fn(),
  loadReport: vi.fn(),
}));

vi.mock("@/app/admin/reports/actions", () => ({
  loadAdminReportAction: mocks.loadReport,
}));

vi.mock(
  "@/lib/admin/reports/admin-report-excel",
  () => ({
    createAdminReportExcel:
      mocks.createExcel,
  }),
);

vi.mock("@/components/admin/reports/admin-booking-performance", () => ({
  AdminBookingPerformance: () => <section>Booking performance test section</section>,
}));

vi.mock("@/components/admin/reports/admin-payment-performance", () => ({
  AdminPaymentPerformance: () => <section>Payment performance test section</section>,
}));

vi.mock("@/components/admin/reports/admin-provider-performance", () => ({
  AdminProviderPerformance: () => <section>Provider performance test section</section>,
}));

import {
  AdminReportsExecutiveClient,
} from "@/components/admin/reports/admin-reports-executive-client";

describe("admin reports integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.createExcel.mockResolvedValue({
      blob: new Blob(
        ["excel-report"],
        {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ),
      fileName:
        "feasta-admin-report-2026-08-01.xlsx",
    });

    Object.defineProperty(
      URL,
      "createObjectURL",
      {
        configurable: true,
        value: vi.fn(
          () => "blob:admin-report",
        ),
      },
    );

    Object.defineProperty(
      URL,
      "revokeObjectURL",
      {
        configurable: true,
        value: vi.fn(),
      },
    );
  });

  it("renders every report phase and accurate financial terminology", () => {
    render(<AdminReportsExecutiveClient initialReport={reportFixture()} />);

    expect(screen.getByRole("heading", {name: "Reports and Insights"})).toBeInTheDocument();
    expect(screen.getByText("Booking performance test section")).toBeInTheDocument();
    expect(screen.getByText("Payment performance test section")).toBeInTheDocument();
    expect(screen.getByText("Provider performance test section")).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "FEASTA platform revenue"})).toBeInTheDocument();
    expect(screen.getByText("Not configured", {selector: "p"})).toBeInTheDocument();
  });

  it(
    "downloads the currently displayed authorized report",
    async () => {
      const user = userEvent.setup();

      const click = vi
        .spyOn(
          HTMLAnchorElement.prototype,
          "click",
        )
        .mockImplementation(
          () => undefined,
        );

      const report = reportFixture();

      render(
        <AdminReportsExecutiveClient
          initialReport={report}
        />,
      );

      await user.click(
        screen.getByRole("button", {
          name: "Export Excel",
        }),
      );

      await waitFor(() => {
        expect(
          mocks.createExcel,
        ).toHaveBeenCalledWith(report);
      });

      expect(
        URL.createObjectURL,
      ).toHaveBeenCalledWith(
        expect.any(Blob),
      );

      expect(
        URL.createObjectURL,
      ).toHaveBeenCalledTimes(1);

      expect(click).toHaveBeenCalledTimes(1);

      await waitFor(
        () => {
          expect(
            URL.revokeObjectURL,
          ).toHaveBeenCalledWith(
            "blob:admin-report",
          );
        },
        {
          timeout: 1_500,
        },
      );

      click.mockRestore();
    },
  );

  it("prints through the browser print action", async () => {
    const user = userEvent.setup();
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<AdminReportsExecutiveClient initialReport={reportFixture()} />);

    await user.click(screen.getByRole("button", {name: "Print"}));

    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it("loads a newly selected bounded report through the server action", async () => {
    const user = userEvent.setup();
    const nextReport = reportFixture({periodLabel: "Jul 26, 2026 – Aug 1, 2026"});
    mocks.loadReport.mockResolvedValueOnce(nextReport);
    render(<AdminReportsExecutiveClient initialReport={reportFixture()} />);

    await user.selectOptions(screen.getByLabelText("Date range"), "last_7_days");
    await user.click(screen.getByRole("button", {name: "Generate report"}));

    await waitFor(() => expect(mocks.loadReport).toHaveBeenCalledWith(
      expect.objectContaining({datePreset: "last_7_days"}),
    ));
    expect(await screen.findByText("Jul 26, 2026 – Aug 1, 2026")).toBeInTheDocument();
  });
});

function reportFixture(
  options: {periodLabel?: string} = {},
): AdminReportResult {
  const metric: AdminReportMetric = {
    value: 1,
    previousValue: 1,
    percentageChange: 0,
    comparisonAvailable: true,
    trend: "unchanged",
  };
  const money: AdminReportMoneyMetric = {
    ...metric,
    valueInCentavos: 10000,
    previousValueInCentavos: 10000,
    formattedValue: "₱100.00",
    formattedPreviousValue: "₱100.00",
    currency: "PHP",
  };
  const rate: AdminReportRateMetric = {
    ...metric,
    numerator: 1,
    denominator: 1,
    formattedValue: "100.0%",
  };

  return {
    generatedAt: "2026-08-01T12:00:00.000Z",
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
        label: options.periodLabel ?? "Jul 3, 2026 – Aug 1, 2026",
        timeZone: "Asia/Manila",
      },
      comparisonPeriod: {
        startAt: "2026-06-02T16:00:00.000Z",
        endAtExclusive: "2026-07-02T16:00:00.000Z",
        label: "Jun 3, 2026 – Jul 2, 2026",
        timeZone: "Asia/Manila",
      },
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
        rejectionRate: {...rate, value: 0, formattedValue: "0.0%"},
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
      refundRate: {...rate, value: 0, formattedValue: "0.0%"},
      byStatus: [],
      byType: [],
      trend: [],
      platformRevenue: {
        status: "not_configured",
        grossPlatformFeeInCentavos: null,
        processingFeeInCentavos: null,
        netPlatformRevenueInCentavos: null,
        explanation: "FEASTA platform revenue is not configured.",
      },
    },
    providers: {
      providers: [],
      minimumReviewsForRatingRanking: 3,
    },
    definitions: [],
  };
}