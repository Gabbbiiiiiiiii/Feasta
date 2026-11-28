import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {fromWebList} from "@/lib/customer/event-list/customer-event-list-cloud-contract";
import type {CustomerEventListCloudEvent} from "@/lib/customer/event-list/customer-event-list-cloud-transport";

const mocks = vi.hoisted(() => {
  const user = {uid: "customer_A"};
  return {user, session: {user, generation: 1}, subscribe: vi.fn(), send: vi.fn(), localRemove: vi.fn()};
});
vi.mock("@/lib/firebase/client", () => ({auth: {get currentUser() { return mocks.user; }}}));
vi.mock("@/lib/customer/event-list/customer-event-list", () => ({
  useCustomerEventListSession: () => mocks.session,
  useCustomerEventList: () => ({items: [{type: "package", providerId: "old-provider", packageId: "old-package", packageName: "Old local selection", price: 1}], removeItem: mocks.localRemove}),
  customerEventListItemKey: (item: {packageId: string}) => item.packageId,
  CUSTOMER_EVENT_LIST_OPEN_EVENT: "event-list-open",
}));
vi.mock("@/lib/customer/event-list/customer-event-list-cloud-transport", () => ({
  CUSTOMER_EVENT_LIST_CLOUD_ENABLED: true,
  subscribeCustomerEventListCloud: mocks.subscribe,
  sendCustomerEventListMutation: mocks.send,
}));
import {CustomerEventListMenu} from "@/components/customer/event-list/customer-event-list-menu";
import {CustomerEventListCloudDrawer} from "@/components/customer/event-list/customer-event-list-cloud-drawer";
import {useCustomerEventListCloudAsync} from "@/lib/customer/event-list/use-customer-event-list-cloud-async";

const item = {type: "package" as const, packageId: "package-one", providerId: "provider-one",
  packageName: "Busog Na Set – Bilao Package", providerName: "bagong business", price: 1850,
  imageUrl: "https://images.example.test/bilao.webp", packageHref: "/customer/packages/package-one", configuration: null};
let events: Array<(event: CustomerEventListCloudEvent) => void>;
function doc(readOnly = false, empty = false, revision = 4) {
  const value = {...fromWebList(mocks.user.uid, empty ? [] : [item], null), revision};
  if (readOnly) value.entries[0].href = null;
  return value;
}
function emit(event: CustomerEventListCloudEvent, index = events.length - 1) {
  act(() => events[index](event));
}
function open() { fireEvent.click(screen.getByRole("button", {name: /Open Event List/})); }
function PendingDrawer() {
  const cloud = useCustomerEventListCloudAsync();
  return <><button onClick={() => void cloud.saveItemAsync(item)}>Save test selection</button>
    <CustomerEventListCloudDrawer cloud={cloud}>
      {cloud.state.document?.entries.map(entry => <p key={entry.identity}>{String(entry.name)}</p>)}
    </CustomerEventListCloudDrawer></>;
}

describe("actual header Event List drawer with cloud enabled", () => {
  beforeEach(() => {
    vi.clearAllMocks(); sessionStorage.clear(); events = [];
    mocks.user = {uid: "customer_A"}; mocks.session = {user: mocks.user, generation: 1};
    mocks.subscribe.mockImplementation((_user, _current, callback) => { events.push(callback); return vi.fn(); });
    mocks.send.mockResolvedValue({version: 1, revision: 5, changed: true, replayed: false,
      migrationReviewRequired: false, removedIdentities: [], preservedIdentities: []});
  });

  it("loads server entries after refresh, updates the header badge, and ignores old local storage", () => {
    const view = render(<CustomerEventListMenu authenticated />);
    open();
    expect(screen.getByText(/Loading your Event List/)).toBeVisible();
    expect(screen.queryByText("Your Event List is empty")).not.toBeInTheDocument();
    emit({status: "ready", document: doc()});
    expect(screen.getByText(item.packageName)).toBeVisible();
    expect(screen.getByText(item.packageName).closest("article")).toHaveClass("rounded-[18px]", "p-3.5");
    expect(screen.getByRole("link", {name: `${item.packageName} ${item.providerName}`})).toHaveAttribute("href", item.packageHref);
    expect(document.querySelector(`img[src="${item.imageUrl}"]`)).toHaveClass("size-full", "object-cover");
    expect(screen.getByRole("link", {name: "Browse More"})).toBeVisible();
    expect(screen.getByRole("link", {name: "Review List"})).toBeVisible();
    expect(screen.getByText("Estimated event total")).toBeVisible();
    expect(screen.getByText(item.providerName)).toBeVisible();
    expect(screen.getByRole("button", {name: "Open Event List, 1 selected service"})).toHaveTextContent("1");
    expect(screen.queryByText("Old local selection")).not.toBeInTheDocument();
    view.unmount();
    render(<CustomerEventListMenu authenticated />);
    emit({status: "ready", document: doc()}); open();
    expect(screen.getByText(item.packageName)).toBeVisible();
    emit({status: "ready", document: doc(false, true, 5)});
    expect(screen.getByText("Your Event List is empty")).toBeVisible();
    expect(screen.getByRole("button", {name: "Open Event List"})).not.toHaveTextContent("1");
  });

  it("counts read-only rows and removes by canonical identity only after server confirmation", async () => {
    render(<CustomerEventListMenu authenticated />);
    const canonical = doc(true);
    const original = JSON.stringify(canonical);
    emit({status: "ready", document: canonical}); open();
    expect(screen.getByText(/Its full cloud data is preserved/)).toBeVisible();
    expect(screen.getByRole("button", {name: "Open Event List, 1 selected service"})).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", {name: `Remove ${item.packageName} from Event List`}));
    await waitFor(() => expect(mocks.send).toHaveBeenCalledOnce());
    expect(mocks.send.mock.calls[0][1]).toMatchObject({action: "remove", identity: canonical.entries[0].identity, expectedRevision: 4});
    expect(screen.getByText(item.packageName)).toBeVisible();
    expect(screen.queryByText("Your Event List is empty")).not.toBeInTheDocument();
    expect(JSON.stringify(canonical)).toBe(original);
    expect(mocks.localRemove).not.toHaveBeenCalled();
    emit({status: "ready", document: doc(false, true, 5)});
    await waitFor(() => expect(screen.getByText("Your Event List is empty")).toBeVisible());
  });

  it("distinguishes missing, cached, and failed reads from a confirmed empty list", () => {
    render(<CustomerEventListMenu authenticated />); open();
    emit({status: "cached"});
    expect(screen.queryByText("Your Event List is empty")).not.toBeInTheDocument();
    emit({status: "missing"});
    expect(screen.getByText(/has not been initialized/)).toBeVisible();
    expect(mocks.send).not.toHaveBeenCalled();
    emit({status: "error", error: new Error("Connection unavailable")});
    expect(screen.getByRole("alert")).toHaveTextContent("Connection unavailable");
    expect(screen.queryByText("Your Event List is empty")).not.toBeInTheDocument();
  });

  it("does not announce empty while an accepted addition still awaits its server snapshot", async () => {
    render(<PendingDrawer />);
    emit({status: "ready", document: doc(false, true)});
    fireEvent.click(screen.getByRole("button", {name: "Save test selection"}));
    await screen.findByText("Saving Event List. Waiting for server confirmation.");
    expect(screen.queryByText("Your Event List is empty")).not.toBeInTheDocument();
    expect(screen.queryByText(item.packageName)).not.toBeInTheDocument();
    emit({status: "ready", document: doc(false, false, 5)});
    expect(screen.getByText(item.packageName)).toBeVisible();
    expect(screen.getByText("Event List verified with server")).toBeVisible();
  });

  it("closes on account change and rejects late snapshots from the previous customer", () => {
    const view = render(<CustomerEventListMenu authenticated />);
    emit({status: "ready", document: doc()}); open();
    const old = doc();
    mocks.user = {uid: "customer_B"}; mocks.session = {user: mocks.user, generation: 2};
    view.rerender(<CustomerEventListMenu authenticated />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    open(); emit({status: "ready", document: old}, 0);
    expect(screen.queryByText(item.packageName)).not.toBeInTheDocument();
    emit({status: "ready", document: doc(false, true)});
    expect(screen.getByText("Your Event List is empty")).toBeVisible();
    view.rerender(<CustomerEventListMenu authenticated={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
