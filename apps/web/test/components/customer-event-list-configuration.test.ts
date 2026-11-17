vi.mock("@/lib/firebase/client", () => ({auth: {currentUser: {uid: "test-customer"}}}));
vi.mock("firebase/auth", () => ({onAuthStateChanged: () => () => {}}));
import {beforeEach, expect, it, vi} from "vitest";
import {
  addCustomerEventListItem, customerEventListReadiness, normalizeConfiguration,
  readCustomerEventList, removeSubmittedCustomerEventListItems,
  eventListItemPrice, removeCustomerEventListService, CUSTOMER_EVENT_LIST_STORAGE_KEY,
  type CustomerEventListConfiguration, type CustomerPackageEventListItem,
} from "@/lib/customer/event-list/customer-event-list";

const configuration = (): CustomerEventListConfiguration => ({
  event: {eventType: "wedding", eventDate: "2030-06-20", eventTime: "10:00",
    eventEndTime: "12:00", guestCount: 100, eventLocation: "Ormoc City",
    eventAddress: "Event hall", specialRequest: ""},
  sharedContractVersion: 2, expectedPackageRevision: 3,
  serviceTier: "full_service", packageThemeId: "garden",
  themeInspiration: {notes: "Rustic", referenceSetupId: "setup-one"},
  foodChoiceSelections: [{groupId: "main", optionIds: ["chicken"]}],
  selectedFoods: [], selectedDecorations: ["Flowers"], selectedFurniture: ["Tables"],
  selectedEventServices: [{id: "music", providerId: "provider-two", providerName: "Band",
    name: "Music", category: "Entertainment", price: 500, source: "feasta_addon_provider"}],
  willArrangeOwnAddOns: false, customerArrangedAddOnsNote: "", estimatedTotal: 10500,
  pricingContext: {currency: "PHP", pricingModel: "per_pax", displayedServicePrice: 100},
});
const item: CustomerPackageEventListItem = {providerId: "provider-one", packageId: "package-one",
  providerName: "Provider", packageName: "Package", price: 10000, imageUrl: null,
  packageHref: "/customer/packages/package-one"};
beforeEach(() => window.localStorage.clear());

it.each([
  {expectedPackageRevision: 4},
  {serviceTier: "drop_off" as const},
  {packageThemeId: "new-theme"},
  {foodChoiceSelections: [{groupId: "main", optionIds: ["fish"]}]},
  {selectedDecorations: ["New flowers"]},
  {selectedEventServices: []},
  {themeInspiration: {notes: "New notes", referenceSetupId: null}},
  {event: {...configuration().event, specialRequest: "New request"}},
])("retains a configuration edited after its submission snapshot: %j", change => {
  addCustomerEventListItem({...item, configuration: configuration()});
  const submitted = readCustomerEventList();
  expect(addCustomerEventListItem({...item, configuration: {...configuration(), ...change}})).toBe(true);
  const edited = readCustomerEventList();
  removeSubmittedCustomerEventListItems(submitted);
  expect(readCustomerEventList()).toEqual(edited);
});

it("removes only the unchanged submitted package snapshot", () => {
  addCustomerEventListItem({...item, configuration: configuration()});
  const submitted = readCustomerEventList();
  addCustomerEventListItem({...item, packageId: "other-package"});
  removeSubmittedCustomerEventListItems(submitted);
  expect(readCustomerEventList()).toEqual([expect.objectContaining({packageId: "other-package"})]);
});

it("round-trips V2 configuration and protects it from package-only saves", () => {
  const config = configuration();
  expect(normalizeConfiguration(config)).toEqual(config);
  addCustomerEventListItem({...item, configuration: config});
  addCustomerEventListItem(item);
  const saved = readCustomerEventList()[0] as CustomerPackageEventListItem;
  expect(saved.configuration).toEqual(config);
  expect(customerEventListReadiness(saved)).toBe("configured_revalidation_required");
  expect(customerEventListReadiness(item)).toBe("needs_customization");
});
it("preserves version-1 package-only and legacy configured entries", () => {
  const {sharedContractVersion, expectedPackageRevision, foodChoiceSelections,
    serviceTier, packageThemeId, themeInspiration, pricingContext, ...legacy} = configuration();
  void [sharedContractVersion, expectedPackageRevision, foodChoiceSelections, serviceTier,
    packageThemeId, themeInspiration, pricingContext];
  for (const configuration of [undefined, {...legacy, selectedFoods: ["Chicken"]}]) {
    window.localStorage.setItem(CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:test-customer", JSON.stringify({version: 1,
      items: [{...item, configuration}]}));
    const saved = readCustomerEventList()[0] as CustomerPackageEventListItem;
    expect(saved.packageId).toBe(item.packageId);
    if (configuration) expect(saved.configuration).toMatchObject(configuration);
    else expect(saved.configuration).toBeNull();
  }
});
it("rejects malformed configuration without replacing a saved snapshot", () => {
  addCustomerEventListItem({...item, configuration: configuration()});
  const original = window.localStorage.getItem(CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:test-customer");
  const invalid = [
    {expectedPackageRevision: null}, {sharedContractVersion: 3},
    {foodChoiceSelections: [{groupId: "bad/id", optionIds: []}]},
    {foodChoiceSelections: [{groupId: "main", optionIds: ["fish", "fish"]}]},
    {foodChoiceSelections: Array(11).fill({groupId: "main", optionIds: []})},
    {selectedFoods: [1]}, {selectedFurniture: Array(51).fill("Chair")},
    {selectedEventServices: [{id: "bad"}]}, {estimatedTotal: -1},
    {pricingContext: {currency: "USD", pricingModel: "per_pax", displayedServicePrice: 1}},
    {serviceTier: "unknown"}, {packageThemeId: "bad/id"},
    {themeInspiration: {notes: "a".repeat(1001), referenceSetupId: null}},
  ];
  for (const fields of invalid) {
    const config = {...configuration(), ...fields} as CustomerEventListConfiguration;
    expect(normalizeConfiguration(config)).toBeNull();
    addCustomerEventListItem({...item, configuration: config});
    expect(window.localStorage.getItem(CUSTOMER_EVENT_LIST_STORAGE_KEY + ":uid:test-customer")).toBe(original);
  }
});

it("uses the configured price instead of the listing price, including after removing an extra", () => {
  addCustomerEventListItem({...item, price: 450, configuration: {...configuration(), estimatedTotal: 33000}});
  expect(eventListItemPrice(readCustomerEventList()[0])).toBe(32500);
  removeCustomerEventListService(item.packageId, "music");
  const saved = readCustomerEventList()[0] as CustomerPackageEventListItem;
  expect(saved.configuration?.estimatedTotal).toBe(32500);
  expect(eventListItemPrice(saved)).toBe(32500);
});
