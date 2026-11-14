vi.mock("firebase/auth", () => ({onAuthStateChanged: () => () => {}}));
import type {ComponentProps} from "react";
import {cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {BookingOfferSelection} from "@/components/customer/bookings/booking-offer-selection";
import {addCustomerEventListItem, removeCustomerEventListItem, readCustomerEventList, CUSTOMER_EVENT_LIST_STORAGE_KEY,
  type CustomerPackageEventListItem} from "@/lib/customer/event-list/customer-event-list";
import {
  omitUntrustedBookingCustomization,
  reconcileBookingCustomization,
} from "@/lib/customer/bookings/booking-customization-selection";
import {
  customizationDraftKey,
  parseCustomizationDraft,
  readCustomizationDraft,
  saveCustomizationDraft,
  type CustomizationDraft,
} from "@/lib/customer/bookings/customization-draft";
import type {PublicPackageDetail} from "@/lib/customer/discovery/marketplace-types";
import type {CustomerRefundPolicyDisclosure} from "@/lib/customer/bookings/customer-refund-policy-client";

const mocks = vi.hoisted(() => ({
  auth: {currentUser: null as {uid: string} | null, authStateReady: vi.fn(async () => {})},
  checkAvailability: vi.fn(),
  loadCalendar: vi.fn(async (_providerId: string, month: string) => ({month, dates: [] as Array<{date: string; state: "booked" | "on_hold" | "unavailable"}>})),
  loadDisclosures: vi.fn(),
  submitBooking: vi.fn(),
  reconcile: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({replace: mocks.replace, push: vi.fn()}),
}));

vi.mock("@/lib/customer/bookings/customer-provider-availability-client", () => ({
  checkCustomerProviderAvailability: mocks.checkAvailability,
  getCustomerProviderCalendarAvailability: mocks.loadCalendar,
}));

vi.mock("@/lib/customer/bookings/customer-booking-submission-client", () => ({
  submitCustomerBookingRequest: mocks.submitBooking,
  reconcileCustomerBookingSubmission: mocks.reconcile,
  bookingSubmissionRequiresRefundPolicyRefresh: () => false,
}));

vi.mock("@/lib/firebase/client", () => ({
  auth: mocks.auth,
  functions: {},
  initializeBrowserAppCheck: vi.fn(),
}));

vi.mock("@/lib/customer/bookings/customer-refund-policy-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/customer/bookings/customer-refund-policy-client")>(),
  getCustomerBookingRefundPolicyDisclosures: mocks.loadDisclosures,
  buildRefundPolicyAcknowledgements: (
    policies: readonly CustomerRefundPolicyDisclosure[],
  ) => policies.map(({providerId, effectivePolicyKey}) => ({
    providerId,
    effectivePolicyKey,
  })),
}));

import {EventCustomizationExperience} from "@/components/customer/bookings/event-customization-experience";
vi.mock("@/components/provider/provider-business-location-map", () => ({
  ProviderBusinessLocationMap: (props: {
    initialCoordinates: {latitude: number; longitude: number} | null;
    onConfirm: (location: {address: string; city: string; province: string; latitude: number; longitude: number}) => void;
    onCancel: () => void;
  }) => <div aria-label="Mock event map">
    <span>{props.initialCoordinates ? "Saved pin" : "No saved pin"}</span>
    <button type="button" onClick={props.onCancel}>Cancel</button>
    <button type="button" onClick={() => props.onConfirm({address: "Map venue address", city: "Ormoc City", province: "Leyte", latitude: 11, longitude: 124})}>Confirm this location</button>
  </div>,
}));
vi.mock("@/lib/customer/bookings/customer-booking-agreement", async () => {
  const {bookingAgreementFixture} = await import("./booking-agreement-fixture");
  return {getCustomerBookingPaymentAgreements: vi.fn(async (input: {providerId: string}) => [bookingAgreementFixture(input.providerId)])};
});

const PROVIDER_ID = "provider_primary_private_123";
const PACKAGE_ID = "package_wedding_12345678";

const baseDraft: CustomizationDraft = {
  event: {
    eventDate: "",
    eventTime: "",
    eventEndTime: "",
    guestCount: "",
    eventLocation: "",
    eventAddress: "",
    specialRequest: "",
  },
  customization: {
    selectedFoods: [],
    selectedDecorations: [],
    selectedFurniture: [],
  },
  addonIds: [],
};

const packageSource = {
  serviceOptions: {
    drop_off: {price: 80_000, includedServices: ["Delivery"]},
    buffet_setup: {price: 120_000, includedServices: ["Chafing dishes"]},
    full_service: {price: 180_000, includedServices: ["Service staff"]},
  },
  themeOptions: [{
    id: "theme_garden",
    name: "Garden",
    description: "Greenery and lanterns",
    imageUrls: ["https://images.example.com/garden.jpg"],
  }],
};

describe("booking customization selection", () => {
  it("offers only canonical tiers present on the current package", () => {
    const result = reconcileBookingCustomization({
      packageSource: {
        serviceOptions: {
          drop_off: packageSource.serviceOptions.drop_off,
          buffet_setup: packageSource.serviceOptions.buffet_setup,
        },
        themeOptions: packageSource.themeOptions,
      },
      serviceTier: "full_service",
      packageThemeId: "theme_garden",
    });

    expect(result.availableTiers).toEqual(["drop_off", "buffet_setup"]);
    expect(result.serviceTier).toBeNull();
    expect(result.packageThemeId).toBeNull();
    expect(result.displayedServicePrice).toBeNull();
  });

  it("keeps a published tier price as display data and ignores an event list snapshot", () => {
    const result = reconcileBookingCustomization({
      packageSource,
      serviceTier: "full_service",
      packageThemeId: "theme_garden",
      eventListSnapshot: {
        price: 1,
        serviceTier: "drop_off",
        packageThemeId: "theme_forged",
      },
    });

    expect(result.serviceTier).toBe("full_service");
    expect(result.packageThemeId).toBe("theme_garden");
    expect(result.displayedServicePrice).toBe(180_000);
    expect(result).not.toHaveProperty("price");
  });

  it("does not let an event list snapshot select a tier or theme", () => {
    const result = reconcileBookingCustomization({
      packageSource,
      serviceTier: null,
      packageThemeId: null,
      eventListSnapshot: {
        price: 180_000,
        serviceTier: "full_service",
        packageThemeId: "theme_garden",
      },
    });

    expect(result.serviceTier).toBeNull();
    expect(result.packageThemeId).toBeNull();
    expect(result.displayedServicePrice).toBeNull();
  });

  it("clears a theme that does not belong to the current package or service level", () => {
    expect(reconcileBookingCustomization({
      packageSource,
      serviceTier: "buffet_setup",
      packageThemeId: "theme_missing",
    }).packageThemeId).toBeNull();

    const dropOff = reconcileBookingCustomization({
      packageSource,
      serviceTier: "drop_off",
      packageThemeId: "theme_garden",
      themeInspiration: {
        notes: "Lanterns",
        referenceSetupId: "setup_ref_01",
      },
    });

    expect(dropOff.packageThemeId).toBeNull();
    expect(dropOff.themesApplicable).toBe(false);
    expect(dropOff.themeInspiration).toEqual({notes: "", referenceSetupId: null});
  });

  it("keeps visual style optional for setup-based service", () => {
    const result = reconcileBookingCustomization({
      packageSource,
      serviceTier: "buffet_setup",
      packageThemeId: null,
      themeInspiration: {
        notes: "Soft lanterns",
        referenceSetupId: "setup_ref_01",
      },
    });

    expect(result.themesApplicable).toBe(true);
    expect(result.packageThemeId).toBeNull();
    expect(result.themeInspiration.referenceSetupId).toBe("setup_ref_01");
    expect(result.displayedServicePrice).toBe(120_000);
  });

  it("rejects malformed stored offer fields and keeps legacy drafts", () => {
    expect(parseCustomizationDraft({
      ...baseDraft,
      serviceTier: "gold",
    })).toBeNull();
    expect(parseCustomizationDraft({
      ...baseDraft,
      packageThemeId: "not a stable id",
    })).toBeNull();
    expect(parseCustomizationDraft({
      ...baseDraft,
      themeInspiration: {notes: "x", price: 180_000},
    })).toBeNull();
    expect(parseCustomizationDraft({
      ...baseDraft,
      themeInspiration: {notes: "Lanterns", referenceSetupId: "not valid"},
    })).toBeNull();

    const legacy = parseCustomizationDraft(baseDraft);
    expect(legacy?.serviceTier).toBeNull();
    expect(legacy?.packageThemeId).toBeNull();
    expect(legacy?.themeInspiration).toEqual({notes: "", referenceSetupId: null});
    expect(legacy).not.toHaveProperty("price");
  });

  it("persists service tier, theme, and client-only inspiration without a price", () => {
    localStorage.clear();
    const key = customizationDraftKey("guest", PROVIDER_ID, PACKAGE_ID);
    saveCustomizationDraft(localStorage, key, {
      ...baseDraft,
      serviceTier: "full_service",
      packageThemeId: "theme_garden",
      themeInspiration: {
        notes: "Lanterns along the table",
        referenceSetupId: "setup_ref_01",
      },
    });

    const stored = readCustomizationDraft(localStorage, key);
    expect(stored?.serviceTier).toBe("full_service");
    expect(stored?.packageThemeId).toBe("theme_garden");
    expect(stored?.themeInspiration).toEqual({
      notes: "Lanterns along the table",
      referenceSetupId: "setup_ref_01",
    });
    expect(stored).not.toHaveProperty("price");
    expect(stored).not.toHaveProperty("displayedServicePrice");
  });

  it("submits service tier and theme ids without inspiration or client prices", () => {
    expect(omitUntrustedBookingCustomization({
      providerId: PROVIDER_ID,
      packageId: PACKAGE_ID,
      selectedFoods: ["Lechon"],
      serviceTier: "full_service",
      packageThemeId: "theme_garden",
      themeInspiration: {notes: "Lanterns", referenceSetupId: "setup_ref_01"},
      referenceSetupId: "setup_ref_01",
      displayedServicePrice: 180_000,
      servicePrice: 180_000,
      tierPrice: 180_000,
      clientPrice: 1,
      packagePrice: 45_000,
      totalAmount: 180_000,
      downPaymentAmount: 180_000,
      remainingBalance: 0,
    })).toEqual({
      providerId: PROVIDER_ID,
      packageId: PACKAGE_ID,
      selectedFoods: ["Lechon"],
      serviceTier: "full_service",
      packageThemeId: "theme_garden",
    });
  });
});

describe("booking offer selection UI", () => {
  function premiumOffer(
    serviceOptions: ComponentProps<typeof BookingOfferSelection>["serviceOptions"],
    serviceTier: ComponentProps<typeof BookingOfferSelection>["serviceTier"] = null,
    pricingModel?: "per_pax" | "per_bundle",
  ) {
    return <BookingOfferSelection availableTiers={["drop_off", "buffet_setup", "full_service"]}
      serviceOptions={serviceOptions} serviceTier={serviceTier} pricingModel={pricingModel} themesApplicable={false}
      hasThemeOptions={false} packageThemeId={null} availableThemes={[]}
      themeInspiration={{notes: "", referenceSetupId: null}} error={null}
      onServiceTierChange={vi.fn()} onPackageThemeChange={vi.fn()} onThemeInspirationChange={vi.fn()} />;
  }

  it.each(["per_pax", "per_bundle"] as const)("keeps published prices and %s units readable in every tier", (model) => {
    render(premiumOffer(packageSource.serviceOptions, "buffet_setup", model));
    for (const [name, price] of [["Drop-Off Catering", "80,000"], ["Buffet Setup", "120,000"], ["Full-Service Catering", "180,000"]]) {
      const card = screen.getByRole("radio", {name}).closest("label")!;
      expect(within(card).getByText(price, {exact: false})).toBeVisible();
      expect(within(card).getByText(model === "per_pax" ? "per guest" : "fixed bundle")).toBeVisible();
    }
    expect(screen.getByRole("radio", {name: "Buffet Setup"})).toBeChecked();
    expect(screen.getByRole("radio", {name: "Full-Service Catering"})).not.toBeChecked();
  });

  it.each([360, 768, 1280])("preserves responsive card structure and accessible keyboard controls at %i px", async (width) => {
    const previousWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {configurable: true, value: width});
    try {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const longBenefit = "Provider-published catering service with a deliberately long description for assisted serving and post-event buffet area cleanup";
      const offer = premiumOffer({...packageSource.serviceOptions,
        full_service: {price: 180000, includedServices: [longBenefit]}}, null, "per_bundle");
      render({...offer, props: {...offer.props, onServiceTierChange: onChange}});
      const group = screen.getByRole("radiogroup", {name: "Service level"});
      expect(group).toHaveAttribute("aria-required", "true");
      expect(group).toHaveClass("grid", "grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]");
      const premium = within(group).getByRole("radio", {name: "Full-Service Catering"});
      const card = premium.closest("label")!;
      expect(card).toHaveClass("min-w-0", "focus-within:ring-2");
      expect(screen.getByText(longBenefit)).toBeVisible();
      expect(premium).toHaveAccessibleDescription(expect.stringContaining(longBenefit));
      premium.focus();
      await user.keyboard(" ");
      expect(onChange).toHaveBeenCalledWith("full_service");
      expect(within(card).getByText("Select")).toBeVisible();
    } finally {
      Object.defineProperty(window, "innerWidth", {configurable: true, value: previousWidth});
    }
  });

  it("keeps the original top selection row and description-before-price layout", () => {
    render(premiumOffer(packageSource.serviceOptions, "buffet_setup", "per_bundle"));
    for (const name of ["Buffet Setup", "Full-Service Catering"]) {
      const radio = screen.getByRole("radio", {name});
      const card = radio.closest("label")!;
      const indicator = within(card).getByText(name === "Buffet Setup" ? "Selected" : "Select");
      const title = within(card).getByText(name);
      const description = document.getElementById(radio.getAttribute("aria-describedby")!.split(" ").find(id => id.endsWith("-description"))!)!;
      const price = document.getElementById(radio.getAttribute("aria-describedby")!.split(" ").find(id => id.endsWith("-price"))!)!;
      expect(indicator.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(title.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(description.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(price).toHaveClass("border-t", "border-feasta-divider");
      expect(card).toHaveClass("p-4");
      expect(title).not.toHaveClass("min-h-12");
      if (name === "Full-Service Catering") {
        const badge = within(card).getByText("Premium Tier");
        expect(badge.parentElement).toBe(indicator.parentElement);
        expect(badge.parentElement).toHaveClass("justify-between");
      }
    }
  });

  it("shows all published benefit fields only in their own tier card", () => {
    render(premiumOffer({
      drop_off: {price: 100, includedServices: ["Provider delivery"], equipmentInclusions: ["Delivery box"]},
      buffet_setup: {price: 25000, includedServices: ["Provider buffet arrangement"], decorInclusions: ["Buffet flowers"], furnitureInclusions: ["Buffet table"], equipmentInclusions: ["Buffet warmer"]},
      full_service: {price: 35000, includedServices: ["Provider assisted serving"], decorInclusions: ["Full styling"]},
    }));
    const expected = {
      "Drop-Off Catering": ["Provider delivery", "Delivery box"],
      "Buffet Setup": ["Provider buffet arrangement", "Buffet flowers", "Buffet table", "Buffet warmer"],
      "Full-Service Catering": ["Provider assisted serving", "Full styling"],
    };
    for (const [name, benefits] of Object.entries(expected)) {
      const radio = screen.getByRole("radio", {name});
      const card = radio.closest("label")!;
      for (const benefit of benefits) {
        expect(within(card).getByText(benefit)).toBeVisible();
        expect(radio).toHaveAccessibleDescription(expect.stringContaining(benefit));
      }
      for (const [otherName, otherBenefits] of Object.entries(expected)) {
        if (otherName !== name) for (const benefit of otherBenefits) expect(within(card).queryByText(benefit)).not.toBeInTheDocument();
      }
    }
  });

  it.each([
    [{drop_off: 300, buffet_setup: 200, full_service: 100}, "Drop-Off Catering"],
    [{drop_off: 100, buffet_setup: 300, full_service: 200}, "Buffet Setup"],
    [{drop_off: 100, buffet_setup: 200, full_service: 300}, "Full-Service Catering"],
  ])("highlights only the unique highest published price (%s)", (prices, name) => {
    render(premiumOffer({
      drop_off: {price: prices.drop_off, includedServices: []},
      buffet_setup: {price: prices.buffet_setup, includedServices: []},
      full_service: {price: prices.full_service, includedServices: []},
    }));
    const premium = screen.getByRole("radio", {name}).closest("label")!;
    expect(within(premium).getByText("Premium Tier")).toBeVisible();
    expect(screen.getAllByText("Premium Tier")).toHaveLength(1);
    expect(premium).toHaveClass("border-primary/50", "via-primary-tint/75", "backdrop-blur-sm");
    expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    const radio = within(premium).getByRole("radio");
    expect(radio).toHaveAccessibleDescription(expect.stringContaining("Premium Tier"));
    expect(screen.queryByText(/most popular|best value|recommended/i)).not.toBeInTheDocument();
  });

  it.each([
    [100, 300, 300], [300, 300, 100], [300, 100, 300], [100, 100, 100],
  ])("does not highlight tied highest prices (%s, %s, %s)", (drop_off, buffet_setup, full_service) => {
    render(premiumOffer({drop_off: {price: drop_off, includedServices: []},
      buffet_setup: {price: buffet_setup, includedServices: []}, full_service: {price: full_service, includedServices: []}}));
    expect(screen.queryByText("Premium Tier")).not.toBeInTheDocument();
  });

  it.each([undefined, null, NaN, Infinity, -Infinity, -1, "300"])("withholds premium ranking for incomplete or invalid price %s", (price) => {
    render(premiumOffer({...packageSource.serviceOptions,
      full_service: {price: price as unknown as number, includedServices: []}}));
    expect(screen.queryByText("Premium Tier")).not.toBeInTheDocument();
  });

  it("handles missing options and no published prices without a premium badge", () => {
    const view = render(premiumOffer({drop_off: packageSource.serviceOptions.drop_off}));
    expect(screen.queryByText("Premium Tier")).not.toBeInTheDocument();
    view.rerender(premiumOffer(undefined));
    expect(screen.queryByText("Premium Tier")).not.toBeInTheDocument();
  });

  it("keeps premium visible alongside selection and updates the highlight when published prices change", () => {
    const view = render(premiumOffer(packageSource.serviceOptions));
    const fullService = screen.getByRole("radio", {name: "Full-Service Catering"});
    const fullCard = fullService.closest("label")!;
    expect(within(fullCard).getByText("Premium Tier")).toBeVisible();
    expect(fullService).not.toBeChecked();
    view.rerender(premiumOffer(packageSource.serviceOptions, "full_service"));
    expect(fullService).toBeChecked();
    expect(within(fullCard).getByText("Selected")).toBeVisible();
    expect(within(fullCard).getByText("Premium Tier")).toBeVisible();
    expect(fullCard).toHaveClass("border-primary", "via-primary-tint-strong/70");
    expect(within(fullCard).getByText("Premium Tier")).toHaveClass("bg-white/85", "text-primary-strong");
    expect(fullCard).not.toHaveClass("ring-2");
    expect(fullCard).toHaveClass("focus-within:ring-2");
    view.rerender(premiumOffer(packageSource.serviceOptions, "drop_off"));
    expect(within(fullCard).getByText("Premium Tier")).toBeVisible();
    expect(fullCard).toHaveClass("border-primary/50");
    expect(screen.getByRole("radio", {name: "Drop-Off Catering"})).toBeChecked();
    view.rerender(premiumOffer({...packageSource.serviceOptions,
      buffet_setup: {price: 200_000, includedServices: ["Chafing dishes"]}}, "drop_off"));
    expect(within(fullCard).queryByText("Premium Tier")).not.toBeInTheDocument();
    expect(within(screen.getByRole("radio", {name: "Buffet Setup"}).closest("label")!).getByText("Premium Tier")).toBeVisible();
    expect(screen.getByRole("radio", {name: "Drop-Off Catering"})).toBeChecked();
    expect(screen.getByText("Chafing dishes")).toBeVisible();
  });

  it("renders available tiers, marks the selection, and tolerates a missing theme image", async () => {
    const user = userEvent.setup();
    const onServiceTierChange = vi.fn();
    const onPackageThemeChange = vi.fn();
    const view = render(
      <BookingOfferSelection
        availableTiers={["drop_off", "buffet_setup"]}
        serviceOptions={packageSource.serviceOptions}
        themesApplicable={false}
        hasThemeOptions
        serviceTier={null}
        packageThemeId={null}
        availableThemes={[]}
        themeInspiration={{notes: "", referenceSetupId: null}}
        error={null}
        onServiceTierChange={onServiceTierChange}
        onPackageThemeChange={onPackageThemeChange}
        onThemeInspirationChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", {name: /Drop-Off Catering/u})).toBeInTheDocument();
    expect(screen.getByRole("radio", {name: /Buffet Setup/u})).toBeInTheDocument();
    expect(screen.queryByRole("radio", {name: /Full-Service Catering/u})).not.toBeInTheDocument();
    expect(screen.getByText(/Choose Buffet Setup or Full-Service Catering/u)).toBeVisible();

    const buffet = screen.getByRole("radio", {name: /Buffet Setup/u});
    buffet.focus();
    await user.keyboard(" ");
    expect(onServiceTierChange).toHaveBeenCalledWith("buffet_setup");

    view.rerender(
      <BookingOfferSelection
        availableTiers={["drop_off", "buffet_setup"]}
        serviceOptions={packageSource.serviceOptions}
        themesApplicable
        hasThemeOptions
        serviceTier="buffet_setup"
        packageThemeId={null}
        availableThemes={[{
          id: "theme_garden",
          name: "Garden",
          description: "Greenery and lanterns",
          imageUrls: [],
        }]}
        themeInspiration={{notes: "", referenceSetupId: "setup_ref_01"}}
        error={null}
        onServiceTierChange={onServiceTierChange}
        onPackageThemeChange={onPackageThemeChange}
        onThemeInspirationChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("radio", {name: /Buffet Setup/u})).toBeChecked();
    expect(within(screen.getByRole("radio", {name: /Buffet Setup/u}).closest("label")!).getByText("Selected")).toBeVisible();
    expect(screen.getByText("No reference images available.")).toBeVisible();
    expect(screen.getByRole("radio", {name: /No visual style/u})).toBeChecked();
    expect(screen.getByText("setup_ref_01")).toBeVisible();
    await user.click(screen.getByRole("radio", {name: /Garden/u}));
    expect(onPackageThemeChange).toHaveBeenCalledWith("theme_garden");
  });

  it("explains legacy packages that do not publish service levels", () => {
    render(
      <BookingOfferSelection
        availableTiers={[]}
        serviceOptions={{}}
        themesApplicable={false}
        hasThemeOptions={false}
        serviceTier={null}
        packageThemeId={null}
        availableThemes={[]}
        themeInspiration={{notes: "", referenceSetupId: null}}
        error={null}
        onServiceTierChange={vi.fn()}
        onPackageThemeChange={vi.fn()}
        onThemeInspirationChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/does not publish separate catering service levels/u)).toBeVisible();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", {name: "Theme inspiration"})).not.toBeInTheDocument();
  });
});

describe("customer booking customization flow", () => {
  it.each(["Event location", "Complete event address"])("confirms and persists a map address, then invalidates the pin on manual %s edits", async (label) => {
    render(<EventCustomizationExperience planningOnly initialEventContext={null} detail={detailFixture()} eventServices={[]} />);
    await screen.findByText("Changes save automatically");
    fireEvent.click(screen.getByRole("button", {name: "Choose on map"}));
    expect(screen.getByText("No saved pin")).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
    expect(screen.queryByLabelText("Mock event map")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("");
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByText("Enter the complete event address.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Choose on map"}));
    fireEvent.click(screen.getByRole("button", {name: "Confirm this location"}));
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("Map venue address");
    expect(screen.getByLabelText(/^Event location/)).toHaveValue("Ormoc City, Leyte");
    expect(screen.queryByText("Enter the complete event address.")).not.toBeInTheDocument();
    await waitFor(() => expect(readCustomizationDraft(localStorage, customizationDraftKey("guest", PROVIDER_ID, PACKAGE_ID, "null"))?.event.eventAddress).toBe("Map venue address"));
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Event details"})).toBeVisible();
    expect(screen.getByText("Choose your event date.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Choose on map"}));
    expect(screen.getByText("Saved pin")).toBeVisible();
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), {target: {value: "Manual venue"}});
    expect(screen.queryByLabelText("Mock event map")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Choose on map"}));
    expect(screen.getByText("No saved pin")).toBeVisible();
  });
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.auth.currentUser = null;
    mocks.auth.authStateReady.mockImplementation(async () => {});
    mocks.loadCalendar.mockImplementation(async (_providerId: string, month: string) => ({month, dates: []}));
    vi.setSystemTime(new Date("2026-09-01T02:00:00.000Z"));
    mocks.checkAvailability.mockResolvedValue([{
      providerId: PROVIDER_ID,
      available: true,
      reasonCode: null,
      message: "Available for your selected event.",
    }]);
    mocks.loadDisclosures.mockResolvedValue({
      acknowledgementsRequired: true,
      policies: [primaryPolicy()],
    });
    mocks.submitBooking.mockResolvedValue({
      bookingId: "booking_created_123",
      mainEventId: "booking_created_123",
      providerRequestIds: ["request_created_123"],
      created: true,
    });
  });

  it.each(["confirmed_created", "confirmed_rejected", "unresolved"])("checks a previous package request: %s", async outcome => {
    mocks.reconcile.mockResolvedValue({outcome, booking: {bookingId: "booking_existing", mainEventId: "booking_existing", providerRequestIds: ["request_existing"], created: false}});
    render(<EventCustomizationExperience draftOwner="customer:customer-a" detail={detailFixture()} eventServices={[]} />);
    const check = await screen.findByRole("button", {name: "Check Previous Request"});
    await waitFor(() => expect(check).toBeEnabled());
    fireEvent.click(check);
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledWith("customer-a", undefined));
    if (outcome === "confirmed_created") {
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/customer/bookings?submitted=booking_existing"));
    } else {
      expect(await screen.findByText(outcome === "confirmed_rejected" ? /Previous request was confirmed rejected/ : /Previous request is unresolved/)).toBeVisible();
      expect(mocks.replace).not.toHaveBeenCalled();
    }
    expect(mocks.submitBooking).not.toHaveBeenCalled();
  });

  it("requires current acknowledgments again after a confirmed package rejection", async () => {
    const user = userEvent.setup();
    mocks.reconcile.mockResolvedValue({outcome: "confirmed_rejected"});
    render(<EventCustomizationExperience draftOwner="customer:customer-a" detail={detailFixture()} eventServices={[]} />);
    await fillEventDetails();
    await screen.findByText("Maria's Catering is available");
    await user.click(screen.getByRole("button", {name: "Continue"}));
    await user.click(screen.getByRole("checkbox", {name: "Lechon"}));
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    for (const checkbox of await screen.findAllByRole("checkbox", {name: /I have reviewed/})) await user.click(checkbox);
    await user.click(screen.getByRole("button", {name: "Check Previous Request"}));
    await screen.findByText(/Previous request was confirmed rejected/);
    expect(mocks.submitBooking).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {name: "Submit booking request"})).toBeDisabled();
    for (const checkbox of await screen.findAllByRole("checkbox", {name: /I have reviewed/})) {
      expect(checkbox).not.toBeChecked();
      await user.click(checkbox);
    }
    await user.click(screen.getByRole("button", {name: "Submit booking request"}));
    await waitFor(() => expect(mocks.submitBooking).toHaveBeenCalledOnce());
    expect(mocks.submitBooking.mock.calls[0][1]).toMatchObject({customerId: "customer-a", freshAttempt: true});
    expect(mocks.submitBooking.mock.calls[0][0].policyAcknowledgements).toHaveLength(1);
    expect(mocks.submitBooking.mock.calls[0][0].agreementAcknowledgements).toHaveLength(1);
  });

  it.each([true, false])("preserves and manages a restored service at review (catalog present: %s)", async present => {
    const user = userEvent.setup();
    const service = {id: "saved-staff", providerId: PROVIDER_ID, providerName: "Maria's Catering", name: "Saved staff",
      description: null, category: "staff", price: 700, imageUrl: null, source: "catering_provider" as const};
    saveCustomizationDraft(localStorage, customizationDraftKey("guest", PROVIDER_ID, PACKAGE_ID, "null"), {
      ...baseDraft, event: {...baseDraft.event, eventLocation: "Ormoc City"}, addonIds: [service.id],
    });
    render(<EventCustomizationExperience detail={detailFixture()} eventServices={present ? [service] : []} />);
    await screen.findByText(/Draft restored/);
    await fillEventDetails();
    await screen.findByText("Maria's Catering is available");
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.queryByRole("heading", {name: "Add event services"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    expect(await screen.findByRole("heading", {name: "Review your booking request"})).toBeVisible();
    expect(screen.getByText("Step 3 of 3")).toBeVisible();
    if (present) {
      expect(screen.getByText(service.name)).toBeVisible();
      await user.click(screen.getByRole("button", {name: "Remove Saved staff from Maria's Catering"}));
    } else {
      expect(screen.getByLabelText("Unavailable saved services")).toHaveTextContent("Unavailable saved service");
      expect(screen.getByLabelText("Unavailable saved services")).not.toHaveTextContent(service.id);
      await user.click(screen.getByRole("button", {name: "Remove unavailable service"}));
    }
    await waitFor(() => expect(readCustomizationDraft(localStorage, customizationDraftKey("guest", PROVIDER_ID, PACKAGE_ID, "null"))?.addonIds).toEqual([]));
    await user.click(screen.getByRole("button", {name: "Back"}));
    expect(screen.getByRole("heading", {name: "Customize your package"})).toBeVisible();
    expect(mocks.submitBooking).not.toHaveBeenCalled();
  });

  it("keeps a compact summary, read-only progress, and Step 1 values across navigation", async () => {
    const user = userEvent.setup();
    render(<EventCustomizationExperience planningOnly detail={detailFixture()} eventServices={[]} />);
    const summary = screen.getByRole("complementary", {name: "Package summary"});
    expect(within(summary).getByRole("heading", {name: "Wedding celebration"})).toBeVisible();
    expect(screen.getAllByText("Wedding celebration")).toHaveLength(1);
    expect(summary.querySelector("img")).toBeNull();
    expect(screen.getByLabelText(/^Event location/)).toHaveValue("Ormoc City");
    expect(screen.getByLabelText(/^Complete event address/)).toHaveAttribute("rows", "2");
    expect(screen.getByLabelText(/^Special requests/)).toHaveAttribute("rows", "3");
    expect(screen.getByText("Wedding", {exact: true})).toBeVisible();
    const progress = screen.getByRole("navigation", {name: "Booking progress"});
    expect(within(progress).queryByRole("button")).toBeNull();
    expect(within(progress).getAllByRole("listitem")).toHaveLength(3);
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Event details"})).toBeVisible();
    expect(screen.getByText("Choose your event date.")).toBeVisible();
    await fillEventDetails();
    fireEvent.change(screen.getByLabelText(/^Special requests/), {target: {value: "Vegetarian meals"}});
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(progress.querySelector('[aria-current="step"]')).toHaveTextContent("Customize package");
    expect(within(progress).getAllByRole("listitem")[0]).toHaveTextContent("completed");
    await user.click(screen.getByRole("button", {name: "Back"}));
    expect(screen.getByLabelText(/^Special requests/)).toHaveValue("Vegetarian meals");
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("Grand Ballroom, Ormoc City");
    expect(summary).toHaveTextContent("September 20, 2026");
    expect(summary).toHaveTextContent("100");
    await user.click(screen.getByRole("button", {name: "Back to package"}));
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Continue editing"}));
    expect(screen.getByLabelText(/^Special requests/)).toHaveValue("Vegetarian meals");
  });

  it("announces storage errors near the header without claiming a failed edit was saved", async () => {
    const view = render(<EventCustomizationExperience planningOnly detail={detailFixture()} eventServices={[]} />);
    const status = screen.getByRole("banner").querySelector('[role="status"]')!;
    await waitFor(() => expect(status).toHaveTextContent("Changes save automatically"));
    fireEvent.change(screen.getByLabelText(/^Special requests/), {target: {value: "First edit"}});
    await waitFor(() => expect(status).toHaveTextContent("Draft saved"));
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {throw new Error("Quota");});
    try {
      fireEvent.change(screen.getByLabelText(/^Special requests/), {target: {value: "Keep this edit"}});
      expect(status).toHaveTextContent("Saving draft");
      await waitFor(() => expect(status).toHaveTextContent("Unable to save a draft on this device"));
      expect(status).not.toHaveTextContent("Draft saved");
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(screen.getByLabelText(/^Special requests/)).toHaveValue("Keep this edit");
    } finally {
      view.unmount();
      write.mockRestore();
    }
  });

  it.each([false, true])("omits empty option sections and preserves required tier behavior (tiers: %s)", async (hasTiers) => {
    const user = userEvent.setup();
    const detail = detailFixture(hasTiers ? packageSource : undefined);
    detail.customization = {foods: [], decorations: [], furniture: [], services: []};
    render(<EventCustomizationExperience planningOnly detail={detail} eventServices={[]} />);
    await fillEventDetails();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    for (const name of ["Food selections", "Decorations", "Furniture", "Included services"]) {
      expect(screen.queryByRole("heading", {name})).not.toBeInTheDocument();
    }
    expect(screen.getByText("No additional package options are published.")).toBeVisible();
    const summary = screen.getByRole("complementary", {name: "Package summary"});
    if (hasTiers) {
      expect(summary).toHaveTextContent("Starting price ? no service level selected");
      const group = screen.getByRole("radiogroup", {name: "Service level"});
      expect(group).toHaveAttribute("aria-required", "true");
      expect(within(group).getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
      expect(group).toHaveClass("grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]");
      await user.click(screen.getByRole("button", {name: "Review booking"}));
      expect(screen.getByRole("heading", {name: "Customize your package"})).toBeVisible();
      expect(group).toHaveAttribute("aria-invalid", "true");
      expect(document.getElementById(group.getAttribute("aria-describedby")!)).toHaveTextContent("Choose a catering service level offered by this package.");
      // Clicking the published description selects the whole card.
      await user.click(screen.getByText("Package delivery without buffet setup or on-site service staff."));
      const dropOff = screen.getByRole("radio", {name: "Drop-Off Catering"});
      expect(dropOff).toBeChecked();
      expect(within(dropOff.closest("label")!).getByText("Selected")).toBeVisible();
      expect(dropOff.closest("label")).toHaveClass("focus-within:ring-2");
      dropOff.focus();
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("radio", {name: "Buffet Setup"})).toBeChecked();
      expect(screen.getByRole("radio", {name: "Buffet Setup"})).toHaveFocus();
      expect(summary).toHaveTextContent("120,000");
      expect(summary).not.toHaveTextContent("Starting price");
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("radio", {name: "Full-Service Catering"})).toBeChecked();
      expect(summary).toHaveTextContent("180,000");
    }
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    expect(screen.getByRole("heading", {name: "Continue your saved plan"})).toBeVisible();
  });

  it.each(["drop_off", "buffet_setup", "full_service"] as const)("keeps visual styles optional and eligible only for setup tiers (%s)", async (tier) => {
    const user = userEvent.setup();
    render(<EventCustomizationExperience planningOnly detail={detailFixture(packageSource)} eventServices={[]} />);
    await fillEventDetails();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    const names = {drop_off: "Drop-Off Catering", buffet_setup: "Buffet Setup", full_service: "Full-Service Catering"};
    await user.click(screen.getByRole("radio", {name: names[tier]}));
    if (tier === "drop_off") {
      expect(screen.queryByRole("radiogroup", {name: "Theme inspiration"})).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Visual notes")).not.toBeInTheDocument();
    } else {
      const themes = screen.getByRole("radiogroup", {name: "Theme inspiration"});
      expect(within(themes).getByRole("radio", {name: /No visual style/})).toBeChecked();
      await user.click(within(themes).getByRole("radio", {name: /Garden/}));
      expect(within(themes).getByRole("radio", {name: /Garden/})).toBeChecked();
      expect(screen.getByText(/not sent to providers/)).toBeVisible();
      await user.click(within(themes).getByRole("radio", {name: /No visual style/}));
    }
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    expect(screen.getByRole("heading", {name: "Continue your saved plan"})).toBeVisible();
  });

  it("keeps published options selectable and restores them with the tier after Back and remount", async () => {
    const user = userEvent.setup();
    const detail = detailFixture(packageSource);
    detail.customization = {foods: ["Lechon", "Grilled fish"], decorations: ["Lanterns"], furniture: ["Round tables"], services: ["Delivery", "Venue cleanup"]};
    const first = render(<EventCustomizationExperience planningOnly detail={detail} eventServices={[]} />);
    await fillEventDetails();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getAllByText("Delivery")).toHaveLength(1);
    expect(screen.getByText("Venue cleanup")).toBeVisible();
    expect(screen.queryByRole("checkbox", {name: "Venue cleanup"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", {name: "Buffet Setup"}));
    for (const name of ["Lechon", "Grilled fish", "Lanterns", "Round tables"]) {
      await user.click(screen.getByRole("checkbox", {name}));
      expect(screen.getByRole("checkbox", {name})).toBeChecked();
    }
    await user.click(screen.getByRole("checkbox", {name: "Grilled fish"}));
    expect(screen.getByRole("checkbox", {name: "Grilled fish"})).not.toBeChecked();
    await user.click(screen.getByRole("button", {name: "Back"}));
    expect(screen.getByRole("heading", {name: "Event details"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("radio", {name: "Buffet Setup"})).toBeChecked();
    await waitFor(() => {
      const saved = readCustomizationDraft(localStorage, customizationDraftKey("guest", PROVIDER_ID, PACKAGE_ID, "null"));
      expect(saved?.serviceTier).toBe("buffet_setup");
      expect(saved?.customization).toEqual({selectedFoods: ["Lechon"], selectedDecorations: ["Lanterns"], selectedFurniture: ["Round tables"]});
    });
    first.unmount();
    render(<EventCustomizationExperience planningOnly detail={detail} eventServices={[]} />);
    await screen.findByText(/Draft restored/);
    await user.click(screen.getByRole("button", {name: "Continue"}));
    for (const name of ["Lechon", "Lanterns", "Round tables"]) expect(screen.getByRole("checkbox", {name})).toBeChecked();
    expect(screen.getByRole("checkbox", {name: "Grilled fish"})).not.toBeChecked();
    expect(screen.getByRole("radio", {name: "Buffet Setup"})).toBeChecked();
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    expect(screen.getByRole("heading", {name: "Continue your saved plan"})).toBeVisible();
  });

  it("keeps legacy package customization and existing food selections", async () => {
    const user = userEvent.setup();
    render(
      <EventCustomizationExperience
        planningOnly
        detail={detailFixture()}
        eventServices={[]}
      />,
    );

    await fillEventDetails();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Customize your package"})).toBeVisible();
    expect(screen.getByText(/does not publish separate catering service levels/u)).toBeVisible();
    await user.click(screen.getByRole("checkbox", {name: "Lechon"}));
    expect(screen.getByRole("checkbox", {name: "Lechon"})).toBeChecked();
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    expect(screen.getByRole("heading", {name: "Continue your saved plan"})).toBeVisible();
  });

  it("requires food choices, reviews dish names, and submits only IDs", async () => {
    const user=userEvent.setup();
    const detail=detailFixture();
    detail.packageRecord.foodChoiceGroups=[{id:"main",title:"Main dish",selectionCount:1,
      options:[{id:"chicken",name:"Chicken Afritada"},{id:"pork",name:"Pork Menudo"}]}];
    render(<EventCustomizationExperience detail={detail} eventServices={[]}/>);
    await fillEventDetails();
    expect(await screen.findByText("Maria's Catering is available")).toBeVisible();
    await user.click(screen.getByRole("button",{name:"Continue"}));
    await user.click(screen.getByRole("button",{name:"Review booking"}));
    expect(screen.getByRole("alert")).toHaveTextContent(/required number/);
    expect(mocks.submitBooking).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox",{name:"Chicken Afritada"}));
    expect(screen.getByRole("checkbox",{name:"Chicken Afritada"})).toBeVisible();
    expect(screen.getByRole("checkbox",{name:"Chicken Afritada"})).toBeChecked();
    expect(screen.getByRole("checkbox",{name:"Pork Menudo"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:"Review booking"}));
    expect(await screen.findByRole("heading",{name:"Review your booking request"})).toBeVisible();
    expect(screen.getByText("Chicken Afritada")).toBeVisible();
    for(const checkbox of await screen.findAllByRole("checkbox",{name:/I have reviewed/})) await user.click(checkbox);
    await user.click(screen.getByRole("button",{name:"Submit booking request"}));
    await waitFor(()=>expect(mocks.submitBooking).toHaveBeenCalledTimes(1));
    expect(mocks.submitBooking.mock.calls[0][0].foodChoiceSelections).toEqual([{groupId:"main",optionIds:["chicken"]}]);
    expect(JSON.stringify(mocks.submitBooking.mock.calls[0][0])).not.toContain("Chicken Afritada");
  });

  it("restores V2 dish IDs and clears stale legacy inclusion selections", async () => {
    const user = userEvent.setup();
    const detail = detailFixture(packageSource);
    Object.assign(detail.packageRecord, {sharedContractVersion: 2, revision: 7, pricingModel: "per_bundle",
      foodChoiceGroups: [{id: "main", title: "Main", selectionCount: 1, options: [{id: "chicken", name: "Chicken"}]}]});
    saveCustomizationDraft(localStorage, customizationDraftKey("guest", PROVIDER_ID, PACKAGE_ID, "null"), {
      ...baseDraft, event: {...baseDraft.event, eventLocation: "Ormoc City"}, serviceTier: "buffet_setup", packageThemeId: "theme_garden",
      customization: {selectedFoods: ["Lechon"], selectedDecorations: ["Old flowers"], selectedFurniture: ["Old chairs"],
        foodChoiceSelections: [{groupId: "main", optionIds: ["chicken"]}]},
    });
    render(<EventCustomizationExperience detail={detail} eventServices={[]}/>);
    expect(await screen.findByText(/Draft restored/)).toBeVisible();
    await fillEventDetails();
    expect(await screen.findByText("Maria's Catering is available")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("radio", {name: "Buffet Setup"})).toBeChecked();
    expect(screen.getByRole("radio", {name: /Garden/})).toBeChecked();
    expect(screen.getByRole("checkbox", {name: "Chicken"})).toBeVisible();
    expect(screen.getByRole("checkbox", {name: "Chicken"})).toBeChecked();
    expect(screen.queryByRole("checkbox", {name: "Lechon"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    for (const checkbox of await screen.findAllByRole("checkbox", {name: /I have reviewed/})) await user.click(checkbox);
    await user.click(screen.getByRole("button", {name: "Submit booking request"}));
    await waitFor(() => expect(mocks.submitBooking).toHaveBeenCalledTimes(1));
    const payload = mocks.submitBooking.mock.calls[0][0];
    expect(payload).toMatchObject({selectedFoods: [], selectedDecorations: [], selectedFurniture: [],
      foodChoiceSelections: [{groupId: "main", optionIds: ["chicken"]}], serviceTier: "buffet_setup", packageThemeId: "theme_garden"});
    expect(payload).not.toHaveProperty("price");
    expect(payload).not.toHaveProperty("foodInclusions");
    expect(payload).not.toHaveProperty("equipmentInclusions");
  });

  it("shows V2 fixed inclusions read-only and updates only the selected tier", async () => {
    const user = userEvent.setup();
    const detail = detailFixture({serviceOptions: {
      buffet_setup: {price: 100, includedServices: ["Buffet staff"], decorInclusions: ["Tier flowers", " shared flowers "]},
      full_service: {price: 200, includedServices: ["Full staff"], furnitureInclusions: ["Tier chairs"]},
    }, themeOptions: packageSource.themeOptions});
    Object.assign(detail.packageRecord, {sharedContractVersion: 2, pricingModel: "per_bundle", foodInclusions: ["Fixed rice"], equipmentInclusions: ["Shared warmer"]});
    detail.customization = {foods: ["Fixed rice"], decorations: ["Shared flowers"], furniture: ["Shared chairs"], services: ["Shared delivery"]};
    render(<EventCustomizationExperience planningOnly detail={detail} eventServices={[]}/>);
    await fillEventDetails();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Customize your package"})).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const tiers = screen.getByRole("radiogroup", {name: "Service level"});
    const buffetCard = within(tiers).getByRole("radio", {name: "Buffet Setup"}).closest("label")!;
    const fullCard = within(tiers).getByRole("radio", {name: "Full-Service Catering"}).closest("label")!;
    expect(within(buffetCard).getByText("Buffet staff")).toBeVisible();
    expect(within(buffetCard).getByText("Tier flowers")).toBeVisible();
    expect(within(buffetCard).queryByText("Full staff")).not.toBeInTheDocument();
    expect(within(fullCard).getByText("Full staff")).toBeVisible();
    expect(within(fullCard).getByText("Tier chairs")).toBeVisible();
    expect(within(fullCard).queryByText("Buffet staff")).not.toBeInTheDocument();
    expect(within(fullCard).getByText("Premium Tier")).toBeVisible();
    expect(screen.queryByRole("radio", {name: "Drop-Off Catering"})).not.toBeInTheDocument();
    const included = screen.getByRole("region", {name: "Included with your package"});
    for (const text of ["Fixed rice", "Shared flowers", "Shared chairs", "Shared delivery", "Shared warmer"]) expect(within(included).getByText(text)).toBeVisible();
    expect(within(included).queryByText("Tier flowers")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", {name: "Buffet Setup"}));
    expect(within(included).getByText("Tier flowers")).toBeVisible();
    expect(within(included).getAllByText(/shared flowers/i)).toHaveLength(1);
    expect(within(included).queryByText("Tier chairs")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", {name: /No visual style/})).toBeChecked();
    expect(screen.getByLabelText("Selected service summary")).toHaveTextContent("100");
    const themeImage = screen.getByRole("img", {name: "Garden reference 1 of 1"});
    expect(themeImage).toHaveAttribute("src", packageSource.themeOptions[0].imageUrls[0]);
    expect(screen.getByText("Greenery and lanterns")).toBeVisible();
    await user.click(screen.getByRole("radio", {name: /Garden/}));
    expect(screen.getByRole("radio", {name: /Garden/})).toBeChecked();
    await user.click(screen.getByRole("radio", {name: /No visual style/}));
    expect(screen.getByRole("radio", {name: /No visual style/})).toBeChecked();
    await user.click(screen.getByRole("radio", {name: "Full-Service Catering"}));
    expect(within(included).queryByText("Tier flowers")).not.toBeInTheDocument();
    expect(within(included).getByText("Tier chairs")).toBeVisible();
    expect(within(included).getByText("Full staff")).toBeVisible();
    expect(screen.getByLabelText("Selected service summary")).toHaveTextContent("Fixed Bundle");
    expect(screen.getByLabelText("Selected service summary")).toHaveTextContent("200");
    expect(screen.getByLabelText("Selected service summary")).not.toHaveTextContent("20,000");
  });

  it("V2 selects a second occasion and tier, estimates per guest, and submits IDs with its revision", async () => {
    const user=userEvent.setup();
    const detail=detailFixture({serviceOptions:{drop_off:{price:100.25,includedServices:['Delivery'],decorInclusions:['Tier flowers']}}});
    Object.assign(detail.packageRecord,{sharedContractVersion:2,revision:7,pricingModel:'per_pax',price:100.25,
      eventType:'birthday',occasionScope:'all',occasionMatchIds:['birthday','wedding']});
    detail.packageRecord.foodChoiceGroups=[{id:"main",title:"Main dish",selectionCount:1,
      options:[{id:"chicken",name:"Chicken Afritada"},{id:"pork",name:"Pork Menudo"}]}];
    render(<EventCustomizationExperience detail={detail} eventServices={[]}/>);
    fireEvent.change(screen.getByRole("combobox",{name:"Event type"}),{target:{value:"wedding"}});
    await fillEventDetails();
    expect(await screen.findByText("Maria's Catering is available")).toBeVisible();
    await user.click(screen.getByRole("button",{name:"Continue"}));
    await user.click(screen.getByRole("radio",{name:/Drop-Off Catering/}));
    await user.click(screen.getByRole("button",{name:"Review booking"}));
    expect(screen.getByRole("alert")).toHaveTextContent(/required number/);
    expect(mocks.submitBooking).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox",{name:"Chicken Afritada"}));
    expect(screen.getByRole("checkbox",{name:"Chicken Afritada"})).toBeVisible();
    expect(screen.getByRole("checkbox",{name:"Chicken Afritada"})).toBeChecked();
    expect(screen.getByRole("checkbox",{name:"Pork Menudo"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:"Review booking"}));
    expect(await screen.findByRole("heading",{name:"Review your booking request"})).toBeVisible();
    expect(screen.getByText("Chicken Afritada")).toBeVisible();
    for(const checkbox of await screen.findAllByRole("checkbox",{name:/I have reviewed/})) await user.click(checkbox);
    await user.click(screen.getByRole("button",{name:"Submit booking request"}));
    await waitFor(()=>expect(mocks.submitBooking).toHaveBeenCalledTimes(1));
    expect(mocks.submitBooking.mock.calls[0][0].foodChoiceSelections).toEqual([{groupId:"main",optionIds:["chicken"]}]);
    expect(JSON.stringify(mocks.submitBooking.mock.calls[0][0])).not.toContain("Chicken Afritada");
    expect(mocks.submitBooking.mock.calls[0][0]).toMatchObject({sharedContractVersion:2,expectedPackageRevision:7,eventType:'wedding',serviceTier:'drop_off'});
    expect(mocks.submitBooking.mock.calls[0][0]).not.toHaveProperty('price');
    expect(mocks.submitBooking.mock.calls[0][0]).toMatchObject({selectedFoods: [], selectedDecorations: [], selectedFurniture: []});
  });

  it("requires a published tier, clears an incompatible theme, and does not submit client prices", async () => {
    const user = userEvent.setup();
    render(
      <EventCustomizationExperience
        detail={detailFixture(packageSource)}
        eventServices={[]}
      />,
    );

    await fillEventDetails();
    expect(await screen.findByText("Maria's Catering is available")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose a catering service level offered by this package.",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    await user.click(screen.getByRole("radio", {name: /Full-Service Catering/u}));
    expect(screen.getByRole("radio", {name: /No visual style/u})).toBeChecked();
    await user.click(screen.getByRole("radio", {name: /Garden/u}));
    await user.type(screen.getByLabelText("Visual notes"), "Lanterns");
    await user.click(screen.getByRole("radio", {name: /Drop-Off Catering/u}));
    expect(screen.queryByRole("radio", {name: /Garden/u})).not.toBeInTheDocument();
    expect(screen.getByText(/not used for Drop-Off Catering/u)).toBeVisible();

    await user.click(screen.getByRole("radio", {name: /Full-Service Catering/u}));
    await user.click(screen.getByRole("radio", {name: /Garden/u}));
    await user.click(screen.getByRole("checkbox", {name: "Lechon"}));
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    expect(await screen.findByRole("heading", {name: "Review your booking request"})).toBeVisible();

    const estimate = screen.getByRole("heading", {
      name: "Review the displayed cost before submission.",
    }).closest("section");
    expect(estimate).not.toBeNull();
    expect(within(estimate as HTMLElement).getAllByText(/180,000/u).length).toBeGreaterThan(0);
    expect(within(estimate as HTMLElement).queryByText(/100,000/u)).not.toBeInTheDocument();
    expect(screen.getAllByText(/180,000/u).length).toBeGreaterThan(0);

    for (const checkbox of await screen.findAllByRole("checkbox", {name: /I have reviewed/u})) await user.click(checkbox);
    await user.click(screen.getByRole("button", {name: "Submit booking request"}));
    await waitFor(() => expect(mocks.submitBooking).toHaveBeenCalledTimes(1));
    const payload = mocks.submitBooking.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.selectedFoods).toEqual(["Lechon"]);
    expect(payload.serviceTier).toBe("full_service");
    expect(payload.packageThemeId).toBe("theme_garden");
    expect(payload).not.toHaveProperty("themeInspiration");
    expect(payload).not.toHaveProperty("referenceSetupId");
    expect(payload).not.toHaveProperty("displayedServicePrice");
    expect(payload).not.toHaveProperty("tierPrice");
    expect(payload).not.toHaveProperty("packagePrice");
    expect(payload).not.toHaveProperty("totalAmount");
    expect(JSON.stringify(payload)).not.toContain("180000");
    expect(JSON.stringify(payload)).not.toContain("180,000");
    expect(JSON.stringify(payload)).not.toContain("Lanterns");
  });

  it("prevents continuing when the selected calendar date becomes booked", async () => {
    mocks.loadCalendar.mockResolvedValue({month: "2026-09", dates: []});
    render(<EventCustomizationExperience detail={detailFixture(packageSource)} eventServices={[]} />);
    await fillEventDetails();
    expect(await screen.findByText("Maria's Catering is available")).toBeVisible();
    mocks.loadCalendar.mockResolvedValue({month: "2026-09", dates: [{date: "2026-09-20", state: "booked"}]});
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
    fireEvent.click(screen.getByRole("button", {name: /^Event date/}));
    await screen.findByRole("button", {name: /, Booked$/});
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.queryByRole("heading", {name: "Customize your package"})).toBeNull();
    expect(mocks.submitBooking).not.toHaveBeenCalled();
    mocks.loadCalendar.mockImplementation(async (_providerId: string, month: string) => ({month, dates: []}));
  });

  it("synchronizes 2000 and 5000 service estimates through tier changes and navigation", async () => {
    const user = userEvent.setup();
    const detail = detailFixture({serviceOptions: {
      drop_off: {price: 2000, includedServices: ["Delivery"]},
      buffet_setup: {price: 5000, includedServices: ["Setup"]},
    }});
    detail.packageRecord.price = 2000;
    render(<EventCustomizationExperience detail={detail} eventServices={[]} />);
    await fillEventDetails();
    expect(await screen.findByText("Maria's Catering is available")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    const sidebar = screen.getByText("Your package").closest("aside")!;
    await user.click(screen.getByRole("radio", {name: /Drop-Off Catering/u}));
    expect(sidebar).toHaveTextContent("2,000");
    await user.click(screen.getByRole("radio", {name: /Buffet Setup/u}));
    expect(sidebar).toHaveTextContent("5,000");
    expect(sidebar).not.toHaveTextContent("2,000");
    expect(screen.getByRole("region", {name: "Customize your package"})).toHaveTextContent("Buffet Setup");
    await user.click(screen.getByRole("radio", {name: /Drop-Off Catering/u}));
    expect(sidebar).toHaveTextContent("2,000");
    expect(sidebar).not.toHaveTextContent("5,000");
    await user.click(screen.getByRole("radio", {name: /Buffet Setup/u}));
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    expect(await screen.findByRole("heading", {name: "Review your booking request"})).toBeVisible();
    const estimate = screen.getByRole("heading", {name: "Review the displayed cost before submission."}).closest("section")!;
    expect(estimate).toHaveTextContent("5,000");
    expect(estimate).not.toHaveTextContent("2,000");
    expect(sidebar).toHaveTextContent("5,000");
    await user.click(screen.getByRole("button", {name: "Back"}));
    expect(screen.getByRole("radio", {name: /Buffet Setup/u})).toBeChecked();
    expect(sidebar).toHaveTextContent("5,000");
    expect(sidebar).not.toHaveTextContent("2,000");
  });

  it("restores a draft against the current package and drops stale selections", async () => {
    saveCustomizationDraft(
      localStorage,
      customizationDraftKey("guest", PROVIDER_ID, PACKAGE_ID, "null"),
      {
        ...baseDraft,
        event: {
          ...baseDraft.event,
          eventLocation: "Ormoc City",
        },
        customization: {
          ...baseDraft.customization,
          selectedFoods: ["Lechon"],
        },
        serviceTier: "full_service",
        packageThemeId: "theme_removed",
        themeInspiration: {
          notes: "Lanterns",
          referenceSetupId: "setup_ref_01",
        },
      },
    );

    render(
      <EventCustomizationExperience
        planningOnly
        detail={detailFixture({
          serviceOptions: {
            buffet_setup: packageSource.serviceOptions.buffet_setup,
          },
          themeOptions: packageSource.themeOptions,
        })}
        eventServices={[]}
      />,
    );

    expect(await screen.findByText(/Draft restored/u)).toBeVisible();
    await fillEventDetails();
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("checkbox", {name: "Lechon"})).toBeChecked();
    expect(screen.queryByRole("radio", {name: /Full-Service Catering/u})).not.toBeInTheDocument();
    expect(screen.getByRole("radio", {name: /Buffet Setup/u})).not.toBeChecked();
    expect(screen.queryByLabelText("Visual notes")).not.toBeInTheDocument();
  });
});

describe("Event List explicit restore and edit", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); vi.clearAllMocks(); localStorage.clear();
    mocks.auth.currentUser = {uid: "customer-a"}; mocks.auth.authStateReady.mockImplementation(async () => {});
    vi.setSystemTime(new Date("2026-09-01T02:00:00Z"));
  });
  function saved(v2 = false): CustomerPackageEventListItem {
    return {providerId: PROVIDER_ID, packageId: PACKAGE_ID, providerName: "Maria's Catering",
      packageName: "Wedding celebration", price: 1, imageUrl: null, packageHref: `/customer/packages/${PACKAGE_ID}`,
      configuration: {event: {eventType: "wedding", eventDate: "2026-09-20", eventTime: "18:00", eventEndTime: "22:00",
        guestCount: 100, eventLocation: "Ormoc City", eventAddress: "Saved ballroom", specialRequest: "No peanuts"},
        sharedContractVersion: v2 ? 2 : null, expectedPackageRevision: v2 ? 7 : null,
        serviceTier: "full_service", packageThemeId: "theme_garden",
        themeInspiration: {notes: "Rustic lights", referenceSetupId: null},
        foodChoiceSelections: v2 ? [{groupId: "main", optionIds: ["fish"]}] : [],
        selectedFoods: v2 ? [] : ["Lechon"], selectedDecorations: ["Flowers"], selectedFurniture: ["Tables"],
        selectedEventServices: [], willArrangeOwnAddOns: false, customerArrangedAddOnsNote: "", estimatedTotal: 1}};
  }
  function sharedSource(date = "2026-09-20") {
    const value = saved();
    return {...value, providerId: "other-provider", packageId: "other-package", packageHref: "/customer/packages/other-package",
      configuration: {...value.configuration!, event: {...value.configuration!.event, eventDate: date}}};
  }
  it("offers shared details, accepts only event fields and keeps the saved provider unchanged", async () => {
    addCustomerEventListItem(sharedSource());
    const before = JSON.stringify(readCustomerEventList());
    render(<EventCustomizationExperience planningOnly draftOwner="customer:customer-a" detail={detail()} eventServices={[]} />);
    fireEvent.click(await screen.findByRole("button", {name: /^Use Maria/}, {timeout: 5000}));
    await waitFor(() => expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("Saved ballroom"));
    expect(screen.getByLabelText(/^Number of guests/)).toHaveValue(100);
    expect(screen.getByLabelText(/Special requests/i)).toHaveValue("");
    expect(JSON.stringify(readCustomerEventList())).toBe(before);
    fireEvent.change(screen.getByLabelText(/^Complete event address/), {target: {value: "Editable venue"}});
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("Editable venue");
  });
  it("lets customers decline shared details", async () => {
    addCustomerEventListItem(sharedSource());
    render(<EventCustomizationExperience planningOnly draftOwner="customer:customer-a" detail={detail()} eventServices={[]} />);
    fireEvent.click(await screen.findByRole("button", {name: "Enter new details"}));
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("");
    expect(screen.queryByRole("region", {name: "Reuse event details"})).toBeNull();
  });
  it("requires a choice between conflicting plans", async () => {
    addCustomerEventListItem(sharedSource());
    addCustomerEventListItem({...sharedSource("2026-09-21"), packageId: "third-package"});
    render(<EventCustomizationExperience planningOnly draftOwner="customer:customer-a" detail={detail()} eventServices={[]} />);
    await screen.findByText(/Saved event details conflict/);
    expect(screen.getAllByRole("button", {name: /^Use Maria/})).toHaveLength(2);
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("");
  });
  it("preserves an existing draft instead of offering shared details", async () => {
    addCustomerEventListItem(sharedSource());
    saveCustomizationDraft(localStorage, customizationDraftKey("customer:customer-a", PROVIDER_ID, PACKAGE_ID, "null"),
      {...baseDraft, event: {...baseDraft.event, eventAddress: "Existing draft"}});
    render(<EventCustomizationExperience planningOnly draftOwner="customer:customer-a" detail={detail()} eventServices={[]} />);
    await waitFor(() => expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("Existing draft"));
    expect(screen.queryByRole("region", {name: "Reuse event details"})).toBeNull();
  });
  it("does not apply a source removed during calendar verification", async () => {
    addCustomerEventListItem(sharedSource());
    let finish!: (value: {month: string; dates: []}) => void;
    mocks.loadCalendar.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    render(<EventCustomizationExperience planningOnly draftOwner="customer:customer-a" detail={detail()} eventServices={[]} />);
    fireEvent.click(await screen.findByRole("button", {name: /^Use Maria/}));
    removeCustomerEventListItem("other-package");
    finish({month: "2026-09", dates: []});
    await waitFor(() => expect(screen.queryByRole("button", {name: /^Use Maria/})).toBeNull());
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("");
  });
  it("checks the new provider calendar and omits an unavailable schedule", async () => {
    addCustomerEventListItem(sharedSource());
    mocks.loadCalendar.mockResolvedValueOnce({month: "2026-09", dates: [{date: "2026-09-20", state: "unavailable"}]});
    render(<EventCustomizationExperience planningOnly draftOwner="customer:customer-a" detail={detail()} eventServices={[]} />);
    fireEvent.click(await screen.findByRole("button", {name: /^Use Maria/}));
    await waitFor(() => expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("Saved ballroom"));
    expect(mocks.loadCalendar).toHaveBeenCalledWith(PROVIDER_ID, "2026-09");
    expect(screen.getByLabelText(/^Start time/)).toHaveValue("");
  });
  it("hides shared details on account switch and logout", async () => {
    addCustomerEventListItem(sharedSource());
    const element = () => <EventCustomizationExperience planningOnly draftOwner="customer:customer-a" detail={detail()} eventServices={[]} />;
    const view = render(element());
    await screen.findByRole("button", {name: /^Use Maria/});
    mocks.auth.currentUser = {uid: "customer-b"}; view.rerender(element());
    expect(screen.queryByRole("button", {name: /^Use Maria/})).toBeNull();
    mocks.auth.currentUser = null; view.rerender(element());
    expect(screen.queryByRole("button", {name: /^Use Maria/})).toBeNull();
  });
  function detail(v2 = false) {
    const value = detailFixture(packageSource);
    value.customization.decorations = ["Flowers"]; value.customization.furniture = ["Tables"];
    if (v2) Object.assign(value.packageRecord, {sharedContractVersion: 2, revision: 7,
      foodChoiceGroups: [{id: "main", title: "Main", selectionCount: 1, options: [{id: "fish", name: "Fish"}, {id: "rice", name: "Rice"}]}]});
    return value;
  }
  async function open(v2 = false, store = true) {
    const unrelatedKey = customizationDraftKey("guest", PROVIDER_ID, PACKAGE_ID, "null");
    saveCustomizationDraft(localStorage, unrelatedKey, {...baseDraft, event: {...baseDraft.event, eventAddress: "Unrelated draft"}});
    const unrelated = localStorage.getItem(unrelatedKey);
    if (store) addCustomerEventListItem(saved(v2));
    render(<EventCustomizationExperience planningOnly draftOwner="customer:customer-a" eventListEditProviderId={PROVIDER_ID}
      detail={detail(v2)} eventServices={[]} />);
    return {unrelatedKey, unrelated};
  }
  it("restores intentionally, edits and saves the same entry while preserving other entries and drafts", async () => {
    const other = {...saved(), packageId: "other-package", packageHref: "/customer/packages/other-package"};
    addCustomerEventListItem(other);
    const {unrelatedKey, unrelated} = await open();
    await screen.findByText(/Saved configuration restored/);
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("Saved ballroom");
    expect(screen.getByLabelText(/^Number of guests/)).toHaveValue(100);
    fireEvent.change(screen.getByLabelText(/^Special requests/i), {target: {value: "Updated request"}});
    fireEvent.click(screen.getByRole("button", {name: "Confirm restored options"}));
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("radio", {name: "Full-Service Catering"})).toBeChecked();
    expect(screen.getByRole("checkbox", {name: "Lechon"})).toBeChecked();
    expect(screen.getByRole("checkbox", {name: "Flowers"})).toBeChecked();
    expect(screen.getByRole("checkbox", {name: "Tables"})).toBeChecked();
    expect(screen.getByLabelText("Visual notes")).toHaveValue("Rustic lights");
    fireEvent.click(screen.getByRole("button", {name: "Review booking"}));
    fireEvent.click(screen.getByRole("button", {name: "Save to Event List"}));
    await screen.findByText(/Saved to Event List\. Configured/);
    const values = readCustomerEventList() as CustomerPackageEventListItem[];
    expect(values).toHaveLength(2);
    expect(values.find(value => value.packageId === PACKAGE_ID)!.configuration!.event.specialRequest).toBe("Updated request");
    expect(values.find(value => value.packageId === "other-package")!.configuration!.estimatedTotal).toBe(1);
    expect(localStorage.getItem(unrelatedKey)).toBe(unrelated);
    expect(mocks.submitBooking).not.toHaveBeenCalled();
  });
  it("restores V2 dish IDs and requires explicit review before saving", async () => {
    await open(true); await screen.findByText(/Saved configuration restored/);
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("checkbox", {name: "Fish"})).toBeChecked();
    fireEvent.click(screen.getByRole("button", {name: "Review booking"}));
    expect(screen.queryByRole("button", {name: "Save to Event List"})).toBeNull();
    fireEvent.click(screen.getByRole("button", {name: "Confirm restored options"}));
    fireEvent.click(screen.getByRole("button", {name: "Review booking"}));
    fireEvent.click(screen.getByRole("button", {name: "Save to Event List"}));
    await screen.findByText(/Saved to Event List\. Configured/);
    expect((readCustomerEventList()[0] as CustomerPackageEventListItem).configuration).toMatchObject({
      sharedContractVersion: 2, expectedPackageRevision: 7, foodChoiceSelections: [{groupId: "main", optionIds: ["fish"]}], estimatedTotal: 180000});
  });
  it("keeps stale selections in storage until explicit correction and resave", async () => {
    const value = saved(true); value.configuration!.foodChoiceSelections = [{groupId: "main", optionIds: ["removed-dish"]}];
    value.configuration!.expectedPackageRevision = 6;
    addCustomerEventListItem(value);
    render(<EventCustomizationExperience planningOnly draftOwner="customer:customer-a" eventListEditProviderId={PROVIDER_ID} detail={detail(true)} eventServices={[]} />);
    await screen.findByText(/Food-choice groups or dishes require correction/);
    expect((readCustomerEventList()[0] as CustomerPackageEventListItem).configuration!.foodChoiceSelections![0].optionIds).toEqual(["removed-dish"]);
    fireEvent.click(screen.getByRole("button", {name: "Remove unavailable options and review current package"}));
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    fireEvent.click(screen.getByRole("button", {name: "Review booking"}));
    expect(screen.queryByRole("button", {name: "Save to Event List"})).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", {name: "Fish"}));
    fireEvent.click(screen.getByRole("button", {name: "Review booking"}));
    fireEvent.click(screen.getByRole("button", {name: "Save to Event List"}));
    await screen.findByText(/Saved to Event List\. Configured/);
    expect((readCustomerEventList()[0] as CustomerPackageEventListItem).configuration!.expectedPackageRevision).toBe(7);
  });
  it("never recreates an edit target cleared after restoration", async () => {
    await open(); await screen.findByText(/Saved configuration restored/);
    fireEvent.click(screen.getByRole("button", {name: "Confirm restored options"}));
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    fireEvent.click(screen.getByRole("button", {name: "Review booking"}));
    const {clearCustomerEventList} = await import("@/lib/customer/event-list/customer-event-list");
    clearCustomerEventList();
    fireEvent.click(screen.getByRole("button", {name: "Save to Event List"}));
    await screen.findByText(/was deleted or cleared/);
    expect(screen.getByRole("link", {name: "Return to Event List"})).toBeVisible();
    expect(readCustomerEventList()).toHaveLength(0);
  });
  it("missing saved configuration never falls back to an unrelated draft", async () => {
    await open(false, false); await screen.findByText(/no other draft has been loaded/);
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("");
    expect(readCustomerEventList()).toHaveLength(0);
  });
  it("blocks guest restoration after a signed-in identity appears", async () => {
    mocks.auth.currentUser = {uid: "another-account"};
    await open(); await screen.findByText(/Your session changed/);
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("");
    expect(mocks.submitBooking).not.toHaveBeenCalled();
  });
  it("restores only the selected entry for the authenticated customer", async () => {
    mocks.auth.currentUser = {uid: "customer-a"};
    addCustomerEventListItem(saved());
    saveCustomizationDraft(localStorage, customizationDraftKey("customer:customer-a", PROVIDER_ID, PACKAGE_ID, "null"),
      {...baseDraft, event: {...baseDraft.event, eventAddress: "Unrelated customer draft"}});
    render(<EventCustomizationExperience draftOwner="customer:customer-a" eventListEditProviderId={PROVIDER_ID}
      detail={detail()} eventServices={[]} />);
    await screen.findByText(/Saved configuration restored/);
    expect(screen.getByLabelText(/^Complete event address/)).toHaveValue("Saved ballroom");
    expect(mocks.submitBooking).not.toHaveBeenCalled();
  });
});

describe("Review Booking Event List save", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); localStorage.clear(); vi.clearAllMocks();
    mocks.auth.currentUser = {uid: "customer-a"}; mocks.auth.authStateReady.mockImplementation(async () => {});
    vi.setSystemTime(new Date("2026-09-01T02:00:00Z"));
    mocks.checkAvailability.mockResolvedValue([{providerId: PROVIDER_ID, available: true,
      reasonCode: null, message: "Available for your selected event."}]);
    mocks.loadDisclosures.mockResolvedValue({acknowledgementsRequired: true, policies: [primaryPolicy()]});
  });
  async function review(planningOnly = false, v2 = false) {
    const detail = detailFixture(packageSource);
    detail.customization.decorations = ["Flowers"]; detail.customization.furniture = ["Tables"];
    if (v2) Object.assign(detail.packageRecord, {sharedContractVersion: 2, revision: 7,
      pricingModel: "per_pax", foodChoiceGroups: [{id: "main", title: "Main", selectionCount: 1,
        options: [{id: "rice", name: "Rice"}, {id: "fish", name: "Fish"}]}]});
    const service = {id: "music", providerId: PROVIDER_ID, providerName: "Maria's Catering",
      name: "Music", description: null, category: "music", price: 500, imageUrl: null,
      source: "catering_provider" as const};
    const owner = planningOnly ? "guest" : "customer:customer-a";
    saveCustomizationDraft(localStorage, customizationDraftKey(owner, PROVIDER_ID, PACKAGE_ID, "null"), {
      ...baseDraft, event: {...baseDraft.event, eventType: "wedding", eventDate: "2026-09-20",
        eventTime: "18:00", eventEndTime: "22:00", guestCount: "100", eventLocation: "Ormoc City",
        eventAddress: "Grand Ballroom", specialRequest: "No peanuts"},
      customization: {selectedFoods: v2 ? [] : ["Lechon"], selectedDecorations: v2 ? [] : ["Flowers"],
        selectedFurniture: v2 ? [] : ["Tables"],
        ...(v2 ? {foodChoiceSelections: [{groupId: "main", optionIds: ["fish"]}]} : {})},
      addonIds: ["music"], serviceTier: "full_service", packageThemeId: "theme_garden",
      themeInspiration: {notes: "Rustic lights", referenceSetupId: "setup-one"},
    });
    render(<EventCustomizationExperience detail={detail} eventServices={[service]}
      planningOnly={planningOnly} draftOwner={owner} />);
    await screen.findByText(/Draft restored/);
    if (!planningOnly) await screen.findByText("Maria's Catering is available");
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    fireEvent.click(screen.getByRole("button", {name: "Review booking"}));
    return screen.getByRole("button", {name: /^(Save to|Add to|Already in) Event List$/});
  }
  it.each([false])("saves all selections, replaces by identity and prevents downgrade; guest=%s", async guest => {
    mocks.auth.currentUser = guest ? null : {uid: "customer-a"};
    const save = await review(guest);
    fireEvent.click(save); fireEvent.click(save);
    await screen.findByText(/Saved to Event List\. Configured/);
    expect(save).toBeDisabled();
    const saved = readCustomerEventList()[0] as CustomerPackageEventListItem;
    expect(saved.configuration).toMatchObject({event: {specialRequest: "No peanuts", guestCount: 100},
      selectedFoods: ["Lechon"], selectedDecorations: ["Flowers"], selectedFurniture: ["Tables"],
      serviceTier: "full_service", packageThemeId: "theme_garden",
      themeInspiration: {notes: "Rustic lights", referenceSetupId: "setup-one"},
      selectedEventServices: [{id: "music", source: "catering_provider"}], estimatedTotal: 180500});
    const serialized = localStorage.getItem(CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:customer-a")!;
    expect(serialized).not.toMatch(/clientRequestId|acknowledgement|bookingToken|paymentToken/iu);
    expect(mocks.submitBooking).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(addCustomerEventListItem({...saved, configuration: undefined})).toBe(true);
    expect((readCustomerEventList()[0] as CustomerPackageEventListItem).configuration).toEqual(saved.configuration);
    const updated = {...saved, configuration: {...saved.configuration!, event: {...saved.configuration!.event, specialRequest: "Updated"}}};
    expect(addCustomerEventListItem(updated)).toBe(true); expect(readCustomerEventList()).toHaveLength(1);
    expect((readCustomerEventList()[0] as CustomerPackageEventListItem).configuration!.event.specialRequest).toBe("Updated");
  });
  it("detects a saved configuration after reopening and allows adding after clearing", async () => {
    fireEvent.click(await review());
    await screen.findByText(/Saved to Event List\. Configured/);
    cleanup();
    const reopened = await review();
    expect(reopened).toHaveTextContent("Already in Event List");
    expect(reopened).toBeDisabled();
    expect(readCustomerEventList()).toHaveLength(1);
    fireEvent.click(reopened);
    expect(readCustomerEventList()).toHaveLength(1);
    const {clearCustomerEventList} = await import("@/lib/customer/event-list/customer-event-list");
    const {act} = await import("@testing-library/react");
    act(() => clearCustomerEventList());
    expect(screen.getByRole("button", {name: "Add to Event List"})).toBeEnabled();
    fireEvent.click(screen.getByRole("button", {name: "Add to Event List"}));
    await screen.findByText(/Saved to Event List\. Configured/);
    expect(readCustomerEventList()).toHaveLength(1);
  });
  it("guests can review but cannot save", async () => {
    mocks.auth.currentUser = null;
    const save = await review(true);
    expect(save).toBeDisabled(); fireEvent.click(save);
    expect(readCustomerEventList()).toHaveLength(0);
    expect(mocks.submitBooking).not.toHaveBeenCalled();
  });
  it("preserves V2 IDs, revision, theme and display-only per-guest price", async () => {
    mocks.auth.currentUser = {uid: "customer-a"};
    fireEvent.click(await review(false, true));
    await screen.findByText(/Saved to Event List\. Configured/);
    expect((readCustomerEventList()[0] as CustomerPackageEventListItem).configuration).toMatchObject({
      sharedContractVersion: 2, expectedPackageRevision: 7,
      foodChoiceSelections: [{groupId: "main", optionIds: ["fish"]}],
      serviceTier: "full_service", packageThemeId: "theme_garden", estimatedTotal: null,
      pricingContext: {currency: "PHP", pricingModel: "per_pax", displayedServicePrice: 180000},
    });
  });
  it.each(["throw", "mismatch", "read"])("reports persistence failure and allows retry: %s", async failure => {
    const save = await review();
    const originalSet = Storage.prototype.setItem, originalGet = Storage.prototype.getItem;
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:customer-a") {
        if (failure === "throw") throw new Error("Storage denied");
        if (failure === "mismatch") return;
      }
      originalSet.call(this, key, value);
    });
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key) {
      if (key === CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:customer-a" && failure === "read") throw new Error("Storage denied");
      return originalGet.call(this, key);
    });
    fireEvent.click(save);
    await screen.findByText(/Could not verify your Event List/);
    expect(save).not.toBeDisabled(); expect(screen.queryByText(/Saved to Event List\. Configured/)).toBeNull();
    set.mockRestore(); get.mockRestore(); fireEvent.click(save);
    await screen.findByText(/Saved to Event List\. Configured/);
    expect(mocks.submitBooking).not.toHaveBeenCalled();
  });
  it.each([true, false])("blocks a changed customer or non-guest SDK identity; planning=%s", async guest => {
    mocks.auth.currentUser = guest ? null : {uid: "customer-a"};
    const save = await review(guest);
    mocks.auth.currentUser = {uid: "other-account"}; fireEvent.click(save);
    if (guest) { expect(save).toBeDisabled(); expect(readCustomerEventList()).toHaveLength(0); return; }
    // Session changes remount the editor and discard the prior account form.
    await waitFor(() => expect(screen.getByRole("heading", {name: "Event details"})).toBeInTheDocument());
    expect(readCustomerEventList()).toHaveLength(0); expect(mocks.submitBooking).not.toHaveBeenCalled();
  });
  it("locks repeated taps while authentication initializes", async () => {
    const save = await review();
    let ready!: () => void;
    mocks.auth.authStateReady.mockImplementation(() => new Promise<void>(resolve => {ready = resolve;}));
    fireEvent.click(save); fireEvent.click(save);
    await waitFor(() => expect(mocks.auth.authStateReady).toHaveBeenCalledOnce());
    expect(save).toBeDisabled(); expect(readCustomerEventList()).toHaveLength(0);
    ready(); await screen.findByText(/Saved to Event List\. Configured/);
    expect(readCustomerEventList()).toHaveLength(1);
  });
});

async function fillEventDetails() {
  const date = screen.getByLabelText(/^Event date/);
  if (date.tagName === "INPUT") {
    fireEvent.change(date, {target: {value: "2026-09-20"}});
  } else {
    fireEvent.click(date);
    fireEvent.click(await screen.findByRole("button", {name: "September 20, 2026, Available"}));
  }
  fireEvent.change(screen.getByLabelText(/^Start time/), {target: {value: "18:00"}});
  fireEvent.change(screen.getByLabelText(/^End time/), {target: {value: "22:00"}});
  fireEvent.change(screen.getByLabelText(/^Number of guests/iu), {target: {value: "100"}});
  fireEvent.change(screen.getByLabelText(/^Complete event address/iu), {
    target: {value: "Grand Ballroom, Ormoc City"},
  });
}

function detailFixture(offer?: {
  serviceOptions?: PublicPackageDetail["packageRecord"]["serviceOptions"];
  themeOptions?: PublicPackageDetail["packageRecord"]["themeOptions"];
}): PublicPackageDetail {
  return {
    packageRecord: {
      id: PACKAGE_ID,
      providerId: PROVIDER_ID,
      providerName: "Maria's Catering",
      name: "Wedding celebration",
      description: "A complete celebration package.",
      eventType: "wedding",
      price: 100_000,
      serviceOptions: offer?.serviceOptions,
      themeOptions: offer?.themeOptions,
      imageUrl: null,
      minimumGuests: 50,
      maximumGuests: 150,
      inclusions: ["Buffet"],
    },
    provider: {
      id: PROVIDER_ID,
      businessName: "Maria's Catering",
      description: "Catering provider",
      serviceType: "catering",
      primaryCategory: "catering_service",
      categories: ["catering_service"],
      location: "Ormoc City",
      serviceAreas: ["Ormoc City"],
      eventTypes: ["wedding"],
      operatingDays: ["thursday"],
      bookingLeadTimeDays: 7,
      minimumGuests: 50,
      maximumGuests: 150,
      logoUrl: null,
      coverImageUrl: null,
      approvalLabel: "Approved",
    },
    customization: {
      foods: ["Lechon"],
      decorations: [],
      furniture: [],
      services: [],
    },
  };
}

function primaryPolicy(): CustomerRefundPolicyDisclosure {
  return {
    providerId: PROVIDER_ID,
    providerName: "Maria's Catering",
    effectivePolicyKey: "provider_default:primary:v4",
    sourceKind: "provider_default",
    rules: [
      {stage: "preparation_not_started", refundBasisPoints: 10_000},
      {stage: "preparation_started", refundBasisPoints: 5_000},
      {stage: "service_started", refundBasisPoints: 0},
    ],
    terms: null,
  };
}
