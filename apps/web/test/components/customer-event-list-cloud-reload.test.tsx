// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook} from "@testing-library/react";
import type {CustomerEventListCloudEvent} from
  "@/lib/customer/event-list/customer-event-list-cloud-transport";
import {fromWebList} from
  "@/lib/customer/event-list/customer-event-list-cloud-contract";

const mocks = vi.hoisted(() => {
  const user = {uid: "reload-customer"};
  return {user, currentUser: user, subscribe: vi.fn(), send: vi.fn(),
    unsubscribe: vi.fn(), generation: 1};
});
vi.mock("@/lib/firebase/client", () => ({auth: {
  get currentUser() { return mocks.currentUser; },
}}));
vi.mock("@/lib/customer/event-list/customer-event-list", () => ({
  useCustomerEventListSession: () => ({
    user: mocks.user, generation: mocks.generation,
  }),
}));
vi.mock("@/lib/customer/event-list/customer-event-list-cloud-transport", () => ({
  CUSTOMER_EVENT_LIST_CLOUD_ENABLED: true,
  subscribeCustomerEventListCloud: mocks.subscribe,
  sendCustomerEventListMutation: mocks.send,
}));
import {useCustomerEventListCloudAsync} from
  "@/lib/customer/event-list/use-customer-event-list-cloud-async";

const packageItem = {
  type: "package" as const, providerId: "provider-reload",
  packageId: "package-reload", providerName: "Provider Reload",
  packageName: "Package Reload", price: 1000, imageUrl: null,
  packageHref: "/customer/packages/package-reload", configuration: null,
};
const accepted = {version: 1 as const, revision: 3, changed: true,
  migrationReviewRequired: false, removedIdentities: [],
  preservedIdentities: [], replayed: true};
let onEvent: (event: CustomerEventListCloudEvent) => void;
function ready() {
  act(() => onEvent({status: "ready", document: {
    ...fromWebList("reload-customer", [], null), revision: 2,
  }}));
}

describe("Event List reload-safe recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.sessionStorage.clear();
    mocks.currentUser = mocks.user;
    mocks.generation = 1;
    mocks.subscribe.mockImplementation(
      (_user: unknown, _check: unknown, callback: typeof onEvent) => {
        onEvent = callback;
        return mocks.unsubscribe;
      },
    );
  });

  it("restores the exact request after unmount without a new save", async () => {
    mocks.send.mockRejectedValueOnce(new Error("response lost"));
    const first = renderHook(() => useCustomerEventListCloudAsync());
    ready();
    await act(async () => {
      await first.result.current.saveItemAsync(packageItem).catch(() => undefined);
    });
    const original = mocks.send.mock.calls[0]?.[1];
    expect(first.result.current.recovery?.status).toBe("uncertain");
    first.unmount();

    const second = renderHook(() => useCustomerEventListCloudAsync());
    ready();
    expect(second.result.current.recovery?.status).toBe("uncertain");
    await expect(second.result.current.saveItemAsync(packageItem))
      .rejects.toThrow(/pending recovery/i);
    expect(mocks.send).toHaveBeenCalledOnce();

    mocks.send.mockResolvedValueOnce(accepted);
    await act(async () => { await second.result.current.retryUncertainAsync(); });
    expect(mocks.send.mock.calls[1]?.[1]).toEqual(original);
    act(() => onEvent({status: "ready", document: {
      ...fromWebList("reload-customer", [packageItem], null), revision: 3,
    }}));
    expect(second.result.current.recovery?.status).toBe("confirmed");
    expect(window.sessionStorage.length).toBe(0);
    second.unmount();
  });

  it("blocks mutations when a saved command is corrupted", async () => {
    window.sessionStorage.setItem(
      "feasta.customer.event-list.cloud-pending.v1:uid:reload-customer",
      "corrupted",
    );
    const hook = renderHook(() => useCustomerEventListCloudAsync());
    ready();
    expect(hook.result.current.recovery?.status).toBe("uncertain");
    await expect(hook.result.current.saveItemAsync(packageItem))
      .rejects.toThrow(/pending recovery/i);
    expect(mocks.send).not.toHaveBeenCalled();
    hook.unmount();
  });
});
