import {fireEvent, render, screen, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import userEvent from "@testing-library/user-event";
import {ProviderRequestDetailDrawer} from "@/app/provider/requests/provider-request-detail-drawer";
import {requestPackageSnapshot} from "@/lib/provider/requests/provider-request-package-snapshot";
import type {ProviderRequestListItem} from "@/lib/provider/requests/provider-request-types";

const saved = {
  serviceTier: "full_service", packageThemeName: "Garden Green & White",
  packageThemeDescription: "Garden ceremony", packageThemeImageUrls: ["https://example.com/theme.jpg"],
  packageOfferSnapshotV2: {tier: "full_service", pricingModel: "per_bundle", unitCentavos: 3500000,
    foodInclusions: ["Rice"], decorInclusions: ["Flowers", "Tier backdrop"], furnitureInclusions: ["Tables"],
    equipmentInclusions: ["Sound system"], serviceInclusions: ["Delivery", "Tier waiters"]},
};
const parent = {packagePrice: 35000, foodChoiceSelections: [
  {groupId: "main", title: "Main Dish", options: [{id: "pork", name: "Pork Menudo"}, {id: "chicken", name: "Buttered Chicken"}]},
  {groupId: "pasta", title: "Pasta/Noodles", options: [{id: "bihon", name: "Bihon Guisado"}]},
  {groupId: "vegetables", title: "Vegetables", options: [{id: "mixed", name: "Buttered Mixed Vegetables"}]},
]};
function request(v2 = true): ProviderRequestListItem {
  return {id: "request-one", mainEventId: "event-one", providerId: "provider-one", type: "catering", status: "pending",
    customer: {id: "customer", name: "Ana", email: null, phoneNumber: null}, package: {id: "booked-package", name: "Wedding Catering"}, services: [],
    event: {eventType: "wedding", eventDate: null, eventTime: null, guestCount: 60, venueAddress: null, city: null, notes: null},
    amount: 37000, downPaymentAmount: 10000, downPaymentPercentage: null, paymentPolicy: null, rejectionReason: null,
    createdAt: null, updatedAt: null, respondedAt: null, ...(v2 ? {packageSnapshot: requestPackageSnapshot(saved, parent)} : {})};
}
function show(value = request()) {return render(<ProviderRequestDetailDrawer request={value} open onOpenChange={() => {}} />);}
describe("provider saved package details", () => {
  it("defaults to a compact summary with all full details hidden", () => {
    show();
    const control = screen.getByRole("button", {name: "View full package details"});
    expect(control).toHaveAttribute("aria-expanded", "false");
    expect(control.querySelector("svg")).not.toHaveClass("rotate-180");
    const panel = document.getElementById(control.getAttribute("aria-controls")!);
    expect(control.nextElementSibling).toBe(panel);
    expect(panel).not.toBeVisible();
    for (const text of ["Wedding Catering", "Full-Service Catering", "Garden Green & White"]) expect(screen.getByText(text)).toBeVisible();
    expect(screen.getByText(/Per bundle.*60 guests/)).toBeVisible();
    expect(screen.getByLabelText("Price: ₱35,000")).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    for (const text of ["Garden ceremony", "Main Dish", "Pork Menudo", "Rice", "Flowers", "Tables", "Sound system", "Delivery"]) expect(screen.getByText(text)).not.toBeVisible();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
  it("shows saved tier, package subtotal, pricing model, theme image and grouped dishes", () => {
    show();
    expect(screen.getByText("Full-Service Catering")).toBeVisible();
    expect(screen.getByLabelText("Price: ₱35,000")).toBeVisible();
    expect(screen.getByText(/Per bundle/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "View full package details"}));
    expect(screen.getByText("Garden ceremony")).toBeVisible();
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.com/theme.jpg");
    expect(screen.getByText("Main Dish")).toBeVisible();
    for (const text of ["Pork Menudo", "Buttered Chicken", "Bihon Guisado", "Buttered Mixed Vegetables"]) expect(screen.getByText(text)).toBeVisible();
    for (const text of ["Rice", "Flowers", "Tier backdrop", "Tables", "Sound system", "Delivery", "Tier waiters"]) expect(screen.getByText(text)).toBeVisible();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Price: ₱37,000")).toBeVisible();
    expect(screen.getByRole("button", {name: "Accept Request"})).toBeVisible();
  });
  it("expands the correct read-only snapshot inline without duplicating theme or adding dialogs", async () => {
    show();
    const control = screen.getByRole("button", {name: "View full package details"});
    expect(control).toHaveAttribute("aria-expanded", "false");
    control.focus();
    await userEvent.keyboard("{Enter}");
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute("aria-expanded", "true");
    expect(control).toHaveAccessibleName("Hide package details");
    expect(control.querySelector("svg")).toHaveClass("rotate-180");
    expect(screen.getByText("Full-Service Catering")).toBeVisible();
    expect(screen.getByLabelText("Price: ₱35,000")).toBeVisible();
    const drawer = screen.getByRole("dialog", {name: "Request details"});
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(drawer).getByText(/booked-package/)).toBeVisible();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getAllByText("Garden ceremony")).toHaveLength(1);
    expect(within(drawer).queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Accept Request"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Decline Request"})).toBeVisible();
    await userEvent.keyboard(" ");
    expect(control).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/booked-package/)).not.toBeVisible();
    expect(screen.getByText("Garden ceremony")).not.toBeVisible();
    expect(screen.getByText("Pork Menudo")).not.toBeVisible();
    expect(screen.getByText("Rice")).not.toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(control).toHaveAccessibleName("View full package details");
    expect(control.querySelector("svg")).not.toHaveClass("rotate-180");
    expect(screen.getByText("Full-Service Catering")).toBeVisible();
    expect(screen.getByLabelText("Price: ₱35,000")).toBeVisible();
  });
  it("requires no live package, including archived, unavailable or edited packages", () => {
    const live = {name: "Changed", price: 999, foodInclusions: ["Changed dish"]};
    const snapshot = requestPackageSnapshot(saved, parent);
    live.price = 1;
    expect(snapshot).toEqual(requestPackageSnapshot(saved, parent));
    show();
    fireEvent.click(screen.getByRole("button", {name: "View full package details"}));
    expect(screen.queryByText(live.name)).not.toBeInTheDocument();
    expect(screen.getByText("Pork Menudo")).toBeVisible();
  });
  it("retains legacy presentation and does not invent absent snapshots", () => {
    show(request(false));
    expect(screen.getByText("Wedding Catering")).toBeVisible();
    expect(screen.queryByText("Package & Customization")).not.toBeInTheDocument();
    expect(requestPackageSnapshot({packageOfferSnapshotV2: {tier: "full_service"}}).price).toBeNull();
  });
  it("keeps long prices together and wraps payment rows and long package text", () => {
    const value = request(); value.amount = 99999999.99; value.package!.name = "Long wedding package ".repeat(30);
    show(value);
    expect(screen.getByLabelText("Price: ₱99,999,999.99").parentElement).toHaveClass("whitespace-nowrap");
    expect(screen.getByLabelText("Price: ₱99,999,999.99").parentElement!.parentElement).toHaveClass("flex-wrap");
    expect(screen.getByText(value.package!.name.trim())).toHaveClass("min-w-0");
    expect(screen.getByRole("button", {name: "View full package details"})).toHaveClass("min-w-0");
    expect(screen.getByRole("region", {name: "Package & Customization"})).toHaveClass("[overflow-wrap:anywhere]");
  });
  it("reads the attributable saved package service row, never payment totals or live unit prices", () => {
    const data = {...saved, packageId: "booked", amount: 39000, totalAmount: 39000,
      financialSnapshot: {grossAmountInCentavos: 3900000},
      services: [{category: "catering_package", serviceId: "booked", price: 35000}, {category: "addon", serviceId: "sound", price: 4000}]};
    expect(requestPackageSnapshot(data).price).toBe(35000);
    expect(requestPackageSnapshot({...data, services: []}).price).toBeNull();
    expect(requestPackageSnapshot({...data, services: [{category: "catering_package", serviceId: "other", price: 500}]}).price).toBeNull();
    expect(requestPackageSnapshot({...data, services: [data.services[0], data.services[0]]}).price).toBeNull();
    expect(requestPackageSnapshot({...data, packagePrice: 36000}).price).toBe(36000);
    expect(requestPackageSnapshot(data, {packagePrice: 34000}).price).toBe(34000);
  });
  it("does not reconstruct missing names from IDs and deduplicates saved inclusions", () => {
    const result = requestPackageSnapshot({...saved, foodChoiceSelections: [{groupId: "main", optionIds: ["pork"]}],
      packageOfferSnapshotV2: {...saved.packageOfferSnapshotV2, foodInclusions: ["Rice", "rice", " Rice "]}}, parent);
    expect(result.foodChoices).toEqual([]);
    expect(result.inclusions[0].items).toEqual(["Rice"]);
  });
});
