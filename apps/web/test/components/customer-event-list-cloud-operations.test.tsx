// @vitest-environment jsdom
import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, renderHook} from "@testing-library/react";
import type {CustomerEventListCloudEvent} from
  "@/lib/customer/event-list/customer-event-list-cloud-transport";
import {fromWebList} from
  "@/lib/customer/event-list/customer-event-list-cloud-contract";
import fixtures from "../../../../contracts/customer-event-list/fixtures.json";
import {decodeDocument} from "@/lib/customer/event-list/customer-event-list-cloud-contract";

const mocks = vi.hoisted(() => {
  const user = {uid: "cloud-operations-customer"};
  return {user, subscribe: vi.fn(), unsubscribe: vi.fn(), send: vi.fn()};
});
vi.mock("@/lib/firebase/client", () => ({auth: {currentUser: mocks.user}}));
vi.mock("@/lib/customer/event-list/customer-event-list", () => ({
  useCustomerEventListSession: () => ({user: mocks.user, generation: 1}),
}));
vi.mock("@/lib/customer/event-list/customer-event-list-cloud-transport", () => ({
  CUSTOMER_EVENT_LIST_CLOUD_ENABLED: true,
  subscribeCustomerEventListCloud: mocks.subscribe,
  sendCustomerEventListMutation: mocks.send,
}));
import {useCustomerEventListCloudAsync} from
  "@/lib/customer/event-list/use-customer-event-list-cloud-async";

const item = {type: "package" as const,
  providerId: "provider-ops", packageId: "package-ops",
  providerName: "Provider Ops", packageName: "Package Ops",
  price: 2000, imageUrl: null,
  packageHref: "/customer/packages/package-ops", configuration: null,
};
const response = (revision: number) => ({version: 1 as const,
  revision, changed: true, migrationReviewRequired: false,
  removedIdentities: [], preservedIdentities: [], replayed: false});
let onEvent: (event: CustomerEventListCloudEvent) => void;
function emit(revision: number, items: typeof item[]) {
  act(() => onEvent({status: "ready", document: {
    ...fromWebList(mocks.user.uid, items, null), revision,
  }}));
}

describe("Cloud Event List remove/clear/schedule commands", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.sessionStorage.clear();
    mocks.subscribe.mockImplementation(
      (_user: unknown, _check: unknown, callback: typeof onEvent) => {
        onEvent = callback;
        return mocks.unsubscribe;
      },
    );
  });

  it("updates Mobile canonical data and rejects another edit until confirmed", async () => {
    const hook = renderHook(() => useCustomerEventListCloudAsync());
    const document = decodeDocument({...structuredClone(fixtures.document), ownerUid: mocks.user.uid}, mocks.user.uid);
    const original = document.entries[1];
    act(() => onEvent({status: "ready", document}));
    mocks.send.mockResolvedValue(response(1));
    await act(async () => { await hook.result.current.editCanonicalConfigurationAsync(original, {
      event: {...original.configuration!.event as object, eventAddress: "Edited from Web"},
    }); });
    expect(mocks.send.mock.calls[0]?.[1]).toMatchObject({action: "update", expectedRevision: 0,
      entry: {...original, configuration: {...original.configuration, event: {...original.configuration!.event as object, eventAddress: "Edited from Web"}}},
    });
    await expect(hook.result.current.editCanonicalConfigurationAsync(original, {})).rejects.toThrow(/pending recovery/i);
    hook.unmount();
  });

  it("rejects a stale Mobile entry without sending a mutation", async () => {
    const hook = renderHook(() => useCustomerEventListCloudAsync());
    const document = decodeDocument({...structuredClone(fixtures.document), ownerUid: mocks.user.uid}, mocks.user.uid);
    const original = structuredClone(document.entries[1]);
    document.entries[1].name = "Changed on Mobile";
    act(() => onEvent({status: "ready", document}));
    await expect(hook.result.current.editCanonicalConfigurationAsync(original, {})).rejects.toThrow(/changed on another device/i);
    expect(mocks.send).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("removes the exact canonical entry after server-confirmed revision", async () => {
    const hook = renderHook(() => useCustomerEventListCloudAsync());
    emit(2, [item]);
    mocks.send.mockResolvedValue(response(3));
    await act(async () => { await hook.result.current.removeItemAsync(item); });
    expect(mocks.send.mock.calls[0]?.[1]).toMatchObject({
      action: "remove", expectedRevision: 2,
      identity: "catering_package:provider-ops:package-ops",
    });
    expect(hook.result.current.recovery?.status).toBe("awaiting_snapshot");
    emit(3, []);
    expect(hook.result.current.recovery?.status).toBe("confirmed");
    hook.unmount();
  });

  it("schedules and clears sequentially only after confirmation", async () => {
    const hook = renderHook(() => useCustomerEventListCloudAsync());
    emit(1, [item]);
    mocks.send.mockResolvedValueOnce(response(2));
    mocks.send.mockResolvedValueOnce(response(3));
    await act(async () => {
      await hook.result.current.writeScheduleAsync({
        eventDate: "2026-12-03", eventTime: "10:30",
      });
    });
    expect(mocks.send.mock.calls[0]?.[1]).toMatchObject({
      action: "schedule", expectedRevision: 1,
      schedule: {eventDate: "2026-12-03", eventTime: "10:30"},
    });
    await expect(hook.result.current.clearListAsync())
      .rejects.toThrow(/pending recovery/i);
    emit(2, [item]);
    await act(async () => { await hook.result.current.clearListAsync(); });
    expect(mocks.send.mock.calls[1]?.[1]).toMatchObject({
      action: "clear", expectedRevision: 2,
    });
    hook.unmount();
  });
});
