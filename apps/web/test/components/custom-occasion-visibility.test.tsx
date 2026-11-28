import {fireEvent, render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
import {ProviderPackageCard} from "@/app/provider/packages/provider-package-card";
import {PublicPackageCard} from "@/components/customer/packages/public-package-card";
import {PackageDetail} from "@/components/customer/packages/package-detail";
import {ProviderProfile} from "@/components/customer/providers/provider-profile";
import {
  formatBookingEventTypeLabel,
  formatPackageOccasionLabels,
} from "@/lib/customer/discovery/package-occasion-labels";
import {humanizeProviderValue} from "@/lib/customer/providers/provider-catalog";
import type {PublicPackage} from "@/lib/customer/discovery/marketplace-types";
import type {PublicProvider} from "@/lib/customer/providers/provider-types";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";

vi.mock("@/components/customer/layout/customer-auth-provider", () => ({
  CustomerAuthLink: ({href, children, className}: {href: string; children: React.ReactNode; className?: string}) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock("@/components/customer/providers/provider-public-reviews", () => ({
  ProviderPublicReviews: () => <section id="provider-reviews">Reviews</section>,
}));

vi.mock("@/lib/provider/provider-package-v2-client", () => ({
  packageV2Enabled: true,
  packageV2PublicationEnabled: true,
  createV2PackageDraft: vi.fn(),
  updateV2PackageDraft: vi.fn(),
  completeV2PackageProgress: vi.fn(),
  hasPendingV2Draft: vi.fn(() => false),
  retryPendingV2Draft: vi.fn(),
}));

const provider: PublicProvider = {
  id: "prov_gabriel",
  businessName: "Gabriel Catering",
  description: "Full-service catering for fiestas and celebrations.",
  serviceType: "catering",
  primaryCategory: "food_catering",
  categories: ["food_catering"],
  location: "Ormoc City",
  serviceAreas: ["Ormoc City"],
  eventTypes: ["birthday", "other"],
  operatingDays: ["monday", "saturday"],
  bookingLeadTimeDays: 3,
  minimumGuests: 30,
  maximumGuests: 300,
  logoUrl: null,
  coverImageUrl: null,
  approvalLabel: "Approved",
};

const basePublicPackage: PublicPackage = {
  id: "pkg_fiesta",
  providerId: provider.id,
  providerName: provider.businessName,
  name: "Fiesta Lechon Buffet",
  description: "Celebration buffet built for fiesta gatherings.",
  eventType: "other",
  occasionScope: "specific",
  occasionMatchIds: ["birthday", "other"],
  price: 25000,
  paymentPolicy: "full_payment",
  depositPercentage: 100,
  imageUrl: null,
  minimumGuests: 50,
  maximumGuests: 150,
  inclusions: ["Roasted Lechon"],
};

describe("custom occasion visibility & editor UX", () => {
  it("hides the auto-added Other chip in the editor and cleans it up when the custom occasion is removed", async () => {
    const occasionCatalog = {
      options: [
        {id: "birthday", label: "Birthday", categoryCodes: ["food_catering"]},
        {id: "other", label: "Other", categoryCodes: ["food_catering"]},
      ],
      catalogRevision: 1,
      eligibilityModel: "global_v1" as const,
      maxSpecificOccasions: 10,
    };

    render(
      <ProviderPackageForm
        occasionCatalog={occasionCatalog}
        loadPrivateOccasions={async () => ({available: [], selected: []})}
        packageCategoryOptions={[{code: "food_catering", name: "Catering"}]}
        eventTypesSupported={["birthday", "other"]}
        minGuestsPerEvent={10}
        maxGuestsPerEvent={200}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const createCustom = await screen.findByRole("option", {name: "Create custom occasion"});
    fireEvent.change(screen.getByRole("combobox", {name: /Suitable occasions/}), {
      target: {value: createCustom.getAttribute("value")},
    });
    fireEvent.change(screen.getByLabelText("Custom occasion name"), {
      target: {value: "Barangay Fiesta"},
    });
    fireEvent.click(screen.getByRole("button", {name: "Add selected occasion"}));

    const chipList = screen.getByRole("list", {name: "Selected occasions"});
    expect(within(chipList).getByText("Barangay Fiesta (custom)")).toBeVisible();
    expect(within(chipList).queryByText("Other")).not.toBeInTheDocument();
    expect(screen.getByText(/Custom occasions appear on your storefront and package page/)).toBeVisible();

    // Removing the only custom occasion also removes the hidden auto-added Other mapping.
    fireEvent.click(screen.getByRole("button", {name: "Remove Barangay Fiesta custom occasion"}));
    expect(screen.queryByRole("list", {name: "Selected occasions"})).not.toBeInTheDocument();
  });

  it("shows Other in global marketplace catalog cards, but Barangay Fiesta on provider storefront and package detail", () => {
    const {rerender} = render(
      <PublicPackageCard packageRecord={basePublicPackage} marketplaceHref="/customer/packages" />,
    );
    // Global catalog has no customOccasionLabels -> shows standard catalog occasions ("Birthday, Other").
    expect(screen.getByText("Birthday, Other")).toBeVisible();
    expect(screen.queryByText(/Barangay Fiesta/)).not.toBeInTheDocument();

    // Provider storefront card receives customOccasionLabels -> shows "Birthday, Barangay Fiesta".
    const storefrontPackage: PublicPackage = {
      ...basePublicPackage,
      customOccasionLabels: ["Barangay Fiesta"],
    };
    rerender(
      <PublicPackageCard
        packageRecord={storefrontPackage}
        marketplaceHref="/customer/providers/prov_gabriel"
        layout="provider-profile"
        showProvider={false}
      />,
    );
    expect(screen.getByText("Birthday, Barangay Fiesta")).toBeVisible();
    expect(screen.queryByText("Birthday, Other")).not.toBeInTheDocument();
  });

  it("shows Barangay Fiesta on the ProviderProfile storefront and PackageDetail page", () => {
    const storefrontPackage: PublicPackage = {
      ...basePublicPackage,
      occasionMatchIds: ["other"],
      customOccasionLabels: ["Barangay Fiesta"],
    };

    render(
      <ProviderProfile
        detail={{provider, packages: [storefrontPackage]}}
        serviceCategoryOptions={[{code: "food_catering", name: "Catering", serviceType: "catering", status: "active"}]}
      />,
    );

    // Visible both in Supported event types and on the storefront package card.
    expect(screen.getAllByText("Barangay Fiesta").length).toBeGreaterThanOrEqual(2);

    render(
      <PackageDetail
        detail={{
          packageRecord: storefrontPackage,
          provider,
          customization: {foods: ["Lechon"], decorations: [], furniture: [], services: []},
        }}
      />,
    );
    const eventFit = screen.getByRole("region", {name: "Event fit"});
    expect(within(eventFit).getByText("Barangay Fiesta")).toBeVisible();
    expect(within(eventFit).queryByText("Other")).not.toBeInTheDocument();
  });

  it("shows custom occasions on provider package cards and maps booking eventType label without changing the canonical ID", () => {
    expect(
      formatPackageOccasionLabels(
        {occasionScope: "specific", occasionMatchIds: ["other"], customOccasionLabels: ["Barangay Fiesta"]},
        humanizeProviderValue,
      ),
    ).toEqual(["Barangay Fiesta"]);
    expect(
      formatBookingEventTypeLabel("other", ["Barangay Fiesta"], humanizeProviderValue),
    ).toBe("Barangay Fiesta");
    expect(
      formatBookingEventTypeLabel("birthday", ["Barangay Fiesta"], humanizeProviderValue),
    ).toBe("Birthday");

    const providerPkg: ProviderPackage = {
      id: "pkg_fiesta",
      providerId: "prov_gabriel",
      name: "Fiesta Lechon Buffet",
      description: "Celebration buffet.",
      eventType: "other",
      serviceCategoryCode: "food_catering",
      price: 25000,
      serviceOptions: {drop_off: {price: 25000, includedServices: ["Delivery"]}},
      themeOptions: [],
      paymentPolicy: "full_payment",
      depositPercentage: 100,
      balanceDueDaysBeforeEvent: null,
      downPaymentPercentage: 100,
      minimumGuests: 50,
      maximumGuests: 150,
      imageUrl: "",
      imageUrls: [],
      foodInclusions: ["Main: Lechon"],
      decorInclusions: [],
      furnitureInclusions: [],
      serviceInclusions: [],
      status: "published",
      isActive: true,
      isPublished: true,
      providerPubliclyVisible: true,
      pricingModel: "per_bundle",
      v2: {
        revision: 1,
        offerStructure: "fixed",
        occasionScope: "specific",
        occasionIds: ["other"],
        equipmentInclusions: [],
        serviceOptions: {drop_off: {price: 25000, includedServices: ["Delivery"]}},
      },
    };
    render(
      <ProviderPackageCard
        item={providerPkg}
        customOccasionLabels={["Barangay Fiesta"]}
        onEdit={vi.fn()}
        onPublish={vi.fn()}
        onArchive={vi.fn()}
      />,
    );
    expect(screen.getByText("Barangay Fiesta")).toBeVisible();
  });
});
