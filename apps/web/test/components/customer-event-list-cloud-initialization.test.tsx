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
  const user = {uid: "customer-init-test"};
  return {
    user,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    send: vi.fn(),
  };
});

vi.mock("@/lib/firebase/client", () => ({
  auth: {currentUser: mocks.user},
}));

vi.mock("@/lib/customer/event-list/customer-event-list", () => ({
  useCustomerEventListSession: () => ({
    user: mocks.user,
    generation: 1,
  }),
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

const item: CustomerPackageEventListItem = {
  type: "package",
  providerId: "provider-init",
  packageId: "package-init",
  packageName: "Initialization Package",
  providerName: "Initialization Provider",
  price: 1200,
  imageUrl: null,
  packageHref: "/customer/packages/package-init",
  configuration: null,
};

let emit: (event: CustomerEventListCloudEvent) => void;

describe("Web cloud Event List first-time initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();

    mocks.subscribe.mockImplementation(
      (
        _user: unknown,
        _current: () => boolean,
        onEvent: (event: CustomerEventListCloudEvent) => void,
      ) => {
        emit = onEvent;
        return mocks.unsubscribe;
      },
    );
  });

  it("imports local planning only after a confirmed missing snapshot", async () => {
    const hook = renderHook(() => useCustomerEventListCloudAsync());

    act(() => emit({status: "missing"}));

    mocks.send.mockResolvedValue({
      version: 1,
      revision: 0,
      changed: true,
      migrationReviewRequired: false,
      removedIdentities: [],
      preservedIdentities: [],
      replayed: false,
    });

    let outcome:
      Awaited<
        ReturnType<typeof hook.result.current.initializeCloudListAsync>
      > | undefined;

    await act(async () => {
      outcome = await hook.result.current.initializeCloudListAsync(
        [item],
        null,
      );
    });

    expect(mocks.send).toHaveBeenCalledOnce();

    const request = mocks.send.mock.calls[0]?.[1];

    expect(request).toMatchObject({
      version: 1,
      action: "import",
      expectedRevision: null,
    });

    expect(request.local.entries).toHaveLength(1);
    expect(outcome?.status).toBe("awaiting_snapshot");
    expect(hook.result.current.state.status).toBe("pending");

    act(() => emit({
      status: "ready",
      document: fromWebList(mocks.user.uid, [item], null),
    }));

    expect(hook.result.current.state.status).toBe("ready");
    expect(hook.result.current.state.document?.entries).toHaveLength(1);

    hook.unmount();
  });

  it("refuses to replace an existing cloud Event List", async () => {
    const hook = renderHook(() => useCustomerEventListCloudAsync());

    act(() => emit({
      status: "ready",
      document: fromWebList(mocks.user.uid, [], null),
    }));

    await expect(
      hook.result.current.initializeCloudListAsync([item], null),
    ).rejects.toThrow(/missing document/i);

    expect(mocks.send).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("refuses initialization before cloud state is confirmed", async () => {
    const hook = renderHook(() => useCustomerEventListCloudAsync());

    await expect(
      hook.result.current.initializeCloudListAsync([item], null),
    ).rejects.toThrow(/missing document/i);

    expect(mocks.send).not.toHaveBeenCalled();
    hook.unmount();
  });
});