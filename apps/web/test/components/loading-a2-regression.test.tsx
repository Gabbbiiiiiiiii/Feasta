import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import type {ReactNode} from "react";

const mocks = vi.hoisted(() => ({payment: vi.fn(), review: vi.fn(), services: vi.fn(), gallery: vi.fn(), subscribe: vi.fn(), admin: vi.fn(), mark: vi.fn()}));
vi.mock("next/navigation", () => ({usePathname: () => "/provider", useRouter: () => ({replace: vi.fn(), push: vi.fn()})}));
vi.mock("@/app/provider/payments/actions", () => ({loadProviderPaymentAction: mocks.payment, loadProviderPaymentsAction: vi.fn()}));
vi.mock("@/app/provider/reviews/actions", () => ({loadProviderReviewAction: mocks.review, loadProviderReviewsAction: vi.fn()}));
vi.mock("@/app/provider/payments/provider-finance-panel", () => ({ProviderFinancePanel: () => null}));
vi.mock("@/lib/provider/provider-service-client", () => ({listProviderServices: mocks.services, archiveProviderService: vi.fn(), publishProviderService: vi.fn()}));
vi.mock("@/app/provider/services/provider-service-form", () => ({ProviderServiceForm: () => null}));
vi.mock("@/app/provider/packages/setup-gallery-actions", () => ({loadProviderSetupGalleryAction: mocks.gallery, saveProviderSetupGalleryAction: vi.fn()}));
vi.mock("@/components/provider/catalog-image-uploader", () => ({CatalogImageUploader: () => null, uploadCatalogImages: vi.fn()}));
vi.mock("@/lib/notifications/notification-client", () => ({subscribeToNotifications: mocks.subscribe, markNotificationRead: mocks.mark, markRecentNotificationsRead: mocks.mark}));
vi.mock("@/app/admin/notifications/actions", () => ({loadAdminNotificationMenuAction: mocks.admin, markAdminNotificationReadAction: mocks.mark, markAdminNotificationsReadAction: mocks.mark}));

type DrawerProps = {open: boolean; loading: boolean; error: string | null; detail?: {payment: {paymentId: string}} | null; review?: {id: string} | null; onOpenChange: (open: boolean) => void; onRetry: () => void};
function Drawer(props: DrawerProps) {
  return <div data-testid="detail" data-selected={props.detail?.payment.paymentId ?? props.review?.id ?? ""} data-loading={props.loading} data-error={props.error ?? ""}>{props.open ? <><span>{props.loading ? "pending detail" : props.error ?? props.detail?.payment.paymentId ?? props.review?.id ?? "no detail"}</span><button onClick={() => props.onOpenChange(false)}>Close detail</button><button onClick={props.onRetry}>Retry detail</button></> : "closed detail"}</div>;
}
vi.mock("@/app/provider/payments/provider-payment-detail-drawer", () => ({ProviderPaymentDetailDrawer: Drawer}));
vi.mock("@/app/provider/reviews/provider-review-detail-drawer", () => ({ProviderReviewDetailDrawer: Drawer}));
// Keep both selections available while a request is pending, without a modal focus trap.
vi.mock("@/components/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/data")>();
  return {...actual, DataTable: ({rows, rowActions, emptyTitle}: {rows: unknown[]; rowActions: (row: unknown) => ReactNode; emptyTitle: string}) => <div>{rows.length ? rows.map((row, index) => <div key={index}>{rowActions(row)}</div>) : emptyTitle}</div>};
});

import {ProviderPaymentsClient} from "@/app/provider/payments/provider-payments-client";
import {ProviderReviewsClient} from "@/app/provider/reviews/provider-reviews-client";
import {ProviderServicesClient} from "@/app/provider/services/provider-services-client";
import {LegacyProviderSetupGalleryManager as ProviderSetupGalleryManager} from "@/app/provider/packages/provider-setup-gallery-manager";
import {NotificationMenu} from "@/components/layout/notification-menu";

function deferred<T>() {let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};}
beforeEach(() => {vi.resetAllMocks();});

function workspace(kind: "payment" | "review") {
  if (kind === "payment") {
    const bucket = {count: 0, totalAmountInCentavos: 0};
    return render(<ProviderPaymentsClient initialFilters={{status: "all", pageSize: 10, cursor: null}} initialPage={{payments: ["A", "B"].map((paymentId) => ({paymentId, customerDisplayName: paymentId, status: "paid"})) , summary: {confirmedCustomerPayments: bucket, processingPayments: bucket, failedPayments: bucket, expiredPayments: bucket, fullyRefundedPayments: bucket, paymentRecords: 2, refundAwaitingConfirmation: 0}, nextCursor: null, hasMore: false, skippedMalformedCount: 0} as Parameters<typeof ProviderPaymentsClient>[0]["initialPage"]} />);
  }
  return render(<ProviderReviewsClient initialFilters={{rating: "all", pageSize: 10, cursor: null}} summary={{totalReviews: 2, averageRating: 5, ratingDistribution: {1: 0, 2: 0, 3: 0, 4: 0, 5: 2}}} initialPage={{reviews: ["A", "B"].map((id) => ({id, customerDisplayName: id})), nextCursor: null, hasMore: false, skippedMalformedCount: 0} as Parameters<typeof ProviderReviewsClient>[0]["initialPage"]} />);
}
function select(index: number) {fireEvent.click(screen.getAllByRole("button", {name: /View (payment|review)/i})[index]);}
function detail(kind: string, id: string) {return kind === "payment" ? {payment: {paymentId: id}} : {id};}

for (const kind of ["payment", "review"] as const) describe(`${kind} detail request ownership`, () => {
  it("keeps B when A succeeds after B", async () => {
    const a = deferred<unknown>(), b = deferred<unknown>(); mocks[kind].mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    workspace(kind); select(0); select(1);
    await act(async () => b.resolve(detail(kind, "B")));
    await act(async () => a.resolve(detail(kind, "A")));
    expect(screen.getByTestId("detail")).toHaveTextContent("B");
  });
  it("ignores stale errors and loading completion while B is pending", async () => {
    const a = deferred<unknown>(), b = deferred<unknown>(); mocks[kind].mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    workspace(kind); select(0); select(1);
    await act(async () => a.reject(new Error("stale")));
    expect(screen.getByTestId("detail")).toHaveTextContent("pending detail");
    await act(async () => b.resolve(detail(kind, "B")));
    expect(screen.getByTestId("detail")).toHaveTextContent("B");
  });
  it("invalidates a pending request on close and makes a fresh request on reopen", async () => {
    const a = deferred<unknown>(); mocks[kind].mockReturnValueOnce(a.promise).mockResolvedValueOnce(detail(kind, "B"));
    workspace(kind); select(0); fireEvent.click(screen.getByText("Close detail"));
    await act(async () => a.resolve(detail(kind, "A")));
    expect(screen.getByTestId("detail")).toHaveTextContent("closed detail");
    expect(screen.getByTestId("detail")).toHaveAttribute("data-selected", "");
    expect(screen.getByTestId("detail")).toHaveAttribute("data-loading", "false");
    expect(screen.getByTestId("detail")).toHaveAttribute("data-error", "");
    select(1); await waitFor(() => expect(screen.getByTestId("detail")).toHaveTextContent("B"));
    expect(mocks[kind]).toHaveBeenCalledTimes(2);
  });
  it("retries a failed read", async () => {
    mocks[kind].mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce(detail(kind, "A"));
    workspace(kind); select(0); await waitFor(() => expect(screen.getByTestId("detail")).toHaveTextContent("could not be loaded"));
    fireEvent.click(screen.getByText("Retry detail")); await waitFor(() => expect(screen.getByTestId("detail")).toHaveTextContent("A"));
    expect(mocks[kind]).toHaveBeenCalledTimes(2);
  });
  it("does not carry a pending result across unmount", async () => {
    const a = deferred<unknown>(); mocks[kind].mockReturnValueOnce(a.promise).mockResolvedValueOnce(detail(kind, "B"));
    const view = workspace(kind); select(0); view.unmount(); workspace(kind); select(1);
    await act(async () => a.resolve(detail(kind, "A")));
    await waitFor(() => expect(screen.getByTestId("detail")).toHaveTextContent("B"));
  });
});

it("services distinguish failed initial reads from empty success and retry", async () => {
  mocks.services.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]);
  render(<ProviderServicesClient providerId="owner" serviceCategories={[]} serviceCategoryOptions={[]} />);
  expect(await screen.findByText("Event services unavailable")).toBeVisible();
  expect(screen.queryByText("No event services yet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Try again"}));
  expect(await screen.findByText("No event services yet")).toBeVisible(); expect(mocks.services).toHaveBeenCalledTimes(2);
});

it("gallery has a real retry and blocks editing an unloaded gallery", async () => {
  mocks.gallery.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({revision: 2, setups: []});
  render(<ProviderSetupGalleryManager />);
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
  expect(screen.getByRole("button", {name: "Add setup"})).toBeDisabled();
  expect(screen.queryByText(/No setups yet/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Retry"}));
  expect(await screen.findByText(/No setups yet/)).toBeVisible(); expect(mocks.gallery).toHaveBeenCalledTimes(2);
});

it("notifications retry a failed subscription and ignore its old callbacks", async () => {
  const callbacks: {next: (value: {notifications: []; unreadCount: number; unreadCountCapped: boolean}) => void; error: () => void}[] = [];
  const unsubscribe = vi.fn();
  mocks.subscribe.mockImplementation((next, error) => {callbacks.push({next, error}); return Promise.resolve({unsubscribe});});
  const view = render(<NotificationMenu role="provider" />); fireEvent.click(screen.getByRole("button", {name: "Notifications"}));
  await waitFor(() => expect(callbacks).toHaveLength(1));
  act(() => callbacks[0].error()); fireEvent.click(screen.getByRole("button", {name: "Retry"}));
  await waitFor(() => expect(callbacks).toHaveLength(2)); expect(unsubscribe).toHaveBeenCalledTimes(1);
  act(() => callbacks[1].next({notifications: [], unreadCount: 0, unreadCountCapped: false}));
  act(() => callbacks[0].error()); expect(screen.getByText("No notifications yet.")).toBeVisible();
  view.unmount(); expect(unsubscribe).toHaveBeenCalledTimes(2);
  act(() => callbacks[1].error());
});

it("disposes a subscription that resolves after unmount", async () => {
  const pending = deferred<{unsubscribe: () => void}>(); const unsubscribe = vi.fn(); mocks.subscribe.mockReturnValue(pending.promise);
  const view = render(<NotificationMenu role="customer" />); view.unmount();
  await act(async () => pending.resolve({unsubscribe})); expect(unsubscribe).toHaveBeenCalledOnce();
});

it("admin notification reads can retry after failure", async () => {
  mocks.admin.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({notifications: [], unreadCount: 0, unreadCountCapped: false});
  render(<NotificationMenu role="admin" />); fireEvent.click(screen.getByRole("button", {name: "Notifications"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded"); fireEvent.click(screen.getByRole("button", {name: "Retry"}));
  expect(await screen.findByText("No notifications yet.")).toBeVisible(); expect(mocks.admin).toHaveBeenCalledTimes(2);
});
it("customer notification read failure remains unread and can be persisted on retry", async () => {
  const notification = {id: "notice", userId: "customer", title: "Read recovery notice", message: "Please read", type: "info", relatedCollection: null, relatedId: null, isRead: false, createdAt: new Date(), readAt: null};
  mocks.subscribe.mockImplementation((next) => {next({notifications: [notification], unreadCount: 1, unreadCountCapped: false}); return Promise.resolve({unsubscribe: vi.fn()});});
  mocks.mark.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  render(<NotificationMenu role="customer" />);
  fireEvent.click(screen.getByRole("button", {name: "1 unread notifications"}));
  fireEvent.click(screen.getByRole("button", {name: /Read recovery notice/}));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be updated");
  expect(screen.getByRole("button", {name: "1 unread notifications"})).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Retry"}));
  const item = await screen.findByRole("button", {name: /Read recovery notice/});
  expect(screen.getByLabelText("Unread")).toBeVisible();
  fireEvent.click(item);
  await waitFor(() => expect(mocks.mark).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByLabelText("Unread")).not.toBeInTheDocument());
  expect(mocks.mark).toHaveBeenLastCalledWith("notice");
});

it("services ignore the old provider read after the provider changes", async () => {
  const old = deferred<unknown>(); mocks.services.mockReturnValueOnce(old.promise).mockResolvedValueOnce([]);
  const view = render(<ProviderServicesClient providerId="old" serviceCategories={[]} serviceCategoryOptions={[]} />);
  await waitFor(() => expect(mocks.services).toHaveBeenCalledWith("old"));
  view.rerender(<ProviderServicesClient providerId="new" serviceCategories={[]} serviceCategoryOptions={[]} />);
  expect(await screen.findByText("No event services yet")).toBeVisible();
  await act(async () => old.reject(new Error("stale failed read")));
  expect(screen.queryByText("Event services unavailable")).not.toBeInTheDocument();
  expect(screen.getByText("No event services yet")).toBeVisible();
});

it("keeps a terminal subscription error visible if another listener publishes afterward", async () => {
  let publish!: (value: {notifications: []; unreadCount: number; unreadCountCapped: boolean}) => void;
  let fail!: () => void;
  const unsubscribe = vi.fn();
  mocks.subscribe.mockImplementation((next, error) => {publish = next; fail = error; return Promise.resolve({unsubscribe});});
  render(<NotificationMenu role="provider" />);
  fireEvent.click(screen.getByRole("button", {name: "Notifications"}));
  await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce());
  act(() => fail());
  act(() => publish({notifications: [], unreadCount: 0, unreadCountCapped: false}));
  expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
  expect(screen.getByRole("button", {name: "Retry"})).toBeVisible();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
