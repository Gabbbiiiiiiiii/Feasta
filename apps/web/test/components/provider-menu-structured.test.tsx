import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: vi.fn(), replace: vi.fn()}),
}));
import {CustomerProviderMenu} from "@/components/customer/providers/customer-provider-menu";
import {CATALOG_IMAGE_LIMIT} from "@/lib/provider/catalog-media";
import {MENU_SERVING_OPTION_LIMIT, parseProviderMenu, publicMenuImages} from "@/lib/provider/provider-menu";

const legacyImage = {
  id: "beef-steak",
  title: "Beef Steak",
  url: "https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/owner/services/beef-steak/image.png",
  isPublished: true,
};
const structuredImage = {
  ...legacyImage,
  description: "Tender beef steak with onions and house seasoning.",
  category: "Beef",
  servingOptions: [
    {id: "family-size", name: "Family Size", description: "For small celebrations",
      minimumGuests: 15, maximumGuests: 20, price: 1050},
    {id: "party-size", name: "Party Size", description: "",
      minimumGuests: 30, maximumGuests: 30, price: 2100},
  ],
};

describe("structured provider catering menu", () => {
  it("preserves legacy browsing-only records without adding structured fields", () => {
    expect(parseProviderMenu([legacyImage], "owner")).toEqual([legacyImage]);
    expect(publicMenuImages([{...legacyImage, isPublished: false}], "owner")).toEqual([]);
  });

  it("normalizes and returns trusted structured display data", () => {
    expect(parseProviderMenu([{...structuredImage, description: "  Tender   beef  ", servingOptions: [
      {...structuredImage.servingOptions[0], name: " Family   Size ", price: 1050.12},
    ]}], "owner")).toEqual([{...legacyImage, description: "Tender beef", category: "Beef", servingOptions: [
      {...structuredImage.servingOptions[0], name: "Family Size", price: 1050.12},
    ]}]);
  });

  it("rejects malformed and duplicate serving options", () => {
    expect(() => parseProviderMenu([{...structuredImage, servingOptions: [
      structuredImage.servingOptions[0], {...structuredImage.servingOptions[1], id: "family-size"},
    ]}], "owner")).toThrow(/identifier/i);
    expect(() => parseProviderMenu([{...structuredImage, servingOptions: [null]}], "owner")).toThrow(/invalid/i);
    expect(() => parseProviderMenu([{...structuredImage, servingOptions: Array.from({length: MENU_SERVING_OPTION_LIMIT + 1}, (_, index) => ({
      ...structuredImage.servingOptions[0], id: `option-${index}`,
    }))}], "owner")).toThrow(/at most 8/i);
  });

  it.each([
    {minimumGuests: 0}, {minimumGuests: 1.5}, {maximumGuests: 1_000_001},
    {minimumGuests: 20, maximumGuests: 10}, {price: 0}, {price: 0.004}, {price: 1050.129},
    {price: -1}, {price: Number.NaN}, {price: 100_000_001},
  ])("rejects invalid serving bounds or price: %j", (change) => {
    expect(() => parseProviderMenu([{...structuredImage, servingOptions: [
      {...structuredImage.servingOptions[0], ...change},
    ]}], "owner")).toThrow();
  });

  it("requires names for selectable items and bounds the item count", () => {
    expect(() => parseProviderMenu([{...structuredImage, title: " "}], "owner")).toThrow(/item name/i);
    expect(() => parseProviderMenu(Array.from({length: CATALOG_IMAGE_LIMIT + 1}, (_, index) => ({
      ...legacyImage, id: `item-${index}`,
    })), "owner")).toThrow(/at most 8/i);
  });

  it("lets customers open a menu item and keeps items without serving sizes browsing-only", () => {
    render(
      <CustomerProviderMenu
        providerId="provider-one"
        providerName="Ana Events"
        menuImages={[structuredImage, {...legacyImage, id: "legacy", title: ""}]}
      />,
    );
    expect(screen.getByRole("button", {name: "View Beef Steak"})).toBeVisible();
    expect(screen.getByRole("button", {name: "View Menu image 2"})).toBeVisible();
    expect(screen.getByText("From ₱1,050")).toBeVisible();
    expect(screen.getByText("Browsing only")).toBeVisible();
    expect(screen.queryByRole("button", {name: /checkout|pay/i})).not.toBeInTheDocument();
  });
});
