import {act, fireEvent, render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import type {ProviderRequestListItem} from "@/lib/provider/requests/provider-request-types";
import {
  providerRequestAcceptanceDescription,
} from "@/lib/provider/requests/provider-request-acceptance-copy";

const acceptProviderRequest = vi.hoisted(() => vi.fn());
const detail = vi.hoisted(() => vi.fn());
const load = vi.hoisted(() => vi.fn());
const decline = vi.hoisted(() => vi.fn());
vi.mock("@/app/provider/requests/actions", () => ({loadProviderRequestsAction: load, loadProviderRequestDetailAction: detail}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({refresh: vi.fn()}),
}));

vi.mock("@/lib/provider/requests/provider-request-client", () => ({
  acceptProviderRequest,
  rejectProviderRequest: decline,
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
  it.each([ ["pending", "New"], ["accepted", "Accepted"], ["rejected", "Declined"], ["cancelled", "Cancelled"], ["expired", "Expired"] ] as const)("labels %s clearly in desktop and mobile results", (status, label) => {
    render(<ProviderRequestsClient initialRequests={[request({status})]} />);
    expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("columnheader").map(cell => cell.textContent)).toEqual(["Customer", "Event", "Event Date", "Status", "Action"]);
  });
  it("accepts the selected request through the trusted action and closes details", async () => {
    const user = userEvent.setup();
    acceptProviderRequest.mockResolvedValueOnce({});
    load.mockResolvedValueOnce({requests: [], nextCursor: null, hasMore: false, skippedMalformedCount: 0});
    render(<ProviderRequestsClient initialDetail={request()} />);
    await user.click(screen.getByRole("button", {name: "Accept Request"}));
    await user.click(within(screen.getByRole("dialog", {name: "Accept this request?"})).getByRole("button", {name: "Accept Request"}));
    expect(acceptProviderRequest).toHaveBeenCalledWith({providerRequestId: "request_one"});
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("shows a retry state when fresh request details fail", async () => {
    const user = userEvent.setup();
    detail.mockRejectedValueOnce(new Error("offline"));
    render(<ProviderRequestsClient initialRequests={[request()]} />);
    await user.click(screen.getAllByRole("button", {name: "View Details for Ana Reyes"})[0]);
    expect(await screen.findByText("This booking request could not be loaded. Please refresh or try again.")).toBeVisible();
    expect(screen.queryByRole("button", {name: "Accept Request"})).toBeNull();
  });
  it("declines through the trusted action with a required trimmed reason and closes details", async () => {
    const user = userEvent.setup();
    decline.mockResolvedValueOnce({});
    load.mockResolvedValueOnce({requests: [], nextCursor: null, hasMore: false, skippedMalformedCount: 0});
    render(<ProviderRequestsClient initialDetail={request()} />);
    await user.click(screen.getByRole("button", {name: "Decline Request"}));
    const modal = screen.getByRole("dialog", {name: "Decline Request"});
    const reason = within(modal).getByLabelText("Reason");
    expect(reason).toBeRequired(); expect(reason).toHaveAttribute("minlength", "5"); expect(reason).toHaveAttribute("maxlength", "500");
    await user.type(reason, "  Date unavailable  ");
    await user.click(within(modal).getByRole("button", {name: "Decline Request"}));
    expect(decline).toHaveBeenCalledWith({providerRequestId: "request_one", reason: "Date unavailable"});
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("shows expiry explanations and hides response actions", () => {
    render(<ProviderRequestsClient initialDetail={request({status: "expired", responseUnavailableReason: "This request has expired."})} />);
    expect(screen.getByText("This request has expired.")).toBeVisible();
    expect(screen.queryByRole("button", {name: "Accept Request"})).toBeNull();
    expect(screen.queryByRole("button", {name: "Decline Request"})).toBeNull();
    expect(screen.getByText("Expired")).toBeVisible();
  });
  it("combines filters and search, paginates, and clears search while retaining status", async () => {
    load.mockReset().mockResolvedValue({requests: [], nextCursor: "older", hasMore: true, skippedMalformedCount: 0});
    render(<ProviderRequestsClient initialFilters={{status: "accepted", search: "buffet", cursor: null}} />);
    await act(async () => {fireEvent.submit(screen.getByRole("search"));});
    expect(load).toHaveBeenLastCalledWith({status: "accepted", search: "buffet", cursor: null});
    expect(screen.getByText("No matches in this part of your history")).toBeVisible();
    await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Next"}));});
    expect(load).toHaveBeenLastCalledWith({status: "accepted", search: "buffet", cursor: "older"});
    await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Clear search"}));});
    expect(load).toHaveBeenLastCalledWith({status: "accepted", search: "", cursor: null});
  });
  it("shows load errors and ignores stale results after text changes", async () => {
    let resolve!: (value: unknown) => void;
    load.mockReset().mockImplementationOnce(() => new Promise(done => {resolve = done;})).mockRejectedValueOnce(new Error("offline"));
    render(<ProviderRequestsClient initialRequests={[request()]} />);
    fireEvent.change(screen.getByRole("searchbox"), {target: {value: "Ana"}});
    await act(async () => {fireEvent.submit(screen.getByRole("search"));});
    expect(screen.getByRole("button", {name: "Searching"})).toBeDisabled();
    fireEvent.change(screen.getByRole("searchbox"), {target: {value: "Other"}});
    await act(async () => {resolve({requests: [request({customer: {id: "old", name: "Obsolete", email: null, phoneNumber: null}})], nextCursor: null, hasMore: false, skippedMalformedCount: 0});});
    expect(screen.queryByText("Obsolete")).toBeNull();
    await screen.findByText("Booking requests could not be loaded. Please try again.");
  });
  it("opens request details from a dashboard link", () => {
    render(<ProviderRequestsClient initialRequestId="request_one" newRequestsOnly initialRequests={[request()]} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", {name: "View request history", hidden: true})).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("button", {name: /accept request/iu})).toBeVisible();
  });
  it("loads all request history, clears search and pagination, and keeps details accessible", async () => {
    const user = userEvent.setup();
    const historical = request({status: "accepted"});
    load.mockReset().mockResolvedValueOnce({requests: [], nextCursor: "older", hasMore: true, skippedMalformedCount: 0})
      .mockResolvedValue({requests: [historical], nextCursor: null, hasMore: false, skippedMalformedCount: 0});
    detail.mockReset().mockResolvedValueOnce(historical);
    render(<ProviderRequestsClient initialFilters={{status: "new", search: "buffet", cursor: null}}
      initialPage={{requests: [], nextCursor: "older", hasMore: true, skippedMalformedCount: 0}} />);
    await user.click(screen.getByRole("button", {name: "Next"}));
    expect(load).toHaveBeenLastCalledWith({status: "new", search: "buffet", cursor: "older"});
    expect(screen.getByText(/Page 2/)).toBeVisible();
    await user.click(screen.getByRole("button", {name: "View request history"}));
    expect(load).toHaveBeenLastCalledWith({status: "all", search: "", cursor: null});
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("button", {name: "All"})).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Page 1/)).toBeVisible();
    expect(screen.getByRole("button", {name: "Previous"})).toBeDisabled();
    await user.click(screen.getAllByRole("button", {name: "View Details for Ana Reyes"})[0]);
    expect(detail).toHaveBeenCalledWith("request_one");
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(within(screen.getByRole("dialog")).getByText("Ana Reyes")).toBeVisible();
  });
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

    detail.mockResolvedValue(request());
    await user.click(screen.getAllByRole("button", {name: "View Details for Ana Reyes"})[0]);
    await user.click(await screen.findByRole("button", {name: "Accept Request"}));

    const dialog = screen.getByRole("dialog", {name: "Accept this request?"});
    expect(within(dialog).getByText(
      "The customer will be asked to pay the full amount after you accept.",
    )).toBeVisible();

    await user.click(within(dialog).getByRole("button", {name: "Accept Request"}));

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

    detail.mockResolvedValue(request({paymentPolicy: "deposit_then_balance", downPaymentAmount: 2000}));
    await user.click(screen.getAllByRole("button", {name: "View Details for Ana Reyes"})[0]);
    await user.click(await screen.findByRole("button", {name: "Accept Request"}));

    expect(screen.getByRole("dialog", {name: "Accept this request?"})).toHaveTextContent(
      "The customer will be asked to complete the required down payment after you accept.",
    );
    expect(screen.getByRole("dialog", {name: "Accept this request?"})).not.toHaveTextContent(
      "pay the full amount",
    );
  });
});
