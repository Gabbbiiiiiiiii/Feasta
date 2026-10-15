import {beforeEach, expect, it, vi} from "vitest";
import type {AdminBookingFilters} from "@/lib/admin/bookings/admin-booking-types";

type AggregateSpec = Record<string, {_field?: string}>;
type PartialPayment = {
  amount?: number;
  amountInCentavos?: number;
  refundedAmountInCentavos?: number;
  status?: string;
};

const state = vi.hoisted(() => ({
  paidAmount: 0 as number | null,
  refundedAmount: 0 as number | null,
  partials: [] as PartialPayment[],
  aggregates: [] as {status: unknown; spec: AggregateSpec}[],
  partialQueries: [] as {limit: number | null; selected: string[] | null; orders: unknown[][]}[],
}));

vi.mock("@/lib/auth/session", () => ({requireAdmin: vi.fn()}));
vi.mock("@/lib/firebase/admin", () => {
  class Query {
    conditions: unknown[][] = [];
    orders: unknown[][] = [];
    cursor: unknown[] = [];
    mode = "list";
    limitValue: number | null = null;
    selected: string[] | null = null;
    aggregateSpec: AggregateSpec | null = null;
    constructor(public collection: string) {}
    copy() {
      const next = new Query(this.collection);
      next.conditions = [...this.conditions];
      next.orders = [...this.orders];
      next.cursor = [...this.cursor];
      next.mode = this.mode;
      next.limitValue = this.limitValue;
      next.selected = this.selected ? [...this.selected] : null;
      next.aggregateSpec = this.aggregateSpec;
      return next;
    }
    where(...condition: unknown[]) {const next = this.copy(); next.conditions.push(condition); return next;}
    orderBy(...order: unknown[]) {const next = this.copy(); next.orders.push(order); return next;}
    startAfter(...cursor: unknown[]) {const next = this.copy(); next.cursor = cursor; return next;}
    limit(value: number) {const next = this.copy(); next.limitValue = value; return next;}
    select(...fields: string[]) {const next = this.copy(); next.selected = fields; return next;}
    count() {const next = this.copy(); next.mode = "count"; return next;}
    aggregate(spec: AggregateSpec) {const next = this.copy(); next.mode = "sum"; next.aggregateSpec = spec; return next;}
    async get() {
      const status = this.conditions.find((condition) => condition[0] === "status")?.[2];
      if (this.collection === "payments" && this.mode === "sum") {
        state.aggregates.push({status, spec: this.aggregateSpec ?? {}});
        const amount = status === "paid" ? state.paidAmount : status === "refunded" ? state.refundedAmount : 0;
        return {docs: [], size: 0, data: () => ({amount})};
      }
      if (this.collection === "payments" && status === "partially_refunded") {
        state.partialQueries.push({limit: this.limitValue, selected: this.selected, orders: this.orders});
        const rows = this.limitValue == null ? state.partials : state.partials.slice(0, this.limitValue);
        const docs = rows.map((data, index) => ({id: `partial-${index}`, data: () => data}));
        return {docs, size: docs.length, data: () => ({})};
      }
      return {docs: [], size: 0, data: () => ({count: 0})};
    }
  }
  return {adminDb: {collection: (name: string) => new Query(name)}};
});

import {getAdminBookingPage} from "@/lib/admin/bookings/admin-booking-service";

const filters: AdminBookingFilters = {
  search: "",
  status: "all",
  paymentStatus: "all",
  date: "all",
  sortField: "createdAt",
  sortDirection: "descending",
  pageSize: 10,
  cursor: null,
};

const partial = (refundedAmountInCentavos: number, amountInCentavos = 500000): PartialPayment => ({
  amount: amountInCentavos / 100,
  amountInCentavos,
  refundedAmountInCentavos,
  status: "partially_refunded",
});

beforeEach(() => {
  state.paidAmount = 0;
  state.refundedAmount = 0;
  state.partials = [];
  state.aggregates = [];
  state.partialQueries = [];
});

async function loadStatistics() {
  const page = await getAdminBookingPage(filters, {freshStatistics: true});
  expectAmountOnlyAggregates();
  return page.statistics;
}

function expectAmountOnlyAggregates() {
  expect(state.aggregates.map((query) => query.status).sort()).toEqual(["paid", "refunded"]);
  for (const query of state.aggregates) {
    expect(Object.values(query.spec).map((field) => field._field)).toEqual(["amount"]);
    expect(JSON.stringify(query.spec)).not.toContain("refundedAmountInCentavos");
  }
  expect(state.aggregates.some((query) => query.status === "partially_refunded")).toBe(false);
  expect(state.partialQueries).toEqual([{
    limit: 101,
    selected: ["amount", "amountInCentavos", "refundedAmountInCentavos", "status"],
    orders: [],
  }]);
}

it("sums fully paid amounts and keeps refunded at zero", async () => {
  state.paidAmount = 5000;
  const statistics = await loadStatistics();
  expect(statistics.totalPaidAmount).toBe(5000);
  expect(statistics.totalRefundedAmount).toBe(0);
});

it("counts a full refund as returned principal with no retained paid", async () => {
  state.refundedAmount = 5000;
  const statistics = await loadStatistics();
  expect(statistics.totalPaidAmount).toBe(0);
  expect(statistics.totalRefundedAmount).toBe(5000);
});

it("retains the unpaid portion of one partial refund", async () => {
  state.partials = [partial(200000)];
  const statistics = await loadStatistics();
  expect(statistics.totalPaidAmount).toBe(3000);
  expect(statistics.totalRefundedAmount).toBe(2000);
});

it("combines fully paid, partial, and fully refunded principal", async () => {
  state.paidAmount = 5000;
  state.refundedAmount = 5000;
  state.partials = [partial(200000)];
  const statistics = await loadStatistics();
  expect(statistics.totalPaidAmount).toBe(8000);
  expect(statistics.totalRefundedAmount).toBe(7000);
});

it("keeps platform totals unavailable when a partial refund amount is missing", async () => {
  state.paidAmount = 5000;
  state.partials = [{amount: 5000, amountInCentavos: 500000, status: "partially_refunded"}];
  const statistics = await loadStatistics();
  expect(statistics.totalPaidAmount).toBeNull();
  expect(statistics.totalRefundedAmount).toBeNull();
});

it("keeps platform totals unavailable when a partial refund is negative", async () => {
  state.partials = [partial(-1)];
  const statistics = await loadStatistics();
  expect(statistics.totalPaidAmount).toBeNull();
  expect(statistics.totalRefundedAmount).toBeNull();
});

it("keeps platform totals unavailable when a partial refund exceeds the original", async () => {
  state.partials = [partial(500001)];
  const statistics = await loadStatistics();
  expect(statistics.totalPaidAmount).toBeNull();
  expect(statistics.totalRefundedAmount).toBeNull();
});

it("calculates exactly 100 valid partial rows", async () => {
  state.partials = Array.from({length: 100}, () => partial(200000));
  const statistics = await loadStatistics();
  expect(statistics.totalPaidAmount).toBe(300000);
  expect(statistics.totalRefundedAmount).toBe(200000);
});

it("keeps platform totals unavailable when 101 partial rows exist", async () => {
  state.partials = Array.from({length: 101}, () => partial(200000));
  const statistics = await loadStatistics();
  expect(statistics.totalPaidAmount).toBeNull();
  expect(statistics.totalRefundedAmount).toBeNull();
});
