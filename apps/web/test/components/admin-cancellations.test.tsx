import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  AdminCancellationQueue,
  AdminCancellationQueueItem,
} from "@/lib/admin/cancellations/admin-cancellation-types";

const mocks = vi.hoisted(() => ({
  loadQueue: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  execute: vi.fn(),
  inspect: vi.fn(),
  createKey: vi.fn((action: string, id: string) => `key:${action}:${id}`),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/app/admin/bookings/actions", () => ({
  loadAdminCancellationQueueAction: mocks.loadQueue,
}));

vi.mock("@/lib/admin/cancellations/admin-cancellation-client", () => ({
  approveCancellation: mocks.approve,
  rejectCancellation: mocks.reject,
  executeCancellationRefund: mocks.execute,
  inspectCancellationRefund: mocks.inspect,
  createCancellationActionKey: mocks.createKey,
}));

vi.mock("@/components/feedback/toast", () => ({
  feastaToast: {success: mocks.success, error: mocks.error},
}));

import {CancellationManagementClient} from "@/components/admin/bookings/cancellation-management-client";

function item(overrides: Partial<AdminCancellationQueueItem> = {}): AdminCancellationQueueItem {
  return {
    cancellationRequestId: "cancellation_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    providerRequestId: "provider_request_a",
    bookingCode: "FEA-2026-001",
    providerName: "Maria's Catering",
    customerName: "Ana Reyes",
    customerEmail: "ana@example.com",
    providerRequestStatus: "confirmed",
    cancellationStatus: "submitted",
    policyEvidenceStatus: "policy_backed",
    frozenStage: "preparation_started",
    customerReason: "The guest count changed substantially.",
    decisionReason: null,
    calculationStatus: "pending_backend_calculation",
    refundAmountInCentavos: null,
    completedRefundAmountInCentavos: null,
    currency: null,
    paymentStatus: "paid",
    operationStatus: null,
    refundProgress: "none",
    reconciliationRequired: false,
    canApprove: true,
    canReject: true,
    canProcessRefund: false,
    canRetryRefund: false,
    submittedAt: "2026-09-01T01:00:00.000Z",
    updatedAt: "2026-09-01T01:00:00.000Z",
    ...overrides,
  };
}

function queue(items: AdminCancellationQueueItem[]): AdminCancellationQueue {
  return {items, skippedMalformedCount: 0};
}

function renderQueue(items: AdminCancellationQueueItem[]) {
  return render(<CancellationManagementClient initialQueue={queue(items)} />);
}

async function openReview(user: ReturnType<typeof userEvent.setup>, providerName = "Maria's Catering") {
  await user.click(screen.getAllByRole("button", {name: `Review cancellation for ${providerName}`})[0]);
  return screen.getByRole("dialog", {name: "Cancellation review"});
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadQueue.mockResolvedValue(queue([item()]));
  mocks.approve.mockResolvedValue({
    cancellationRequestId: item().cancellationRequestId,
    providerRequestId: item().providerRequestId,
    mainEventId: "event_a",
    cancellationStatus: "approved",
    providerRequestStatus: "cancelled",
    mainEventStatus: "confirmed",
    refundOperationId: "refund_operation_a",
    refundAmountInCentavos: 250000,
    currency: "PHP",
    idempotentReplay: false,
  });
  mocks.reject.mockResolvedValue({
    cancellationRequestId: item().cancellationRequestId,
    providerRequestId: item().providerRequestId,
    mainEventId: "event_a",
    cancellationStatus: "rejected",
    idempotentReplay: false,
  });
  mocks.execute.mockResolvedValue({
    cancellationRequestId: item().cancellationRequestId,
    providerRequestId: item().providerRequestId,
    paymentId: "payment_a",
    refundOperationId: "refund_operation_a",
    status: "processing",
    gatewayStatus: "processing",
    idempotentReplay: false,
  });
  mocks.inspect.mockResolvedValue({
    cancellationRequestId: item().cancellationRequestId,
    providerRequestId: item().providerRequestId,
    paymentId: "payment_a",
    refundOperationId: "refund_operation_a",
    cancellationStatus: "refund_failed",
    operationStatus: "failed",
    refundAmountInCentavos: 250000,
    currency: "PHP",
    gatewayStatus: "failed",
    failureCode: "GATEWAY_REFUND_FAILED",
    reconciliationRequired: false,
    updatedAt: "2026-09-01T02:00:00.000Z",
  });
});

describe("Admin Provider-service cancellation operations", () => {
  it("loads policy-backed and legacy cases without fabricating legacy financials", async () => {
    const legacy = item({
      cancellationRequestId: "cancellation_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      providerRequestId: "provider_request_b",
      providerName: "Photo Studio",
      policyEvidenceStatus: "legacy",
      frozenStage: null,
      cancellationStatus: "under_review",
      calculationStatus: "manual_review_required",
      refundProgress: "manual_review",
      canApprove: false,
    });
    const user = userEvent.setup();
    renderQueue([item(), legacy]);

    expect(screen.getAllByText("Policy-backed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manual review required").length).toBeGreaterThan(0);
    await openReview(user, "Photo Studio");
    expect(screen.getByText("No policy, percentage, or estimated refund has been fabricated. Automatic approval remains unavailable.")).toBeVisible();
    expect(screen.queryByRole("button", {name: "Approve cancellation"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Reject cancellation"})).toBeVisible();
  });

  it.each([
    ["cancelled_no_refund", 0, "Cancellation approved. The trusted calculation found no refundable amount."],
    ["approved", 250000, "Cancellation approved. The refund is ready for processing."],
  ] as const)("approves a policy-backed %s result using no editable financial input", async (status, amount, message) => {
    mocks.approve.mockResolvedValueOnce({
      cancellationRequestId: item().cancellationRequestId,
      providerRequestId: item().providerRequestId,
      mainEventId: "event_a",
      cancellationStatus: status,
      providerRequestStatus: "cancelled",
      mainEventStatus: "confirmed",
      refundOperationId: amount > 0 ? "refund_operation_a" : null,
      refundAmountInCentavos: amount,
      currency: "PHP",
      idempotentReplay: false,
    });
    const user = userEvent.setup();
    renderQueue([item()]);
    await openReview(user);
    await user.click(screen.getByRole("button", {name: "Approve cancellation"}));
    const confirmation = screen.getAllByRole("dialog").at(-1)!;
    expect(within(confirmation).queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(within(confirmation).getByRole("button", {name: "Approve cancellation"}));

    await waitFor(() => {
      expect(mocks.approve).toHaveBeenCalledWith(item().cancellationRequestId, `key:approve:${item().cancellationRequestId}`);
      expect(mocks.success).toHaveBeenCalledWith(message);
    });
  });

  it("requires a bounded reason and rejects only the selected cancellation", async () => {
    const providerB = item({
      cancellationRequestId: "cancellation_cccccccccccccccccccccccccccccccccccccccc",
      providerRequestId: "provider_request_c",
      providerName: "Provider B",
    });
    const user = userEvent.setup();
    renderQueue([item(), providerB]);
    await openReview(user, "Provider B");
    await user.click(screen.getByRole("button", {name: "Reject cancellation"}));
    const confirmation = screen.getAllByRole("dialog").at(-1)!;
    const confirm = within(confirmation).getByRole("button", {name: "Reject cancellation"});
    expect(confirm).toBeDisabled();
    await user.type(within(confirmation).getByRole("textbox"), "Evidence does not support this request.");
    await user.click(confirm);

    await waitFor(() => {
      expect(mocks.reject).toHaveBeenCalledWith(
        providerB.cancellationRequestId,
        "Evidence does not support this request.",
        `key:reject:${providerB.cancellationRequestId}`,
      );
    });
    expect(mocks.reject).not.toHaveBeenCalledWith(item().cancellationRequestId, expect.anything(), expect.anything());
  });

  it.each([
    ["Process refund", "process", item({cancellationStatus: "approved", operationStatus: "reserved", refundProgress: "approved", canApprove: false, canReject: false, canProcessRefund: true})],
    ["Retry refund", "retry", item({cancellationStatus: "refund_failed", operationStatus: "failed", refundProgress: "failed_retry_pending", canApprove: false, canReject: false, canRetryRefund: true})],
  ] as const)("supports %s only through executeProviderRequestRefund", async (label, action, record) => {
    const user = userEvent.setup();
    renderQueue([record]);
    await openReview(user);
    await user.click(screen.getByRole("button", {name: label}));
    const confirmation = screen.getAllByRole("dialog").at(-1)!;
    expect(confirmation).toHaveTextContent("The browser sends no amount, currency, or gateway identifier.");
    await user.click(within(confirmation).getByRole("button", {name: label}));
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledWith(
      record.cancellationRequestId,
      `key:${action}:${record.cancellationRequestId}`,
    ));
  });

  it("withholds retry and presents reconciliation-required wording", async () => {
    const record = item({
      cancellationStatus: "refund_failed",
      operationStatus: "failed",
      refundProgress: "failed_reconciliation_required",
      reconciliationRequired: true,
      canApprove: false,
      canReject: false,
      canRetryRefund: false,
      refundAmountInCentavos: 250000,
      calculationStatus: "calculated",
    });
    const user = userEvent.setup();
    renderQueue([record]);
    await openReview(user);
    expect(screen.getAllByText("Refund requires reconciliation review").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", {name: "Retry refund"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Inspect reconciliation status"}));
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledWith(record.cancellationRequestId));
    expect((await within(screen.getByRole("dialog", {name: "Cancellation review"})).findAllByText("Failed")).length).toBeGreaterThan(0);
  });

  it("presents completed refunds as read-only and prevents duplicate execution", async () => {
    const completed = item({
      cancellationStatus: "refund_completed",
      operationStatus: "completed",
      refundProgress: "full_completed",
      calculationStatus: "calculated",
      refundAmountInCentavos: 500000,
      completedRefundAmountInCentavos: 500000,
      currency: "PHP",
      canApprove: false,
      canReject: false,
    });
    const user = userEvent.setup();
    renderQueue([completed]);
    await openReview(user);
    expect(screen.getAllByText("Full refund completed").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", {name: /Process refund|Retry refund/u})).not.toBeInTheDocument();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("presents refund processing as in-flight with no duplicate execution control", async () => {
    const processing = item({
      cancellationStatus: "refund_processing",
      operationStatus: "processing",
      refundProgress: "processing",
      calculationStatus: "calculated",
      refundAmountInCentavos: 250000,
      currency: "PHP",
      canApprove: false,
      canReject: false,
    });
    const user = userEvent.setup();
    renderQueue([processing]);
    await openReview(user);
    expect(screen.getAllByText("Refund processing").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", {name: /Process refund|Retry refund/u})).not.toBeInTheDocument();
  });

  it("prevents duplicate decision submission while the first action is pending", async () => {
    let resolveApproval: ((value: unknown) => void) | undefined;
    mocks.approve.mockImplementationOnce(() => new Promise((resolve) => {
      resolveApproval = resolve;
    }));
    const user = userEvent.setup();
    renderQueue([item()]);
    await openReview(user);
    await user.click(screen.getByRole("button", {name: "Approve cancellation"}));
    const confirmation = screen.getAllByRole("dialog").at(-1)!;
    const confirm = within(confirmation).getByRole("button", {name: "Approve cancellation"});
    await user.dblClick(confirm);
    expect(mocks.approve).toHaveBeenCalledTimes(1);

    resolveApproval?.({
      cancellationRequestId: item().cancellationRequestId,
      cancellationStatus: "approved",
      refundAmountInCentavos: 250000,
    });
    await waitFor(() => expect(mocks.loadQueue).toHaveBeenCalled());
  });

  it("maps permission failures to safe visible feedback and retains the action for recovery", async () => {
    mocks.approve.mockRejectedValueOnce(new Error("Only an authorized FEASTA Admin can perform this action."));
    const user = userEvent.setup();
    renderQueue([item()]);
    await openReview(user);
    await user.click(screen.getByRole("button", {name: "Approve cancellation"}));
    const confirmation = screen.getAllByRole("dialog").at(-1)!;
    await user.click(within(confirmation).getByRole("button", {name: "Approve cancellation"}));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Only an authorized FEASTA Admin can perform this action."));
    expect(mocks.approve).toHaveBeenCalledTimes(1);
  });
});
