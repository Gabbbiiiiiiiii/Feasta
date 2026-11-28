// @vitest-environment jsdom

import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook} from "@testing-library/react";

import type {CustomerEventListCloudEvent} from
  "@/lib/customer/event-list/customer-event-list-cloud-transport";
import type {CustomerPackageEventListItem} from
  "@/lib/customer/event-list/customer-event-list";
import {fromWebList} from
  "@/lib/customer/event-list/customer-event-list-cloud-contract";

const mocks = vi.hoisted(() => {
  const userA = {uid: "customer-A"};
  const userB = {uid: "customer-B"};

  return {
    userA,
    userB,
    currentUser: userA,
    session: {user: userA, generation: 1},
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    send: vi.fn(),
  };
});

vi.mock("@/lib/firebase/client", () => ({
  auth: {
    get currentUser() {
      return mocks.currentUser;
    },
  },
}));

vi.mock("@/lib/customer/event-list/customer-event-list", () => ({
  useCustomerEventListSession: () => mocks.session,
}));

// Enable cloud ONLY in this test module.
vi.mock(
  "@/lib/customer/event-list/customer-event-list-cloud-transport",
  () => ({
    CUSTOMER_EVENT_LIST_CLOUD_ENABLED: true,
    subscribeCustomerEventListCloud: mocks.subscribe,
    sendCustomerEventListMutation: mocks.send,
  }),
);

import {useCustomerEventListCloudAsync} from
  "@/lib/customer/event-list/use-customer-event-list-cloud-async";

const packageItem: CustomerPackageEventListItem = {
  type: "package",
  packageId: "package-one",
  providerId: "provider-one",
  packageName: "Package One",
  providerName: "Provider One",
  price: 1500,
  imageUrl: null,
  packageHref: "/customer/packages/package-one",
  configuration: null,
};

function cloudDocument(revision: number) {
  return {
    ...fromWebList("customer-A", [], null),
    revision,
  };
}

function mutationResult(revision: number) {
  return {
    version: 1 as const,
    revision,
    changed: true,
    migrationReviewRequired: false,
    removedIdentities: [],
    preservedIdentities: [],
    replayed: false,
  };
}

let callbacks: Array<(event: CustomerEventListCloudEvent) => void> = [];

function emit(event: CustomerEventListCloudEvent, index = 0) {
  const callback = callbacks[index];
  if (!callback) throw new Error("Expected a cloud subscription.");

  act(() => callback(event));
}

function renderReadyHook() {
  const hook = renderHook(() => useCustomerEventListCloudAsync());

  emit({
    status: "ready",
    document: cloudDocument(2),
  });

  expect(hook.result.current.state.status).toBe("ready");
  return hook;
}

describe("Web Event List async hook enabled-mode simulation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    callbacks = [];
    mocks.currentUser = mocks.userA;
    mocks.session.user = mocks.userA;
    mocks.session.generation = 1;

    mocks.subscribe.mockImplementation(
      (
        _user: unknown,
        _isCurrent: () => boolean,
        onEvent: (event: CustomerEventListCloudEvent) => void,
      ) => {
        callbacks.push(onEvent);
        return mocks.unsubscribe;
      },
    );
  });

  it("exposes the confirmed Firestore document", () => {
    const hook = renderReadyHook();

    expect(hook.result.current.enabled).toBe(true);
    expect(hook.result.current.state.document?.revision).toBe(2);
    expect(mocks.subscribe).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();

    hook.unmount();
  });

  it("waits for the confirmed snapshot after callable acceptance", async () => {
    const hook = renderReadyHook();
    mocks.send.mockResolvedValue(mutationResult(3));

    let outcome:
      Awaited<ReturnType<typeof hook.result.current.saveItemAsync>> |
      undefined;

    await act(async () => {
      outcome = await hook.result.current.saveItemAsync(packageItem);
    });

    expect(outcome).toMatchObject({
      revision: 3,
      status: "awaiting_snapshot",
    });

    expect(hook.result.current.state.status).toBe("pending");
    expect(hook.result.current.state.pendingRevision).toBe(3);
    expect(hook.result.current.state.document?.revision).toBe(2);

    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0]?.[1]).toMatchObject({
      version: 1,
      action: "add",
      expectedRevision: 2,
    });

    emit({
      status: "ready",
      document: cloudDocument(3),
    });

    expect(hook.result.current.state.status).toBe("ready");
    expect(hook.result.current.state.pendingRevision).toBeNull();
    expect(hook.result.current.state.document?.revision).toBe(3);

    hook.unmount();
  });

  it("preserves confirmed data when the callable fails", async () => {
    const hook = renderReadyHook();
    mocks.send.mockRejectedValue(new Error("network-unavailable"));

    let failure: unknown;

    await act(async () => {
      try {
        await hook.result.current.saveItemAsync(packageItem);
      } catch (error) {
        failure = error;
      }
    });

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("network-unavailable");
    expect(hook.result.current.state.status).toBe("error");
    expect(hook.result.current.state.document?.revision).toBe(2);

    hook.unmount();
  });

  it("ignores the previous customer's subscription after account change", () => {
    const hook = renderReadyHook();

    act(() => {
      mocks.currentUser = mocks.userB;
      mocks.session.user = mocks.userB;
      mocks.session.generation = 2;
      hook.rerender();
    });

    expect(hook.result.current.state.document).toBeNull();

    // This callback belongs to the old customer-A subscription.
    emit({
      status: "ready",
      document: cloudDocument(9),
    }, 0);

    expect(hook.result.current.state.document?.revision).not.toBe(9);
    expect(mocks.unsubscribe).toHaveBeenCalled();

    hook.unmount();
  });

  it("blocks duplicate saves while a mutation is unresolved", async () => {
    const hook = renderReadyHook();

    let finish!: (value: ReturnType<typeof mutationResult>) => void;

    mocks.send.mockImplementation(
      () => new Promise((resolve) => {
        finish = resolve;
      }),
    );

    let first!: ReturnType<typeof hook.result.current.saveItemAsync>;

    act(() => {
      first = hook.result.current.saveItemAsync(packageItem);
    });

    await expect(
      hook.result.current.saveItemAsync(packageItem),
    ).rejects.toThrow(/pending/i);

    expect(mocks.send).toHaveBeenCalledOnce();

    await act(async () => {
      finish(mutationResult(3));
      await first;
    });

    expect(hook.result.current.state.status).toBe("pending");

    hook.unmount();
  });

  it("rejects first-time saves until cloud initialization exists", async () => {
    const hook = renderHook(() => useCustomerEventListCloudAsync());

    emit({status: "missing"});

    await expect(
      hook.result.current.saveItemAsync(packageItem),
    ).rejects.toThrow(/not ready/i);

    expect(mocks.send).not.toHaveBeenCalled();

    hook.unmount();
  });
});