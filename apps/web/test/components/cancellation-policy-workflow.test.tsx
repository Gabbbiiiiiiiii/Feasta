import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const adminMocks = vi.hoisted(() => ({
  updateAdminDefault: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
  saveProviderCancellation: vi.fn(),
  publishRefund: vi.fn(),
  setOverride: vi.fn(),
  refresh: vi.fn(),
}));

const customerMocks = vi.hoisted(() => ({
  getOptions: vi.fn(),
  getStatus: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({refresh: providerMocks.refresh}),
}));

vi.mock("@/lib/admin/file-maintenance/admin-cancellation-policy-client", () => ({
  updateAdminDefaultCancellationPolicy: (...args: unknown[]) =>
    adminMocks.updateAdminDefault(...args),
}));

vi.mock("@/lib/provider/refund-policy/provider-refund-policy-client", () => ({
  saveProviderCancellationPolicy: (...args: unknown[]) =>
    providerMocks.saveProviderCancellation(...args),
  publishProviderRefundPolicy: (...args: unknown[]) =>
    providerMocks.publishRefund(...args),
  setPackageRefundPolicyOverride: (...args: unknown[]) =>
    providerMocks.setOverride(...args),
}));

vi.mock("@/lib/customer/bookings/customer-cancellation-client", () => ({
  createCustomerCancellationIdempotencyKey: () => "customer-cancellation:test-key",
  getCustomerProviderRequestCancellationOptions: (...args: unknown[]) =>
    customerMocks.getOptions(...args),
  getCustomerProviderRequestCancellationStatus: (...args: unknown[]) =>
    customerMocks.getStatus(...args),
  submitCustomerProviderRequestCancellation: (...args: unknown[]) =>
    customerMocks.submit(...args),
}));

import {FileMaintenanceClient} from "@/components/admin/file-maintenance/file-maintenance-client";
import {ProviderRefundPolicyClient} from "@/app/provider/refund-policy/provider-refund-policy-client";
import {PreBookingCancellationCutoffNotice} from "@/components/customer/bookings/cancellation-cutoff-notice";
import {CustomerBookingCancellationDialog} from "@/components/customer/bookings/customer-booking-cancellation-dialog";
import type {CustomerBookingProviderRequest} from "@/lib/customer/bookings/customer-booking-types";

const sampleCustomerRequest: CustomerBookingProviderRequest = {
  id: "req_cutoff_1234",
  providerRequestId: "req_cutoff_1234",
  mainEventId: "evt_cutoff_1",
  providerId: "prov_1",
  providerName: "Emerald Catering",
  type: "catering",
  status: "confirmed",
  paymentStatus: "paid",
  paymentId: "pay_1",
  settlementStatus: "fully_settled",
  grossSettledAmountInCentavos: 2_000_000,
  outstandingAmountInCentavos: 0,
  remainingBalanceStatus: "not_applicable",
  remainingBalanceDueAt: null,
  remainingBalanceGraceEndsAt: null,
  checkoutOptions: [],
  packageId: "pkg_1",
  packageName: "Fiesta Package",
  services: [],
  amount: 20_000,
  downPaymentAmount: 10_000,
  remainingBalance: 10_000,
  downPaymentPercentage: 50,
  rejectionReason: null,
  cancellationReason: null,
  requestedAt: "2026-11-20T08:00:00.000Z",
  respondedAt: "2026-11-20T09:00:00.000Z",
  acceptedAt: "2026-11-20T09:00:00.000Z",
  rejectedAt: null,
  replacementStatus: null,
  confirmedAt: "2026-11-21T09:00:00.000Z",
  paidAt: "2026-11-21T09:00:00.000Z",
  refundedAt: null,
  completedAt: null,
  cancelledAt: null,
  expiresAt: null,
  reviewStatus: "unavailable",
};

describe("Admin & Provider cancellation cutoff policy workflow", () => {
  beforeEach(() => {
    adminMocks.updateAdminDefault.mockReset().mockResolvedValue({
      success: true,
      policyVersion: 2,
      defaultCutoffHoursBeforeEvent: 36,
      minCutoffHoursBeforeEvent: 12,
      maxCutoffHoursBeforeEvent: 168,
      guidanceNote: "Cancel 36 hours ahead.",
    });
    providerMocks.saveProviderCancellation.mockReset().mockResolvedValue({
      success: true,
      providerId: "prov_1",
      mode: "admin_default",
      cutoffHoursBeforeEvent: null,
      effectiveCutoffHoursBeforeEvent: 72,
      policyVersion: 1,
    });
    providerMocks.refresh.mockReset();
    customerMocks.getOptions.mockReset();
    customerMocks.getStatus.mockReset().mockResolvedValue({
      providerRequestId: "req_cutoff_1234",
      cancellation: null,
    });
    customerMocks.submit.mockReset();
  });

  it("lets Admin manage the default cancellation policy with Days + Hours inside File Maintenance", async () => {
    const user = userEvent.setup();
    render(
      <FileMaintenanceClient
        initialCategories={[]}
        initialAgreements={[]}
        initialBusinessDocuments={[]}
        initialCancellationPolicy={{
          policyVersion: 1,
          defaultCutoffHoursBeforeEvent: 72,
          minCutoffHoursBeforeEvent: 24,
          maxCutoffHoursBeforeEvent: 720,
          guidanceNote: null,
          updatedAt: null,
          isSeededFallback: true,
        }}
      />,
    );

    await user.click(screen.getByRole("tab", {name: "Cancellation Policy"}));
    expect(screen.getByRole("heading", {name: "Default Cancellation Policy"})).toBeVisible();

    const defaultGroup = screen.getByRole("group", {name: "Suggested Default Cutoff"});
    const minGroup = screen.getByRole("group", {name: "Minimum Allowed Cutoff"});
    const maxGroup = screen.getByRole("group", {name: "Maximum Allowed Cutoff"});

    fireEvent.change(within(minGroup).getByLabelText(/Days/), {target: {value: "0"}});
    fireEvent.change(within(minGroup).getByLabelText(/Hours/), {target: {value: "12"}});
    fireEvent.change(within(defaultGroup).getByLabelText(/Days/), {target: {value: "1"}});
    fireEvent.change(within(defaultGroup).getByLabelText(/Hours/), {target: {value: "12"}});
    fireEvent.change(within(maxGroup).getByLabelText(/Days/), {target: {value: "7"}});
    fireEvent.change(within(maxGroup).getByLabelText(/Hours/), {target: {value: "0"}});
    fireEvent.change(screen.getByLabelText(/Default guidance note/), {
      target: {value: "Cancel 36 hours ahead."},
    });

    await user.click(screen.getByRole("button", {name: "Save Default Cancellation Policy"}));
    const dialog = screen.getByRole("dialog", {name: "Save default cancellation policy?"});
    await user.click(within(dialog).getByRole("button", {name: "Save Policy"}));

    await waitFor(() =>
      expect(adminMocks.updateAdminDefault).toHaveBeenCalledWith({
        defaultCutoffHoursBeforeEvent: 36,
        minCutoffHoursBeforeEvent: 12,
        maxCutoffHoursBeforeEvent: 168,
        guidanceNote: "Cancel 36 hours ahead.",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Version 2");
  });

  it("lets Provider either apply Admin default or set up a custom bounded cutoff", async () => {
    const user = userEvent.setup();
    render(
      <ProviderRefundPolicyClient
        data={{
          providerPolicy: null,
          packages: [],
          adminDefaultCancellationPolicy: {
            policyVersion: 2,
            defaultCutoffHoursBeforeEvent: 72,
            minCutoffHoursBeforeEvent: 24,
            maxCutoffHoursBeforeEvent: 168,
            guidanceNote: "Platform standard notice.",
            updatedAt: "2026-11-20T00:00:00.000Z",
            isSeededFallback: false,
          },
          providerCancellationPolicy: null,
        }}
      />,
    );

    expect(screen.getByRole("heading", {name: "Cancellation Cutoff Policy"})).toBeVisible();
    expect(screen.getByText("3 days before event")).toBeVisible();

    // First test invalid custom value below min (12 hours < 24 hours min)
    fireEvent.change(screen.getByLabelText(/Days/), {target: {value: "0"}});
    fireEvent.change(screen.getByLabelText(/Hours/), {target: {value: "12"}});
    await user.click(screen.getByRole("button", {name: "Save Custom Cutoff"}));
    expect(screen.getByRole("alert")).toHaveTextContent(/between 1 day and 7 days/iu);
    expect(providerMocks.saveProviderCancellation).not.toHaveBeenCalled();

    // Now apply Admin default with 1 click + confirmation
    await user.click(screen.getByRole("button", {name: "Apply Admin Default"}));
    const confirmDialog = screen.getByRole("dialog", {name: "Apply Admin default cancellation cutoff?"});
    await user.click(within(confirmDialog).getByRole("button", {name: "Apply Default"}));

    await waitFor(() =>
      expect(providerMocks.saveProviderCancellation).toHaveBeenCalledWith({
        mode: "admin_default",
      }),
    );
    expect(providerMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("displays computed cutoff date and short-notice warning before booking", () => {
    const {rerender} = render(
      <PreBookingCancellationCutoffNotice
        cutoff={{
          sourceKind: "provider_custom",
          cutoffHoursBeforeEvent: 72,
          guidanceNote: "Custom caterer cutoff.",
        }}
        eventDate="2027-12-10"
        eventTime="14:00"
      />,
    );
    expect(screen.getByText(/Cancellation cutoff:/u)).toBeVisible();
    expect(screen.getByText(/3 days before event start/u)).toBeVisible();

    // Event already inside cutoff window (short-notice booking)
    rerender(
      <PreBookingCancellationCutoffNotice
        cutoff={{
          sourceKind: "admin_default",
          cutoffHoursBeforeEvent: 72,
          guidanceNote: null,
        }}
        eventDate="2020-01-01"
        eventTime="14:00"
      />,
    );
    expect(screen.getByText(/Past cancellation cutoff — non-cancellable once confirmed/u)).toBeVisible();
  });

  it("blocks customer cancellation cleanly when CANCELLATION_CUTOFF_PASSED is returned", async () => {
    customerMocks.getOptions.mockResolvedValue({
      providerRequestId: "req_cutoff_1234",
      providerRequestStatus: "confirmed",
      cancellationAllowed: false,
      reasonCode: "CANCELLATION_CUTOFF_PASSED",
      cancellationCutoffAt: "2026-12-07T06:00:00.000Z",
      cancellationCutoffHours: 72,
      eligibilityExpiresInMs: 0,
      activeCancellation: null,
      policy: null,
      refundPreview: null,
    });

    render(
      <CustomerBookingCancellationDialog
        request={sampleCustomerRequest}
        onClose={() => {}}
      />,
    );

    expect(await screen.findByText("Cancellation closed — cutoff passed")).toBeVisible();
    expect(screen.getByText(/Report an Issue remains available/u)).toBeVisible();
    expect(screen.getByRole("button", {name: "Submit cancellation request"})).toBeDisabled();
  });
});
