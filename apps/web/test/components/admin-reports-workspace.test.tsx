import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {AdminReportsWorkspaceClient} from "@/components/admin/reports/admin-reports-workspace-client";
import {
  buildPrintableReportSpec,
  DEFAULT_BOOKINGS_REPORT_FILTERS,
  DEFAULT_FEE_WITHDRAWALS_FILTERS,
  DEFAULT_PROVIDER_PERFORMANCE_FILTERS,
  DEFAULT_SERVICE_FEES_FILTERS,
  DEFAULT_USERS_DIRECTORY_FILTERS,
  type BookingsReportPayload,
  type FeeWithdrawalsReportPayload,
  type ProviderPerformanceReportPayload,
  type ServiceFeesReportPayload,
  type UsersDirectoryReportPayload,
} from "@/lib/admin/reports/admin-report-modules-types";
import {
  createSubModuleReportPdf,
  sanitizePdfText,
} from "@/lib/admin/reports/admin-report-pdf";
import {buildPrintableReportHtml} from "@/lib/admin/reports/admin-report-print";

const mocks = vi.hoisted(() => ({
  loadModule: vi.fn(),
  downloadPdf: vi.fn(),
  printReport: vi.fn(),
}));

vi.mock("@/app/admin/reports/actions", () => ({
  loadAdminReportModuleAction: mocks.loadModule,
  loadAdminReportAction: vi.fn(),
}));

vi.mock("@/lib/admin/reports/admin-report-pdf", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/admin/reports/admin-report-pdf")>();
  return {
    ...actual,
    downloadSubModuleReportPdf: mocks.downloadPdf,
  };
});

vi.mock("@/lib/admin/reports/admin-report-print", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/admin/reports/admin-report-print")>();
  return {
    ...actual,
    printSubModuleReport: mocks.printReport,
  };
});

const serviceFeesFixture: ServiceFeesReportPayload = {
  module: "service_fees",
  generatedAt: "2026-11-27T07:00:00.000Z",
  periodLabel: "All time",
  filters: DEFAULT_SERVICE_FEES_FILTERS,
  availableStatuses: ["paid", "partially_refunded"],
  summary: {
    recordCount: 2,
    grossFeeEarnedInCentavos: 15000,
    grossFeeEarnedFormatted: "₱150.00",
    feeRefundedInCentavos: 2000,
    feeRefundedFormatted: "₱20.00",
    netFeeInCentavos: 13000,
    netFeeFormatted: "₱130.00",
  },
  rows: [
    {
      id: "pay_1",
      dateLabel: "Nov 25, 2026",
      bookingCode: "BK-1001",
      customerName: "Sophia Ranalan",
      providerName: "Emerald Catering",
      paymentTypeLabel: "Full payment",
      customerPaidFormatted: "₱1,100.00",
      feeEarnedFormatted: "₱100.00",
      feeRefundedFormatted: "₱0.00",
      netFeeFormatted: "₱100.00",
      statusLabel: "Paid",
    },
    {
      id: "pay_2",
      dateLabel: "Nov 20, 2026",
      bookingCode: "BK-1002",
      customerName: "Gabriel Cruz",
      providerName: "Bagong Business",
      paymentTypeLabel: "Down payment",
      customerPaidFormatted: "₱550.00",
      feeEarnedFormatted: "₱50.00",
      feeRefundedFormatted: "₱20.00",
      netFeeFormatted: "₱30.00",
      statusLabel: "Partially refunded",
    },
  ],
};

const feeWithdrawalsFixture: FeeWithdrawalsReportPayload = {
  module: "fee_withdrawals",
  generatedAt: "2026-11-27T07:00:00.000Z",
  periodLabel: "All time",
  filters: DEFAULT_FEE_WITHDRAWALS_FILTERS,
  availableMethods: ["gcash"],
  summary: {
    withdrawalCount: 1,
    totalWithdrawnInCentavos: 25000,
    totalWithdrawnFormatted: "₱250.00",
    currentAvailableInCentavos: 43220,
    currentAvailableFormatted: "₱432.20",
  },
  rows: [
    {
      id: "wd_1",
      dateLabel: "Nov 26, 2026, 2:00 PM",
      reference: "company_commission_wd_1",
      methodLabel: "GCash",
      accountName: "FEASTA Admin",
      destination: "09******21",
      amountFormatted: "₱250.00",
      statusLabel: "Completed",
    },
  ],
};

const bookingsFixture: BookingsReportPayload = {
  module: "bookings",
  generatedAt: "2026-11-27T07:00:00.000Z",
  periodLabel: "All time",
  filters: DEFAULT_BOOKINGS_REPORT_FILTERS,
  availableStatuses: ["completed", "cancelled"],
  summary: {
    totalBookings: 2,
    completedBookings: 1,
    cancelledBookings: 1,
    cancellationRateFormatted: "50.0%",
  },
  rows: [
    {
      id: "bk_1",
      bookingCode: "BK-1001",
      eventDateLabel: "Dec 12, 2026",
      eventTypeLabel: "Wedding",
      customerName: "Sophia Ranalan",
      providerNames: "Emerald Catering",
      bookingStatusLabel: "Completed",
      paymentStatusLabel: "Paid",
      paidFormatted: "₱1,100.00",
      refundedFormatted: "₱0.00",
    },
  ],
};

const providersFixture: ProviderPerformanceReportPayload = {
  module: "providers",
  generatedAt: "2026-11-27T07:00:00.000Z",
  periodLabel: "All time",
  filters: DEFAULT_PROVIDER_PERFORMANCE_FILTERS,
  availableServiceCategories: [
    ["catering", "Catering"],
    ["photography", "Photography"],
  ],
  summary: {
    providerCount: 2,
    topByBookingsLabel: "Emerald Catering (12)",
    highestRatedLabel: "Royal Feast (4.9)",
    totalCompletedEvents: 15,
  },
  rows: [
    {
      id: "prov_1",
      rank: 1,
      providerName: "Emerald Catering",
      serviceCategoryLabel: "Catering",
      totalBookings: 12,
      completedEvents: 10,
      cancelledBookings: 1,
      acceptanceRateFormatted: "91.7%",
      ratingLabel: "4.7 (8)",
      ratingAverage: 4.7,
      reviewCount: 8,
      grossValueInCentavos: 12000000,
      grossValueFormatted: "₱120,000.00",
    },
    {
      id: "prov_2",
      rank: 2,
      providerName: "Royal Feast",
      serviceCategoryLabel: "Photography",
      totalBookings: 6,
      completedEvents: 5,
      cancelledBookings: 0,
      acceptanceRateFormatted: "100.0%",
      ratingLabel: "4.9 (11)",
      ratingAverage: 4.9,
      reviewCount: 11,
      grossValueInCentavos: 8500000,
      grossValueFormatted: "₱85,000.00",
    },
  ],
};

const usersFixture: UsersDirectoryReportPayload = {
  module: "users",
  generatedAt: "2026-11-27T07:00:00.000Z",
  periodLabel: "All registered accounts",
  filters: DEFAULT_USERS_DIRECTORY_FILTERS,
  availableRoles: ["customer", "provider"],
  availableStatuses: ["Active"],
  municipalities: [["ormoc city", "Ormoc City"]],
  summary: {
    totalUsers: 2,
    customersCount: 1,
    providersCount: 1,
    activeCount: 2,
  },
  rows: [
    {
      id: "usr_1",
      fullName: "Sophia Ranalan",
      roleLabel: "Customer",
      email: "sophia@example.test",
      phone: "09171234567",
      municipality: "Ormoc City",
      bookingsCount: 4,
      dateJoinedLabel: "Oct 1, 2026",
      status: "Active",
    },
    {
      id: "usr_2",
      fullName: "Juan Dela Cruz (Emerald Catering)",
      roleLabel: "Provider",
      email: "emerald@example.test",
      phone: "09179999999",
      municipality: "Ormoc City",
      bookingsCount: 12,
      dateJoinedLabel: "Sep 15, 2026",
      status: "Active",
    },
  ],
};

describe("admin reports sub-module workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.downloadPdf.mockResolvedValue("feasta-service-fees-report-2026-11-27.pdf");
    mocks.loadModule.mockImplementation(async (request) => {
      switch (request.module) {
        case "service_fees":
          return serviceFeesFixture;
        case "fee_withdrawals":
          return feeWithdrawalsFixture;
        case "bookings":
          return bookingsFixture;
        case "providers":
          return providersFixture;
        case "users":
          return usersFixture;
      }
    });
  });

  it("renders the 5 core sub-module tabs with Export PDF and Print, without Export Excel or standalone Customer Directory", () => {
    render(
      <AdminReportsWorkspaceClient initialServiceFees={serviceFeesFixture} />,
    );

    const tablist = screen.getByRole("tablist", {name: "Report sub-modules"});
    expect(
      within(tablist)
        .getAllByRole("tab")
        .map((tab) => tab.textContent?.trim()),
    ).toEqual([
      "FEASTA Service Fees",
      "Fee Withdrawals",
      "Bookings & Cancellations",
      "Provider Performance",
      "Users Directory",
    ]);

    expect(screen.getByRole("button", {name: /Export PDF/i})).toBeVisible();
    expect(screen.getByRole("button", {name: /Print/i})).toBeVisible();
    expect(
      screen.queryByRole("button", {name: /Export Excel/i}),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", {name: /Customer Directory/i}),
    ).not.toBeInTheDocument();

    const table = screen.getByRole("table", {
      name: "FEASTA service fees report records",
    });
    expect(within(table).getByText("BK-1001")).toBeVisible();
    expect(within(table).getByText("Emerald Catering")).toBeVisible();
    expect(screen.getByText("Page 1 of 1")).toBeVisible();

    const feeStatusSelect = screen.getByRole("combobox", {
      name: "Payment status",
    });
    expect(
      within(feeStatusSelect)
        .getAllByRole("option")
        .map((option) => option.textContent?.trim()),
    ).toEqual(["All statuses", "Paid", "Partially refunded"]);
  });

  it("switches across sub-modules, loads their tables on demand, and applies Provider Performance sorting", async () => {
    const user = userEvent.setup();
    render(
      <AdminReportsWorkspaceClient initialServiceFees={serviceFeesFixture} />,
    );

    await user.click(screen.getByRole("tab", {name: /Fee Withdrawals/i}));
    const withdrawalsTable = await screen.findByRole("table", {
      name: "FEASTA fee withdrawals report records",
    });
    expect(withdrawalsTable).toBeVisible();
    expect(
      within(withdrawalsTable).getByText("company_commission_wd_1"),
    ).toBeVisible();

    await user.click(screen.getByRole("tab", {name: /Provider Performance/i}));
    await waitFor(() => {
      expect(
        screen.getByRole("table", {
          name: "Provider performance and ratings report records",
        }),
      ).toBeVisible();
    });
    expect(screen.getByText("Emerald Catering (12)")).toBeVisible();
    expect(screen.getByText("Royal Feast (4.9)")).toBeVisible();
    expect(
      within(screen.getByRole("combobox", {name: "Service category"}))
        .getAllByRole("option")
        .map((option) => option.textContent?.trim()),
    ).toEqual(["All service categories", "Catering", "Photography"]);

    await user.selectOptions(
      screen.getByRole("combobox", {name: "Rank providers by"}),
      "highest_rating",
    );
    await user.click(screen.getByRole("button", {name: "Apply filters"}));
    await waitFor(() => {
      expect(mocks.loadModule).toHaveBeenCalledWith({
        module: "providers",
        filters: expect.objectContaining({sortBy: "highest_rating"}),
      });
    });

    await user.click(screen.getByRole("tab", {name: /Users Directory/i}));
    const usersTable = await screen.findByRole("table", {
      name: "Users directory report records",
    });
    expect(usersTable).toBeVisible();
    expect(within(usersTable).getByText("sophia@example.test")).toBeVisible();
    expect(within(usersTable).getByText("emerald@example.test")).toBeVisible();
    expect(
      within(screen.getByRole("combobox", {name: "User role"}))
        .getAllByRole("option")
        .map((option) => option.textContent?.trim()),
    ).toEqual(["All roles", "Customers", "Providers"]);
    expect(
      within(screen.getByRole("combobox", {name: "Account status"}))
        .getAllByRole("option")
        .map((option) => option.textContent?.trim()),
    ).toEqual(["All statuses", "Active"]);
  });

  it("exports PDF and prints report values only (without calling window.print on the web page)", async () => {
    const user = userEvent.setup();
    const windowPrintSpy = vi
      .spyOn(window, "print")
      .mockImplementation(() => undefined);

    render(
      <AdminReportsWorkspaceClient initialServiceFees={serviceFeesFixture} />,
    );

    await user.click(screen.getByRole("button", {name: /Export PDF/i}));
    await waitFor(() => {
      expect(mocks.downloadPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          module: "service_fees",
          title: "FEASTA Service Fees Report",
        }),
      );
    });

    await user.click(screen.getByRole("button", {name: /Print/i}));
    expect(mocks.printReport).toHaveBeenCalledWith(
      expect.objectContaining({
        module: "service_fees",
        title: "FEASTA Service Fees Report",
      }),
    );
    expect(windowPrintSpy).not.toHaveBeenCalled();
    windowPrintSpy.mockRestore();
  });
});

describe("admin report PDF and clean print output", () => {
  it("generates a valid multi-page PDF document with WinAnsi-safe peso formatting", async () => {
    expect(sanitizePdfText("₱1,500.00 — Test · ‘Quote’")).toBe(
      "PHP 1,500.00 - Test | 'Quote'",
    );

    const manyRowsPayload: ServiceFeesReportPayload = {
      ...serviceFeesFixture,
      rows: Array.from({length: 35}, (_, index) => ({
        ...serviceFeesFixture.rows[0],
        id: `pay_${index + 1}`,
        bookingCode: `BK-${2000 + index}`,
      })),
    };

    const spec = buildPrintableReportSpec(manyRowsPayload);
    const result = await createSubModuleReportPdf(spec);

    expect(result.fileName).toBe("feasta-service-fees-report-2026-11-27.pdf");
    expect(result.blob.type).toBe("application/pdf");
    expect(result.bytes.byteLength).toBeGreaterThan(1_000);
    // Verify standard PDF signature "%PDF-"
    const header = String.fromCharCode(...result.bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  it("builds a clean standalone tabular HTML document for Print with escaped values and no web app chrome", () => {
    const xssPayload: UsersDirectoryReportPayload = {
      ...usersFixture,
      rows: [
        {
          ...usersFixture.rows[0],
          fullName: `<script>alert("xss")</script> & Co.`,
        },
      ],
    };

    const spec = buildPrintableReportSpec(xssPayload);
    const html = buildPrintableReportHtml(spec);

    expect(html).toContain("Users Directory Report");
    expect(html).toContain("<table>");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; Co.");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("Export PDF");
    expect(html).not.toContain("Collapse sidebar");
  });
});
