import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({records: {} as Record<string, Record<string, unknown>>, reads: vi.fn()}));
vi.mock("@/lib/auth/session", () => ({requireCustomer: async () => ({uid: "customer-owned"})}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  collection: (name: string) => ({doc: (id: string) => ({name, id, get: async () => {
    state.reads(name, id);
    const data = state.records[`${name}/${id}`];
    return {id, exists: Boolean(data), data: () => data};
  }})}),
  getAll: async (...refs: {name: string; id: string}[]) => refs.map(({name, id}) => {
    const data = state.records[`${name}/${id}`];
    return {id, exists: Boolean(data), data: () => data};
  }),
}}));
import {getCustomerPaymentReturnDetails} from "@/lib/customer/payments/customer-payment-service";
const lookup = {paymentId: "payment-owned"};
beforeEach(() => {
  state.reads.mockClear();
  state.records = {
    "payments/payment-owned": {paymentId: "payment-owned", providerRequestId: "request-owned", mainEventId: "booking-owned", bookingId: "booking-owned",
      customerId: "customer-owned", providerId: "provider-owned", paymentType: "provider_down_payment", gateway: "paymongo", status: "paid",
      amount: 2500, amountInCentavos: 250000, currency: "PHP", paymentChoice: "minimum"},
    "providerRequests/request-owned": {providerRequestId: "request-owned", mainEventId: "booking-owned", bookingId: "booking-owned", customerId: "customer-owned",
      providerId: "provider-owned", paymentId: "payment-owned", initialPaymentId: "payment-owned", amount: 5000, downPaymentAmount: 2500, status: "confirmed",
      financialSnapshot: {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 500000, requiredUpfrontAmountInCentavos: 250000, remainingBalanceInCentavos: 250000}},
    "mainEvents/booking-owned": {mainEventId: "booking-owned", bookingId: "booking-owned", customerId: "customer-owned", providerRequestIds: ["request-owned"], status: "confirmed", bookingCode: "BK-TEST"},
    "providers/provider-owned": {businessName: "Test provider"},
  };
});
describe("owned payment return reads", () => {
  it("resolves the exact owned payment without mutating any record", async () => {
    const before = structuredClone(state.records);
    expect(await getCustomerPaymentReturnDetails(lookup)).toMatchObject({paymentStatus: "paid", providerRequestId: "request-owned", canStartCheckout: false});
    expect(state.records).toEqual(before);
  });
  it("a cancelled browser return cannot turn an unpaid transaction into paid", async () => {
    state.records["payments/payment-owned"].status = "expired";
    expect(await getCustomerPaymentReturnDetails(lookup)).toMatchObject({paymentStatus: "expired"});
    expect(state.records["payments/payment-owned"].status).toBe("expired");
  });
  it("retains exact initial-payment lookup after the current pointer advances", async () => {
    state.records["providerRequests/request-owned"].paymentId = "payment-balance";
    expect(await getCustomerPaymentReturnDetails(lookup)).toMatchObject({paymentStatus: "paid"});
  });
  it.each(["customer", "relationship", "missing", "invalid"])("rejects %s correlation safely", async (kind) => {
    if (kind === "customer") state.records["payments/payment-owned"].customerId = "another-customer";
    if (kind === "relationship") state.records["providerRequests/request-owned"].mainEventId = "another-booking";
    if (kind === "missing") delete state.records["payments/payment-owned"];
    const input = kind === "invalid" ? {...lookup, paymentId: "../secret"} : lookup;
    await expect(getCustomerPaymentReturnDetails(input)).rejects.toThrow("Payment return unavailable");
  });
  it("ignores browser-supplied relationships and derives the owned records", async () => {
    const untrusted = {...lookup, providerRequestId: "attacker-request", bookingId: "attacker-booking"};
    expect(await getCustomerPaymentReturnDetails(untrusted)).toMatchObject({providerRequestId: "request-owned", bookingDetailsPath: "/customer/bookings/booking-owned"});
  });
  it("missing lookup fails before any record read", async () => {
    await expect(getCustomerPaymentReturnDetails({} as typeof lookup)).rejects.toThrow();
    expect(state.reads).not.toHaveBeenCalled();
  });
});
