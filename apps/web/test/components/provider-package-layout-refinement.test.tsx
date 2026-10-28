import {fireEvent, render, screen, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
import {ProviderPackageFoodMenu} from "@/app/provider/packages/provider-package-food-menu";
import {ProviderPackageReview} from "@/app/provider/packages/provider-package-review";
import {createProviderPackageOfferDraft} from "@/app/provider/packages/provider-package-offer-builder";

vi.mock("@/lib/provider/provider-package-client", () => ({createProviderPackage: vi.fn(), updateProviderPackage: vi.fn()}));
vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: vi.fn()}));

describe("package layout refinement", () => {
  it("keeps progress and actions outside scrolling content with a labeled read-only category", () => {
    render(<ProviderPackageForm dialogLayout packageCategoryOptions={[{code: "food_catering", name: "Catering"}]} eventTypesSupported={["birthday"]} minGuestsPerEvent={10} maxGuestsPerEvent={100} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const content = screen.getByRole("region", {name: "Package details"});
    expect(content).not.toContainElement(screen.getByRole("navigation", {name: "Package creation progress"}));
    expect(content).not.toContainElement(screen.getByRole("button", {name: "Next"}));
    expect(screen.getByLabelText(/Service category/)).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/Service category/)).toHaveValue("Catering");
    fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Birthday package"}});
    fireEvent.change(screen.getByLabelText(/Description/), {target: {value: "Birthday catering"}});
    fireEvent.click(screen.getByRole("button", {name: "Next"}));
    expect(screen.getByRole("region", {name: "Guest capacity"})).toBeVisible();
    expect(screen.getByRole("region", {name: "Payment and starting price"})).toBeVisible();
  });

  it("explains how to start an empty menu and keeps both actions available", () => {
    render(<ProviderPackageFoodMenu value={[]} onChange={vi.fn()} />);
    expect(screen.getByRole("heading", {name: "No dishes added"})).toBeVisible();
    expect(screen.getByText(/Use Add Dish to list/)).toBeVisible();
    expect(screen.getByRole("button", {name: "Add Dish"})).toBeEnabled();
    expect(screen.getByRole("button", {name: "Add Category"})).toBeEnabled();
  });

  it("identifies the review cover and empty optional sections", () => {
    render(<ProviderPackageReview name="Birthday" description="Catering" eventType="birthday" serviceCategory="Catering" pricingModel="per_pax" minimumGuests="10" maximumGuests="100" serviceOptions={{}} food={[]} decor="" furniture="" services="" offerDraft={createProviderPackageOfferDraft()} images={[{id: "cover", title: "", url: "https://example.com/photo.jpg"}]} paymentPolicy="full_payment" depositPercentage="50" />);
    expect(screen.getByText("Cover image")).toBeVisible();
    expect(screen.getByText("No service tiers enabled")).toBeVisible();
    expect(within(screen.getByRole("region", {name: "Package review"})).getByText("No dishes added")).toBeVisible();
    expect(screen.getAllByText("None added")).toHaveLength(4);
  });
});
