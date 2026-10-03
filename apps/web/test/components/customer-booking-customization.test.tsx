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
  loadDisclosures: vi.fn(),
  submitBooking: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({replace: mocks.replace, push: vi.fn()}),
}));

vi.mock("@/lib/customer/bookings/customer-provider-availability-client", () => ({
  checkCustomerProviderAvailability: mocks.checkAvailability,
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
    expect(screen.getByText("Selected")).toBeVisible();
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

  it("keeps legacy package customization and existing food selections", async () => {
    const user = userEvent.setup();
    render(
      <EventCustomizationExperience
        planningOnly
        detail={detailFixture()}
        eventServices={[]}
      />,
    );

    fillEventDetails();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Customize your package"})).toBeVisible();
    expect(screen.getByText(/does not publish separate catering service levels/u)).toBeVisible();
    await user.click(screen.getByRole("checkbox", {name: "Lechon"}));
    expect(screen.getByRole("checkbox", {name: "Lechon"})).toBeChecked();
    await user.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("heading", {name: "Add event services"})).toBeVisible();
  });

  it("requires a published tier, clears an incompatible theme, and does not submit client prices", async () => {
    const user = userEvent.setup();
    render(
      <EventCustomizationExperience
        detail={detailFixture(packageSource)}
        eventServices={[]}
      />,
    );

    fillEventDetails();
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
    expect(within(estimate as HTMLElement).getAllByText(/100,000/u).length).toBeGreaterThan(0);
    expect(within(estimate as HTMLElement).queryByText(/180,000/u)).not.toBeInTheDocument();
    expect(screen.getAllByText(/180,000/u).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("checkbox", {name: /I have reviewed/u}));
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
    fillEventDetails();
    fireEvent.click(screen.getByRole("button", {name: "Continue"}));
    expect(screen.getByRole("checkbox", {name: "Lechon"})).toBeChecked();
    expect(screen.queryByRole("radio", {name: /Full-Service Catering/u})).not.toBeInTheDocument();
    expect(screen.getByRole("radio", {name: /Buffet Setup/u})).not.toBeChecked();
    expect(screen.queryByLabelText("Visual notes")).not.toBeInTheDocument();
  });
});

function fillEventDetails() {
  fireEvent.change(screen.getByLabelText("Event date"), {target: {value: "2026-09-20"}});
  fireEvent.change(screen.getByLabelText("Start time"), {target: {value: "18:00"}});
  fireEvent.change(screen.getByLabelText("End time"), {target: {value: "22:00"}});
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
