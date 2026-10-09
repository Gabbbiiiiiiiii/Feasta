import {beforeEach, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({call: vi.fn()}));
vi.mock("firebase/functions", () => ({httpsCallable: () => mocks.call}));
vi.mock("@/lib/firebase/client", () => ({
  auth: {authStateReady: async () => undefined, currentUser: {uid: "customer"}},
  functions: {}, initializeBrowserAppCheck: vi.fn(),
}));

import {
  getCustomerProviderRequestCancellationOptions,
  submitCustomerProviderRequestCancellation,
} from "@/lib/customer/bookings/customer-cancellation-client";

const requestId = "request-0001";
const preview = {
  calculationStatus: "calculated", frozenStage: "preparation_started",
  refundAmountInCentavos: 25_000, paidAmountInCentavos: 50_000,
  nonRefundableAmountInCentavos: 25_000, currency: "PHP",
};
function options(refundPreview: unknown = preview) {
  return {providerRequestId: requestId, providerRequestStatus: "confirmed",
    cancellationAllowed: true, reasonCode: "ALLOWED", activeCancellation: null,
    policy: {policyKey: "provider_default:provider-0001:v1", sourceKind: "provider_default",
      policyVersion: 1, terms: null, rules: [
        {stage: "preparation_not_started", refundBasisPoints: 10_000},
        {stage: "preparation_started", refundBasisPoints: 5_000},
        {stage: "service_started", refundBasisPoints: 0},
      ]}, refundPreview};
}
beforeEach(() => vi.clearAllMocks());

it("parses only the trusted breakdown and current request status", async () => {
  mocks.call.mockResolvedValue({data: options()});
  const result = await getCustomerProviderRequestCancellationOptions(requestId);
  expect(result.refundPreview).toEqual(preview);
  expect(result.providerRequestStatus).toBe("confirmed");
  expect(mocks.call).toHaveBeenCalledWith({providerRequestId: requestId});
});

it.each([
  {...preview, paidAmountInCentavos: undefined},
  {...preview, nonRefundableAmountInCentavos: -1},
  {...preview, paidAmountInCentavos: 1},
  {...preview, refundAmountInCentavos: 0.5},
])("rejects malformed financial preview %#", async (invalid) => {
  mocks.call.mockResolvedValue({data: options(invalid)});
  await expect(getCustomerProviderRequestCancellationOptions(requestId)).rejects.toThrow();
});

it("does not fabricate a breakdown when older Functions omit it", async () => {
  const older = {calculationStatus: preview.calculationStatus, frozenStage: preview.frozenStage,
    refundAmountInCentavos: preview.refundAmountInCentavos, currency: preview.currency};
  mocks.call.mockResolvedValue({data: options(older)});
  expect((await getCustomerProviderRequestCancellationOptions(requestId)).refundPreview?.paidAmountInCentavos)
    .toBeUndefined();
});

it("rejects missing acknowledgement before calling Firebase", async () => {
  await expect(submitCustomerProviderRequestCancellation({providerRequestId: requestId,
    reason: "Our schedule changed", idempotencyKey: "attempt-0001", acknowledged: false})).rejects.toThrow(/Acknowledge/u);
  expect(mocks.call).not.toHaveBeenCalled();
});
