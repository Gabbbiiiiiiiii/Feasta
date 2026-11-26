import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
import {createProviderPackage, updateProviderPackage} from "@/lib/provider/provider-package-client";
import {uploadProviderServiceImage} from "@/lib/provider/provider-media-client";
import {createV2PackageDraft} from "@/lib/provider/provider-package-v2-client";
vi.mock("@/lib/provider/provider-package-client", () => ({createProviderPackage: vi.fn(), updateProviderPackage: vi.fn(), publishProviderPackage: vi.fn()}));
vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: vi.fn()}));
vi.mock("@/app/provider/packages/dish-library-actions", () => ({
  loadDishLibrary: async () => ({
    revision: 1,
    categories: ["Rice"],
    dishes: [{id: "rice", name: "Steamed rice", category: "Rice"}],
  }),
}));
vi.mock("@/lib/provider/provider-package-v2-client", () => ({
  packageV2Enabled: true,
  packageV2PublicationEnabled: false,
  createV2PackageDraft: vi.fn(),
  updateV2PackageDraft: vi.fn(),
  completeV2PackageProgress: vi.fn(),
  hasPendingV2Draft: vi.fn(() => false),
  retryPendingV2Draft: vi.fn(),
}));
const occasionCatalog = {options: [{id: "birthday", label: "Birthday", categoryCodes: ["food_catering", "catering_service"]}, {id: "wedding", label: "Wedding", categoryCodes: ["food_catering", "catering_service"]}], catalogRevision: 4, eligibilityModel: "global_v1" as const, maxSpecificOccasions: 5};
const props = {occasionCatalog, packageCategoryOptions: [{code: "food_catering", name: "Catering"}], eventTypesSupported: ["birthday"], minGuestsPerEvent: 10, maxGuestsPerEvent: 100, onSaved: vi.fn(), onCancel: vi.fn()};
const next = () => fireEvent.click(screen.getByRole("button", {name: "Next"}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createV2PackageDraft).mockResolvedValue({
    packageId: "new",
    packageRevision: 1,
    status: "draft",
  } as Awaited<ReturnType<typeof createV2PackageDraft>>);
});

describe("wizard UX", () => {
  it.each(["per_pax", "per_bundle"] as const)("creates a %s draft only after explicit final save", async (pricingModel) => {
    const {container} = render(<ProviderPackageForm {...props} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByText(/your authorized service category/)).toBeVisible();
    expect(screen.queryByRole("button", {name: /Request.*occasion/i})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Birthday package"}});
    fireEvent.change(screen.getByLabelText(/Description/), {target: {value: "A complete birthday celebration"}});
    fireEvent.change(screen.getByLabelText(/Suitable occasions/), {target: {value: "birthday"}});
    fireEvent.click(screen.getByRole("button", {name: "Add selected occasion"}));
    next();
    expect(screen.getByRole("heading", {name: "Step 2: Pricing & capacity"})).toBeVisible();
    expect(screen.queryByRole("complementary", {name: "Live package summary"})).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Preview service tier")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Preview guest count")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Pricing model/)).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Pricing model/), {target: {value: pricingModel}});
    fireEvent.click(screen.getByRole("checkbox", {name: /Drop-Off Catering/}));
    fireEvent.change(screen.getByLabelText(/Drop-Off Catering price/), {target: {value: "100.25"}});
    fireEvent.change(screen.getByLabelText(/Minimum guests/), {target: {value: "10"}});
    fireEvent.change(screen.getByLabelText(/Maximum guests/), {target: {value: "30"}});
    next();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Package structure/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Choose from Dish List"}));
    const picker = within(await screen.findByRole("dialog", {name: "Dish Library"}));
    fireEvent.click(await picker.findByRole("checkbox", {name: "Select all Rice"}));
    fireEvent.click(picker.getByRole("button", {name: "Add 1 selected dish"}));
    fireEvent.submit(container.querySelector("form")!);
    next();
    expect(screen.getByRole("heading", {name: /Step 4:/})).toBeVisible();
    expect(screen.getByRole("button", {name: "Next"})).toHaveAttribute("type", "button");
    fireEvent.submit(container.querySelector("form")!);
    next();
    expect(screen.getByRole("heading", {name: /Step 5:/})).toBeVisible();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByText(/estimated subtotal|guest count to preview/i)).not.toBeInTheDocument();
    expect(createProviderPackage).not.toHaveBeenCalled();
    expect(createV2PackageDraft).not.toHaveBeenCalled();
    expect(updateProviderPackage).not.toHaveBeenCalled();
    expect(uploadProviderServiceImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "Save as Draft"}));
    expect(screen.getByText("Save package as draft?")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", {name: "FEASTA Confirmation"})).getByRole("button", {name: "Save as Draft"}));
    await waitFor(() => expect(createV2PackageDraft).toHaveBeenCalledTimes(1));
    expect(createProviderPackage).not.toHaveBeenCalled();
    expect(createV2PackageDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        offerStructure: "fixed",
        serviceCategoryCode: "food_catering",
        pricingModel,
        occasionIds: ["birthday"],
      })
    );
    const payload = vi.mocked(createV2PackageDraft).mock.calls[0][0];
    for (const key of ["previewGuestCount", "previewTier"]) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload.serviceOptions).toMatchObject({drop_off: {price: 100.25, includedServices: []}});
  });
  function openPricingStep() {
    render(<ProviderPackageForm {...props} />);
    fireEvent.change(screen.getByLabelText(/Suitable occasions/), {target: {value: "birthday"}});
    fireEvent.click(screen.getByRole("button", {name: "Add selected occasion"}));
    fireEvent.change(screen.getByLabelText(/Package name/), {
      target: {value: "Birthday catering"},
    });
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: {value: "Complete catering for birthday celebrations."},
    });
    next();
    expect(screen.getByRole("heading", {
      name: "Step 2: Pricing & capacity",
    })).toBeVisible();
  }

  function configurePricing() {
    fireEvent.click(screen.getByRole("checkbox", {
      name: /Drop-Off Catering/,
    }));
    fireEvent.change(screen.getByLabelText(/Drop-Off Catering price/), {
      target: {value: "150.25"},
    });
    fireEvent.change(screen.getByLabelText(/Minimum guests/), {
      target: {value: "10"},
    });
    fireEvent.change(screen.getByLabelText(/Maximum guests/), {
      target: {value: "30"},
    });
  }

  it("rejects invalid minimum guest counts on Step 2", () => {
    openPricingStep();
    configurePricing();

    for (const invalid of ["", "10.5", "-1", "1e2", "9", "101"]) {
      fireEvent.change(screen.getByLabelText(/Minimum guests/), {
        target: {value: invalid},
      });
      next();
      expect(screen.getByRole("heading", {
        name: "Step 2: Pricing & capacity",
      })).toBeVisible();
    }

    fireEvent.change(screen.getByLabelText(/Minimum guests/), {
      target: {value: "10"},
    });
    next();
    expect(screen.getByRole("heading", {
      name: "Step 3: Food menu",
    })).toBeVisible();
  });

  it("rejects invalid maximum guest counts on Step 2", () => {
    openPricingStep();
    configurePricing();

    for (const invalid of ["", "30.5", "-1", "1e2", "9", "101"]) {
      fireEvent.change(screen.getByLabelText(/Maximum guests/), {
        target: {value: invalid},
      });
      next();
      expect(screen.getByRole("heading", {
        name: "Step 2: Pricing & capacity",
      })).toBeVisible();
    }

    fireEvent.change(screen.getByLabelText(/Maximum guests/), {
      target: {value: "30"},
    });
    next();
    expect(screen.getByRole("heading", {
      name: "Step 3: Food menu",
    })).toBeVisible();
  });

  it("preserves tier prices when switching pricing models", () => {
    openPricingStep();
    configurePricing();

    const price = screen.getByLabelText(/Drop-Off Catering price/);
    const model = screen.getByLabelText(/Pricing model/);

    expect(model).toHaveValue("per_pax");
    expect(price).toHaveValue("150.25");

    fireEvent.change(model, {target: {value: "per_bundle"}});
    expect(model).toHaveValue("per_bundle");
    expect(price).toHaveValue("150.25");

    fireEvent.change(model, {target: {value: "per_pax"}});
    expect(model).toHaveValue("per_pax");
    expect(price).toHaveValue("150.25");

    next();
    expect(screen.getByRole("heading", {
      name: "Step 3: Food menu",
    })).toBeVisible();
  });
  it("retains the selector for multiple authorized categories", () => {
    render(<ProviderPackageForm {...props} packageCategoryOptions={[...props.packageCategoryOptions, {code: "other", name: "Other"}]} />);
    expect(screen.getByLabelText(/Service category/)).toHaveValue("");
  });
});
