import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, expect, it, vi} from "vitest";
import {ProviderPackagesClient} from "@/app/provider/packages/provider-packages-client";
import {ProviderMenuManager} from "@/app/provider/packages/provider-menu-manager";
import ProviderPackagesPage from "@/app/provider/packages/page";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";

const mocks = vi.hoisted(() => ({list: vi.fn(), publish: vi.fn(), archive: vi.fn(), load: vi.fn(), account: vi.fn()}));
vi.mock("@/lib/provider/provider-package-client", () => ({listProviderPackages: mocks.list, publishProviderPackage: mocks.publish, archiveProviderPackage: mocks.archive, createProviderPackage: vi.fn(), updateProviderPackage: vi.fn()}));
vi.mock("@/app/provider/packages/menu-actions", () => ({loadProviderMenuAction: mocks.load, saveProviderMenuAction: vi.fn()}));
vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: vi.fn()}));
vi.mock("@/lib/auth/session", () => ({requireProviderCatalogAccess: mocks.account}));

const props = {providerId: "provider-one", eventTypesSupported: ["birthday", "wedding"], minGuestsPerEvent: 10, maxGuestsPerEvent: 200};
const base: ProviderPackage = {
  id: "newest", providerId: props.providerId, name: "Zeta celebration", description: "Family gathering",
  eventType: "birthday", price: 12000, downPaymentPercentage: 20, minimumGuests: 20, maximumGuests: 80,
  imageUrl: "https://example.com/legacy.png", imageUrls: ["https://example.com/cover.png", "https://example.com/second.png"],
  status: "draft", isActive: false, isPublished: false, providerPubliclyVisible: false,
  foodInclusions: [], decorInclusions: [], furnitureInclusions: [], serviceInclusions: [],
};
const records: ProviderPackage[] = [base,
  {...base, id: "middle", name: "Alpha wedding", eventType: "wedding", price: 20000, status: "published", imageUrls: undefined},
  {...base, id: "oldest", name: "Beta reunion", eventType: "reunion", price: 5000, status: "archived", imageUrls: [], imageUrl: ""},
];
const menu = {revision: 3, images: [
  {id: "chicken", title: "Chicken", url: "https://example.com/chicken.png", isPublished: true},
  {id: "pasta", title: "Pasta", url: "https://example.com/pasta.png", isPublished: false},
  {id: "untitled", title: "", url: "https://example.com/menu.png", isPublished: false},
]};
beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue(records);
  mocks.publish.mockReset().mockResolvedValue({success: true});
  mocks.archive.mockReset().mockResolvedValue({success: true});
  mocks.load.mockReset().mockResolvedValue(menu);
});
const cardNames = () => screen.getAllByRole("article").map((element) => element.getAttribute("aria-label"));

it("renders real package metrics, media, prices, guests and lifecycle actions", async () => {
  render(<ProviderPackagesClient {...props} />);
  const draft = await screen.findByRole("article", {name: base.name});
  expect(screen.getByRole("region", {name: "Total packages"})).toHaveTextContent("3");
  for (const label of ["Published", "Drafts", "Archived"]) expect(screen.getByRole("region", {name: label})).toHaveTextContent("1");
  expect(within(draft).getByRole("img")).toHaveAttribute("src", base.imageUrls![0]);
  expect(within(draft).getByText("20–80 guests")).toBeVisible();
  expect(within(draft).getByText(/12,000/)).toBeVisible();
  expect(within(draft).getByText("20% down payment")).toBeVisible();
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
  expect(cardNames()).toEqual([base.name]);
  fireEvent.change(screen.getByLabelText("Search packages"), {target: {value: "family"}});
  expect(cardNames()).toHaveLength(3);
  fireEvent.change(screen.getByLabelText("Search packages"), {target: {value: "wedding"}});
  expect(cardNames()).toEqual(["Alpha wedding"]);
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
  fireEvent.change(screen.getByLabelText("Title / category"), {target: {value: "Pasta"}});
  expect(cardNames()).toEqual(["Pasta"]);
  fireEvent.change(screen.getByLabelText("Search menu images"), {target: {value: "chicken"}});
  expect(screen.getByText("No menu images match your filters.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Clear menu filters"}));
  expect(cardNames()).toEqual(["Chicken", "Pasta", "Menu image 3"]);
});

it("does not invent category options for untitled catalog images", async () => {
  mocks.load.mockResolvedValue({revision: 1, images: [menu.images[2]]});
  render(<ProviderMenuManager />);
  await screen.findByRole("article", {name: "Menu image 1"});
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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
