import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, expect, it, vi} from "vitest";
import {ProviderPackagesClient} from "@/app/provider/packages/provider-packages-client";
import {ProviderMenuManager} from "@/app/provider/packages/provider-menu-manager";
import ProviderPackagesPage from "@/app/provider/packages/page";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";
import {createProviderPackage, updateProviderPackage} from "@/lib/provider/provider-package-client";
import {uploadProviderServiceImage} from "@/lib/provider/provider-media-client";

const mocks = vi.hoisted(() => ({list: vi.fn(), publish: vi.fn(), archive: vi.fn(), load: vi.fn(), account: vi.fn()}));
vi.mock("@/lib/provider/provider-package-client", () => ({listProviderPackages: mocks.list, publishProviderPackage: mocks.publish, archiveProviderPackage: mocks.archive, createProviderPackage: vi.fn(), updateProviderPackage: vi.fn()}));
vi.mock("@/app/provider/packages/menu-actions", () => ({loadProviderMenuAction: mocks.load, saveProviderMenuAction: vi.fn()}));
vi.mock("@/app/provider/packages/setup-gallery-actions", () => ({
  loadPrivateProviderSetupGalleryV2Action: vi.fn().mockResolvedValue({
    ok: false, code: "UNAVAILABLE", error: "Setup Gallery V2 is unavailable.",
  }),
  savePrivateProviderSetupGalleryV2Action: vi.fn(),
  loadProviderSetupGalleryAction: vi.fn().mockResolvedValue({revision: 0, setups: []}),
  saveProviderSetupGalleryAction: vi.fn(),
}));
vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: vi.fn()}));
vi.mock("@/lib/auth/session", () => ({requireProviderCatalogAccess: mocks.account}));
vi.mock("@/lib/service-categories/service-category-service", () => ({
  getActiveServiceCategoryOptions:
    vi.fn().mockResolvedValue([
      {
        code: "catering_service",
        name: "Catering Service",
        serviceType: "catering",
        status: "active",
      },
    ]),
}));
vi.mock(
  "@/lib/provider/provider-package-payment-policy-service",
  () => ({
    getProviderPackagePaymentPolicyBounds:
      vi.fn().mockResolvedValue({
        minimumDepositRateBps:
          2000,

        maximumDepositRateBps:
          8000,

        minimumBalanceDueDaysBeforeEvent:
          1,

        maximumBalanceDueDaysBeforeEvent:
          30,
      }),
  }),
);

const props = {providerId: "provider-one", eventTypesSupported: ["birthday", "wedding"], minGuestsPerEvent: 10, maxGuestsPerEvent: 200, packageCategoryOptions: [{code: "catering_service", name: "Catering Service"}]};
const base: ProviderPackage = {
  id: "newest", providerId: props.providerId, name: "Zeta celebration", description: "Family gathering",
  eventType: "birthday", serviceCategoryCode: "catering_service", price: 12000,
  serviceOptions: {
    drop_off: {price: 12000, includedServices: []},
  },
  themeOptions: [],
  paymentPolicy: "deposit_then_balance",
  depositPercentage: 20,
  balanceDueDaysBeforeEvent: 7,
  downPaymentPercentage: 20,
  minimumGuests: 20, maximumGuests: 80,
  imageUrl: "https://example.com/legacy.png", imageUrls: ["https://example.com/cover.png", "https://example.com/second.png"],
  status: "draft", isActive: false, isPublished: false, providerPubliclyVisible: false,
  foodInclusions: [], decorInclusions: [], furnitureInclusions: [], serviceInclusions: [],
};
const records: ProviderPackage[] = [base,
  {
    ...base,
    id: "middle",
    name: "Alpha wedding",
    eventType: "wedding",
    price: 20000,
    serviceOptions: {
      drop_off: {price: 20000, includedServices: []},
    },
    status: "published",
    imageUrls: undefined,
  },
  {
    ...base,
    id: "oldest",
    name: "Beta reunion",
    eventType: "reunion",
    price: 5000,
    serviceOptions: {
      drop_off: {price: 5000, includedServices: []},
    },
    status: "archived",
    imageUrls: [],
    imageUrl: "",
  },
];
const menu = {revision: 3, images: [
  {id: "chicken", title: "Chicken", url: "https://example.com/chicken.png", isPublished: true},
  {id: "pasta", title: "Pasta", url: "https://example.com/pasta.png", isPublished: false},
  {id: "untitled", title: "", url: "https://example.com/menu.png", isPublished: false},
]};
beforeEach(() => {
  vi.mocked(createProviderPackage).mockReset();
  vi.mocked(updateProviderPackage).mockReset();
  vi.mocked(uploadProviderServiceImage).mockReset();
  mocks.list.mockReset().mockResolvedValue(records);
  mocks.publish.mockReset().mockResolvedValue({success: true});
  mocks.archive.mockReset().mockResolvedValue({success: true});
  mocks.load.mockReset().mockResolvedValue(menu);
});
const cardNames = () => screen.getAllByRole("article").map((element) => element.getAttribute("aria-label"));

it("keeps the deposit editable and explains the FEASTA deadline without a day input", async () => {
  render(<ProviderPackagesClient {...props} />);
  fireEvent.click(await screen.findByRole("button", {name: `Edit ${base.name}`}));
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  expect(screen.getByLabelText(/Deposit required/)).toHaveValue(20);
  expect(screen.queryByLabelText(/Remaining balance due \(days before event\)/)).not.toBeInTheDocument();
  expect(screen.getByText("24 hours before the scheduled event start")).toBeVisible();
  expect(screen.getByText(/FEASTA automatically sets the remaining balance deadline/)).toBeVisible();
});

it("guides edits through five steps and preserves categorized dishes", async () => {
  render(<ProviderPackagesClient {...props} />);
  fireEvent.click(await screen.findByRole("button", {name: `Edit ${base.name}`}));
  expect(screen.getByRole("heading", {name: "Step 1: Basic details"})).toBeVisible();
  fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Retained package draft"}});
  fireEvent.change(screen.getByLabelText(/Pricing model/), {target: {value: "per_pax"}});
  const scroller = screen.getByRole("region", {name: "Package details"});
  scroller.scrollTop = 400;
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  await waitFor(() => expect(scroller.scrollTop).toBe(0));
  expect(screen.getByRole("heading", {name: "Step 2: Pricing & capacity"})).toBeVisible();
  expect(screen.getByText(/Drop-Off Catering price \(PHP per person\)/)).toBeVisible();
  fireEvent.change(screen.getByLabelText(/Deposit required/), {target: {value: "35"}});
  fireEvent.click(screen.getByRole("checkbox", {name: /Buffet Setup/}));
  fireEvent.change(screen.getByLabelText(/Buffet Setup price/), {target: {value: "13000.25"}});
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  fireEvent.click(screen.getByRole("button", {name: "Add Category"}));
  fireEvent.change(screen.getByLabelText("Category name"), {target: {value: "Drinks"}});
  fireEvent.click(within(screen.getByRole("dialog", {name: "Add Category"})).getByRole("button", {name: "Add Category"}));
  fireEvent.click(screen.getByRole("button", {name: "Add Dish"}));
  fireEvent.change(screen.getByLabelText("Category"), {target: {value: "Chicken"}});
  fireEvent.change(screen.getByLabelText("Dish name"), {target: {value: "Provider chicken dish"}});
  fireEvent.click(screen.getByRole("button", {name: "Save Dish"}));
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  expect(screen.getByRole("heading", {name: "Step 4: Services & media"})).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Add Theme"}));
  fireEvent.change(screen.getByLabelText("Theme name"), {target: {value: "Custom Garden"}});
  fireEvent.change(screen.getByLabelText("Theme description"), {target: {value: "Custom styling"}});
  fireEvent.click(screen.getByRole("button", {name: "Save Theme"}));
  fireEvent.click(screen.getByRole("button", {name: "Back"}));
  expect(screen.getByRole("button", {name: "Edit dish Provider chicken dish"})).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Add Dish"}));
  expect(screen.getByRole("option", {name: "Drinks"})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  expect(screen.getByRole("region", {name: "Package review"})).toHaveTextContent("Provider chicken dish");
  expect(screen.getByRole("button", {name: "Save changes"})).toBeEnabled();
  fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
  expect(screen.getByRole("dialog", {name: "Discard package changes?"})).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Keep editing"}));
  expect(screen.getByRole("region", {name: "Package review"})).toHaveTextContent("Provider chicken dish");
  expect(screen.getByRole("region", {name: "Package review"})).toHaveTextContent("Retained package draft");
  expect(screen.getByRole("region", {name: "Package review"})).toHaveTextContent("Custom Garden");
  expect(screen.queryByLabelText("Preview guest count")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
  await waitFor(() => expect(updateProviderPackage).toHaveBeenCalledWith(base.id, expect.objectContaining({
    pricingModel: "per_pax",
    name: "Retained package draft",
    price: 12000,
    foodInclusions: ["Chicken: Provider chicken dish"],
    depositPercentage: 35,
    minimumGuests: base.minimumGuests,
    maximumGuests: base.maximumGuests,
    imageUrls: base.imageUrls,
    serviceOptions: expect.objectContaining({buffet_setup: {price: 13000.25, includedServices: []}}),
    themeOptions: [expect.objectContaining({name: "Custom Garden", description: "Custom styling"})],
  })));
});

it.each(["Close dialog", "Cancel"])("confirms %s on an untouched editor and keeps form state and focus", async (action) => {
  const user = userEvent.setup();
  render(<ProviderPackagesClient {...props} />);
  await user.click(await screen.findByRole("button", {name: "New package"}));
  const editor = screen.getByRole("dialog", {name: "Create package"});
  const trigger = within(editor).getByRole("button", {name: action});
  await user.click(trigger);
  const confirmation = screen.getByRole("dialog", {name: "Discard package changes?"});
  expect(confirmation).toHaveTextContent("Your unsaved package details, pricing, dishes, themes, and images will be lost if you close this editor.");
  await user.click(within(confirmation).getByRole("button", {name: "Keep editing"}));
  expect(screen.getByRole("dialog", {name: "Create package"})).toBe(editor);
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(createProviderPackage).not.toHaveBeenCalled();
  expect(updateProviderPackage).not.toHaveBeenCalled();
});

it("discards only after confirmation and restores the package-list opener without saving", async () => {
  const user = userEvent.setup();
  render(<ProviderPackagesClient {...props} />);
  const trigger = await screen.findByRole("button", {name: `Edit ${base.name}`});
  await user.click(trigger);
  fireEvent.change(screen.getByLabelText(/Package name/), {target: {value: "Unsaved changed name"}});
  await user.click(screen.getByRole("button", {name: "Cancel"}));
  await user.click(screen.getByRole("button", {name: "Discard changes"}));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(updateProviderPackage).not.toHaveBeenCalled();
  expect(createProviderPackage).not.toHaveBeenCalled();
  expect(uploadProviderServiceImage).not.toHaveBeenCalled();
});

it("routes Escape through confirmation and ignores outside parent dismissal", async () => {
  const user = userEvent.setup();
  render(<ProviderPackagesClient {...props} />);
  await user.click(await screen.findByRole("button", {name: `Edit ${base.name}`}));
  fireEvent.pointerDown(document.body, {button: 0});
  expect(screen.getByRole("dialog", {name: "Edit package"})).toBeVisible();
  expect(screen.queryByRole("dialog", {name: "Discard package changes?"})).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", {name: "Discard package changes?"})).toBeVisible();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", {name: "Edit package"})).toBeVisible();
  expect(screen.queryByRole("dialog", {name: "Discard package changes?"})).not.toBeInTheDocument();
});

it("keeps dish and theme dismissal separate from the parent discard confirmation", async () => {
  const user = userEvent.setup();
  render(<ProviderPackagesClient {...props} />);
  await user.click(await screen.findByRole("button", {name: `Edit ${base.name}`}));
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  fireEvent.click(screen.getByRole("checkbox", {name: /Buffet Setup/}));
  fireEvent.change(screen.getByLabelText(/Buffet Setup price/), {target: {value: "125.75"}});
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  await user.click(screen.getByRole("button", {name: "Add Dish"}));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", {name: "Edit package"})).toBeVisible();
  expect(screen.queryByRole("dialog", {name: "Discard package changes?"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  await user.click(screen.getByRole("button", {name: "Add Theme"}));
  await user.click(screen.getByRole("button", {name: "Cancel"}));
  expect(screen.getByRole("dialog", {name: "Edit package"})).toBeVisible();
  expect(screen.queryByRole("dialog", {name: "Discard package changes?"})).not.toBeInTheDocument();
});

it("prevents closing throughout uploads and closes successful saves without discard confirmation", async () => {
  const user = userEvent.setup();
  Object.defineProperty(URL, "createObjectURL", {configurable: true, value: vi.fn(() => "blob:upload-fixture")});
  Object.defineProperty(URL, "revokeObjectURL", {configurable: true, value: vi.fn()});
  let finishUpload!: (value: {url: string; publicId: string}) => void;
  vi.mocked(uploadProviderServiceImage).mockImplementationOnce(() => new Promise((resolve) => { finishUpload = resolve; }));
  render(<ProviderPackagesClient {...props} />);
  await user.click(await screen.findByRole("button", {name: `Edit ${base.name}`}));
  for (let index = 0; index < 3; index++) fireEvent.click(screen.getByRole("button", {name: "Next"}));
  fireEvent.change(screen.getByLabelText("Package images"), {target: {files: [new File(["image"], "image.png", {type: "image/png"})]}});
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  await user.click(screen.getByRole("button", {name: "Save changes"}));
  expect(screen.getByRole("button", {name: "Cancel"})).toBeDisabled();
  expect(screen.queryByRole("button", {name: "Close dialog"})).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", {name: "Edit package"})).toBeVisible();
  expect(screen.queryByRole("dialog", {name: "Discard package changes?"})).not.toBeInTheDocument();
  finishUpload({url: "https://example.com/uploaded.png", publicId: "uploaded"});
  await waitFor(() => expect(updateProviderPackage).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("explains and disables publication of canonical pricing drafts", async () => {
  mocks.list.mockResolvedValue([{...base, pricingModel: "per_bundle"}]);
  render(<ProviderPackagesClient {...props} />);
  expect(await screen.findByRole("button", {name: `Publish ${base.name}`})).toBeDisabled();
  expect(screen.getByText(/Draft-only until customer compatibility is verified/)).toBeVisible();
});

it("retains a new draft and its pricing model when an old callable rejects pricingModel", async () => {
  vi.mocked(createProviderPackage).mockRejectedValueOnce({code: "functions/invalid-argument", message: "Unsupported package fields: pricingModel."});
  render(<ProviderPackagesClient {...props} />);
  fireEvent.click(await screen.findByRole("button", {name: "New package"}));
  const form = within(screen.getByRole("dialog", {name: "Create package"}));
  fireEvent.change(form.getByLabelText(/Package name/), {target: {value: "New catering draft"}});
  fireEvent.change(form.getByLabelText(/Description/), {target: {value: "A complete catering package for an event."}});
  expect(form.getByLabelText(/Service category/)).toHaveAttribute("readonly");
  fireEvent.click(form.getByRole("button", {name: "Next"}));
  fireEvent.click(form.getByRole("checkbox", {name: /Drop-Off Catering/}));
  fireEvent.change(form.getByLabelText(/Drop-Off Catering price/), {target: {value: "500.25"}});
  fireEvent.change(form.getByLabelText(/Minimum guests/), {target: {value: "20"}});
  fireEvent.change(form.getByLabelText(/Maximum guests/), {target: {value: "80"}});
  for (let index = 0; index < 3; index++) fireEvent.click(form.getByRole("button", {name: "Next"}));
  expect(form.queryByRole("complementary", {name: "Live package summary"})).not.toBeInTheDocument();
  const review = within(form.getByRole("region", {name: "Package review"}));
  for (const name of ["Package details", "Pricing model & capacity", "Service tiers & pricing", "Food inclusions", "Themes", "Images", "Payment terms"]) {
    expect(review.getByRole("heading", {name})).toBeVisible();
  }
  expect(review.getByText(/Draft only:/)).toBeVisible();
  expect(review.getByText("PHP 500.25")).toBeVisible();
  fireEvent.click(form.getByRole("button", {name: "Create draft package"}));
  await waitFor(() => expect(form.getByText(/connected package service does not support this pricing model/)).toBeVisible());
  expect(createProviderPackage).toHaveBeenCalledWith(expect.objectContaining({pricingModel: "per_pax", price: 500.25}));
  fireEvent.click(form.getByRole("button", {name: "Back"}));
  for (let index = 0; index < 3; index++) fireEvent.click(form.getByRole("button", {name: "Back"}));
  expect(form.getByLabelText(/Package name/)).toHaveValue("New catering draft");
  expect(form.getByLabelText(/Pricing model/)).toHaveValue("per_pax");
});

it("keeps invalid capacity on the pricing step", async () => {
  render(<ProviderPackagesClient {...props} />);
  fireEvent.click(await screen.findByRole("button", {name: `Edit ${base.name}`}));
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  fireEvent.change(screen.getByLabelText(/Maximum guests/), {target: {value: "5"}});
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  expect(screen.getByRole("heading", {name: "Step 2: Pricing & capacity"})).toBeVisible();
  expect(screen.getByText("Enter a guest range within your business capacity.")).toBeVisible();
});

it("renders real package metrics, media, prices, guests and lifecycle actions", async () => {
  render(<ProviderPackagesClient {...props} />);
  const draft = await screen.findByRole("article", {name: base.name});
  expect(screen.getByRole("region", {name: "Total packages"})).toHaveTextContent("3");
  for (const label of ["Published", "Drafts", "Archived"]) expect(screen.getByRole("region", {name: label})).toHaveTextContent("1");
  expect(within(draft).getByRole("img")).toHaveAttribute("src", base.imageUrls![0]);
  expect(within(draft).getByText("20–80 guests")).toBeVisible();
  expect(within(draft).getByText(/12,000/)).toBeVisible();
  expect(
    within(draft).getByText(
      "20% deposit + remaining balance",
    ),
  ).toBeVisible();
  expect(within(draft).getByRole("button", {name: `Edit ${base.name}`})).toBeEnabled();
  const published = screen.getByRole("article", {name: "Alpha wedding"});
  expect(within(published).getByRole("img")).toHaveAttribute("src", base.imageUrl);
  expect(within(published).queryByRole("button", {name: /Edit|Publish/})).not.toBeInTheDocument();
  expect(within(published).getByRole("button", {name: "Archive Alpha wedding"})).toBeEnabled();
  const archived = screen.getByRole("article", {name: "Beta reunion"});
  expect(within(archived).getByRole("img", {name: "No package image"})).toBeVisible();
  expect(within(archived).queryByRole("button")).not.toBeInTheDocument();
});

it("filters loaded records by actual events, status, name and description, and clears empty results", async () => {
  const user = userEvent.setup();
  render(<ProviderPackagesClient {...props} />);
  await screen.findByRole("article", {name: base.name});
  expect(within(screen.getByLabelText("Event type")).getByRole("option", {name: "Reunion"})).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Status"), {target: {value: "published"}});
  expect(cardNames()).toEqual(["Alpha wedding"]);
  fireEvent.change(screen.getByLabelText("Event type"), {target: {value: "birthday"}});
  expect(screen.getByText("No packages match your filters.")).toBeVisible();
  await user.click(screen.getAllByRole("button", {name: "Clear filters"})[0]!);
  fireEvent.change(screen.getByLabelText("Search packages"), {target: {value: "zeta"}});
  await waitFor(() => expect(cardNames()).toEqual([base.name]));
  fireEvent.change(screen.getByLabelText("Search packages"), {target: {value: "family"}});
  await waitFor(() => expect(cardNames()).toHaveLength(3));
  fireEvent.change(screen.getByLabelText("Search packages"), {target: {value: "wedding"}});
  await waitFor(() => expect(cardNames()).toEqual(["Alpha wedding"]));
  expect(mocks.list).toHaveBeenCalledTimes(1);
});

it("sorts locally without mutating the original newest-first results", async () => {
  render(<ProviderPackagesClient {...props} />);
  await screen.findByRole("article", {name: base.name});
  const select = screen.getByLabelText("Sort packages");
  for (const [sort, expected] of [
    ["oldest", ["Beta reunion", "Alpha wedding", base.name]],
    ["price-low", ["Beta reunion", base.name, "Alpha wedding"]],
    ["price-high", ["Alpha wedding", base.name, "Beta reunion"]],
    ["name", ["Alpha wedding", "Beta reunion", base.name]],
    ["newest", [base.name, "Alpha wedding", "Beta reunion"]],
  ] as const) {
    fireEvent.change(select, {target: {value: sort}});
    expect(cardNames()).toEqual(expected);
  }
  expect(mocks.list).toHaveBeenCalledTimes(1);
});

it("uses existing confirmed mutations and reloads summary counts", async () => {
  const user = userEvent.setup();
  render(<ProviderPackagesClient {...props} />);
  await user.click(await screen.findByRole("button", {name: `Publish ${base.name}`}));
  mocks.list.mockResolvedValue(records.map((item) => item.id === base.id ? {...item, status: "published"} : item));
  await user.click(screen.getByRole("button", {name: "Publish package"}));
  await waitFor(() => expect(mocks.publish).toHaveBeenCalledWith(base.id));
  await waitFor(() => expect(screen.getByRole("region", {name: "Published"})).toHaveTextContent("2"));
  await user.click(screen.getByRole("button", {name: `Archive ${base.name}`}));
  mocks.list.mockResolvedValue(records.map((item) => item.id === base.id ? {...item, status: "archived"} : item));
  await user.click(screen.getByRole("button", {name: "Archive package"}));
  await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith(base.id));
  await waitFor(() => expect(screen.getByRole("region", {name: "Archived"})).toHaveTextContent("2"));
});

it("offers creation from the truthful empty state", async () => {
  mocks.list.mockResolvedValue([]);
  const user = userEvent.setup();
  render(<ProviderPackagesClient {...props} />);
  expect(await screen.findByText("No packages yet")).toBeVisible();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name: "Create package"}));
  expect(screen.getByRole("dialog", {name: "Create package"})).toBeVisible();
});

it("uses real catalog images, publication flags, and saved title/category filters", async () => {
  render(<ProviderMenuManager />);
  const chicken = await screen.findByRole("article", {name: "Chicken"});
  expect(within(chicken).getByRole("img")).toHaveAttribute("src", menu.images[0]!.url);
  expect(within(chicken).getByLabelText("Status: Published")).toBeVisible();
  expect(within(screen.getByRole("article", {name: "Pasta"})).getByLabelText("Status: Draft")).toBeVisible();
  expect(screen.queryByRole("option", {name: "Seafood"})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search menu images"), {target: {value: "Pasta"}});
  await waitFor(() => expect(cardNames()).toEqual(["Pasta"]));
  fireEvent.change(screen.getByLabelText("Search menu images"), {target: {value: "chicken"}});
  await waitFor(() => expect(cardNames()).toEqual(["Chicken"]));
  fireEvent.click(screen.getByRole("button", {name: "Clear menu filters"}));
  await waitFor(() => expect(cardNames()).toEqual(["Chicken", "Pasta", "Menu image 3"]));
});

it("does not invent category options for untitled catalog images", async () => {
  mocks.load.mockResolvedValue({revision: 1, images: [menu.images[2]]});
  render(<ProviderMenuManager />);
  await screen.findByRole("article", {name: "Menu image 1"});
  expect(screen.queryByRole("combobox", {name: "Category"})).not.toBeInTheDocument();
});

it.each([
  ["catering", [], true], ["both", ["photographer"], true],
  ["addon", ["food_trays_packed_meals"], true],
  ["addon", ["photographer"], false], ["addon", ["event_coordinator"], false],
] as const)("gates provider catalog management using %s capabilities %j", async (providerServiceType, serviceCategories, expected) => {
  mocks.account.mockResolvedValue({providerId: props.providerId, provider: {id: props.providerId, providerServiceType, serviceCategories, verificationStatus: "approved", ...props}});
  render(await ProviderPackagesPage());
  if (expected) expect(screen.getByRole("heading", {name: "Menu & Catalog"})).toBeVisible();
  else expect(screen.queryByRole("heading", {name: "Menu & Catalog"})).not.toBeInTheDocument();
  await waitFor(() => { if (expected) expect(mocks.load).toHaveBeenCalled(); });
});

it("keeps six packages per page and resets pagination after filtering and sorting", async () => {
  const user = userEvent.setup();
  mocks.list.mockResolvedValue(Array.from({length: 8}, (_, index) => ({
    ...base, id: `page-${index}`, name: `Package ${index + 1}`,
    status: index < 6 ? "draft" : "published",
    eventType: index < 6 ? "birthday" : "wedding",
  })));
  render(<ProviderPackagesClient {...props} />);
  await screen.findByRole("article", {name: "Package 1"});
  expect(cardNames()).toHaveLength(6);
  await user.click(screen.getByRole("button", {name: "Next"}));
  expect(cardNames()).toEqual(["Package 7", "Package 8"]);
  fireEvent.change(screen.getByLabelText("Sort packages"), {target: {value: "oldest"}});
  expect(cardNames()).toEqual(["Package 8", "Package 7", "Package 6", "Package 5", "Package 4", "Package 3"]);
  await user.click(screen.getByRole("button", {name: "Next"}));
  fireEvent.change(screen.getByLabelText("Status"), {target: {value: "published"}});
  expect(cardNames()).toEqual(["Package 8", "Package 7"]);
  expect(screen.queryByRole("navigation", {name: "Package pagination"})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Status"), {target: {value: ""}});
  fireEvent.change(screen.getByLabelText("Event type"), {target: {value: "wedding"}});
  expect(cardNames()).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Event type"), {target: {value: ""}});
  await user.click(screen.getByRole("button", {name: "Next"}));
  fireEvent.change(screen.getByLabelText("Search packages"), {target: {value: "Package 8"}});
  await waitFor(() => expect(cardNames()).toEqual(["Package 8"]));
  expect(mocks.list).toHaveBeenCalledTimes(1);
});
