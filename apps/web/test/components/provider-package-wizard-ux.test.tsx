import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
import {createProviderPackage, updateProviderPackage} from "@/lib/provider/provider-package-client";
import {uploadProviderServiceImage} from "@/lib/provider/provider-media-client";
vi.mock("@/lib/provider/provider-package-client", () => ({createProviderPackage: vi.fn(), updateProviderPackage: vi.fn()}));
vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: vi.fn()}));
const occasionCatalog = {options: [{id: "birthday", label: "Birthday", categoryCodes: ["food_catering", "catering_service"]}, {id: "wedding", label: "Wedding", categoryCodes: ["food_catering", "catering_service"]}], catalogRevision: 4, providerEligibilityRevision: 2, maxSpecificOccasions: 5};
const props = {occasionCatalog, packageCategoryOptions: [{code: "food_catering", name: "Catering"}], eventTypesSupported: ["birthday"], minGuestsPerEvent: 10, maxGuestsPerEvent: 100, onSaved: vi.fn(), onCancel: vi.fn()};
const next = () => fireEvent.click(screen.getByRole("button", {name: "Next"}));
beforeEach(() => vi.clearAllMocks());

describe("wizard UX", () => {
  it.each(["per_pax", "per_bundle"] as const)("creates a %s draft only after explicit final save", async (pricingModel) => {
    const {container} = render(<ProviderPackageForm {...props} />);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByText(/your authorized service category/)).toBeVisible();
    expect(screen.queryByRole("button", {name: /Request.*occasion/i})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Birthday package"}});
    fireEvent.change(screen.getByLabelText(/Description/), {target: {value: "A complete birthday celebration"}});
    next();
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
    expect(updateProviderPackage).not.toHaveBeenCalled();
    expect(uploadProviderServiceImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "Create draft package"}));
    await waitFor(() => expect(createProviderPackage).toHaveBeenCalledTimes(1));
    expect(createProviderPackage).toHaveBeenCalledWith(expect.objectContaining({eventType: "birthday", serviceCategoryCode: "food_catering", pricingModel}));
    const payload = vi.mocked(createProviderPackage).mock.calls[0][0];
    for (const key of ["occasionIds", "occasionNames", "foodChoiceGroups", "equipmentInclusions", "previewGuestCount", "previewTier"]) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload.serviceOptions).toEqual({drop_off: {price: 100.25, includedServices: []}});
  });
  it("retains the selector for multiple authorized categories", () => {
    render(<ProviderPackageForm {...props} packageCategoryOptions={[...props.packageCategoryOptions, {code: "other", name: "Other"}]} />);
    expect(screen.getByLabelText(/Service category/)).toHaveValue("");
  });
});
