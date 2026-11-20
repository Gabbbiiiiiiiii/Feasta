// @vitest-environment jsdom

import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  callable: vi.fn(),
  subscribe: vi.fn(),
  document: vi.fn(),
  decode: vi.fn(),
}));

vi.mock("@/lib/firebase/client", () => ({
  auth: {
    currentUser: {uid: "customer-test"},
  },
  db: {},
  functions: {},
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: mocks.callable,
}));

vi.mock("firebase/firestore", () => ({
  doc: mocks.document,
  onSnapshot: mocks.subscribe,
}));

vi.mock(
  "@/lib/customer/event-list/customer-event-list-cloud-contract",
  () => ({
    decodeDocument: mocks.decode,
  }),
);

import {auth} from "@/lib/firebase/client";
import {
  CUSTOMER_EVENT_LIST_CLOUD_ENABLED,
  sendCustomerEventListMutation,
  subscribeCustomerEventListCloud,
  readCustomerEventListCloud,
} from "@/lib/customer/event-list/customer-event-list-cloud-transport";
import type {User} from "firebase/auth";

const customer = auth.currentUser as User;

describe("Customer Event List cloud transport safety gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("restores only a server-confirmed cloud document and closes its listener", async () => {
    const unsubscribe = vi.fn();
    mocks.subscribe.mockReturnValue(unsubscribe);
    const document = {ownerUid: customer.uid, revision: 2};
    mocks.decode.mockReturnValue(document);
    const restored = readCustomerEventListCloud(customer, () => true);
    const next = mocks.subscribe.mock.calls[0][2];
    const data = vi.fn(() => document);
    next({metadata: {fromCache: true, hasPendingWrites: false}, exists: () => true, data});
    expect(data).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    next({metadata: {fromCache: false, hasPendingWrites: false}, exists: () => true, data});
    await expect(restored).resolves.toEqual(document);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("does not restore a cloud edit for an invalidated customer session", async () => {
    await expect(readCustomerEventListCloud(customer, () => false)).rejects.toThrow(/session/i);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("does not contact Firebase merely by importing the transport", () => {
    expect(mocks.callable).not.toHaveBeenCalled();
    expect(mocks.document).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("rejects an invalidated session without contacting Cloud Functions", async () => {
    await expect(
      sendCustomerEventListMutation(
        customer,
        {
          version: 1,
          requestId: "test-request-00001",
          expectedRevision: 0,
          action: "clear",
        },
        () => false,
      ),
    ).rejects.toThrow(/disabled|session/i);

    expect(mocks.callable).not.toHaveBeenCalled();
  });

  it("does not create a Firestore listener for an invalidated session", () => {
    const callback = vi.fn();

    const unsubscribe = subscribeCustomerEventListCloud(
      customer,
      () => false,
      callback,
    );

    expect(typeof unsubscribe).toBe("function");
    unsubscribe();

    expect(mocks.document).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not modify existing local Event List data", async () => {
    const key = "feasta.customer.event-list.v1:uid:customer-test";
    const existing = JSON.stringify({
      version: 1,
      items: [{packageId: "saved-package"}],
    });

    window.localStorage.setItem(key, existing);

    const writes = vi.spyOn(Storage.prototype, "setItem");
    const removals = vi.spyOn(Storage.prototype, "removeItem");
    const clears = vi.spyOn(Storage.prototype, "clear");

    try {
      await expect(
        sendCustomerEventListMutation(
          customer,
          {
            version: 1,
            requestId: "test-request-00002",
            expectedRevision: 0,
            action: "clear",
          },
          () => false,
        ),
      ).rejects.toThrow(/disabled|session/i);

      subscribeCustomerEventListCloud(
        customer,
        () => false,
        vi.fn(),
      )();

      expect(window.localStorage.getItem(key)).toBe(existing);
      expect(writes).not.toHaveBeenCalled();
      expect(removals).not.toHaveBeenCalled();
      expect(clears).not.toHaveBeenCalled();
    } finally {
      writes.mockRestore();
      removals.mockRestore();
      clears.mockRestore();
    }
  });

  it.runIf(CUSTOMER_EVENT_LIST_CLOUD_ENABLED)("sends enabled mutations through the mocked callable only", async () => {
    const response = {version: 1, revision: 1, changed: true, replayed: false,
      migrationReviewRequired: false, removedIdentities: [], preservedIdentities: []};
    const invoke = vi.fn().mockResolvedValue({data: response});
    mocks.callable.mockReturnValue(invoke);
    const command = {version: 1 as const, requestId: "test-request-enabled", expectedRevision: 0,
      action: "clear" as const};
    await expect(sendCustomerEventListMutation(customer, command, () => true)).resolves.toEqual(response);
    expect(mocks.callable).toHaveBeenCalledWith({}, "mutateCustomerEventList");
    expect(invoke).toHaveBeenCalledExactlyOnceWith(command);
  });

  it.runIf(CUSTOMER_EVENT_LIST_CLOUD_ENABLED)("subscribes through the mocked Firestore SDK only", () => {
    const reference = {};
    const unsubscribe = vi.fn();
    mocks.document.mockReturnValue(reference);
    mocks.subscribe.mockReturnValue(unsubscribe);
    expect(subscribeCustomerEventListCloud(customer, () => true, vi.fn())).toBe(unsubscribe);
    expect(mocks.document).toHaveBeenCalledWith({}, "customerEventLists", customer.uid);
    expect(mocks.subscribe).toHaveBeenCalledWith(reference,
      {includeMetadataChanges: true}, expect.any(Function), expect.any(Function));
  });
});
