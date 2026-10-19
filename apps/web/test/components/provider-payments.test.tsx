import {readFileSync} from "node:fs";
import {join} from "node:path";

import {act, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {
  ProviderPayment,
  ProviderPaymentDetail,
  ProviderPaymentFilter,
  ProviderPaymentPage,
} from "@/lib/provider/payments/provider-payment-types";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  loadPage: vi.fn(),
  loadPayment: vi.fn(),
  loadFinance: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/provider/payments",
  useRouter: () => ({replace: mocks.replace}),
}));

vi.mock("@/app/provider/payments/actions", () => ({
  loadProviderPaymentsAction: mocks.loadPage,
  loadProviderPaymentAction: mocks.loadPayment,
  loadProviderFinanceOverviewAction: mocks.loadFinance,
}));

import {ProviderPaymentsClient} from "@/app/provider/payments/provider-payments-client";

function payment(
  status: ProviderPayment["status"] = "paid",
  id = `payment-${status}`,
): ProviderPayment {
  return {
    paymentId: id,
    providerRequestId: `request-${status}`,
    mainEventId: `event-${status}`,
    customerDisplayName: "Ana Reyes",
    eventType: "birthday",
    eventDate: "2026-09-15T04:00:00.000Z",
    eventTime: "12:00 PM",
    serviceSummary: "Celebration Package",
    amount: 2500,
    amountInCentavos: 250000,
    formattedAmount: "PHP 2,500.00",
    currency: "PHP",
    paymentType: "provider_down_payment",
    status,
    refundStatus: null,
    createdAt: "2026-08-18T02:00:00.000Z",
    updatedAt: "2026-08-19T02:00:00.000Z",
    paidAt: status === "paid" ? "2026-08-19T02:00:00.000Z" : null,
    failedAt: status === "failed" ? "2026-08-19T02:00:00.000Z" : null,
    expiredAt: status === "expired" ? "2026-08-19T02:00:00.000Z" : null,
    refundedAt: status === "refunded" ? "2026-08-20T02:00:00.000Z" : null,
  };
}

function paymentPage(
  payments: ProviderPayment[] = [payment()],
  nextCursor: string | null = null,
): ProviderPaymentPage {
  return {
    payments,
    summary: {
      confirmedCustomerPayments: {count: 2, totalAmountInCentavos: 500000},
      processingPayments: {count: 1, totalAmountInCentavos: 125000},
      failedPayments: {count: 1, totalAmountInCentavos: 75000},
      expiredPayments: {count: 2, totalAmountInCentavos: 100000},
      fullyRefundedPayments: {count: 1, totalAmountInCentavos: 50000},
      paymentRecords: 7,
      refundAwaitingConfirmation: 1,
    },
    nextCursor,
    hasMore: nextCursor !== null,
    skippedMalformedCount: 0,
  };
}

function detail(record = payment()): ProviderPaymentDetail {
  return {
    payment: record,
    providerRequestStatus: "confirmed",
    mainEventStatus: "confirmed",
  };
}

function renderWorkspace({
  initialPage = paymentPage(),
  status = "all",
}: {
  initialPage?: ProviderPaymentPage;
  status?: ProviderPaymentFilter;
} = {}) {
  render(
    <ProviderPaymentsClient
      initialPage={initialPage}
      initialFilters={{status, pageSize: 10, cursor: null}}
    />,
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", "/provider/payments");
  mocks.loadPage.mockReset();
  mocks.loadPayment.mockReset();
  mocks.loadFinance.mockReset();
  mocks.replace.mockReset();
  mocks.loadPage.mockResolvedValue(paymentPage());
  mocks.loadPayment.mockResolvedValue(detail());
});

describe("provider booking payments route contract", () => {
  const root = process.cwd();
  const pageSource = readFileSync(
    join(root, "src/app/provider/payments/page.tsx"),
    "utf8",
  );
  const actionSource = readFileSync(
    join(root, "src/app/provider/payments/actions.ts"),
    "utf8",
  );
  const serviceSource = readFileSync(
    join(root, "src/lib/provider/payments/provider-payment-service.ts"),
    "utf8",
  );

  it("renders from the approved-provider server service without client provider identity", () => {
    expect(pageSource).toContain("getProviderPaymentPage(initialFilters)");
    expect(actionSource).toContain("getProviderPaymentRows(filters)");
    expect(actionSource).toContain("getProviderPayment(paymentId)");
    expect(serviceSource).toContain("await requireApprovedProvider()");
    expect(pageSource).not.toContain("providerId");
    expect(actionSource).not.toContain("providerId");
  });
});

describe("filtered payment read isolation", () => {
  it("keeps summaries out of the authorized row read and filter action", () => {
    const service = readFileSync(join(process.cwd(), "src/lib/provider/payments/provider-payment-service.ts"), "utf8");
    const rows = service.slice(service.indexOf("export async function getProviderPaymentRows"), service.indexOf("export async function getProviderPayment("));
    expect(rows).toContain("await requireApprovedProvider()");
    expect(rows).toContain('.where("providerId", "==", providerId)');
    expect(rows).toContain("startAfter(");
    expect(rows).not.toMatch(/loadProviderPaymentSummary|aggregate\(/);
    const actions = readFileSync(join(process.cwd(), "src/app/provider/payments/actions.ts"), "utf8");
    const filterAction = actions.slice(actions.indexOf("export async function loadProviderPaymentsAction"), actions.indexOf("export async function loadProviderPaymentAction"));
    expect(filterAction).toContain("getProviderPaymentRows(filters)");
    expect(filterAction).not.toMatch(/getProviderPaymentPage|getProviderPaymentSummary|getProviderFinanceOverview/);
    const client = readFileSync(join(process.cwd(), "src/app/provider/payments/provider-payments-client.tsx"), "utf8");
    expect(client).not.toMatch(/router\.(replace|push|refresh)/);
  });
});

describe("provider booking payments workspace", () => {
  it.each([1, 3])("shows the initial count of %s refunds awaiting confirmation", count => {
    const initialPage = paymentPage();
    initialPage.summary.refundAwaitingConfirmation = count;
    renderWorkspace({initialPage});
    expect(screen.getByRole("status", {name: "Refunds awaiting confirmation"})).toHaveTextContent(
      count === 1 ? "1 refund is awaiting confirmation." : "3 refunds are awaiting confirmation.",
    );
  });

  it("omits the pending-refund notice when the initial count is zero", () => {
    const initialPage = paymentPage();
    initialPage.summary.refundAwaitingConfirmation = 0;
    renderWorkspace({initialPage});
    expect(screen.queryByRole("status", {name: "Refunds awaiting confirmation"})).not.toBeInTheDocument();
  });

  it("preserves the initial summary when filters load only rows without refreshing finance", async () => {
    const initialPage = paymentPage();
    initialPage.summary.refundAwaitingConfirmation = 3;
    const rows: Omit<ProviderPaymentPage, "summary"> = {
      payments: [payment("failed")], nextCursor: null, hasMore: false, skippedMalformedCount: 0,
    };
    mocks.loadPage.mockResolvedValueOnce(rows);
    renderWorkspace({initialPage});
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", {name: "Failed", pressed: false}));
    await screen.findAllByLabelText("Status: Failed");
    expect(screen.getByRole("status", {name: "Refunds awaiting confirmation"})).toHaveTextContent("3 refunds are awaiting confirmation.");
    expect(mocks.loadPage).toHaveBeenCalledExactlyOnceWith({status: "failed", pageSize: 10, cursor: null});
    expect(mocks.loadFinance).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByText(/Reload the page to refresh all financial summaries/)).toBeVisible();
  });

  it("renders the provider finance heading, exact summary metrics, and centavo-safe PHP values", () => {
    renderWorkspace();

    expect(screen.getByRole("heading", {level: 1, name: "Payments"}))
      .toBeVisible();
    expect(screen.getByText("Provider finance")).toBeVisible();
    expect(screen.getByLabelText("Pending earnings")).toBeVisible();
    expect(screen.getByLabelText("Available earnings")).toBeVisible();
    expect(screen.getByLabelText("Paid out")).toBeVisible();
    expect(screen.getByRole("link", {name: "View earnings statement"})).toHaveAttribute("href", "/provider/payments/statements");

  });

  it("shows all canonical filters and resets the opaque cursor when URL status changes", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    const filters = screen.getByRole("group", {name: "Payment status filters"});
    for (const label of [
      "All",
      "Pending",
      "Processing",
      "Paid",
      "Failed",
      "Expired",
      "Refunded",
    ]) {
      expect(within(filters).getByRole("button", {name: label})).toBeVisible();
    }

    await user.click(within(filters).getByRole("button", {name: "Processing"}));
    await waitFor(() => {
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(window.location.search).toContain("status=processing");
      expect(mocks.loadPage).toHaveBeenCalledWith({
        status: "processing",
        pageSize: 10,
        cursor: null,
      });
    });
  });

  it("uses opaque cursor history for Next and Previous", async () => {
    const user = userEvent.setup();
    mocks.loadPage
      .mockResolvedValueOnce(paymentPage([payment()], "opaque-next-2"))
      .mockResolvedValueOnce(paymentPage([payment()]));
    renderWorkspace({initialPage: paymentPage([payment()], "opaque-next-1")});

    await user.click(screen.getByRole("button", {name: "Next"}));
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith({
      status: "all",
      pageSize: 10,
      cursor: "opaque-next-1",
    }));
    expect(await screen.findByText("Page 2")).toBeVisible();

    await user.click(screen.getByRole("button", {name: "Previous"}));
    await waitFor(() => expect(mocks.loadPage).toHaveBeenLastCalledWith({
      status: "all",
      pageSize: 10,
      cursor: null,
    }));
    expect(await screen.findByText("Page 1")).toBeVisible();
  });

  it("renders honest empty states for all and filtered results", () => {
    const {unmount} = render(
      <ProviderPaymentsClient
        initialPage={paymentPage([])}
        initialFilters={{status: "all", pageSize: 10, cursor: null}}
      />,
    );
    expect(screen.getByText("No payment activity yet")).toBeVisible();
    expect(screen.getByText(
      "Customer payment activity for your booking requests will appear here.",
    )).toBeVisible();
    unmount();

    renderWorkspace({initialPage: paymentPage([]), status: "failed"});
    expect(screen.getByText("No payments match this status")).toBeVisible();
  });

  it("renders complete desktop and mobile history facts with canonical status text", () => {
    renderWorkspace();

    const table = screen.getByRole("table", {name: "Provider booking payment results"});
    for (const heading of [
      "Customer / Event",
      "Payment amount",
      "Payment status",
      "Activity date",
      "View payment",
    ]) {
      expect(within(table).getByRole("columnheader", {name: heading})).toBeVisible();
    }
    expect(within(table).getByText("Ana Reyes")).toBeVisible();
    expect(within(table).queryByText("Celebration Package")).not.toBeInTheDocument();
    expect(within(table).getByLabelText("Status: Paid")).toBeVisible();

    const mobile = screen.getByLabelText(
      "Provider booking payment results, mobile view",
    );
    expect(within(mobile).getByText("Ana Reyes")).toBeVisible();

    expect(within(mobile).getByText(/₱2,500\.00/u)).toBeVisible();
  });

  it("keeps Paid canonical while indicating a requested refund", () => {
    renderWorkspace({
      initialPage: paymentPage([{...payment(), refundStatus: "requested"}]),
    });

    expect(screen.getAllByLabelText("Status: Paid").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Refund pending").length).toBeGreaterThan(0);
  });

  it("renders every canonical payment status without inventing UI states", () => {
    const statuses = [
      "pending",
      "processing",
      "paid",
      "failed",
      "expired",
      "refunded",
    ] as const;
    renderWorkspace({
      initialPage: paymentPage(statuses.map((status) => payment(status))),
    });

    for (const status of statuses) {
      const label = `${status[0].toUpperCase()}${status.slice(1)}`;
      expect(screen.getAllByLabelText(`Status: ${label}`).length)
        .toBeGreaterThanOrEqual(2);
    }
  });

  it("loads provider-safe detail fields and closes accessibly", async () => {
    const user = userEvent.setup();
    const record = {...payment(), refundStatus: "requested" as const};
    mocks.loadPayment.mockResolvedValue(detail(record));
    renderWorkspace({initialPage: paymentPage([record])});

    await user.click(screen.getAllByRole("button", {
      name: "View payment for Ana Reyes",
    })[0]);

    await waitFor(() => expect(mocks.loadPayment).toHaveBeenCalledWith("payment-paid"));
    const drawer = await screen.findByRole("dialog", {name: "Payment details"});
    expect(within(drawer).getByText("payment-paid")).toBeVisible();
    expect(within(drawer).getByText("request-paid")).toBeVisible();
    expect(within(drawer).getByText("event-paid")).toBeVisible();
    expect(within(drawer).getByText("Provider request down payment")).toBeVisible();
    expect(within(drawer).getByLabelText("Status: Refund pending")).toBeVisible();
    expect(within(drawer).getAllByLabelText("Status: Confirmed")).toHaveLength(2);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", {name: "Payment details"}))
      .not.toBeInTheDocument();
  });

  it("does not expose sensitive fields or provider financial actions", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getAllByRole("button", {
      name: "View payment for Ana Reyes",
    })[0]);
    const drawer = await screen.findByRole("dialog", {name: "Payment details"});

    expect(drawer).not.toHaveTextContent(/checkoutUrl|clientRequestHash|webhook|email|phone/iu);

  });

  it("shows safe errors without leaking server details", async () => {
    const user = userEvent.setup();
    mocks.loadPayment.mockRejectedValueOnce(new Error("Firestore permission-denied"));
    renderWorkspace();
    await user.click(screen.getAllByRole("button", {
      name: "View payment for Ana Reyes",
    })[0]);

    expect(await screen.findByText(
      "The latest payment details could not be loaded. Please try again.",
    )).toBeVisible();
    expect(screen.queryByText("Firestore permission-denied")).not.toBeInTheDocument();
  });
  it.each(["all", "pending", "processing", "paid", "failed", "expired", "refunded"] as const)("loads the %s filter with a fresh cursor", async status => {
    const user = userEvent.setup();
    renderWorkspace({status: status === "all" ? "paid" : "all"});
    const label = status[0].toUpperCase() + status.slice(1);
    const button = within(screen.getByRole("group", {name: "Payment status filters"})).getByRole("button", {name: label});
    await user.click(button);
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledExactlyOnceWith({status, pageSize: 10, cursor: null}));
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores stale responses and keeps filters usable during loading", async () => {
    let resolveOld!: (value: ProviderPaymentPage) => void;
    mocks.loadPage.mockImplementationOnce(() => new Promise(resolve => {resolveOld = resolve;}))
      .mockResolvedValueOnce(paymentPage([payment("failed")]));
    const user = userEvent.setup();
    renderWorkspace();
    const filters = screen.getByRole("group", {name: "Payment status filters"});
    await user.click(within(filters).getByRole("button", {name: "Paid"}));
    expect(screen.getByRole("table")).toHaveAttribute("aria-busy", "true");
    await user.click(within(filters).getByRole("button", {name: "Failed"}));
    await screen.findAllByLabelText("Status: Failed");
    await act(async () => resolveOld(paymentPage([payment("paid")])));
    expect(screen.queryByLabelText("Status: Paid")).not.toBeInTheDocument();
    expect(within(filters).getByRole("button", {name: "Failed"})).toHaveAttribute("aria-pressed", "true");
    expect(mocks.loadPage).toHaveBeenCalledTimes(2);
  });

  it("restores URL filters on popstate and resets cursors", async () => {
    renderWorkspace({status: "paid"});
    window.history.pushState(null, "", "/provider/payments?status=refunded");
    await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(mocks.loadPage).toHaveBeenLastCalledWith({status: "refunded", pageSize: 10, cursor: null});
    expect(screen.getByRole("button", {name: "Refunded", pressed: true})).toBeVisible();
  });

  it("retries a failed filter without showing previous rows", async () => {
    mocks.loadPage.mockRejectedValueOnce(new Error("private backend error"));
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(screen.getByRole("button", {name: "Failed", pressed: false}));
    await screen.findByText("Payment activity could not be loaded. Please try again.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: /try again/i}));
    await screen.findByRole("table");
    expect(mocks.loadPage).toHaveBeenCalledTimes(2);
  });

});
