import {render, screen, within} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";

import CustomerDirectoryPage from "@/app/admin/reports/customer-directory/page";
import {getCustomerDirectoryReport} from "@/lib/admin/reports/customer-directory-report";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  collection: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({requireAdmin: mocks.requireAdmin}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {collection: mocks.collection}}));

type Row = [id: string, data: Record<string, unknown>];
let source: Record<string, Row[]>;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({uid: "admin"});
  source = {
    users: [
      ["customer-a", {role: "customer", firstName: "Ari", email: "ari@example.test",
        phoneNumber: "09123456789", city: "Stale user city", isActive: true,
        createdAt: {toDate: () => new Date("2026-10-01T20:00:00Z")}}],
      ["customer-b", {role: "customer", firstName: "Bea", city: "Ormoc City", isBlocked: true}],
      ["customer-c", {role: "customer", firstName: "Cal", isActive: false}],
      ["customer-d", {role: "customer", firstName: "Dee"}],
      ["provider-a", {role: "provider", firstName: "Provider only"}],
    ],
    customers: [
      ["customer-a", {city: " Ormoc City "}],
      ["customer-c", {city: 42}],
      ["customer-d", {city: "  "}],
      ["provider-a", {city: "Other municipality"}],
    ],
    mainEvents: [
      ["booking-a", {customerId: "customer-a", status: "confirmed"}],
      ["booking-b", {customerId: "customer-a", status: "cancelled"}],
      ["booking-c", {customerId: "customer-a", status: "draft"}],
    ],
  };
  mocks.collection.mockImplementation((name: string) => {
    let rows = source[name];
    const query = {
      select: () => query,
      where: (field: string, operator: string, value: string) => {
        mocks.where(field, operator, value);
        rows = rows.filter(([, data]) => data[field] === value);
        return query;
      },
      limit: (count: number) => {
        mocks.limit(count);
        rows = rows.slice(0, count);
        return query;
      },
      get: async () => ({
        size: rows.length,
        docs: rows.map(([id, data]) => ({id, data: () => data, get: (field: string) => data[field]})),
      }),
    };
    return query;
  });
});

it("filters by trimmed customer-profile city and counts distinct submitted events", async () => {
  const report = await getCustomerDirectoryReport({municipality: " ORMOC CITY ", status: "Active"});
  expect(report.municipalities).toEqual([["ormoc city", "Ormoc City"]]);
  expect(report.rows).toEqual([{
    name: "Ari", email: "ari@example.test", phone: "09123456789", municipality: "Ormoc City",
    bookings: 2, joined: new Intl.DateTimeFormat("en-PH", {timeZone: "Asia/Manila"}).format(new Date("2026-10-02T00:00:00Z")), status: "Active",
  }]);
  expect(mocks.where).toHaveBeenCalledWith("role", "==", "customer");
  expect(await getCustomerDirectoryReport({municipality: "Stale user city"})).toMatchObject({rows: []});
});

it("shows unavailable for missing, blank, and invalid profile cities", async () => {
  const report = await getCustomerDirectoryReport({});
  expect(report.rows.slice(1).map(({municipality}) => municipality)).toEqual(
    ["Unavailable", "Unavailable", "Unavailable"],
  );
  expect(await getCustomerDirectoryReport({municipality: "Ormoc City", status: "Blocked"}))
    .toMatchObject({rows: []});
});

it("denies access before any query and fails closed at the report size limit", async () => {
  mocks.requireAdmin.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(getCustomerDirectoryReport({})).rejects.toThrow("Forbidden");
  expect(mocks.collection).not.toHaveBeenCalled();

  source.mainEvents = Array.from({length: 5_001}, (_, index) => [String(index), {}]);
  await expect(getCustomerDirectoryReport({})).rejects.toThrow("exceeds 5,000 records");
  expect(mocks.limit).toHaveBeenCalledWith(5_001);
});

it("renders selected filters, report rows, and a print action", async () => {
  render(await CustomerDirectoryPage({searchParams: Promise.resolve({municipality: "Ormoc City", status: "Active"})}));
  expect(screen.getByRole("heading", {name: "Customer Directory"})).toBeInTheDocument();
  expect(screen.getByRole("combobox", {name: "Municipality"})).toHaveValue("ormoc city");
  expect(screen.getByRole("combobox", {name: "Account status"})).toHaveValue("Active");
  expect(within(screen.getByRole("table")).getByRole("rowheader", {name: "Ari"})).toBeVisible();
  expect(screen.queryByText("Bea")).not.toBeInTheDocument();
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  try {
    screen.getByRole("button", {name: "Print / Save PDF"}).click();
    expect(print).toHaveBeenCalledOnce();
  } finally {
    print.mockRestore();
  }
});
