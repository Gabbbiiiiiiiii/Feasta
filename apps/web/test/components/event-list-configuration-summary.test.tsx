import {fireEvent, render, screen} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ConfigurationSummary} from "@/components/customer/event-list/configuration-summary";
import {eventListPackageEditHref, eventListConfigurationDraft} from "@/lib/customer/event-list/configuration-edit";
import type {CustomerPackageEventListItem} from "@/lib/customer/event-list/customer-event-list";
vi.mock("@/app/customer/packages/event-list-labels", () => ({loadEventListPackageLabels: vi.fn(async () => ({
  packageRecord: {foodChoiceGroups: [{id: "internal-group", options: [{id: "internal-dish", name: "Roast chicken"}]}],
    themeOptions: [{id: "internal-theme", name: "Garden"}]},
  setupLabels: [{id: "internal-reference", title: "Twilight garden"}],
}))}));
const entry: CustomerPackageEventListItem = {providerId: "provider-one", packageId: "package-one", providerName: "Provider",
  packageName: "Package", packageHref: "/customer/packages/package-one", price: 1000, imageUrl: null,
  configuration: {event: {eventType: "wedding", eventDate: "2030-06-20", eventTime: "10:00", eventEndTime: "12:00",
    guestCount: 50, eventLocation: "Ormoc City", eventAddress: "Event hall", specialRequest: "No peanuts"},
    selectedFoods: [], selectedDecorations: ["Flowers"], selectedFurniture: ["Tables"],
    sharedContractVersion: 2, expectedPackageRevision: 7, serviceTier: "full_service", packageThemeId: "internal-theme",
    foodChoiceSelections: [{groupId: "internal-group", optionIds: ["internal-dish"]}],
    themeInspiration: {notes: "Rustic lights", referenceSetupId: "internal-reference"},
    selectedEventServices: [{id: "internal-addon", providerId: "band", providerName: "Band", name: "Music", category: null, price: 500}],
    willArrangeOwnAddOns: false, customerArrangedAddOnsNote: "", estimatedTotal: 1500}};
it("shows compact saved summary and resolves labels without internal identifiers", async () => {
  const view = render(<ConfigurationSummary item={entry} />);
  expect(screen.getByText("Configured — revalidation required")).toBeVisible();
  expect(screen.getByText(/50 guests/)).toBeVisible();
  fireEvent.click(screen.getByText("Configuration details"));
  expect(await screen.findByText("Roast chicken")).toBeVisible();
  for (const label of ["Garden", "Full-Service Catering", "Flowers", "Tables", "Rustic lights", "No peanuts", "Music — Band", "Twilight garden"]) {
    expect(screen.getByText(label)).toBeVisible();
  }
  expect(view.container.textContent).not.toContain("internal-");
});
it("keeps package-only entries unconfigured and provides intentional edit routes", () => {
  render(<ConfigurationSummary item={{...entry, configuration: null}} />);
  expect(screen.getByText("Needs customization")).toBeVisible();
  expect(eventListPackageEditHref({...entry, configuration: null})).toBe("/customer/packages/package-one/plan");
  expect(eventListPackageEditHref(entry)).toBe("/customer/packages/package-one/plan?eventListProvider=provider-one");
});
it("projects selected configuration without tokens, prices or submission identity in the draft", () => {
  const draft = eventListConfigurationDraft(entry.configuration!);
  expect(draft.event.guestCount).toBe("50");
  expect(draft.customization.foodChoiceSelections).toEqual([{groupId: "internal-group", optionIds: ["internal-dish"]}]);
  expect(draft.addonIds).toEqual(["internal-addon"]);
  expect(draft.themeInspiration?.notes).toBe("Rustic lights");
  expect(draft).not.toHaveProperty("submission"); expect(draft).not.toHaveProperty("estimatedTotal");
});
