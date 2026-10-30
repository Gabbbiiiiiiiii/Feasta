import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect, it, vi} from "vitest";
import {ProviderPackageCard} from "@/app/provider/packages/provider-package-card";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";

const item: ProviderPackage = {
  id: "preview", providerId: "provider", name: "Celebration package", description: "First line\nSecond line",
  eventType: "birthday", serviceCategoryCode: "catering_service", price: 99999,
  serviceOptions: {
    drop_off: {price: 1250, includedServices: ["Delivery", "Food trays"]},
    full_service: {price: 4500, includedServices: ["Wait staff", "Cleanup"]},
  },
  themeOptions: [{id: "garden", name: "Garden party", description: "Green and white", imageUrls: ["https://example.com/theme.png"]}],
  paymentPolicy: "deposit_then_balance", depositPercentage: 30, downPaymentPercentage: 30, balanceDueDaysBeforeEvent: 7,
  minimumGuests: 20, maximumGuests: 80, imageUrl: "https://example.com/legacy.png",
  imageUrls: ["https://example.com/cover.png", "https://example.com/extra.png"],
  foodInclusions: ["Roast chicken"], decorInclusions: ["Flowers"], furnitureInclusions: ["Dining tables"], serviceInclusions: ["Coordination"],
  status: "published", isActive: true, isPublished: true, providerPubliclyVisible: true,
};
async function open(overrides: Partial<ProviderPackage> = {}, serviceCategoryLabel?: string) {
  const user = userEvent.setup();
  render(<ProviderPackageCard item={{...item, ...overrides}} serviceCategoryLabel={serviceCategoryLabel} onEdit={vi.fn()} onPublish={vi.fn()} onArchive={vi.fn()} />);
  const trigger = screen.getByRole("button", {name: `View ${item.name}`});
  await user.click(trigger);
  return {user, trigger, dialog: screen.getByRole("dialog", {name: item.name})};
}
it("shows the complete saved overview, tiers, inclusions, themes and payment terms without editable controls", async () => {
  const {dialog} = await open({}, "Catering Service");
  const details = within(dialog);
  const overview = within(details.getByRole("region", {name: "Package overview"}));
  for (const value of ["Birthday", "Catering Service", "20", "80", "First line Second line"]) {
    expect(overview.getByText(value)).toBeVisible();
  }
  expect(overview.getByLabelText("Status: Published")).toBeVisible();
  expect(overview.getByLabelText("Price: ₱1,250")).toBeVisible();
  expect(overview.getByText("First line Second line")).toHaveClass("whitespace-pre-line");
  for (const [name, price, services] of [
    ["Drop-Off Catering", "₱1,250", ["Delivery", "Food trays"]],
    ["Full-Service Catering", "₱4,500", ["Wait staff", "Cleanup"]],
  ] as const) {
    const tier = within(details.getByRole("region", {name}));
    expect(tier.getByLabelText(`Price: ${price}`)).toBeVisible();
    services.forEach((service) => expect(tier.getByText(service)).toBeVisible());
  }
  expect(details.queryByRole("region", {name: "Buffet Setup"})).not.toBeInTheDocument();
  for (const value of ["Roast chicken", "Flowers", "Dining tables", "Coordination", "Garden party", "Green and white", "30% deposit + remaining balance", "Balance due 7 days before event"]) {
    expect(details.getByText(value)).toBeVisible();
  }
  expect(dialog.querySelector("input,select,textarea,form")).toBeNull();
  expect(details.getByRole("button", {name: `View ${item.name} cover`}).querySelector("img")).toHaveAttribute("src", item.imageUrls![0]);
  expect(details.getByRole("button", {name: `View ${item.name} additional image 2`}).querySelector("img")).toHaveAttribute("src", item.imageUrls![1]);
  expect(details.getByRole("button", {name: "View Garden party image 1"}).querySelector("img")).toHaveAttribute("src", item.themeOptions[0]!.imageUrls[0]);
});
it("opens the shared image viewer and restores focus through nested dialogs", async () => {
  const {user, dialog, trigger} = await open();
  const photo = within(dialog).getByRole("button", {name: `View ${item.name} cover`});
  await user.click(photo);
  expect(screen.getByRole("dialog", {name: `${item.name} cover`})).toBeVisible();
  await user.keyboard("{Escape}");
  expect(photo).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
it("handles legacy empty fields without inventing tiers or payment policies", async () => {
  const {dialog, user, trigger} = await open({serviceOptions: {}, themeOptions: [], imageUrls: [], imageUrl: "", serviceCategoryCode: null, description: "", paymentPolicy: null, foodInclusions: [], decorInclusions: [], furnitureInclusions: [], serviceInclusions: []});
  const details = within(dialog);
  for (const value of ["Not specified", "No package description provided.", "No package images uploaded.", "No package inclusions have been listed.", "No theme options configured.", "No payment policy configured for this legacy package."]) expect(details.getByText(value)).toBeVisible();
  expect(details.getByText(/No service tiers configured/)).toBeVisible();
  expect(details.getByLabelText("Price: ₱99,999")).toBeVisible();
  expect(details.queryByText(/Balance due/)).not.toBeInTheDocument();
  await user.click(details.getByRole("button", {name: "Close"}));
  expect(trigger).toHaveFocus();
});
it.each([
  ["full_payment", null, "100% due after booking acceptance"],
  ["deposit_then_balance", null, "Balance due 24 hours before event"],
  ["deposit_then_balance", 1, "Balance due 24 hours before event"],
] as const)("uses canonical payment terms for %s with deadline %s", async (paymentPolicy, balanceDueDaysBeforeEvent, expected) => {
  const {dialog} = await open({paymentPolicy, balanceDueDaysBeforeEvent, imageUrls: undefined});
  expect(within(dialog).getByText(expected)).toBeVisible();
  expect(within(dialog).getByRole("button", {name: `View ${item.name} cover`}).querySelector("img")).toHaveAttribute("src", item.imageUrl);
  if (paymentPolicy === "full_payment") expect(within(dialog).queryByText(/Balance due/)).not.toBeInTheDocument();
});
