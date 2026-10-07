import {expect, it} from "vitest";
import {manualRefundStatusCheckAvailable, refundCheckFeedback, refundInspectionFeedback, savedRefundPresentation} from "@/lib/admin/cancellations/admin-refund-check-presentation";
import type {AdminCancellationQueueItem, AdminCancellationReconciliationResult} from "@/lib/admin/cancellations/admin-cancellation-types";
const result: AdminCancellationReconciliationResult = {cancellationRequestId: "cancellation_123", refundOperationId: "refund_123",
  status: "completed", gatewayStatus: "succeeded", reconciliationRequired: false, idempotentReplay: true};
it("confirms the validated completed 5000-peso refund without review wording", () => {
  expect(refundCheckFeedback(result, 500000)).toEqual({status: "confirmed", title: "Refund confirmed", message: "₱5,000.00 has been refunded."});
});
it.each([
  {status: "completed", gatewayStatus: "succeeded", reconciliationRequired: true},
  {status: "completed", gatewayStatus: null, reconciliationRequired: false},
  {status: "failed", gatewayStatus: "failed", reconciliationRequired: true},
] as const)("keeps conflicting/incomplete check %j under review", patch => {
  expect(refundCheckFeedback({...result, ...patch}, 500000).status).toBe("review");
});
it("maps known pending confirmation to automatic checking", () => {
  expect(refundCheckFeedback({...result, status: "processing", gatewayStatus: "pending", reconciliationRequired: true}, 500000)).toMatchObject({
    title: "Refund pending", message: "FEASTA is checking the refund status automatically.",
  });
});

const savedItem = (patch: Partial<AdminCancellationQueueItem>): AdminCancellationQueueItem => ({
  cancellationRequestId: "cancellation_123", providerRequestId: "request_123", bookingCode: "FEA-1", providerName: "Maria",
  customerName: "Ana", customerEmail: null, providerRequestStatus: "cancelled", cancellationStatus: "refund_processing",
  policyEvidenceStatus: "policy_backed", frozenStage: "preparation_not_started", customerReason: "Changed plans", decisionReason: null,
  calculationStatus: "calculated", refundAmountInCentavos: 500000, completedRefundAmountInCentavos: null, currency: "PHP",
  paymentStatus: "paid", operationStatus: "processing", refundProgress: "processing", reconciliationRequired: false,
  refundAutomaticCheckState: "scheduled", canApprove: false, canReject: false, canProcessRefund: false, canRetryRefund: false,
  submittedAt: "2026-10-06T00:00:00.000Z", updatedAt: "2026-10-06T00:00:00.000Z", ...patch,
});

it("shows automatic checking for a pending refund and no manual action", () => {
  expect(savedRefundPresentation(savedItem({}))?.message).toBe("FEASTA is checking the refund status automatically.");
  expect(manualRefundStatusCheckAvailable(savedItem({}))).toBe(false);
});

it("shows a saved confirmation without a status-check action", () => {
  const item = savedItem({cancellationStatus: "refund_completed", operationStatus: "completed", refundProgress: "full_completed",
    completedRefundAmountInCentavos: 500000, paymentStatus: "refunded", refundAutomaticCheckState: "stopped"});
  expect(savedRefundPresentation(item)).toMatchObject({title: "Refund confirmed", message: "₱5,000.00 has been refunded."});
  expect(manualRefundStatusCheckAvailable(item)).toBe(false);
});

it("keeps a failed refund readable and a review refund retryable", () => {
  expect(savedRefundPresentation(savedItem({cancellationStatus: "refund_failed", operationStatus: "failed",
    refundProgress: "failed_retry_pending", refundAutomaticCheckState: "stopped"}))?.title).toBe("Refund failed");
  const review = savedItem({refundAutomaticCheckState: "review"});
  expect(savedRefundPresentation(review)?.message).toBe("FEASTA could not confirm the latest refund status automatically.");
  expect(manualRefundStatusCheckAvailable(review)).toBe(true);
});

it("does not present a legacy saved refund as confirmed", () => {
  const legacy = savedItem({policyEvidenceStatus: "legacy", cancellationStatus: "refund_completed", paymentStatus: "refunded",
    refundProgress: "full_completed", completedRefundAmountInCentavos: 500000});
  expect(savedRefundPresentation(legacy)?.title).toBe("Refund needs review");
  expect(manualRefundStatusCheckAvailable(legacy)).toBe(false);
});
it("does not confirm completion using only an inspection snapshot", () => {
  expect(refundInspectionFeedback({cancellationRequestId: "cancellation_123", providerRequestId: "request_123", paymentId: "payment_123",
    refundOperationId: "refund_123", cancellationStatus: "refund_completed", operationStatus: "completed", refundAmountInCentavos: 500000,
    currency: "PHP", gatewayStatus: "succeeded", failureCode: null, reconciliationRequired: false, updatedAt: "2026-10-06"}).status).toBe("review");
});
