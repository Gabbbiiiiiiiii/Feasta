import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

const database = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[] > }));
vi.mock("@/lib/auth/session", () => ({ requireRole: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("firebase-admin/firestore", async (importOriginal) => ({
  ...await importOriginal<typeof import("firebase-admin/firestore")>(),
  AggregateField: { sum: (field: string) => ({ field }) },
}));
vi.mock("@/lib/firebase/admin", () => {
  const comparable = (value: unknown): number | string => {
    if (value && typeof value === "object" && "toMillis" in value) {
      return (value as { toMillis(): number }).toMillis();
    }
    return value as number | string;
  };
  function query(rows: Record<string, unknown>[]) {
    return {
      where(field: string, operator: string, expected: unknown) {
        return query(rows.filter((row) => {
          if (operator === "==") return row[field] === expected;
          if (operator === "in") return (expected as unknown[]).includes(row[field]);
          if (operator === ">=") return comparable(row[field]) >= comparable(expected);
          if (operator === "<") return comparable(row[field]) < comparable(expected);
          throw new Error("Unexpected query operator");
        }));
      },
      select(...fields: string[]) {
        return query(rows.map((row) => ({ id: row.id, ...Object.fromEntries(
          fields.filter((field) => field in row).map((field) => [field, row[field]]),
        ) })));
      },
      orderBy() { return query(rows); },
      limit(count: number) { return query(rows.slice(0, count)); },
      doc(id: string) { return { get: async () => ({ data: () => rows.find((row) => row.id === id) }) }; },
      count() { return { get: async () => ({ data: () => ({ count: rows.length }) }) }; },
      aggregate(fields: Record<string, { field: string }>) {
        // Firestore aggregates include only documents with every aggregated field.
        const eligible = rows.filter((row) => Object.values(fields).every(({ field }) => field in row));
        return { get: async () => ({ data: () => Object.fromEntries(
          Object.entries(fields).map(([name, { field }]) => [name,
            eligible.reduce((sum, row) => sum + (typeof row[field] === "number" ? row[field] : 0), 0),
          ]),
        ) }) };
      },
      async get() { return { docs: rows.map((row) => ({ id: row.id, data: () => row })) }; },
    };
  }
  return { adminDb: { collection: (name: string) => query(database.rows[name] ?? []) } };
});
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: ({ domain, tickFormatter }: { domain: number[]; tickFormatter: (value: number) => string }) => (
    <div data-testid="revenue-axis" data-min={domain[0]}>{tickFormatter(100000)}</div>
  ),
  Tooltip: () => null,
  Line: () => null,
}));

import { getAdminDashboardData } from "@/lib/admin/dashboard/admin-dashboard-data";
import AdminPage from "@/app/admin/page";

function entry(id: string, date: string, amount: number, refund = false) {
  return {
    id, ledgerEntryId: id, schemaVersion: 1, currency: "PHP",
    paymentId: "payment-one", providerRequestId: "request-one",
    mainEventId: "event-one", providerId: "provider-one",
    createdAt: Timestamp.fromDate(new Date(date)),
    ...(refund ? {
      entryType: "refund_completed", refundAmountInCentavos: amount * 20,
      commissionReversedInCentavos: amount, providerVatReversedInCentavos: 0,
      platformVatReversedInCentavos: 0, withholdingReversedInCentavos: 0,
    } : {
      entryType: "payment_settled", grossAmountInCentavos: amount * 20 || 10000,
      commissionAccruedInCentavos: amount, providerVatInCentavos: 0,
      platformVatInCentavos: 0, withholdingInCentavos: 0,
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T04:00:00.000Z"));
  database.rows = {
    users: [
      { role: "customer", isActive: true }, { role: "customer", isActive: false },
      { role: "provider", isActive: true }, { role: "provider", isActive: false },
      { role: "admin", isActive: true },
    ],
    mainEvents: [{ status: "confirmed" }, { status: "completed" }, { status: "cancelled" }],
    providerRequests: [{ mainEventId: "event-one" }, { mainEventId: "event-one" }],
    providerVerifications: [{ status: "submitted" }, { status: "under_review" }, { status: "approved" }],
    payments: [
      { status: "paid", amountInCentavos: 1000000 },
      { status: "pending", amountInCentavos: 2000000 },
      { status: "failed", amountInCentavos: 3000000 },
    ],
    financialLedgerEntries: [entry("settlement", "2026-09-26T16:00:00.000Z", 50000)],
  };
});
afterEach(() => vi.useRealTimers());

describe("Admin dashboard financial and population metrics", () => {
  it("uses the recorded PHP500 fee from a PHP10,000 payment and counts all customers, providers and events", async () => {
    const dashboard = await getAdminDashboardData();
    expect(dashboard.statistics).toEqual({
      feastaRevenueInCentavos: 50000, totalUsers: 4, totalBookings: 3, verificationQueue: 2,
      revenueLast30DaysInCentavos: 50000, customerAccounts: 2, providerAccounts: 2,
      activeBookings: 1, completedBookings: 1, submittedApprovals: 1, underReviewApprovals: 1,
    });
    expect(dashboard.operationsOverview).toMatchObject({
      pendingProcessingPayments: 1, failedExpiredPayments: 1,
    });
    database.rows.appSettings = [{ id: "platform", platformCommissionRateBps: 9000 }];
    expect((await getAdminDashboardData()).statistics.feastaRevenueInCentavos).toBe(50000);
  });

  it("subtracts completed partial and full fee reversals on their ledger dates, even for old payments", async () => {
    database.rows.financialLedgerEntries = [
      entry("old-payment", "2024-01-01T00:00:00Z", 50000),
      entry("partial-refund", "2026-09-26T16:00:00Z", 10000, true),
      entry("remaining-refund", "2026-09-27T16:00:00Z", 40000, true),
    ];
    database.rows.payments[0].status = "refunded";
    const dashboard = await getAdminDashboardData();
    expect(dashboard.statistics.feastaRevenueInCentavos).toBe(0);
    expect(dashboard.revenueByRange["7D"].slice(-2)).toEqual([
      { label: "Sep 27", revenueInCentavos: -10000 },
      { label: "Sep 28", revenueInCentavos: -40000 },
    ]);
    expect(dashboard.revenueByRange["1Y"].at(-1)?.revenueInCentavos).toBe(-50000);
  });

  it("preserves Manila midnight boundaries and 7/30 daily and 3/12 monthly buckets", async () => {
    database.rows.financialLedgerEntries = [
      entry("before-midnight", "2026-09-26T15:59:59.999Z", 10000),
      entry("at-midnight", "2026-09-26T16:00:00.000Z", 20000),
      entry("before-month", "2026-08-31T15:59:59.999Z", 30000),
      entry("at-month", "2026-08-31T16:00:00.000Z", 40000),
      entry("outside-year", "2025-09-30T15:59:59.999Z", 50000),
      entry("inside-year", "2025-09-30T16:00:00.000Z", 60000),
    ];
    const { revenueByRange, statistics } = await getAdminDashboardData();
    expect(Object.values(revenueByRange).map((points) => points.length)).toEqual([7, 30, 3, 12]);
    expect(revenueByRange["7D"].slice(-3)).toEqual([
      { label: "Sep 26", revenueInCentavos: 10000 },
      { label: "Sep 27", revenueInCentavos: 20000 },
      { label: "Sep 28", revenueInCentavos: 0 },
    ]);
    expect(revenueByRange["3M"].map((point) => point.revenueInCentavos)).toEqual([0, 30000, 70000]);
    expect(revenueByRange["1Y"][0]).toEqual({ label: "Oct 25", revenueInCentavos: 60000 });
    expect(statistics.feastaRevenueInCentavos).toBe(210000);
  });

  it("handles leap days and year transitions using the existing rolling ranges", async () => {
    vi.setSystemTime(new Date("2024-03-01T04:00:00Z"));
    database.rows.financialLedgerEntries = [entry("leap-day", "2024-02-28T16:00:00Z", 12345)];
    let result = await getAdminDashboardData();
    expect(result.revenueByRange["7D"].at(-2)).toEqual({ label: "Feb 29", revenueInCentavos: 12345 });
    vi.setSystemTime(new Date("2025-01-01T04:00:00Z"));
    result = await getAdminDashboardData();
    expect(result.revenueByRange["3M"].map((point) => point.label)).toEqual(["Nov 24", "Dec 24", "Jan 25"]);
  });

  it("supports genuine zero commission and empty ledgers without substituting customer payments", async () => {
    database.rows.financialLedgerEntries = [entry("no-fee", "2026-09-27T16:00:00Z", 0)];
    expect((await getAdminDashboardData()).statistics.feastaRevenueInCentavos).toBe(0);
    database.rows.financialLedgerEntries = [];
    const result = await getAdminDashboardData();
    expect(result.statistics.feastaRevenueInCentavos).toBe(0);
    expect(result.revenueByRange["1Y"].every((point) => point.revenueInCentavos === 0)).toBe(true);
  });

  it("fails rather than silently treating missing fee evidence as zero", async () => {
    delete (database.rows.financialLedgerEntries[0] as Record<string, unknown>).commissionAccruedInCentavos;
    await expect(getAdminDashboardData()).rejects.toThrow("invalid financial ledger entry");
  });

  it("renders four linked cards including pending approvals and switches revenue ranges", async () => {
    database.rows.financialLedgerEntries.push(entry("earlier-fee", "2026-09-01T00:00:00Z", 625025));
    const user = userEvent.setup();
    render(await AdminPage());
    const summary = screen.getByRole("region", { name: "Platform summary" });
    expect(within(summary).getAllByRole("region")).toHaveLength(4);
    expect(within(summary).getByText("\u20b16,750.25 in the last 30 days")).toBeInTheDocument();
    expect(within(summary).getByText("2 customers / 2 providers")).toBeInTheDocument();
    expect(within(summary).getByText("1 active / 1 completed")).toBeInTheDocument();
    expect(within(summary).getByText("1 submitted / 1 under review")).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: /FEASTA Revenue/i })).toHaveAttribute("href", "/admin/payments");
    expect(within(summary).getByText("\u20b16,750.25")).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: /Total Users/ })).toHaveAttribute("href", "/admin/users");
    expect(within(summary).getByRole("link", { name: /Total Bookings/ })).toHaveAttribute("href", "/admin/bookings");
    expect(within(summary).getByRole("link", { name: /Pending Accounts for Approval/ })).toHaveAttribute("href", "/admin/providers");
    expect(screen.getByText(/Platform and service fees earned through eligible FEASTA transactions\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1M" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "7D" }));
    expect(screen.getByText(/Total FEASTA revenue for this range is \u20b1500.00/)).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("button", { name: "1M" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByText(/Total FEASTA revenue for this range is \u20b16,750.25/)).toBeInTheDocument();
    expect(screen.getByTestId("revenue-axis")).toHaveTextContent("\u20b11K");
  });

  it("keeps negative refund-only revenue visible on the chart", async () => {
    database.rows.financialLedgerEntries = [
      entry("old", "2024-01-01T00:00:00Z", 50000),
      entry("reversal", "2026-09-27T16:00:00Z", 50000, true),
    ];
    render(await AdminPage());
    expect(Number(screen.getByTestId("revenue-axis").getAttribute("data-min"))).toBeLessThanOrEqual(-50000);
    expect(screen.getByText(/Total FEASTA revenue for this range is -\u20b1500.00/)).toBeInTheDocument();
  });

  it("ranks active providers by distinct completed events and links their actual verification application", async () => {
    database.rows.providers = [
      { id: "provider-a", ownerId: "owner-a", businessName: "Alpha Catering", providerServiceType: "catering", isActive: true, completedBookings: 999 },
      { id: "provider-b", ownerId: "owner-b", businessName: "Beta Events", providerServiceType: "decorations", isActive: true },
      { id: "inactive", businessName: "Inactive", isActive: false },
      { id: "no-completions", businessName: "No completions", isActive: true, completedBookings: 99999 },
    ];
    database.rows.providerRequests = [
      { providerId: "provider-a", mainEventId: "event-a", status: "completed" },
      { providerId: "provider-a", mainEventId: "event-a", status: "completed" },
      { providerId: "provider-a", mainEventId: "event-cancelled", status: "cancelled" },
      { providerId: "provider-a", status: "completed" },
      { providerId: "provider-b", mainEventId: "event-a", status: "completed" },
      { providerId: "provider-b", mainEventId: "event-b", status: "completed" },
      { providerId: "inactive", mainEventId: "event-a", status: "completed" },
    ];
    database.rows.providerVerifications.push(
      { id: "application-b-old", providerId: "provider-b", ownerId: "owner-b", createdAt: new Date("2026-01-01") },
      { id: "application-b-current", providerId: "provider-b", ownerId: "owner-b", updatedAt: new Date("2026-09-01") },
      { id: "application-wrong-owner", providerId: "provider-b", ownerId: "other-owner", updatedAt: new Date("2026-09-28") },
    );
    const dashboard = await getAdminDashboardData();
    expect(dashboard.topProviders.map(({ id, completedBookings, href }) => ({ id, completedBookings, href }))).toEqual([
      { id: "provider-b", completedBookings: 2, href: "/admin/providers?selected=application-b-current" },
      { id: "provider-a", completedBookings: 1, href: "/admin/providers?q=Alpha%20Catering" },
    ]);
    render(await AdminPage());
    expect(screen.getByRole("link", { name: /Beta Events/ })).toHaveAttribute("href", "/admin/providers?selected=application-b-current");
    expect(screen.getByRole("link", { name: /Alpha Catering/ })).toHaveAttribute("href", "/admin/providers?q=Alpha%20Catering");
    expect(screen.getByRole("link", { name: "View all providers" })).toHaveAttribute("href", "/admin/providers");
  });

  it("limits the provider ranking to five with deterministic ties", async () => {
    database.rows.providers = Array.from({ length: 7 }, (_, index) => ({
      id: "provider-" + index, businessName: "Provider " + index, isActive: true,
    })).reverse();
    database.rows.providerRequests = database.rows.providers.map((provider) => ({
      providerId: provider.id, mainEventId: "event-one", status: "completed",
    }));
    const dashboard = await getAdminDashboardData();
    expect(dashboard.topProviders.map((provider) => provider.id)).toEqual([
      "provider-0", "provider-1", "provider-2", "provider-3", "provider-4",
    ]);
  });

  it("replaces quick actions with live operations counts without verification or booking overview", async () => {
    database.rows.reviews = [
      { isReported: true, isDeleted: false },
      { isReported: true, isDeleted: true },
      { isReported: false, isDeleted: false },
    ];
    database.rows.complaints = [{ status: "submitted" }, { status: "escalated" }, { status: "resolved" }];
    database.rows.appSettings = [{ id: "adminDashboard", quickActionsTitle: "Quick Actions" }];
    database.rows.adminLogs = [{ id: "log", action: "user_account_enabled", actorName: "Test Admin", entity: "user", createdAt: new Date() }];
    const dashboard = await getAdminDashboardData();
    expect(dashboard.operationsOverview).toEqual({
      pendingProcessingPayments: 1, failedExpiredPayments: 1, reportedReviews: 1, openComplaints: 2,
    });
    const user = userEvent.setup();
    render(await AdminPage());
    const operations = screen.getByRole("region", { name: "Operations Overview" });
    expect(within(operations).getAllByRole("link")).toHaveLength(4);
    expect(within(operations).getByRole("link", { name: "Pending / processing payments: 1" })).toHaveAttribute("href", "/admin/payments");
    expect(within(operations).getByRole("link", { name: "Reported reviews: 1" })).toHaveAttribute("href", "/admin/reviews");
    expect(within(operations).getByRole("link", { name: "Open complaints: 2" })).toHaveAttribute("href", "/admin/complaints");
    expect(within(operations).queryByText(/provider|booking/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Quick Actions")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Booking Overview/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent Activities" })).toBeInTheDocument();
    expect(screen.getByText("User account enabled")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Platform Health" })).not.toBeInTheDocument();
    for (let i = 0; i < 4; i++) await user.tab();
    expect(screen.getByRole("link", { name: /Pending Accounts for Approval/ })).toHaveFocus();
  });

});
