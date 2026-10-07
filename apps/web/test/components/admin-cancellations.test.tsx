import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

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
  reconcile: vi.fn(),
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
  reconcileCancellationRefund: mocks.reconcile,
  createCancellationActionKey: mocks.createKey,
}));

vi.mock("@/components/feedback/toast", () => ({
  feastaToast: {success: mocks.success, error: mocks.error},
}));

import {CancellationManagementClient} from "@/components/admin/bookings/cancellation-management-client";
afterEach(() => vi.useRealTimers());

it("separates cancellation from refund completion and removes the manual refresh control", () => {
  renderQueue([item({cancellationStatus: "refund_completed", refundProgress: "full_completed", refundAmountInCentavos: 500000,
    canApprove: false, canReject: false})]);
  expect(screen.queryByRole("button", {name: "Refresh queue"})).not.toBeInTheDocument();
  const table = screen.getByRole("table", {name: "Provider-service cancellation queue"});
  const row = within(table).getAllByRole("row")[1];
  const cells = within(row).getAllByRole("cell");
  expect(cells[4]).toHaveTextContent("Cancelled");
  expect(cells[4]).not.toHaveTextContent(/refund/i);
  expect(cells[5]).toHaveTextContent("Refund confirmed");
  expect(cells[5]).toHaveTextContent("5,000.00");
});

it("polls silently while preserving the rejection form and its drawer", async () => {
  vi.useFakeTimers();
  renderQueue([item()]);
  fireEvent.click(screen.getByRole("button", {name: "Review cancellation for Maria's Catering"}));
  fireEvent.click(screen.getByRole("button", {name: "Reject cancellation"}));
  fireEvent.change(screen.getByLabelText(/Rejection reason/), {target: {value: "Review evidence retained."}});
  await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
  expect(mocks.loadQueue).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText(/Rejection reason/)).toHaveValue("Review evidence retained.");
  mocks.loadQueue.mockRejectedValueOnce(new Error("offline"));
  await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.success).not.toHaveBeenCalled();
});

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
    refundAutomaticCheckState: null,
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
  return screen.getByRole("dialog", {name: "Cancellation details"});
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

    expect(screen.getAllByText("Policy recorded").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manual review required").length).toBeGreaterThan(0);
    await openReview(user, "Photo Studio");
    expect(screen.getByText("The refund policy is unavailable for this request. Automatic approval is unavailable; review the booking before deciding.")).toBeVisible();
    expect(screen.queryByRole("button", {name: "Approve cancellation"})).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Reject cancellation"})).toBeVisible();
  });

  it.each([
    ["cancelled_no_refund", 0, "Cancellation approved. No refund is due."],
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
    if (action === "process") expect(screen.queryByRole("button", {name: "Check refund status"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: label}));
    const confirmation = screen.getAllByRole("dialog").at(-1)!;
    expect(confirmation).toHaveTextContent("The saved refund amount will be used.");
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
    expect(screen.getAllByText("Refund needs review").length).toBeGreaterThan(0);
    expect(screen.getByText("FEASTA could not confirm the latest refund status automatically.")).toBeVisible();
    expect(screen.queryByRole("button", {name: "Retry refund"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Check refund status"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Try status check again"}));
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledWith(record.cancellationRequestId));
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
    expect(screen.getAllByText("Refund confirmed").length).toBeGreaterThan(0);
    expect(screen.getByText("₱5,000.00 has been refunded.")).toBeVisible();
    expect(screen.queryByRole("button", {name: /Process refund|Retry refund|Check refund status|Try status check again/u})).not.toBeInTheDocument();
    expect(mocks.reconcile).not.toHaveBeenCalled();
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
    expect(screen.getAllByText("Refund pending").length).toBeGreaterThan(0);
    expect(screen.getByText("FEASTA is checking the refund status automatically.")).toBeVisible();
    expect(screen.queryByRole("button", {name: /Process refund|Retry refund|Check refund status|Try status check again/u})).not.toBeInTheDocument();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("keeps a pending refund automatic and lets the saved refresh replace it", async () => {
    vi.useFakeTimers();
    const processing = item({cancellationStatus: "refund_processing", operationStatus: "processing",
      refundProgress: "processing", refundAmountInCentavos: 500000, currency: "PHP", canApprove: false, canReject: false});
    const confirmed = item({...processing, cancellationStatus: "refund_completed", operationStatus: "completed",
      refundProgress: "full_completed", completedRefundAmountInCentavos: 500000, paymentStatus: "refunded"});
    mocks.loadQueue.mockResolvedValue(queue([confirmed]));
    renderQueue([processing]);
    fireEvent.click(screen.getByRole("button", {name: "Review cancellation for Maria's Catering"}));
    const drawer = screen.getByRole("dialog", {name: "Cancellation details"});
    expect(within(drawer).getByText("Refund pending")).toBeVisible();
    expect(within(drawer).getByText("FEASTA is checking the refund status automatically.")).toBeVisible();
    expect(within(drawer).queryByRole("button", {name: /Check refund status|Try status check again/u})).not.toBeInTheDocument();
    await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
    expect(within(drawer).getByText("Refund confirmed")).toBeVisible();
    expect(within(drawer).getByText("₱5,000.00 has been refunded.")).toBeVisible();
    expect(screen.getByRole("dialog", {name: "Cancellation details"})).toBe(drawer);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("reports an unavailable manual retry without creating or processing a refund", async () => {
    mocks.reconcile.mockRejectedValueOnce(new Error("unavailable"));
    const user = userEvent.setup();
    renderQueue([item({cancellationStatus: "refund_processing", refundProgress: "processing",
      refundAutomaticCheckState: "review", canApprove: false, canReject: false})]);
    const drawer = await openReview(user);
    await user.click(within(drawer).getByRole("button", {name: "Try status check again"}));
    expect(await within(drawer).findByText("Refund status could not be checked. Try again.")).toBeVisible();
    expect(mocks.loadQueue).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.reconcile).toHaveBeenCalledOnce();
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

it("keeps internal IDs only in Support references and presents plain cancellation details", () => {
  const record = item({cancellationStatus: "refund_completed", operationStatus: "completed", frozenStage: "preparation_not_started",
    refundProgress: "full_completed", refundAmountInCentavos: 500000, completedRefundAmountInCentavos: 500000,
    paymentStatus: "refunded", canApprove: false, canReject: false});
  renderQueue([record]);
  const table = screen.getByRole("table", {name: "Provider-service cancellation queue"});
  expect(within(table).getByText(record.bookingCode)).toBeVisible();
  expect(within(table).queryByText(record.providerRequestId)).not.toBeInTheDocument();
  expect(within(table).queryByText(record.cancellationRequestId)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Review cancellation for Maria's Catering"}));
  const drawer = screen.getByRole("dialog", {name: "Cancellation details"});
  for (const label of ["Refund summary", "Refund amount", "Refund status", "Payment status", "Reason for cancellation", "Preparation had not started", "Policy recorded", "Refunded", "Refund confirmed", "₱5,000.00 has been refunded.", "Support references"]) {
    expect(within(drawer).getByText(label)).toBeVisible();
  }
  for (const label of ["System refund result", "Calculation", "Calculated", "Refund progress", "Refund status check"]) {
    expect(within(drawer).queryByText(label)).not.toBeInTheDocument();
  }
  expect(within(drawer).getByText(record.providerRequestId).closest("details")).not.toHaveAttribute("open");
});

it("shows a saved confirmed refund without asking Admin to check it", () => {
  const completed = item({cancellationStatus: "refund_completed", operationStatus: "completed", refundProgress: "full_completed",
    refundAmountInCentavos: 500000, completedRefundAmountInCentavos: 500000, paymentStatus: "refunded", canApprove: false, canReject: false});
  render(<CancellationManagementClient initialQueue={queue([completed])} />);
  fireEvent.click(screen.getByRole("button", {name: "Review cancellation for Maria's Catering"}));
  const drawer = screen.getByRole("dialog", {name: "Cancellation details"});
  expect(within(drawer).getByText("Refund confirmed")).toBeVisible();
  expect(within(drawer).getByText("₱5,000.00 has been refunded.")).toBeVisible();
  expect(within(drawer).queryByRole("button", {name: /Check refund status|Try status check again/u})).not.toBeInTheDocument();
  expect(mocks.reconcile).not.toHaveBeenCalled();
  expect(mocks.inspect).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("keeps the open drawer while background refresh reads saved FEASTA state", async () => {
  vi.useFakeTimers();
  const record = item({cancellationStatus: "refund_processing", operationStatus: "processing", refundProgress: "processing",
    refundAmountInCentavos: 500000, canApprove: false, canReject: false});
  mocks.loadQueue.mockResolvedValue(queue([record]));
  renderQueue([record]);
  fireEvent.click(screen.getByRole("button", {name: "Review cancellation for Maria's Catering"}));
  const drawer = screen.getByRole("dialog", {name: "Cancellation details"});
  expect(screen.getByRole("table", {hidden: true})).toHaveTextContent(record.bookingCode);
  await act(async () => {await vi.advanceTimersByTimeAsync(5_000);});
  expect(mocks.loadQueue).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("dialog", {name: "Cancellation details"})).toBe(drawer);
  expect(within(drawer).getByText("Refund pending")).toBeVisible();
  expect(mocks.reconcile).not.toHaveBeenCalled();
});
