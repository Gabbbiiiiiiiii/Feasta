// @vitest-environment jsdom

import {beforeEach, describe, expect, it, vi} from "vitest";
import {fireEvent, render, screen} from "@testing-library/react";

import type {CustomerPackageEventListItem} from
  "@/lib/customer/event-list/customer-event-list";

const mocks = vi.hoisted(() => ({
  items: [] as Array<{packageId: string}>,
  addItem: vi.fn(),
}));

vi.mock("@/lib/customer/event-list/customer-event-list", () => ({
  customerEventListItemKey: (item: {packageId: string}) =>
    item.packageId,
  useCustomerEventList: () => ({
    items: mocks.items,
    addItem: mocks.addItem,
  }),
}));

vi.mock(
  "@/lib/customer/event-list/use-customer-event-list-cloud-async",
  () => ({useCustomerEventListCloudAsync: () => ({
    enabled: false,
    state: {status: "idle", document: null, error: null, pendingRevision: null},
    recovery: null,
  })}),
);

vi.mock(
  "@/lib/customer/event-list/customer-event-list-cloud-transport",
  () => ({
    CUSTOMER_EVENT_LIST_CLOUD_ENABLED: false,
  }),
);

import {AddToEventListButton} from
  "@/components/customer/event-list/add-to-event-list-button";

const packageItem: CustomerPackageEventListItem = {
  type: "package",
  providerId: "provider-feedback-test",
  packageId: "package-feedback-test",
  packageName: "Feedback Test Package",
  providerName: "Feedback Test Provider",
  price: 1500,
  imageUrl: null,
  packageHref: "/customer/packages/package-feedback-test",
  configuration: null,
};

describe("Add to Event List button feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.items = [];
  });

  it("shows an accessible error when local saving fails", () => {
    mocks.addItem.mockReturnValue(false);

    render(<AddToEventListButton item={packageItem} />);

    const button = screen.getByRole("button", {
      name: "Add to List",
    });

    expect(button.hasAttribute("disabled")).toBe(false);

    fireEvent.click(button);

    expect(mocks.addItem).toHaveBeenCalledOnce();
    expect(mocks.addItem).toHaveBeenCalledWith(packageItem);

    const error = screen.getByRole("alert");

    expect(error.textContent).toContain(
      "Could not save this selection.",
    );

    expect(
      screen.getByRole("button", {name: "Add to List"})
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("shows Added to List without an error after a successful save", () => {
    mocks.addItem.mockReturnValue(true);

    const view = render(
      <AddToEventListButton item={packageItem} />,
    );

    fireEvent.click(
      screen.getByRole("button", {name: "Add to List"}),
    );

    expect(mocks.addItem).toHaveBeenCalledOnce();
    expect(mocks.addItem).toHaveBeenCalledWith(packageItem);
    expect(screen.queryByRole("alert")).toBeNull();

    // Simulate the existing Event List hook publishing its saved items.
    mocks.items = [{packageId: packageItem.packageId}];
    view.rerender(
      <AddToEventListButton item={packageItem} />,
    );

    const addedButton = screen.getByRole("button", {
      name: "Added to List",
    });

    expect(addedButton.hasAttribute("disabled")).toBe(true);
    expect(addedButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(addedButton);
    expect(mocks.addItem).toHaveBeenCalledOnce();
  });
});