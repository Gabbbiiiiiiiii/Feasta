import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import type {ProviderRequestListItem} from "@/lib/provider/requests/provider-request-types";
import {
  providerRequestAcceptanceDescription,
} from "@/lib/provider/requests/provider-request-acceptance-copy";

const acceptProviderRequest = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({refresh: vi.fn()}),
}));

vi.mock("@/lib/provider/requests/provider-request-client", () => ({
  acceptProviderRequest,
  rejectProviderRequest: vi.fn(),
}));

import {ProviderRequestsClient} from "@/app/provider/requests/provider-requests-client";
import {
  ProviderRequestActionError,
  providerRequestPreconditionError,
} from "@/lib/provider/requests/provider-request-acceptance-copy";

function request(
  overrides: Partial<ProviderRequestListItem> = {},
): ProviderRequestListItem {
  return {
    id: "request_one",
    mainEventId: "event_one",
    providerId: "provider_one",
    type: "catering",
    status: "pending",
    customer: {
      id: "customer_one",
      name: "Ana Reyes",
      email: null,
      phoneNumber: null,
    },
    package: {id: "package_one", name: "Fiesta"},
    services: [],
    event: {
      eventType: "birthday",
      eventDate: "2026-12-01T00:00:00.000Z",
      eventTime: "18:00",
      guestCount: 40,
      venueAddress: null,
      city: "Ormoc",
      notes: null,
    },
    amount: 10000,
    downPaymentAmount: 10000,
    paymentPolicy: "full_payment",
    downPaymentPercentage: 100,
    rejectionReason: null,
    createdAt: null,
    updatedAt: null,
    respondedAt: null,
    ...overrides,
  };
}

describe("provider request acceptance copy", () => {
  it("uses the booking payment policy for full payment and deposit", () => {
    expect(providerRequestAcceptanceDescription({
      paymentPolicy: "full_payment",
      amount: 10000,
      downPaymentAmount: 2000,
    })).toBe(
      "The customer will be asked to pay the full amount after you accept.",
    );

    expect(providerRequestAcceptanceDescription({
      paymentPolicy: "deposit_then_balance",
      amount: 10000,
      downPaymentAmount: 10000,
    })).toBe(
      "The customer will be asked to complete the required down payment after you accept.",
    );

    expect(providerRequestAcceptanceDescription({
      paymentPolicy: null,
      amount: 10000,
      downPaymentAmount: 0,
    })).toBe("This request will be confirmed after you accept it.");
  });

  it("shows payout setup guidance instead of a raw acceptance failure", async () => {
    const user = userEvent.setup();
    acceptProviderRequest.mockRejectedValueOnce(
      new ProviderRequestActionError(
        "Set up your payout account before accepting paid bookings.",
        true,
      ),
    );

    render(
      <ProviderRequestsClient
        initialRequests={[request()]}
        initialSummary={{
          pending: 1,
          awaitingPayment: 0,
          confirmed: 0,
          completed: 0,
          total: 1,
        }}
      />,
    );

    await user.click(screen.getByRole("button", {name: "View request from Ana Reyes"}));
    await user.click(screen.getByRole("button", {name: "Accept request"}));

    const dialog = screen.getByRole("dialog", {name: "Accept this request?"});
    expect(within(dialog).getByText(
      "The customer will be asked to pay the full amount after you accept.",
    )).toBeVisible();

    await user.click(within(dialog).getByRole("button", {name: "Accept request"}));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Set up your payout account before accepting paid bookings.",
    );
    expect(screen.getByRole("link", {name: "Set up payouts"})).toHaveAttribute(
      "href",
      "/provider/payments",
    );
    expect(screen.queryByText(/400/)).not.toBeInTheDocument();
    expect(screen.queryByText(/FAILED_PRECONDITION/)).not.toBeInTheDocument();
  });

  it("maps payout_setup_not_ready and ignores a client success flag", () => {
    const error = providerRequestPreconditionError(
      "Complete payout setup before accepting new booking requests.",
      "payout_setup_not_ready",
    );

    expect(error).toBeInstanceOf(ProviderRequestActionError);
    expect(error.payoutSetupRequired).toBe(true);
    expect(error.message).toBe(
      "Set up your payout account before accepting paid bookings.",
    );
    expect(error.message).not.toMatch(/400|FAILED_PRECONDITION/);
  });

  it("keeps deposit confirmation wording when the policy is deposit_then_balance", async () => {
    const user = userEvent.setup();
    render(
      <ProviderRequestsClient
        initialRequests={[request({
          paymentPolicy: "deposit_then_balance",
          amount: 10000,
          downPaymentAmount: 2000,
        })]}
        initialSummary={{
          pending: 1,
          awaitingPayment: 0,
          confirmed: 0,
          completed: 0,
          total: 1,
        }}
      />,
    );

    await user.click(screen.getByRole("button", {name: "View request from Ana Reyes"}));
    await user.click(screen.getByRole("button", {name: "Accept request"}));

    expect(screen.getByRole("dialog", {name: "Accept this request?"})).toHaveTextContent(
      "The customer will be asked to complete the required down payment after you accept.",
    );
    expect(screen.getByRole("dialog", {name: "Accept this request?"})).not.toHaveTextContent(
      "pay the full amount",
    );
  });
});
