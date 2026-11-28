import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {ProviderMockWithdrawDialog} from "@/app/provider/payments/provider-mock-withdraw-dialog";
import {requestMockProviderWithdrawal} from "@/lib/provider/payments/provider-payout-client";

vi.mock("@/lib/provider/payments/provider-payout-client", () => ({
  requestMockProviderWithdrawal: vi.fn(),
}));

describe("provider mock withdraw dialog", () => {
  beforeEach(() => {
    vi.mocked(requestMockProviderWithdrawal).mockReset();
  });

  it("supports custom amount and records a successful mock withdrawal", async () => {
    const user = userEvent.setup();
    const onCompleted = vi.fn().mockResolvedValue(undefined);

    vi.mocked(requestMockProviderWithdrawal).mockResolvedValue({
      withdrawalId: "mock_wd_test",
      amountInCentavos: 50000,
      currency: "PHP",
      status: "succeeded",
      mode: "mock",
      destination: {
        type: "gcash",
        accountName: "Ana Reyes",
        mobileMasked: "••••4567",
        bankName: null,
        accountNumberMasked: null,
      },
      allocationCount: 1,
      completedAt: "2026-11-19T10:00:00.000Z",
    });

    render(
      <ProviderMockWithdrawDialog
        open
        availableAmountInCentavos={2160000}
        onOpenChange={vi.fn()}
        onCompleted={onCompleted}
      />,
    );

    expect(screen.getByRole("heading", {name: "Withdraw earnings"})).toBeVisible();
    expect(screen.getByText(/Mock payout mode/u)).toBeVisible();

    await user.click(screen.getByLabelText("Custom amount"));
    await user.clear(screen.getByLabelText("Custom withdrawal amount in pesos"));
    await user.type(
      screen.getByLabelText("Custom withdrawal amount in pesos"),
      "500",
    );
    await user.click(screen.getByRole("button", {name: "Continue"}));

    await user.type(screen.getByLabelText("Account name"), "Ana Reyes");
    await user.type(screen.getByLabelText("GCash mobile number"), "09171234567");
    await user.click(screen.getByRole("button", {name: "Continue"}));

    expect(screen.getByText("₱500.00")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Confirm withdrawal"}));

    await waitFor(() => {
      expect(requestMockProviderWithdrawal).toHaveBeenCalledWith(
        expect.objectContaining({
          amountInCentavos: 50000,
          destinationType: "gcash",
          accountName: "Ana Reyes",
          mobileNumber: "09171234567",
        }),
      );
    });

    expect(await screen.findByRole("heading", {name: "Withdrawal recorded"})).toBeVisible();
    expect(onCompleted).toHaveBeenCalled();
  });

  it("blocks amounts above available earnings before submit", async () => {
    const user = userEvent.setup();

    render(
      <ProviderMockWithdrawDialog
        open
        availableAmountInCentavos={10000}
        onOpenChange={vi.fn()}
        onCompleted={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText("Custom amount"));
    await user.type(
      screen.getByLabelText("Custom withdrawal amount in pesos"),
      "500",
    );
    await user.click(screen.getByRole("button", {name: "Continue"}));

    expect(
      screen.getByText("Withdrawal amount cannot exceed available earnings."),
    ).toBeVisible();
    expect(requestMockProviderWithdrawal).not.toHaveBeenCalled();
  });
});
