import {providerInitialPaymentPresentation} from "@/lib/provider/requests/provider-request-payment-presentation";
import {act, fireEvent, render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

import type {ProviderRequestListItem} from "@/lib/provider/requests/provider-request-types";

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
    initialPaymentPresentation: providerInitialPaymentPresentation(savedPayment()),
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
    amount: 1000,
    downPaymentAmount: 1000,
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
  it("opens request details from a dashboard link and offers request history", async () => {
    const user = userEvent.setup();
    load.mockReset().mockResolvedValueOnce({requests: [], nextCursor: null, hasMore: false, skippedMalformedCount: 0});
    render(<ProviderRequestsClient initialRequestId="request_one" newRequestsOnly initialRequests={[request()]}
      initialSummary={{pending: 1, awaitingPayment: 0, confirmed: 0, completed: 0, total: 1}} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", {name: "New", hidden: true})).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("dialog")).getByRole("button", {name: /accept request/iu})).toBeVisible();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", {name: "View request history"}));
    expect(load).toHaveBeenLastCalledWith({status: "all", search: "", cursor: null});
    expect(screen.getByRole("button", {name: "All"})).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", {name: "New"})).toHaveAttribute("aria-pressed", "false");
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
  it.each([
    ["pending short notice", savedPayment("short_notice"), "Full payment required", "Required customer payment", "full amount"],
    ["pending deposit eligible", savedPayment("deposit_eligible"), "Deposit or full payment", "Minimum customer deposit", "minimum deposit or full payment"],
    ["accepted short notice", acceptedPayment(), "Full payment required", "Required customer payment", "full amount"],
    ["accepted deposit eligible", acceptedPayment("deposit_eligible"), "Deposit or full payment", "Minimum customer deposit", "minimum deposit or full payment"],
    ["pending full-payment add-on", savedAddonPayment(), "Full payment required", "Required customer payment", "full amount"],
    ["accepted full-payment add-on", acceptedAddonPayment(), "Full payment required", "Required customer payment", "full amount"],
    ["accepted full-payment add-on with nominal deposit", {...acceptedAddonPayment(), downPaymentAmount: 500, remainingBalance: 500,
      financialSnapshot: {...acceptedAddonPayment().financialSnapshot, requiredUpfrontAmountInCentavos: 50000, remainingBalanceInCentavos: 50000}},
    "Full payment required", "Required customer payment", "full amount"],
    ["full-payment package", savedPayment(), "Full payment required", "Required customer payment", "full amount"],
    ["legacy", {}, "Payment eligibility unavailable", null, "eligibility is unavailable"],
    ["malformed", {...savedPayment(), initialPaymentEligibility: {mode: "full_only"}}, "Payment eligibility unavailable", null, "eligibility is unavailable"],
  ])("shows frozen eligibility in the drawer and acceptance confirmation: %s", async (_name, saved, heading, amountLabel, confirmation) => {
    const user = userEvent.setup();
    const initialPaymentPresentation = providerInitialPaymentPresentation(saved as Record<string, unknown>);
    const addon = (_name as string).includes("add-on");
    const fullPaymentPackage = _name === "full-payment package" || addon;
    const originalPercentage = fullPaymentPackage && !(_name as string).includes("nominal deposit") ? 100 : 50;
    render(<ProviderRequestsClient initialDetail={request({amount: 1000, downPaymentAmount: originalPercentage * 10, downPaymentPercentage: originalPercentage,
      type: addon ? "addon" : "catering", package: addon ? null : {id: "package_one", name: "Fiesta"},
      status: (_name as string).startsWith("accepted") ? "accepted" : "pending",
      paymentPolicy: fullPaymentPackage ? "full_payment" : "deposit_then_balance", initialPaymentPresentation})} />);
    expect(screen.getByText(heading as string)).toBeVisible();
    expect(screen.getByText(`Original ${addon ? "service" : "package"} payment terms`)).toBeVisible();
    expect(screen.getByText(`Original ${addon ? "service" : "package"} upfront amount`)).toBeVisible();
    expect(screen.getByText(`Original ${addon ? "service" : "package"} upfront rate: ${originalPercentage}%`)).toBeVisible();
    expect(screen.queryByText("Required down payment")).toBeNull();
    if (amountLabel) {
      const row = screen.getByText(amountLabel as string).parentElement!;
      expect(row).toHaveTextContent(initialPaymentPresentation.kind === "minimum" ? /500/ : /1,000/);
    } else {
      expect(screen.queryByText("Required customer payment")).toBeNull();
      expect(screen.queryByText("Minimum customer deposit")).toBeNull();
    }
    if ((_name as string).includes("short notice")) expect(screen.getByText(/submitted fewer than 72 hours/)).toBeVisible();
    if ((_name as string).startsWith("accepted")) return;
    await user.click(screen.getByRole("button", {name: "Accept Request"}));
    const modal = screen.getByRole("dialog", {name: "Accept this request?"});
    expect(modal).toHaveTextContent(confirmation as string);
    if ((_name as string).includes("short notice")) expect(modal).toHaveTextContent("submitted fewer than 72 hours");
  });

  it.each([null, [], {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: -1}])("does not infer amounts from malformed financial evidence: %s", financialSnapshot => {
    expect(providerInitialPaymentPresentation({...acceptedPayment(), financialSnapshot}).kind).toBe("unavailable");
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
      "The customer will be asked to pay the full amount after you accept. Full payment is required under this booking's saved payment eligibility.",
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

  it("offers deposit or full payment when frozen eligibility permits it", async () => {
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

    detail.mockResolvedValue(request({paymentPolicy: "deposit_then_balance", downPaymentAmount: 2000, initialPaymentPresentation: providerInitialPaymentPresentation(savedPayment("deposit_eligible"))}));
    await user.click(screen.getAllByRole("button", {name: "View Details for Ana Reyes"})[0]);
    await user.click(await screen.findByRole("button", {name: "Accept Request"}));

    expect(screen.getByRole("dialog", {name: "Accept this request?"})).toHaveTextContent(
      "After you accept, the customer may choose the minimum deposit or full payment.",
    );
    expect(screen.getByRole("dialog", {name: "Accept this request?"})).not.toHaveTextContent(
      "pay the full amount",
    );
  });
});

// Submission freezes the agreement and eligibility; acceptance adds a financial snapshot later.
function savedPayment(reason = "package_full_payment") {
  const depositEligible = reason === "deposit_eligible";
  const submittedAt = "2026-10-19T00:00:00Z";
  const eventStartAt = depositEligible ? "2026-10-23T00:00:00Z" : "2026-10-20T00:00:00Z";
  return {
    status: "pending",
    initialPaymentEligibilitySchemaVersion: 2,
    initialPaymentEligibility: {mode: depositEligible ? "minimum_or_full" : "full_only", reason,
      depositAllowed: reason !== "package_full_payment", depositEligible, depositMinimumNoticeHours: 72,
      authorityTimeSource: "booking_submission", submittedAt, evaluatedAt: submittedAt, eventStartAt},
    bookingPaymentAgreement: {schemaVersion: 1, timingSchemaVersion: 3, channel: "booking_submission",
      initialPaymentEligibilitySchemaVersion: 2, depositEligible, eligibilityReason: reason,
      agreedAt: submittedAt, eventStartAt, grossAmountInCentavos: 100000,
      requiredUpfrontAmountInCentavos: depositEligible ? 50000 : 100000,
      remainingBalanceInCentavos: depositEligible ? 50000 : 0},
  };
}

function acceptedPayment(reason = "short_notice") {
  return {...savedPayment(reason), status: "accepted", financialSnapshot: {
    schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000,
    requiredUpfrontAmountInCentavos: reason === "package_full_payment" ? 100000 : 50000,
    remainingBalanceInCentavos: reason === "package_full_payment" ? 0 : 50000,
  }};
}

describe("malformed provider eligibility", () => {
  it.each([
    {initialPaymentEligibilitySchemaVersion: 99},
    {initialPaymentEligibilitySchemaVersion: 1},
    {initialPaymentEligibility: []},
    {initialPaymentEligibility: {...savedPayment().initialPaymentEligibility, depositEligible: true}},
    {initialPaymentEligibility: {...savedPayment().initialPaymentEligibility, reason: "unknown"}},
    {initialPaymentEligibility: {...savedPayment().initialPaymentEligibility, authorityTimeSource: "browser"}},
    {initialPaymentEligibility: {...savedPayment().initialPaymentEligibility, submittedAt: null}},
  ])("does not infer eligibility from package terms: %j", override => {
    expect(providerInitialPaymentPresentation({...savedPayment(), ...override})).toMatchObject({kind: "unavailable", amount: null});
  });
});

describe("submission agreement and acceptance snapshot consistency", () => {
  it.each(["short_notice", "deposit_eligible", "package_full_payment"])("reads pending %s without a snapshot", reason => {
    const pending = savedPayment(reason);
    expect(pending).not.toHaveProperty("financialSnapshot");
    expect(providerInitialPaymentPresentation(pending)).toMatchObject({
      kind: reason === "deposit_eligible" ? "minimum" : "full", amount: reason === "deposit_eligible" ? 500 : 1000,
    });
  });
  it("accepts the nominal 50% snapshot alongside the full-payment agreement", () => {
    const accepted = acceptedPayment();
    expect(accepted.bookingPaymentAgreement.requiredUpfrontAmountInCentavos).toBe(100000);
    expect(accepted.financialSnapshot.requiredUpfrontAmountInCentavos).toBe(50000);
    expect(providerInitialPaymentPresentation(accepted)).toMatchObject({kind: "full", amount: 1000});
  });
  it.each([
    {schemaVersion: 2}, {timingSchemaVersion: 2}, {channel: "checkout"},
    {initialPaymentEligibilitySchemaVersion: 1}, {depositEligible: true}, {eligibilityReason: "deposit_eligible"},
    {grossAmountInCentavos: NaN}, {requiredUpfrontAmountInCentavos: 100000.5},
    {requiredUpfrontAmountInCentavos: 50000, remainingBalanceInCentavos: 50000},
    {remainingBalanceInCentavos: 1}, {agreedAt: "bad date"},
    {agreedAt: "2026-10-18T00:00:00Z"}, {eventStartAt: "2026-10-21T00:00:00Z"},
  ])("rejects contradictory submission agreements: %j", override => {
    const pending = savedPayment("short_notice");
    expect(providerInitialPaymentPresentation({...pending, bookingPaymentAgreement: {...pending.bookingPaymentAgreement, ...override}}))
      .toMatchObject({kind: "unavailable", amount: null});
  });
  it.each([
    {schemaVersion: 2}, {currency: "USD"}, {grossAmountInCentavos: 200000, remainingBalanceInCentavos: 150000},
    {requiredUpfrontAmountInCentavos: -1, remainingBalanceInCentavos: 100001},
    {remainingBalanceInCentavos: 0},
  ])("rejects contradictory acceptance snapshots: %j", override => {
    const accepted = acceptedPayment();
    expect(providerInitialPaymentPresentation({...accepted, financialSnapshot: {...accepted.financialSnapshot, ...override}}))
      .toMatchObject({kind: "unavailable", amount: null});
  });
  it("rejects a deposit snapshot that contradicts the agreed minimum", () => {
    const accepted = acceptedPayment("deposit_eligible");
    expect(providerInitialPaymentPresentation({...accepted, financialSnapshot: {...accepted.financialSnapshot,
      requiredUpfrontAmountInCentavos: 30000, remainingBalanceInCentavos: 70000}}).kind).toBe("unavailable");
  });
  it.each([undefined, null, [], {}])("keeps requests without a trustworthy agreement unavailable: %j", bookingPaymentAgreement => {
    expect(providerInitialPaymentPresentation({...acceptedPayment(), bookingPaymentAgreement}).kind).toBe("unavailable");
  });
});

// External add-on submission freezes the agreement and timing, but not top-level eligibility.
function savedAddonPayment() {
  const eventStartAt = "2026-10-21T10:00:00.000Z";
  return {
    type: "addon", status: "pending", customerId: "customer_one", providerId: "provider_one", amount: 1000,
    eventDate: "2026-10-20T16:00:00.000Z", eventTime: "18:00", eventEndTime: "20:00", eventStartAt,
    remainingBalanceTimingSchemaVersion: 3,
    bookingPaymentAgreement: {
      schemaVersion: 1, timingSchemaVersion: 3, channel: "booking_submission", initialPaymentEligibilitySchemaVersion: 2,
      customerId: "customer_one", providerId: "provider_one", agreedAt: "2026-10-19T00:00:00.000Z", eventStartAt, eventEndTime: "20:00",
      paymentPolicy: {paymentPolicy: "full_payment"}, depositEligible: false, eligibilityReason: "package_full_payment",
      grossAmountInCentavos: 100000, requiredUpfrontAmountInCentavos: 100000, remainingBalanceInCentavos: 0,
    },
  };
}
function acceptedAddonPayment() {
  return {...savedAddonPayment(), status: "accepted", financialSnapshot: {
    schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000, requiredUpfrontAmountInCentavos: 100000, remainingBalanceInCentavos: 0,
  }};
}

describe("external add-on frozen full-payment agreement", () => {
  it("reads a pending add-on without a financial snapshot or separate eligibility", () => {
    const pending = savedAddonPayment();
    expect(pending).not.toHaveProperty("financialSnapshot");
    expect(pending).not.toHaveProperty("initialPaymentEligibility");
    expect(providerInitialPaymentPresentation(pending)).toMatchObject({kind: "full", amount: 1000});
  });
  it.each([100, 50])("reads accepted full-payment add-ons with original %i%% upfront terms", percentage => {
    const original = acceptedAddonPayment();
    const data = {...original, downPaymentAmount: percentage * 10, remainingBalance: 1000 - percentage * 10,
      financialSnapshot: {...original.financialSnapshot, requiredUpfrontAmountInCentavos: percentage * 1000,
        remainingBalanceInCentavos: 100000 - percentage * 1000}};
    const before = structuredClone(data);
    expect(providerInitialPaymentPresentation(data)).toMatchObject({kind: "full", amount: 1000});
    expect(data).toEqual(before);
  });
  it.each([
    {downPaymentAmount: 1000}, {remainingBalance: 0}, {downPaymentAmount: "500"},
    {remainingBalance: null}, {downPaymentAmount: -500}, {remainingBalance: Number.NaN},
    {downPaymentAmount: Number.POSITIVE_INFINITY}, {remainingBalance: 1001},
  ])("rejects original amounts contradicting the nominal snapshot: %j", override => {
    const original = acceptedAddonPayment();
    expect(providerInitialPaymentPresentation({...original, downPaymentAmount: 500, remainingBalance: 500,
      financialSnapshot: {...original.financialSnapshot, requiredUpfrontAmountInCentavos: 50000, remainingBalanceInCentavos: 50000},
      ...override}).kind).toBe("unavailable");
  });
  it.each([undefined, null, [], {}, "full_payment"])("rejects missing or malformed agreements: %j", bookingPaymentAgreement => {
    expect(providerInitialPaymentPresentation({...savedAddonPayment(), bookingPaymentAgreement}).kind).toBe("unavailable");
  });
  it.each([
    {schemaVersion: 2}, {timingSchemaVersion: 2}, {channel: "checkout"}, {initialPaymentEligibilitySchemaVersion: 1},
    {paymentPolicy: {paymentPolicy: "deposit_then_balance"}}, {paymentPolicy: "full_payment"},
    {depositEligible: true}, {eligibilityReason: "short_notice"},
    {requiredUpfrontAmountInCentavos: 50000, remainingBalanceInCentavos: 50000},
    {grossAmountInCentavos: 0, requiredUpfrontAmountInCentavos: 0},
    {grossAmountInCentavos: 100000.5, requiredUpfrontAmountInCentavos: 100000.5},
    {grossAmountInCentavos: Number.MAX_SAFE_INTEGER + 1, requiredUpfrontAmountInCentavos: Number.MAX_SAFE_INTEGER + 1},
    {requiredUpfrontAmountInCentavos: -1}, {remainingBalanceInCentavos: 1},
    {customerId: "someone_else"}, {providerId: "another_provider"}, {customerId: null}, {providerId: ""},
    {agreedAt: "invalid"}, {eventStartAt: "invalid"}, {eventStartAt: "2026-10-22T10:00:00Z"},
  ])("rejects malformed or contradictory agreement terms: %j", override => {
    const pending = savedAddonPayment();
    expect(providerInitialPaymentPresentation({...pending, bookingPaymentAgreement: {...pending.bookingPaymentAgreement, ...override}}).kind)
      .toBe("unavailable");
  });
  it.each([
    {amount: 999}, {amount: "1000"}, {customerId: "another_customer"}, {providerId: "another_provider"},
    {eventDate: "2026-10-22T00:00:00Z"}, {eventDate: null}, {eventTime: "19:00"}, {eventEndTime: "21:00"},
    {eventStartAt: "2026-10-22T10:00:00Z"}, {remainingBalanceTimingSchemaVersion: 2},
    {depositEligibilityCutoffAt: "invalid"},
  ])("rejects conflicting request evidence: %j", override => {
    expect(providerInitialPaymentPresentation({...savedAddonPayment(), ...override}).kind).toBe("unavailable");
  });
  it.each([
    null, [], {schemaVersion: 2}, {schemaVersion: 1, currency: "USD"},
    {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 200000, requiredUpfrontAmountInCentavos: 200000, remainingBalanceInCentavos: 0},
    {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000, requiredUpfrontAmountInCentavos: 50000, remainingBalanceInCentavos: 40000},
    {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000, requiredUpfrontAmountInCentavos: "50000", remainingBalanceInCentavos: 50000},
    {schemaVersion: 1, currency: "PHP", grossAmountInCentavos: 100000, requiredUpfrontAmountInCentavos: 50000.5, remainingBalanceInCentavos: 49999.5},
  ])("rejects contradictory acceptance evidence: %j", financialSnapshot => {
    expect(providerInitialPaymentPresentation({...acceptedAddonPayment(), financialSnapshot}).kind).toBe("unavailable");
  });
  it.each([
    {initialPaymentEligibility: null}, {initialPaymentEligibilitySchemaVersion: 2},
    {initialPaymentEligibilitySchemaVersion: 2, initialPaymentEligibility: savedPayment("deposit_eligible").initialPaymentEligibility},
    {initialPaymentEligibilitySchemaVersion: 2, initialPaymentEligibility: savedPayment("short_notice").initialPaymentEligibility},
  ])("never bypasses conflicting top-level eligibility: %j", override => {
    expect(providerInitialPaymentPresentation({...savedAddonPayment(), ...override}).kind).toBe("unavailable");
  });
  it("also accepts matching canonical top-level eligibility", () => {
    const pending = savedAddonPayment();
    expect(providerInitialPaymentPresentation({...pending, initialPaymentEligibilitySchemaVersion: 2,
      initialPaymentEligibility: {...savedPayment().initialPaymentEligibility,
        submittedAt: pending.bookingPaymentAgreement.agreedAt, evaluatedAt: pending.bookingPaymentAgreement.agreedAt,
        eventStartAt: pending.eventStartAt}})).toMatchObject({kind: "full", amount: 1000});
  });
  it("does not apply the agreement-only path to catering", () => {
    expect(providerInitialPaymentPresentation({...savedAddonPayment(), type: "catering"}).kind).toBe("unavailable");
  });
});
