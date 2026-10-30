import type {ComponentProps} from "react";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {BookingOfferSelection} from "@/components/customer/bookings/booking-offer-selection";
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
  checkAvailability: vi.fn(),
  loadCalendar: vi.fn(async (_providerId: string, month: string) => ({month, dates: [] as Array<{date: string; state: "booked" | "on_hold" | "unavailable"}>})),
  loadDisclosures: vi.fn(),
  submitBooking: vi.fn(),
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
  bookingSubmissionRequiresRefundPolicyRefresh: () => false,
}));

vi.mock("@/lib/firebase/client", () => ({
  auth: {},
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
  ) {
    return <BookingOfferSelection availableTiers={["drop_off", "buffet_setup", "full_service"]}
      serviceOptions={serviceOptions} serviceTier={serviceTier} themesApplicable={false}
      hasThemeOptions={false} packageThemeId={null} availableThemes={[]}
      themeInspiration={{notes: "", referenceSetupId: null}} error={null}
      onServiceTierChange={vi.fn()} onPackageThemeChange={vi.fn()} onThemeInspirationChange={vi.fn()} />;
  }

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
    expect(premium).toHaveClass("border-primary/50", "via-primary-tint/75", "backdrop-blur-sm", "isolate", "before:pointer-events-none", "after:pointer-events-none");
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
    expect(fullCard).toHaveClass("border-primary", "via-primary-tint-strong/70", "backdrop-blur-sm");
    expect(within(fullCard).getByText("Premium Tier")).toHaveClass("bg-white/85", "border-primary/15", "text-primary-strong");
    expect(fullCard).not.toHaveClass("ring-1");
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
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
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
    expect(within(progress).getAllByRole("listitem")).toHaveLength(4);
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
      await user.click(screen.getByRole("button", {name: "Continue"}));
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
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Add event services"})).toBeVisible();
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
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Add event services"})).toBeVisible();
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
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Add event services"})).toBeVisible();
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
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Add event services"})).toBeVisible();
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
    await user.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByRole("alert")).toHaveTextContent(/required number/);
    expect(mocks.submitBooking).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox",{name:"Chicken Afritada"}));
    expect(screen.getByRole("checkbox",{name:"Pork Menudo"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:"Continue"}));
    await user.click(screen.getByRole("button",{name:"Review booking"}));
    expect(await screen.findByRole("heading",{name:"Review your booking request"})).toBeVisible();
    expect(screen.getByText("Chicken Afritada")).toBeVisible();
    for(const checkbox of await screen.findAllByRole("checkbox",{name:/I have reviewed/})) await user.click(checkbox);
    await user.click(screen.getByRole("button",{name:"Submit booking request"}));
    await waitFor(()=>expect(mocks.submitBooking).toHaveBeenCalledTimes(1));
    expect(mocks.submitBooking.mock.calls[0][0].foodChoiceSelections).toEqual([{groupId:"main",optionIds:["chicken"]}]);
    expect(JSON.stringify(mocks.submitBooking.mock.calls[0][0])).not.toContain("Chicken Afritada");
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
    await user.click(screen.getByRole("button",{name:"Continue"}));
    expect(screen.getByRole("alert")).toHaveTextContent(/required number/);
    expect(mocks.submitBooking).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox",{name:"Chicken Afritada"}));
    expect(screen.getByRole("checkbox",{name:"Pork Menudo"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:"Continue"}));
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
    await user.click(screen.getByRole("button", {name: "Continue"}));
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
    await user.click(screen.getByRole("button", {name: "Continue"}));
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
    await user.click(screen.getByRole("button", {name: "Continue"}));
    await user.click(screen.getByRole("button", {name: "Review booking"}));
    expect(await screen.findByRole("heading", {name: "Review your booking request"})).toBeVisible();
    const estimate = screen.getByRole("heading", {name: "Review the displayed cost before submission."}).closest("section")!;
    expect(estimate).toHaveTextContent("5,000");
    expect(estimate).not.toHaveTextContent("2,000");
    expect(sidebar).toHaveTextContent("5,000");
    await user.click(screen.getByRole("button", {name: "Back"}));
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
