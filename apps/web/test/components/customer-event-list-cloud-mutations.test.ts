import {describe, expect, it, vi} from "vitest";
// Planning and disabled-API coverage must not depend on local activation.
// Enabled mutations are exercised separately by the cloud hook suites.
vi.mock("@/lib/customer/event-list/customer-event-list-cloud-transport", () => ({
  CUSTOMER_EVENT_LIST_CLOUD_ENABLED: false,
}));
import type {CustomerEventListItem} from
  "@/lib/customer/event-list/customer-event-list";
import {
  fromWebList,
} from "@/lib/customer/event-list/customer-event-list-cloud-contract";
import {
  CustomerEventListCloudMutationApi,
  planCloudClear,
  planCloudImport,
  planCloudRemove,
  planCloudSave,
  planCloudSchedule,
} from "@/lib/customer/event-list/customer-event-list-cloud-mutations";
import type {CustomerEventListCloudController} from
  "@/lib/customer/event-list/customer-event-list-cloud-controller";

const uid = "customer-test";
const requestId = "test-request-00001";

const packageItem: CustomerEventListItem = {
  type: "package",
  providerId: "provider-one",
  packageId: "package-one",
  packageName: "Package One",
  providerName: "Provider One",
  price: 1500,
  imageUrl: null,
  packageHref: "/customer/packages/package-one",
  configuration: null,
};

describe("Web Event List cloud mutation planning", () => {
  it("plans a new entry using cloud revision", () => {
    const cloud = fromWebList(uid, [], null);
    const input = planCloudSave(cloud, packageItem, requestId);

    expect(input.action).toBe("add");
    expect(input.expectedRevision).toBe(0);
    expect(input.requestId).toBe(requestId);
  });

  it("updates an existing identity rather than duplicating it", () => {
    const cloud = fromWebList(uid, [packageItem], null);
    const input = planCloudSave(cloud, packageItem, requestId);

    expect(input.action).toBe("update");
    expect(input.expectedRevision).toBe(0);
  });

  it("plans removal only for an existing canonical identity", () => {
    const cloud = fromWebList(uid, [packageItem], null);
    const identity = cloud.entries[0].identity;

    expect(planCloudRemove(cloud, identity, requestId)).toMatchObject({
      action: "remove",
      identity,
      expectedRevision: 0,
    });

    expect(() =>
      planCloudRemove(cloud, "missing-entry", requestId),
    ).toThrow(/no longer exists/i);
  });

  it("plans clear and schedule without changing cloud state", () => {
    const cloud = fromWebList(uid, [packageItem], null);

    expect(planCloudClear(cloud, requestId).action).toBe("clear");
    expect(planCloudSchedule(cloud, null, requestId)).toMatchObject({
      action: "schedule",
      schedule: null,
      expectedRevision: 0,
    });
    expect(cloud.entries).toHaveLength(1);
  });

  it("constructs a revision-zero import", () => {
    const input = planCloudImport(
      uid,
      [packageItem],
      null,
      requestId,
    );

    expect(input).toMatchObject({
      version: 1,
      action: "import",
      expectedRevision: null,
    });
    expect(
      (input.local as {revision: number}).revision,
    ).toBe(0);
  });

  it("rejects invalid request IDs", () => {
    const cloud = fromWebList(uid, [], null);

    expect(() =>
      planCloudClear(cloud, "short"),
    ).toThrow(/request ID/i);
  });

  it("cannot invoke the controller while cloud is disabled", async () => {
    const mutate = vi.fn();
    const controller = {
      mutate,
    } as unknown as CustomerEventListCloudController;

    const api = new CustomerEventListCloudMutationApi(controller);
    const input = planCloudClear(
      fromWebList(uid, [], null),
      requestId,
    );

    await expect(api.execute(input)).rejects.toThrow(/disabled/i);
    expect(mutate).not.toHaveBeenCalled();
  });
});
