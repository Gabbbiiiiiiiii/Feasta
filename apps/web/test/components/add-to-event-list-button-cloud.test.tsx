// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, fireEvent, render, screen} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  items: [] as unknown[],
  addItem: vi.fn(),
  readSchedule: vi.fn(() => null),
  save: vi.fn(),
  initialize: vi.fn(),
  retry: vi.fn(),
  state: {status: "ready", document: {
    entries: [] as Array<{identity: string}>,
  }},
  recovery: null as null | {status: string},
}));

vi.mock("@/lib/customer/event-list/customer-event-list", () => ({
  customerEventListItemKey: (item: {packageId: string}) => item.packageId,
  useCustomerEventList: () => ({
    items: mocks.items, addItem: mocks.addItem,
    readSchedule: mocks.readSchedule,
  }),
}));
vi.mock("@/lib/customer/event-list/customer-event-list-cloud-contract", () => ({
  fromWebItem: (item: {providerId: string; packageId: string}) => ({
    identity: `catering_package:${item.providerId}:${item.packageId}`,
  }),
  toWebItem: () => ({status: "supported"}),
}));
vi.mock("@/lib/customer/event-list/customer-event-list-cloud-transport", () => ({
  CUSTOMER_EVENT_LIST_CLOUD_ENABLED: true,
}));
vi.mock("@/lib/customer/event-list/use-customer-event-list-cloud-async", () => ({
  useCustomerEventListCloudAsync: () => ({
    enabled: true,
    state: mocks.state,
    recovery: mocks.recovery,
    saveItemAsync: mocks.save,
    initializeCloudListAsync: mocks.initialize,
    retryUncertainAsync: mocks.retry,
  }),
}));
import {AddToEventListButton} from
  "@/components/customer/event-list/add-to-event-list-button";

const item = {
  type: "package" as const,
  providerId: "provider-one", packageId: "package-one",
  providerName: "Provider One", packageName: "Package One",
  price: 1200, imageUrl: null,
  packageHref: "/customer/packages/package-one", configuration: null,
};

describe("Add to List cloud feedback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.items = [];
    mocks.recovery = null;
    mocks.state = {status: "ready", document: {entries: []}};
    mocks.save.mockResolvedValue({revision: 1, status: "awaiting_snapshot"});
    mocks.initialize.mockResolvedValue({revision: 0, status: "awaiting_snapshot"});
    mocks.retry.mockResolvedValue({revision: 1, status: "awaiting_snapshot"});
  });

  it("waits for the confirmed cloud entry before showing saved", async () => {
    const view = render(<AddToEventListButton item={item} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", {name: "Add to List"}));
    });
    expect(mocks.save).toHaveBeenCalledWith(item);
    expect(mocks.addItem).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {name: "Add to List"})).toBeTruthy();

    mocks.state = {status: "ready", document: {
      entries: [{identity: "catering_package:provider-one:package-one"}],
    }};
    view.rerender(<AddToEventListButton item={item} />);
    expect(screen.getByRole("button", {name: "Added to List"})).toBeTruthy();
  });

  it("does not show saved when the snapshot is cached", () => {
    mocks.state = {status: "cached", document: {
      entries: [{identity: "catering_package:provider-one:package-one"}],
    }};
    render(<AddToEventListButton item={item} />);
    expect(screen.queryByRole("button", {name: "Added to List"})).toBeNull();
    expect(screen.getByRole("button", {name: "Add to List"}).hasAttribute("disabled")).toBe(true);
  });

  it("explicitly initializes only a confirmed missing document", async () => {
    mocks.state = {status: "missing", document: {entries: []}};
    render(<AddToEventListButton item={item} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", {name: "Add to List"}));
    });
    expect(mocks.initialize).toHaveBeenCalledWith([item], null);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("retries an uncertain mutation without creating a new command", async () => {
    mocks.recovery = {status: "uncertain"};
    render(<AddToEventListButton item={item} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", {name: "Retry Save"}));
    });
    expect(mocks.retry).toHaveBeenCalledOnce();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("reports a failed cloud request without a local fallback", async () => {
    mocks.save.mockRejectedValue(new Error("network timeout"));
    render(<AddToEventListButton item={item} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", {name: "Add to List"}));
    });
    expect(screen.getByRole("alert").textContent).toContain("network timeout");
    expect(mocks.addItem).not.toHaveBeenCalled();
  });
});
