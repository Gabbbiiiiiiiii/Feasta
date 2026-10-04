import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {updateAdminCancellationRolloutAction} from "@/app/admin/settings/actions";
import {AdminCancellationRolloutClient} from "@/components/admin/settings/admin-cancellation-rollout-client";
import type {AdminCancellationRolloutSettings} from "@/lib/admin/settings/admin-settings-types";
vi.mock("@/app/admin/settings/actions", () => ({updateAdminCancellationRolloutAction: vi.fn()}));
const initial: AdminCancellationRolloutSettings = {bookingRefundPolicyCaptureMode: "off", bookingCaptureConfigurationStatus: "missing", bookingCaptureUpdatedAt: null, bookingCaptureUpdatedBy: null, schemaVersion: 1, isPublic: false, customerCancellationMode: "off", automaticPolicyRefundApprovalMode: "off", updatedAt: null, updatedBy: null};
const booking = () => screen.getByLabelText("Booking refund-policy capture");
const customer = () => screen.getByLabelText("Customer cancellation");
const automatic = () => screen.getByLabelText("Automatic policy refund approval");
const reason = () => screen.getByLabelText("Internal administrative reason");
const save = () => screen.getByRole("button", {name: "Save booking and cancellation rollout"});
beforeEach(() => vi.clearAllMocks());
describe("Admin cancellation rollout UI", () => {
  it("renders saved Off state, allows explicit automatic selection and requires reason", () => {
    render(<AdminCancellationRolloutClient initialSettings={initial} />);
    expect(screen.getByText("Customer cancellation: Off")).toBeInTheDocument();
    expect(automatic()).toBeEnabled();
    expect(reason()).toBeRequired();
    expect(save()).toBeDisabled();
    fireEvent.change(reason(), {target: {value: "short"}});
    expect(save()).toBeDisabled();
  });
  it.each(["off", "review_only"])("retains automatic mode when customer changes to %s and discard restores saved values", (mode) => {
    render(<AdminCancellationRolloutClient initialSettings={{...initial, customerCancellationMode: "enabled", automaticPolicyRefundApprovalMode: "enabled"}} />);
    fireEvent.change(customer(), {target: {value: mode}});
    expect(automatic()).toHaveValue("enabled");
    expect(automatic()).toBeEnabled();
    fireEvent.change(reason(), {target: {value: "Explain the rollout change."}});
    fireEvent.click(screen.getByRole("button", {name: "Discard changes"}));
    expect(customer()).toHaveValue("enabled");
    expect(automatic()).toHaveValue("enabled");
    expect(reason()).toHaveValue("");
  });
  it("sends exact trusted fields, shows loading and updates saved state", async () => {
    let resolve!: (result: {settings: AdminCancellationRolloutSettings; changed: boolean}) => void;
    vi.mocked(updateAdminCancellationRolloutAction).mockImplementation(() => new Promise((done) => {resolve = done;}));
    render(<AdminCancellationRolloutClient initialSettings={initial} />);
    fireEvent.change(booking(), {target: {value: "required"}});
    fireEvent.change(customer(), {target: {value: "enabled"}});
    expect(automatic()).toBeEnabled();
    fireEvent.change(automatic(), {target: {value: "enabled"}});
    fireEvent.change(reason(), {target: {value: "  Enable reviewed rollout.  "}});
    fireEvent.click(save());
    expect(updateAdminCancellationRolloutAction).toHaveBeenCalledWith({bookingRefundPolicyCaptureMode: "required", customerCancellationMode: "enabled", automaticPolicyRefundApprovalMode: "enabled", internalReason: "Enable reviewed rollout."});
    expect(screen.getByRole("button", {name: "Saving..."})).toBeDisabled();
    expect(customer()).toBeDisabled();
    resolve({settings: {...initial, bookingRefundPolicyCaptureMode: "required", bookingCaptureConfigurationStatus: "valid", customerCancellationMode: "enabled", automaticPolicyRefundApprovalMode: "enabled"}, changed: true});
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("updated successfully"));
    expect(screen.getByText("Customer cancellation: Enabled")).toBeInTheDocument();
    expect(reason()).toHaveValue("");
    fireEvent.change(customer(), {target: {value: "off"}});
    fireEvent.click(screen.getByRole("button", {name: "Discard changes"}));
    expect(customer()).toHaveValue("enabled");
    expect(automatic()).toHaveValue("enabled");
  });
  it("allows saving displayed defaults for repair and handles true no-change", async () => {
    vi.mocked(updateAdminCancellationRolloutAction).mockResolvedValue({settings: initial, changed: false});
    render(<AdminCancellationRolloutClient initialSettings={initial} />);
    fireEvent.change(reason(), {target: {value: "Confirm safe rollout defaults."}});
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("No booking or cancellation rollout changes"));
  });
  it("displays safe errors and retains the draft for retry", async () => {
    vi.mocked(updateAdminCancellationRolloutAction).mockRejectedValue(new Error("Sensitive server details"));
    render(<AdminCancellationRolloutClient initialSettings={initial} />);
    fireEvent.change(booking(), {target: {value: "required"}});
    fireEvent.change(customer(), {target: {value: "review_only"}});
    fireEvent.change(reason(), {target: {value: "Review rollout configuration."}});
    fireEvent.click(save());
    await waitFor(() => expect(screen.getByText(/could not be updated/u)).toBeVisible());
    expect(screen.queryByText("Sensitive server details")).not.toBeInTheDocument();
    expect(customer()).toHaveValue("review_only");
    expect(screen.getByText("Customer cancellation: Off")).toBeInTheDocument();
  });
});

describe("Combined rollout repair UI", () => {
  it.each(["review_only", "enabled"] as const)("renders the saved missing capture/%s mismatch and requires repair", async (mode) => {
    render(<AdminCancellationRolloutClient initialSettings={{...initial, customerCancellationMode: mode}} />);
    expect(booking()).toHaveValue("off");
    expect(customer()).toHaveValue(mode);
    expect(screen.getByText(/New bookings are not capturing/u)).toBeVisible();
    expect(screen.getByText("Booking refund-policy capture: Off (missing)")).toBeVisible();
    fireEvent.change(reason(), {target: {value: "Repair booking evidence capture."}});
    fireEvent.click(save());
    expect(screen.getByText(/must be Required before/u)).toBeVisible();
    expect(updateAdminCancellationRolloutAction).not.toHaveBeenCalled();
    vi.mocked(updateAdminCancellationRolloutAction).mockResolvedValue({settings: {...initial, bookingRefundPolicyCaptureMode: "required", bookingCaptureConfigurationStatus: "valid", customerCancellationMode: mode}, changed: true});
    fireEvent.change(booking(), {target: {value: "required"}});
    fireEvent.click(save());
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("updated successfully"));
    expect(screen.queryByText(/New bookings are not capturing/u)).not.toBeInTheDocument();
  });
  it("rejects automatic approval with review-only without coercing either selection", () => {
    render(<AdminCancellationRolloutClient initialSettings={{...initial, bookingRefundPolicyCaptureMode: "required", customerCancellationMode: "enabled", automaticPolicyRefundApprovalMode: "enabled"}} />);
    fireEvent.change(customer(), {target: {value: "review_only"}});
    fireEvent.change(reason(), {target: {value: "Review the rollout selection."}});
    fireEvent.click(save());
    expect(screen.getByText(/requires customer cancellation to be fully enabled/u)).toBeVisible();
    expect(customer()).toHaveValue("review_only");
    expect(automatic()).toHaveValue("enabled");
    expect(updateAdminCancellationRolloutAction).not.toHaveBeenCalled();
  });
});
