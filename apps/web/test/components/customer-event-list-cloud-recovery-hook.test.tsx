// @vitest-environment jsdom

import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook} from "@testing-library/react";
import type {CustomerEventListCloudEvent} from
  "@/lib/customer/event-list/customer-event-list-cloud-transport";
import {fromWebList} from
  "@/lib/customer/event-list/customer-event-list-cloud-contract";

const mocks = vi.hoisted(() => {
  const a = {uid: "customer-A"};
  const b = {uid: "customer-B"};
  return {
    a, b, current: a,
    session: {user: a, generation: 1},
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    send: vi.fn(),
  };
});

vi.mock("@/lib/firebase/client", () => ({
  auth: {
    get currentUser() { return mocks.current; },
  },
}));

vi.mock("@/lib/customer/event-list/customer-event-list", () => ({
  useCustomerEventListSession: () => mocks.session,
}));

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

const item = {
  type: "package" as const,
  providerId: "provider-one",
  packageId: "package-one",
  providerName: "Provider One",
  packageName: "Package One",
  price: 1500,
  imageUrl: null,
  packageHref: "/customer/packages/package-one",
  configuration: null,
};

const accepted = (revision: number, replayed = false) => ({
  version: 1 as const, revision, changed: true,
  migrationReviewRequired: false, removedIdentities: [],
  preservedIdentities: [], replayed,
});

let callbacks: Array<(event: CustomerEventListCloudEvent) => void> = [];

function emit(event: CustomerEventListCloudEvent, index = 0) {
  const callback = callbacks[index];
  if (!callback) throw new Error("Missing subscription callback.");
  act(() => callback(event));
}

function ready(revision = 2) {
  const hook = renderHook(() => useCustomerEventListCloudAsync());
  emit({
    status: "ready",
    document: {
      ...fromWebList("customer-A", [], null),
      revision,
    },
  });
  return hook;
}

describe("Event List hook recovery integration", () => {
  beforeEach(() => {
    // Clear one-shot implementations as well as call history.
    vi.resetAllMocks();
    window.sessionStorage.clear();
    callbacks = [];
    mocks.current = mocks.a;
    mocks.session.user = mocks.a;
    mocks.session.generation = 1;
    mocks.subscribe.mockImplementation(
      (_user: unknown, _current: () => boolean,
        callback: (event: CustomerEventListCloudEvent) => void) => {
        callbacks.push(callback);
        return mocks.unsubscribe;
      },
    );
  });

  it("retries the same command after an uncertain response", async () => {
    const hook = ready();

    mocks.send.mockRejectedValueOnce(new Error("network timeout"));
    mocks.send.mockResolvedValueOnce(accepted(3, true));

    let failure: unknown;
    await act(async () => {
      try {
        await hook.result.current.saveItemAsync(item);
      } catch (error) {
        failure = error;
      }
    });

    expect((failure as Error).message).toContain("network timeout");
    expect(hook.result.current.recovery?.status).toBe("uncertain");
    expect(hook.result.current.state.status).toBe("error");
    expect(hook.result.current.state.document?.revision).toBe(2);

    await expect(
      hook.result.current.saveItemAsync(item),
    ).rejects.toThrow(/pending recovery/i);

    let outcome: Awaited<
      ReturnType<typeof hook.result.current.retryUncertainAsync>
    > | undefined;

    await act(async () => {
      outcome = await hook.result.current.retryUncertainAsync();
    });

    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0]?.[1])
      .toEqual(mocks.send.mock.calls[1]?.[1]);
    expect(outcome?.requestId)
      .toBe(mocks.send.mock.calls[0]?.[1].requestId);
    expect(outcome?.status).toBe("awaiting_snapshot");

    emit({
      status: "ready",
      document: {...fromWebList("customer-A", [item], null), revision: 3},
    });

    expect(hook.result.current.recovery?.status).toBe("confirmed");
    expect(hook.result.current.state.status).toBe("ready");

    hook.unmount();
  });

  it("does not treat an unrelated newer snapshot as proof after timeout", async () => {
    const hook = ready();
    mocks.send.mockRejectedValueOnce(new Error("response lost"));

    await act(async () => {
      await hook.result.current.saveItemAsync(item).catch(() => undefined);
    });

    emit({
      status: "ready",
      document: {...fromWebList("customer-A", [], null), revision: 50},
    });

    expect(hook.result.current.recovery?.status).toBe("uncertain");
    expect(hook.result.current.state.status).toBe("error");
    expect(hook.result.current.state.document?.revision).toBe(50);
    hook.unmount();
  });

  it("allows a subsequent mutation after confirmed synchronization", async () => {
    const hook = ready();
    mocks.send.mockResolvedValueOnce(accepted(3));
    mocks.send.mockResolvedValueOnce(accepted(4));

    await act(async () => {
      await hook.result.current.saveItemAsync(item);
    });
    emit({
      status: "ready",
      document: {...fromWebList("customer-A", [item], null), revision: 3},
    });

    expect(hook.result.current.recovery?.status).toBe("confirmed");

    await act(async () => {
      await hook.result.current.saveItemAsync({
        ...item, packageName: "Revised Package",
      });
    });

    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1]?.[1]).toMatchObject({
      action: "update",
      expectedRevision: 3,
    });
    hook.unmount();
  });

  it("invalidates uncertain recovery when accounts change", async () => {
    const hook = ready();
    mocks.send.mockRejectedValueOnce(new Error("timeout"));

    await act(async () => {
      await hook.result.current.saveItemAsync(item).catch(() => undefined);
    });

    act(() => {
      mocks.current = mocks.b;
      mocks.session.user = mocks.b;
      mocks.session.generation = 2;
      hook.rerender();
    });

    expect(hook.result.current.recovery).toBeNull();

    // The new session has no inherited recovery capability.
    await expect(
      hook.result.current.retryUncertainAsync(),
    ).rejects.toThrow(/uncertain/i);

    // An old customer request is never replayed under the new account.
    expect(mocks.send).toHaveBeenCalledOnce();
    hook.unmount();
  });

  it("keeps initialization pending until its snapshot arrives", async () => {
    const hook = renderHook(() => useCustomerEventListCloudAsync());
    emit({status: "missing"});
    mocks.send.mockResolvedValueOnce(accepted(0));

    await act(async () => {
      await hook.result.current.initializeCloudListAsync([item], null);
    });

    expect(hook.result.current.state.status).toBe("pending");
    expect(mocks.send.mock.calls[0]?.[1].action).toBe("import");

    emit({
      status: "ready",
      document: fromWebList("customer-A", [item], null),
    });
    expect(hook.result.current.recovery?.status).toBe("confirmed");
    expect(hook.result.current.state.status).toBe("ready");
    hook.unmount();
  });
});