import {describe, expect, it} from "vitest";
import {dashboardEventStart, dashboardMatches} from "@/lib/provider/dashboard/provider-dashboard-projection";

const now = new Date("2026-10-10T02:00:00Z"); // 10am Manila
const future = new Date("2026-10-10T04:00:00Z");
const request = {customerId: "customer", eventDate: new Date("2026-10-09T16:00:00Z"), eventTime: "14:00", status: "pending", expiresAt: future};
const event = {customerId: "customer", status: "pending_provider_approval"};
const waiting = {...request, status: "waiting_for_down_payment", downPaymentAmount: 100, paymentStatus: "pending"};
const balance = {...request, status: "confirmed", settlementSchemaVersion: 1, settlementStatus: "deposit_settled",
  financialSnapshot: {schemaVersion: 1, grossAmountInCentavos: 10000}, grossSettledAmountInCentavos: 3000,
  outstandingAmountInCentavos: 7000, hardPaymentDeadlineAt: future};

describe("provider dashboard count predicates", () => {
  it("counts pending actionable requests, including later today", () => {
    expect(dashboardMatches("new", request, event, now)).toBe(true);
    expect(dashboardMatches("new", {...request, expiresAt: now}, event, now)).toBe(false);
    expect(dashboardMatches("new", {...request, eventTime: "09:00"}, event, now)).toBe(false);
    expect(dashboardMatches("new", request, {...event, status: "needs_provider_replacement"}, now)).toBe(true);
  });
  it.each(["accepted", "rejected", "cancelled", "expired", "payment_processing", "disputed"])("does not count %s as new or waiting", status => {
    expect(dashboardMatches("new", {...request, status}, event, now)).toBe(false);
    expect(dashboardMatches("payment", {...waiting, status}, {...event, status: "waiting_for_down_payment"}, now)).toBe(false);
  });
  it("uses the Manila date and event time, not midnight, for future events", () => {
    expect(dashboardEventStart(request)?.toISOString()).toBe("2026-10-10T06:00:00.000Z");
    expect(dashboardMatches("upcoming", {...request, status: "confirmed"}, {...event, status: "confirmed"}, now)).toBe(true);
    expect(dashboardMatches("upcoming", {...request, status: "confirmed", eventTime: "10:00"}, {...event, status: "confirmed"}, now)).toBe(false);
    expect(dashboardMatches("upcoming", {...request, status: "accepted"}, {...event, status: "confirmed"}, now)).toBe(false);
  });
  it("keeps a confirmed provider event when another provider is awaiting payment", () => {
    expect(dashboardMatches("upcoming", {...request, status: "confirmed"}, {...event, status: "waiting_for_down_payment"}, now)).toBe(true);
  });
  it("counts a live initial payment obligation and excludes processing and expired holds", () => {
    const parent = {...event, status: "waiting_for_down_payment"};
    expect(dashboardMatches("payment", waiting, parent, now)).toBe(true);
    for (const change of [{expiresAt: now}, {paymentStatus: "processing"}, {paymentStatus: "refunded"}, {downPaymentAmount: 0}, {expiresAt: null}]) {
      expect(dashboardMatches("payment", {...waiting, ...change}, parent, now)).toBe(false);
    }
  });
  it("counts a canonical deposit balance before its payment deadline, even before due", () => {
    const parent = {...event, status: "confirmed"};
    expect(dashboardMatches("payment", balance, parent, now)).toBe(true);
    for (const change of [{hardPaymentDeadlineAt: now}, {settlementStatus: "balance_payment_processing"},
      {outstandingAmountInCentavos: 0}, {settlementSchemaVersion: 99}, {remainingBalanceEnforcement: {status: "on_hold"}}]) {
      expect(dashboardMatches("payment", {...balance, ...change}, parent, now)).toBe(false);
    }
  });
  it("does not reopen fully settled or refunded obligations", () => {
    expect(dashboardMatches("payment", {...balance, grossSettledAmountInCentavos: 10000, outstandingAmountInCentavos: 0, settlementStatus: "fully_settled"}, {...event, status: "confirmed"}, now)).toBe(false);
  });
  it.each(["cancelled", "expired", "disputed"])("excludes a %s parent from active counts", status => {
    for (const view of ["new", "upcoming", "payment"] as const) {
      expect(dashboardMatches(view, waiting, {...event, status}, now)).toBe(false);
    }
  });
  it("excludes cancellation and reconciliation locks from actionable counts", () => {
    for (const change of [{activeCancellationRequestId: "cancel"}, {refundExecutionLock: {}}, {reconciliationRequired: true}]) {
      expect(dashboardMatches("new", {...request, ...change}, event, now)).toBe(false);
    }
  });
  it("counts actual completion without turning refund history into a new obligation", () => {
    expect(dashboardMatches("completed", {...request, status: "completed", paymentStatus: "refunded"}, {...event, status: "completed"}, now)).toBe(true);
    expect(dashboardMatches("completed", {...request, status: "cancelled"}, {...event, status: "completed"}, now)).toBe(false);
    expect(dashboardMatches("completed", {...request, status: "completed"}, {...event, status: "disputed"}, now)).toBe(false);
  });
  it("fails closed for missing or unrelated parent events and invalid event times", () => {
    expect(dashboardMatches("new", request, null, now)).toBe(false);
    expect(dashboardMatches("new", request, {...event, customerId: "other"}, now)).toBe(false);
    expect(dashboardMatches("new", {...request, eventTime: "25:00"}, event, now)).toBe(false);
  });
});
