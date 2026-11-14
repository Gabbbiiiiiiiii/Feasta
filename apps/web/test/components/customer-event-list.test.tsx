vi.mock("@/lib/firebase/client", () => ({auth: {currentUser: {uid: "test-customer"}}}));
vi.mock("firebase/auth", () => ({onAuthStateChanged: () => () => {}}));
vi.mock("@/app/customer/packages/event-list-labels", () => ({loadEventListPackageLabels: vi.fn(async () => null)}));
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {NextRequest} from "next/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {AddToEventListButton} from "@/components/customer/event-list/add-to-event-list-button";
import {CustomerEventListMenu} from "@/components/customer/event-list/customer-event-list-menu";
import {CustomerEventListReview} from "@/components/customer/event-list/customer-event-list-review";
import {PackageDetail} from "@/components/customer/packages/package-detail";
import {CustomerMarketplaceHeader} from "@/components/customer/layout/customer-marketplace-header";
import {normalizePublicProvider} from "@/lib/customer/providers/provider-normalization";
import type {PublicPackage} from "@/lib/customer/discovery/marketplace-types";
import {
  CUSTOMER_EVENT_LIST_MAX_ITEMS,
  CUSTOMER_EVENT_LIST_OPEN_EVENT,
  CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY,
  CUSTOMER_EVENT_LIST_STORAGE_KEY,
  addCustomerEventListItem,
  clearCustomerEventList,
  customerEventListItemKey,
  readCustomerEventList,
  readCustomerEventListSchedule,
  removeCustomerEventListItem,
  removeCustomerEventListService,
  writeCustomerEventListSchedule,
  type CustomerCustomMenuEventListItem,
  type CustomerPackageEventListItem,
} from "@/lib/customer/event-list/customer-event-list";
import {proxy} from "@/proxy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: vi.fn(), replace: vi.fn()}),
  usePathname: () => "/customer/packages",
  useSearchParams: () => new URLSearchParams(),
}));

const packageItem: CustomerPackageEventListItem = {
  type: "package",
  packageId: "package-one",
  providerId: "provider-one",
  packageName: "Garden Celebration",
  providerName: "Ana Events",
  price: 45000,
  imageUrl: "https://images.example.test/package.webp",
  packageHref: "/customer/packages/package-one",
};

const customItem: CustomerCustomMenuEventListItem = {
  type: "custom_menu",
  key: "ignored",
  providerId: "provider-one",
  providerName: "Ana Events",
  menuItemId: "chicken",
  menuItemName: "Chicken",
  servingOptionId: "tray",
  servingOptionName: "Tray",
  servingDescription: "Serves a small group",
  servingMinimumGuests: 10,
  servingMaximumGuests: 20,
  price: 1800,
  imageUrl: "https://images.example.test/chicken.webp",
  providerHref: "/customer/providers/provider-one",
};

const publicPackage: PublicPackage = {
  id: "package-one",
  providerId: "provider-one",
  providerName: "Ana Events",
  name: "Garden Celebration",
  description: "A published package.",
  eventType: "wedding",
  price: 45000,
  imageUrl: null,
  minimumGuests: 50,
  maximumGuests: 150,
  inclusions: [],
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("customer event list storage", () => {
  it("persists a versioned planning list and replaces duplicates by identity", () => {
    addCustomerEventListItem(packageItem);
    addCustomerEventListItem({...packageItem, price: 47000, packageName: "Garden Celebration Updated"});
    addCustomerEventListItem(customItem);
    addCustomerEventListItem({
      ...customItem,
      servingOptionId: "party",
      servingOptionName: "Party",
      price: 2400,
    });

    const stored = JSON.parse(window.localStorage.getItem(CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:test-customer") ?? "");
    expect(stored.version).toBe(1);
    expect(readCustomerEventList()).toMatchObject([
      {
        type: "custom_menu",
        key: "custom-menu:provider-one:chicken",
        servingOptionId: "party",
        price: 2400,
      },
      {
        type: "package",
        packageId: "package-one",
        price: 47000,
      },
    ]);
    expect(customerEventListItemKey(customItem)).toBe("custom-menu:provider-one:chicken");
  });

  it("rejects malformed JSON, unknown versions, and malformed items", () => {
    window.localStorage.setItem(CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:test-customer", "{");
    expect(readCustomerEventList()).toEqual([]);

    window.localStorage.setItem(CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:test-customer", JSON.stringify({
      version: 2,
      items: [packageItem],
    }));
    expect(readCustomerEventList()).toEqual([]);

    window.localStorage.setItem(CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:test-customer", JSON.stringify({
      version: 1,
      items: [
        packageItem,
        {type: "package", packageId: "bad id", providerId: "provider-one"},
        {type: "delivery", packageId: "package-two"},
        {...packageItem, packageHref: "https://evil.test/customer/packages/package-one"},
        {...customItem, price: 0},
      ],
    }));
    expect(readCustomerEventList()).toEqual([expect.objectContaining({packageId: "package-one"})]);
  });

  it("keeps at most 24 items and still reads an unversioned array", () => {
    for (let index = 0; index < CUSTOMER_EVENT_LIST_MAX_ITEMS + 3; index += 1) {
      addCustomerEventListItem({
        ...packageItem,
        packageId: `package-${index}`,
        packageHref: `/customer/packages/package-${index}`,
      });
    }
    const capped = readCustomerEventList();
    expect(capped).toHaveLength(24);
    expect(capped[0]?.type === "package" ? capped[0].packageId : null)
      .toBe(`package-${CUSTOMER_EVENT_LIST_MAX_ITEMS + 2}`);

    window.localStorage.setItem(CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:test-customer", JSON.stringify([
      packageItem,
      packageItem,
    ]));
    expect(readCustomerEventList()).toHaveLength(1);
  });

  it("removes items and services, and clears schedule context with the last item", () => {
    addCustomerEventListItem({
      ...packageItem,
      configuration: {
        event: {
          eventType: "wedding",
          eventDate: "2026-12-12",
          eventTime: "10:00",
          eventEndTime: "14:00",
          guestCount: 80,
          eventLocation: "Garden",
          eventAddress: "Ormoc City",
          specialRequest: "",
        },
        selectedFoods: [],
        selectedDecorations: [],
        selectedFurniture: [],
        selectedEventServices: [{
          id: "lighting",
          providerId: "provider-two",
          providerName: "Lights Co",
          name: "Lighting",
          category: "lights",
          price: 3000,
        }],
        willArrangeOwnAddOns: false,
        customerArrangedAddOnsNote: "",
        estimatedTotal: 48000,
      },
    });
    writeCustomerEventListSchedule({
      eventDate: "2026-12-12",
      eventTime: "10:00",
      eventEndTime: "14:00",
      eventType: "wedding",
      guestCount: 80,
      eventLocation: "Garden",
    });
    expect(readCustomerEventListSchedule()).toMatchObject({
      eventDate: "2026-12-12",
      guestCount: 80,
    });

    removeCustomerEventListService("package-one", "lighting");
    const [updated] = readCustomerEventList();
    expect(updated?.type === "package" && updated.configuration?.selectedEventServices).toEqual([]);
    expect(updated?.type === "package" && updated.configuration?.estimatedTotal).toBe(45000);

    removeCustomerEventListItem("package-one");
    expect(readCustomerEventList()).toEqual([]);
    expect(window.localStorage.getItem(CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY)).toBeNull();
    expect(readCustomerEventListSchedule()).toBeNull();
  });

  it("ignores unavailable storage and synchronizes from storage events", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => addCustomerEventListItem(packageItem)).not.toThrow();
    setItem.mockRestore();

    addCustomerEventListItem(packageItem);
    const listener = vi.fn();
    window.addEventListener("storage", listener);
    window.dispatchEvent(new StorageEvent("storage", {
      key: CUSTOMER_EVENT_LIST_STORAGE_KEY,
      newValue: window.localStorage.getItem(CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:test-customer"),
    }));
    expect(listener).toHaveBeenCalled();
    window.removeEventListener("storage", listener);
    clearCustomerEventList();
    expect(readCustomerEventList()).toEqual([]);
  });
});

describe("customer event list planning UI", () => {
  it("keeps the guest icon grey and blocks clicks, keyboard and open events with saved items", async () => {
    addCustomerEventListItem(packageItem);
    const user = userEvent.setup();
    render(<CustomerEventListMenu authenticated={false} />);
    const trigger = screen.getByRole("button", {name: /Event List unavailable/});
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-disabled", "true");
    expect(trigger).toHaveAttribute("title", "Sign in to use Event List");
    expect(trigger).toHaveClass("text-feasta-text-tertiary");
    expect(trigger.querySelector("svg")).toBeInTheDocument();
    expect(trigger.querySelector("span")).toBeNull();
    await user.click(trigger);
    trigger.focus();
    await user.keyboard("{Enter} ");
    fireEvent(window, new Event(CUSTOMER_EVENT_LIST_OPEN_EVENT));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("customer-event-list-panel")).toBeNull();
    expect(readCustomerEventList()).toHaveLength(1);
  });

  it("opens for signed-in customers and disables again on sign-out without reopening on sign-in", () => {
    addCustomerEventListItem(packageItem);
    const {rerender} = render(<CustomerEventListMenu authenticated />);
    const trigger = screen.getByRole("button", {name: /Open Event List/});
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveClass("text-primary-strong");
    expect(trigger.querySelector("span")).toHaveTextContent("1");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", {name: "Event List"})).toBeInTheDocument();
    rerender(<CustomerEventListMenu authenticated={false} />);
    expect(screen.getByRole("button", {name: /Event List unavailable/})).toBeDisabled();
    fireEvent(window, new Event(CUSTOMER_EVENT_LIST_OPEN_EVENT));
    expect(document.getElementById("customer-event-list-panel")).toBeNull();
    rerender(<CustomerEventListMenu authenticated />);
    expect(screen.queryByRole("dialog", {name: "Event List"})).not.toBeInTheDocument();
    fireEvent(window, new Event(CUSTOMER_EVENT_LIST_OPEN_EVENT));
    expect(screen.getByRole("dialog", {name: "Event List"})).toBeInTheDocument();
  });

  it("keeps package details free of Add to List for guests", async () => {
    const provider = normalizePublicProvider("provider-one", {
      ownerId: "owner",
      businessName: "Ana Events",
      providerServiceType: "catering",
      verificationStatus: "approved",
      publiclyVisible: true,
      isActive: true,
    }, {role: "provider", providerId: "provider-one", accountStatus: "active"})!;
    render(
      <PackageDetail
        detail={{
          provider,
          packageRecord: publicPackage,
          customization: {foods: [], decorations: [], furniture: [], services: []},
        }}
      />,
    );

    expect(screen.getAllByRole("link", {name: "Customize & request"})[0]).toHaveAttribute(
      "href",
      "/customer/packages/package-one/book",
    );
    expect(screen.queryByRole("button", {name: "Add to List"})).not.toBeInTheDocument();
    expect(readCustomerEventList()).toEqual([]);
    expect(screen.queryByRole("button", {name: /submit booking/iu})).not.toBeInTheDocument();
  });

  it("disables the guest checklist and protects the review route", () => {
    render(<CustomerMarketplaceHeader authReturnTo="/customer/packages" />);
    expect(screen.getByRole("button", {name: "Event List unavailable. Sign in to use Event List."})).toBeDisabled();
    expect(screen.queryByRole("dialog", {name: "Event List"})).not.toBeInTheDocument();

    const response = proxy(new NextRequest("https://feasta.test/customer/event-list/review"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).searchParams.get("next"))
      .toBe("/customer/event-list/review");
  });

  it("asks for event details before a custom-menu booking can be submitted", () => {
    addCustomerEventListItem(customItem);
    render(<CustomerEventListReview />);
    expect(screen.getByText("Chicken")).toBeVisible();
    expect(screen.getByRole("heading", {name: "Ana Events"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Complete Event Details"})).toBeVisible();
    expect(screen.queryByRole("button", {name: "Submit Booking"})).not.toBeInTheDocument();
  });

  it("reviews saved packages and removes them from the list", async () => {
    addCustomerEventListItem(packageItem);
    render(<CustomerEventListReview />);
    expect(screen.getByRole("heading", {name: "Review List"})).toBeVisible();
    expect(screen.getByRole("link", {name: "Garden Celebration"})).toHaveAttribute(
      "href",
      "/customer/packages/package-one",
    );
    expect(screen.queryByRole("link", {name: "Continue to Submit Booking"})).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "Remove Garden Celebration from Event List"}));
    await waitFor(() => expect(readCustomerEventList()).toEqual([]));
    expect(screen.getByText("Your Event List is empty")).toBeVisible();
  });

  it("shows a saved package as already added", () => {
    addCustomerEventListItem(packageItem);
    render(<AddToEventListButton item={packageItem} />);
    expect(screen.getByRole("button", {name: "Added to List"})).toBeDisabled();
  });

  it("submits custom-menu bookings only from review and only after refund acknowledgement", () => {
    const root = join(process.cwd(), "src");
    const sources = [
      "lib/customer/event-list/customer-event-list.ts",
      "components/customer/event-list/customer-event-list-menu.tsx",
      "components/customer/event-list/customer-event-list-review.tsx",
      "components/customer/event-list/add-to-event-list-button.tsx",
      "components/customer/event-list/package-event-list-action.tsx",
      "app/customer/event-list/review/page.tsx",
    ].map((relative) => readFileSync(join(root, relative), "utf8")).join("\n");

    const reviewSource = readFileSync(
      join(root, "components/customer/event-list/customer-event-list-review.tsx"),
      "utf8",
    );
    const otherSources = [
      "lib/customer/event-list/customer-event-list.ts",
      "components/customer/event-list/customer-event-list-menu.tsx",
      "components/customer/event-list/add-to-event-list-button.tsx",
      "components/customer/event-list/package-event-list-action.tsx",
      "app/customer/event-list/review/page.tsx",
    ].map((relative) => readFileSync(join(root, relative), "utf8")).join("\n");

    expect(reviewSource).toContain("submitCustomerBookingRequest");
    expect(reviewSource).toContain(
      "Review and acknowledge the Provider refund policy before submitting.",
    );
    expect(reviewSource).not.toMatch(/createPaymentSession/u);
    expect(otherSources).not.toMatch(/submitBookingRequest|submitCustomerBookingRequest|createPaymentSession/u);
    expect(sources).toContain("Event List");
  });

  it("removes a planned item from the menu", async () => {
    addCustomerEventListItem(packageItem);
    render(<CustomerEventListMenu authenticated={true} />);
    fireEvent.click(screen.getByRole("button", {name: /Open Event List/}));
    fireEvent.click(screen.getByRole("button", {name: "Remove Garden Celebration from Event List"}));
    await waitFor(() => expect(readCustomerEventList()).toEqual([]));
  });
});
