import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, expect, it} from "vitest";
import {CustomerProviderMenu} from "@/components/customer/providers/customer-provider-menu";
import {CustomerEventListMenu} from "@/components/customer/event-list/customer-event-list-menu";
import {AddToEventListButton} from "@/components/customer/event-list/add-to-event-list-button";
import {addCustomerEventListItem, readCustomerEventList, removeCustomerEventListItem, removeCustomerEventListService, customerEventListItemKey} from "@/lib/customer/event-list/customer-event-list";
import type {CustomerCustomMenuEventListItem, CustomerPackageEventListItem} from "@/lib/customer/event-list/customer-event-list";

const storageKey = "feasta.customer.event-list.v1";
const image = {id: "beef", title: "Beef Steak", url: "https://example.com/beef.jpg", isPublished: true, description: "Tender seasoned beef", category: "Beef", servingOptions: [
  {id: "party", name: "Party Size", description: "For sharing", minimumGuests: 30, maximumGuests: 30, price: 2100},
  {id: "family", name: "Family Size", description: "Family meal", minimumGuests: 15, maximumGuests: 20, price: 1050},
]};
const custom: CustomerCustomMenuEventListItem = {type: "custom_menu", key: "custom-menu:provider:beef", providerId: "provider", providerName: "SB Catering", menuItemId: "beef", menuItemName: "Beef Steak", servingOptionId: "family", servingOptionName: "Family Size", servingDescription: "Family meal", servingMinimumGuests: 15, servingMaximumGuests: 20, price: 1050, imageUrl: image.url, providerHref: "/customer/providers/provider"};
const packageItem: CustomerPackageEventListItem = {packageId: "package", providerId: "provider", packageName: "Celebration", providerName: "SB Catering", price: 5000, imageUrl: image.url, packageHref: "/customer/packages/package"};

beforeEach(() => window.localStorage.clear());

it("requires a serving size and event schedule, saves the choice and opens the drawer", async () => {
  const user = userEvent.setup();
  render(<><CustomerProviderMenu providerId="provider" providerName="SB Catering" menuImages={[image]} /><CustomerEventListMenu /></>);
  expect(screen.getByText(/From.*1,050/)).toBeVisible();
  await user.click(screen.getByRole("button", {name: "View Beef Steak"}));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Tender seasoned beef")).toBeVisible();
  const add = within(dialog).getByRole("button", {name: "Add to List"});
  expect(add).toBeDisabled();
  const radio = within(dialog).getByRole("radio", {name: /Family Size/});
  radio.focus();
  await user.keyboard(" ");
  expect(radio).toBeChecked();

  // Serving size alone is not enough.
  expect(add).toBeDisabled();

  fireEvent.change(
    within(dialog).getByLabelText("Event date *"),
    {
      target: {
        value: "2026-12-01",
      },
    },
  );

  // Date without time is still incomplete.
  expect(add).toBeDisabled();

  fireEvent.change(
    within(dialog).getByLabelText("Serving / event time *"),
    {
      target: {
        value: "18:00",
      },
    },
  );

  expect(add).toBeEnabled();

  await user.click(add);
  expect(readCustomerEventList()).toEqual([custom]);
  await waitFor(() => expect(screen.getByRole("button", {name: "Open Event List, 1 selected service"})).toHaveAttribute("aria-expanded", "true"));
  expect(screen.getByText(/Added to List: Beef Steak/)).toBeInTheDocument();
  expect(screen.getByText(/Family Size \u00b7 Good for 15–20 guests/)).toBeVisible();
  expect(screen.getByRole("link", {name: /Review List/})).toHaveAttribute("href", "/customer/event-list/review");
  await user.click(screen.getByRole("button", {name: "Remove Beef Steak from Event List"}));
  expect(readCustomerEventList()).toEqual([]);
});

it("replaces a serving choice through the modal and lets different menu items coexist", async () => {
  const user = userEvent.setup();
  render(<CustomerProviderMenu providerId="provider" providerName="SB Catering" menuImages={[image, {...image, id: "chicken", title: "Chicken"}]} />);
  let selectionIndex = 0;

  for (
    const [title, size] of [
      ["Beef Steak", "Family Size"],
      ["Beef Steak", "Party Size"],
      ["Chicken", "Family Size"],
    ]
  ) {
    await user.click(
      screen.getByRole(
        "button",
        {
          name: `View ${title}`,
        },
      ),
    );

    const dialog =
      screen.getByRole("dialog");

    const add =
      within(dialog).getByRole(
        "button",
        {
          name: "Add to List",
        },
      );

    expect(add).toBeDisabled();

    await user.click(
      within(dialog).getByRole(
        "radio",
        {
          name:
            new RegExp(size!),
        },
      ),
    );

    const eventDate =
      within(dialog).getByLabelText(
        "Event date *",
      );

    const eventTime =
      within(dialog).getByLabelText(
        "Serving / event time *",
      );

    if (selectionIndex === 0) {
      fireEvent.change(
        eventDate,
        {
          target: {
            value:
              "2026-12-01",
          },
        },
      );

      fireEvent.change(
        eventTime,
        {
          target: {
            value:
              "18:00",
          },
        },
      );
    }
    else {
      // The Event List schedule must be shared
      // with every later menu selection.
      expect(
        eventDate,
      ).toHaveValue(
        "2026-12-01",
      );

      expect(
        eventTime,
      ).toHaveValue(
        "18:00",
      );
    }

    expect(add).toBeEnabled();

    await user.click(add);

    await waitFor(() =>
      expect(
        screen.queryByRole(
          "dialog",
        ),
      ).not.toBeInTheDocument(),
    );

    selectionIndex += 1;
  }
  const items = readCustomerEventList();
  expect(items).toHaveLength(2);
  expect(items.find((item) => customerEventListItemKey(item) === custom.key)).toMatchObject({servingOptionId: "party", price: 2100});
});

it("keeps legacy and invalid-option images browsing-only and restores focus", async () => {
  const user = userEvent.setup();
  render(<CustomerProviderMenu providerId="provider" providerName="SB Catering" menuImages={[{...image, servingOptions: undefined}, {...image, id: "invalid", title: "Invalid options", servingOptions: [{...image.servingOptions[0]!, price: 0}]}]} />);
  expect(screen.getAllByText("Browsing only")).toHaveLength(2);
  const card = screen.getByRole("button", {name: "View Beef Steak"});
  await user.click(card);
  expect(screen.getByText(/Serving options are not currently available/)).toBeVisible();
  expect(screen.queryByRole("button", {name: "Add to List"})).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(card).toHaveFocus());
});

it("loads legacy packages, preserves package button behavior and removes by package ID", async () => {
  window.localStorage.setItem(storageKey, JSON.stringify([packageItem]));
  addCustomerEventListItem(custom);
  removeCustomerEventListService("package", "missing");
  render(<AddToEventListButton item={packageItem} />);
  expect(screen.getByRole("button", {name: "Added to List"})).toBeDisabled();
  expect(readCustomerEventList()).toHaveLength(2);
  removeCustomerEventListItem("package");
  expect(readCustomerEventList()).toEqual([custom]);
});

it.each([
  {providerId: "../bad"}, {menuItemId: ""}, {servingOptionId: "x:y"}, {menuItemName: " "}, {providerName: ""}, {servingOptionName: ""},
  {imageUrl: "http://example.com/image.jpg"}, {imageUrl: "https://user:pass@example.com/image.jpg"},
  {servingGuestCount: 0}, {servingGuestCount: 1.5}, {price: 0}, {price: -1}, {price: Infinity},
  {providerHref: "https://example.com"}, {providerHref: "/customer/providers/../packages/package"}, {servingDescription: 4},
])("discards malformed custom records: %j", (changes) => {
  window.localStorage.setItem(storageKey, JSON.stringify([{...custom, ...changes}, packageItem]));
  expect(readCustomerEventList()).toHaveLength(1);
  expect(readCustomerEventList()[0]).toMatchObject({packageId: "package"});
});

it("derives identity from IDs instead of trusting stored keys", () => {
  addCustomerEventListItem({...custom, key: "forged"});
  addCustomerEventListItem({...custom, servingOptionId: "party", servingOptionName: "Party Size", price: 2100});
  expect(readCustomerEventList()).toHaveLength(1);
  expect(readCustomerEventList()[0]).toMatchObject({key: custom.key, servingOptionId: "party"});
});


it("counts custom prices alongside configured packages and reviews only the package", async () => {
  const user = userEvent.setup();
  addCustomerEventListItem({...packageItem, configuration: {
    event: {eventType: "birthday", eventDate: "2026-12-01", eventTime: "10:00", eventEndTime: "12:00", guestCount: 15, eventLocation: "Manila", eventAddress: "Main Street", specialRequest: ""},
    selectedFoods: [], selectedDecorations: [], selectedFurniture: [],
    selectedEventServices: [{id: "service", providerId: "provider", providerName: "SB Catering", name: "Flowers", category: null, price: 100}],
    willArrangeOwnAddOns: false, customerArrangedAddOnsNote: "", estimatedTotal: 5100,
  }});
  addCustomerEventListItem(custom);
  render(<CustomerEventListMenu />);
  await user.click(screen.getByRole("button", {name: "Open Event List, 3 selected services"}));
  expect(screen.getByRole("link", {name: /Review List/})).toHaveAttribute("href", "/customer/event-list/review");
  expect(screen.getByText(/6,150/)).toBeVisible();
  await user.click(screen.getByRole("button", {name: "Remove Flowers from Event List"}));
  expect(screen.getByText(/6,050/)).toBeVisible();
  expect(readCustomerEventList().find((item) => item.type !== "custom_menu")).toMatchObject({configuration: {estimatedTotal: 5000, selectedEventServices: []}});
});
