// @vitest-environment jsdom

import {describe, expect, it, vi} from "vitest";
import {renderHook} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  subscription: vi.fn(),
  mutation: vi.fn(),
  session: {
    user: {uid: "customer-hook-test"},
    generation: 1,
  },
}));

vi.mock("@/lib/firebase/client", () => ({
  auth: {currentUser: mocks.session.user},
}));

vi.mock("@/lib/customer/event-list/customer-event-list", () => ({
  useCustomerEventListSession: () => mocks.session,
}));

vi.mock(
  "@/lib/customer/event-list/customer-event-list-cloud-transport",
  () => ({
    CUSTOMER_EVENT_LIST_CLOUD_ENABLED: false,
    subscribeCustomerEventListCloud: mocks.subscription,
    sendCustomerEventListMutation: mocks.mutation,
  }),
);

import {useCustomerEventListCloudAsync} from
  "@/lib/customer/event-list/use-customer-event-list-cloud-async";

describe("Web Event List async cloud hook disabled state", () => {
  it("does not subscribe or mutate when the cloud gate is off", () => {
    const {result, unmount} = renderHook(
      () => useCustomerEventListCloudAsync(),
    );

    expect(result.current.enabled).toBe(false);
    expect(result.current.state.status).toBe("idle");
    expect(result.current.state.document).toBeNull();
    expect(mocks.subscription).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();

    unmount();
  });

  it("rejects cloud saves without touching Firebase transport", async () => {
    const {result} = renderHook(
      () => useCustomerEventListCloudAsync(),
    );

    await expect(result.current.saveItemAsync({
      type: "package",
      packageId: "package-hook-test",
      providerId: "provider-hook-test",
      packageName: "Test package",
      providerName: "Test provider",
      price: 1000,
      imageUrl: null,
      packageHref: "/customer/packages/package-hook-test",
      configuration: null,
    })).rejects.toThrow(/disabled/i);

    expect(mocks.subscription).not.toHaveBeenCalled();
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
});