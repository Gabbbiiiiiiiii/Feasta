import {beforeEach, expect, it, vi} from "vitest";
import type {AdminPaymentFilters} from "@/lib/admin/payments/admin-payment-types";

const database = vi.hoisted(() => ({
  records: {} as Record<string, {id: string; values: Record<string, unknown>}[]>,
  requireAdmin: vi.fn(),
  partialLimits: [] as number[],
}));
vi.mock("@/lib/auth/session", () => ({requireAdmin: database.requireAdmin}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  collection: (collection: string) => query(collection),
}}));

function query(collection: string, conditions: {field: unknown; value: unknown}[] = [], limit?: number) {
  const rows = () => (database.records[collection] ?? []).filter(record => conditions.every(({field, value}) =>
    typeof field === "string" ? record.values[field] === value : Array.isArray(value) && value.includes(record.id),
  ));
  return {
    where: (field: unknown, _operator: string, value: unknown) => query(collection, [...conditions, {field, value}], limit),
    orderBy: () => query(collection, conditions, limit),
    limit: (value: number) => {
      if (conditions.some(condition => condition.value === "partially_refunded")) database.partialLimits.push(value);
      return query(collection, conditions, value);
    },
    count: () => ({get: async () => ({data: () => ({count: rows().length})})}),
    aggregate: () => ({get: async () => ({data: () => ({amountInCentavos: rows().reduce((sum, record) => sum + Number(record.values.amountInCentavos), 0)})})}),
    get: async () => ({docs: rows().slice(0, limit).map(record => ({id: record.id, data: () => record.values}))}),
  };
}
const filters: AdminPaymentFilters = {search: "", status: "all", paymentType: "all", date: "all", issue: "all", sortField: "createdAt", sortDirection: "descending", pageSize: 10, cursor: null};
const record = (id: string, status = "paid", refund?: number) => ({id, values: {
  status, amountInCentavos: 500000, refundedAmountInCentavos: refund,
  mainEventId: "booking", providerRequestId: "request", providerId: "provider", customerId: "customer",
  paymongoResourceId: "gateway", currency: "PHP", paymentType: "provider_down_payment",
}});
beforeEach(() => {
  vi.resetModules();
  database.records = {payments: [record("legacy-paid")], providers: [{id: "provider", values: {businessName: "Provider"}}]};
  database.partialLimits = [];
  database.requireAdmin.mockReset();
});
async function load(changes: Partial<AdminPaymentFilters> = {}) {
  const {getAdminPaymentPage} = await import("@/lib/admin/payments/admin-payment-service");
  return getAdminPaymentPage({...filters, ...changes});
}
it("an orphaned paid payment retains independent missing records without a secondary mismatch", async () => {
  const result = await load();
  expect(database.requireAdmin).toHaveBeenCalledOnce();
  expect(result.payments[0].issues).toEqual(["missing_booking", "missing_provider_request"]);
  expect(result.payments[0].amountInCentavos).toBe(500000);
  expect(result.payments[0].refundedAmountFormatted).toBeNull();
});
it("a resolved booking with an inconsistent payment status still needs review", async () => {
  database.records.mainEvents = [{id: "booking", values: {paymentStatus: "unpaid"}}];
  expect((await load()).payments[0].issues).toContain("booking_status_mismatch");
});
it("a canonical deposit remains a paid transaction without a false booking mismatch", async () => {
  database.records.payments[0].values.amountInCentavos = 250000;
  database.records.mainEvents = [{id: "booking", values: {providerRequestIds: ["request"]}}];
  database.records.providerRequests = [{id: "request", values: {
    mainEventId: "booking", customerId: "customer", providerId: "provider", initialPaymentId: "legacy-paid",
    settlementSchemaVersion: 1, settlementStatus: "deposit_settled", financialSnapshot: {grossAmountInCentavos: 500000},
    grossSettledAmountInCentavos: 250000, outstandingAmountInCentavos: 250000,
  }}];
  const payment = (await load()).payments[0];
  expect(payment.status).toBe("paid");
  expect(payment.issues).not.toContain("booking_status_mismatch");
});
it.each(["zero", "amount", "linkage"])("keeps a real canonical %s mismatch visible", async (issue) => {
  database.records.mainEvents = [{id: "booking", values: {providerRequestIds: ["request"]}}];
  database.records.providerRequests = [{id: "request", values: {
    mainEventId: issue === "linkage" ? "other" : "booking", customerId: "customer", providerId: "provider", initialPaymentId: "legacy-paid",
    settlementSchemaVersion: 1, settlementStatus: issue === "zero" ? "unpaid" : "deposit_settled",
    financialSnapshot: {grossAmountInCentavos: 500000}, grossSettledAmountInCentavos: issue === "zero" ? 0 : 250000,
    outstandingAmountInCentavos: issue === "zero" ? 500000 : 250000,
  }}];
  expect((await load()).payments[0].issues).toContain("booking_status_mismatch");
});
it("the actual page preserves all three review filter values", async () => {
  expect((await load({issue: "all"})).payments).toHaveLength(1);
  expect((await load({issue: "with_issues"})).payments).toHaveLength(1);
  expect((await load({issue: "without_issues"})).payments).toHaveLength(0);
});
it("page totals include retained principal and completed partial refunds using bounded canonical accounting", async () => {
  database.records.payments = [record("paid"), record("legacy-refunded", "refunded"), record("partial", "partially_refunded", 200000)];
  const result = await load();
  expect(result.statistics.confirmedVolumeInCentavos).toBe(800000);
  expect(result.statistics.refundedAmountInCentavos).toBe(700000);
  expect(result.payments.find(payment => payment.id === "legacy-refunded")?.refundedAmountFormatted).toMatch(/5,000\.00/);
  expect(result.payments.find(payment => payment.id === "partial")?.refundedAmountFormatted).toMatch(/2,000\.00/);
  expect(database.partialLimits).toEqual([100]);
});
it("unknown partial refund accounting keeps totals unavailable", async () => {
  database.records.payments = [record("partial", "partially_refunded")];
  const result = await load();
  expect(result.statistics.confirmedVolumeInCentavos).toBeNull();
  expect(result.statistics.refundedAmountInCentavos).toBeNull();
  expect(result.statistics.refundedAmountFormatted).toBe("Unavailable");
});
