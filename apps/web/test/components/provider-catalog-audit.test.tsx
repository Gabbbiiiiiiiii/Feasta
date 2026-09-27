import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, expect, it, vi} from "vitest";
import {ImageGallery} from "@/components/customer/discovery/image-gallery";
import {ProviderMenuManager} from "@/app/provider/packages/provider-menu-manager";
import {ProviderProfile} from "@/components/customer/providers/provider-profile";
import {normalizePublicProvider} from "@/lib/customer/providers/provider-normalization";

const actions = vi.hoisted(() => ({load: vi.fn(), save: vi.fn()}));
vi.mock("@/app/provider/packages/menu-actions", () => ({loadProviderMenuAction: actions.load, saveProviderMenuAction: actions.save}));
vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: vi.fn()}));
vi.mock("@/app/customer/favorites/actions", () => ({setProviderFavoriteAction: vi.fn()}));
const image = {id: "poster", url: "https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/owner/services/poster/image.png", title: "Chicken menu", isPublished: true};

beforeEach(() => { actions.load.mockReset(); actions.save.mockReset(); });

it("restores lightbox focus to the actual opening thumbnail", async () => {
  const user = userEvent.setup();
  render(<ImageGallery label="Menu" images={[image, {...image, title: "Desserts"}]} />);
  const first = screen.getByRole("button", {name: "View Chicken menu"});
  await user.click(first);
  await user.click(screen.getByRole("button", {name: "Next image"}));
  await user.keyboard("{Escape}");
  await waitFor(() => expect(first).toHaveFocus());
});

it("does not claim a menu is empty when its load failed", async () => {
  actions.load.mockRejectedValue(new Error("Offline"));
  render(<ProviderMenuManager />);
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
  expect(screen.queryByText(/No menu items yet/)).not.toBeInTheDocument();
});

it("keeps individual item edits local until Save and persists the revised catalog", async () => {
  const revised = {...image, title: "Roast chicken menu"};
  actions.load.mockResolvedValue({revision: 4, images: [image]});
  actions.save.mockResolvedValue({ok: true, menu: {revision: 5, images: [revised]}});
  const user = userEvent.setup();
  render(<ProviderMenuManager />);
  await user.click(await screen.findByRole("button", {name: "Edit Chicken menu"}));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", {name: "Chicken menu"})).toBeVisible();
  const name = within(dialog).getByRole("textbox", {name: "Item name"});
  expect(name).toHaveValue("Chicken menu");
  expect(within(dialog).getAllByRole("img")).toHaveLength(1);
  expect(within(dialog).getByRole("img", {name: "Chicken menu"})).toHaveAttribute("src", image.url);
  expect(within(dialog).getByLabelText("Change image")).toHaveAttribute("type", "file");
  expect(within(dialog).getByLabelText("Change image")).toBeEnabled();
  expect(within(dialog).getByTitle("Change menu image")).toBeVisible();
  expect(within(dialog).getByRole("textbox", {name: "Category"})).toHaveValue("");
  expect(within(dialog).getByRole("textbox", {name: "Description"})).toHaveValue("");
  expect(within(dialog).getByRole("heading", {name: "Serving sizes"})).toBeVisible();
  expect(within(dialog).getByRole("button", {name: "Add serving size"})).toBeEnabled();
  expect(within(dialog).queryByRole("button", {name: /Move image|Remove image|Add more images|Choose images/})).not.toBeInTheDocument();
  await user.clear(name);
  await user.type(name, revised.title);
  expect(actions.save).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole("button", {name: "Save menu"}));
  await waitFor(() => expect(actions.save).toHaveBeenCalledWith({revision: 4, images: [revised]}));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByRole("button", {name: "Edit Roast chicken menu"})).toBeVisible();
});

it("isolates individual editing and preserves the other item and both publication states", async () => {
  const second = {...image, id: "desserts", title: "Desserts", url: image.url.replace("/poster/", "/desserts/"), isPublished: false,
    category: "Sweets", description: "Assorted desserts", servingOptions: [{id: "tray", name: "Tray", description: "For sharing", guestCount: 15, price: 900}]};
  const revised = {...image, category: "Chicken", description: "Roasted chicken", servingOptions: []};
  actions.load.mockResolvedValue({revision: 4, images: [image, second]});
  actions.save.mockResolvedValue({ok: true, menu: {revision: 5, images: [revised, second]}});
  const user = userEvent.setup();
  render(<ProviderMenuManager />);
  await user.click(await screen.findByRole("button", {name: "Edit Chicken menu"}));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("textbox", {name: "Item name"})).toHaveValue("Chicken menu");
  expect(within(dialog).getAllByRole("img")).toHaveLength(1);
  expect(within(dialog).getByRole("img", {name: "Chicken menu"})).toHaveAttribute("src", image.url);
  expect(within(dialog).queryByText("Desserts")).not.toBeInTheDocument();
  expect(within(dialog).queryByDisplayValue("Desserts")).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("img", {name: "Desserts"})).not.toBeInTheDocument();
  expect(within(dialog).queryByDisplayValue(second.description)).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("group", {name: /Selected image/})).not.toBeInTheDocument();
  await user.type(within(dialog).getByRole("textbox", {name: "Category"}), revised.category);
  await user.type(within(dialog).getByRole("textbox", {name: "Description"}), revised.description);
  expect(actions.save).not.toHaveBeenCalled();
  expect(within(screen.getByRole("region", {name: "Menu item details"})).queryByRole("button", {name: "Save menu"})).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", {name: "Save menu"}));
  await waitFor(() => expect(actions.save).toHaveBeenCalledWith({revision: 4, images: [revised, second]}));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(within(screen.getByRole("article", {name: "Chicken menu"})).getByLabelText("Status: Published")).toBeVisible();
  expect(within(screen.getByRole("article", {name: "Desserts"})).getByLabelText("Status: Draft")).toBeVisible();
});

it("keeps a configuration failure visible and retains menu changes for retry", async () => {
  actions.load.mockResolvedValue({revision: 4, images: [image]});
  actions.save.mockResolvedValue({ok: false, error: "Menu image verification is not configured. Contact FEASTA support."});
  const user = userEvent.setup();
  render(<ProviderMenuManager />);
  await user.click(await screen.findByRole("button", {name: "Edit Chicken menu"}));
  const dialog = await screen.findByRole("dialog");
  const name = within(dialog).getByRole("textbox", {name: "Item name"});
  expect(name).toHaveValue("Chicken menu");
  await user.clear(name);
  await user.type(name, "Roast chicken menu");
  await user.click(within(dialog).getByRole("button", {name: "Save menu"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Menu uploads need server configuration. Contact FEASTA support, then retry saving.");
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(name).toHaveValue("Roast chicken menu");
  expect(actions.save).toHaveBeenCalledWith({revision: 4, images: [{...image, title: "Roast chicken menu"}]});
  expect(within(dialog).getByRole("button", {name: "Save menu"})).toBeEnabled();
});

it.each([
  ["catering", "catering_service", true], ["both", "catering_event_styling", true],
  ["addon", "photographer", false], ["addon", "event_coordinator", false],
  ["addon", "decorator_event_stylist", false],
] as const)("renders truthful profile sections for %s / %s", (serviceType, category, hasMenu) => {
  const provider = normalizePublicProvider("provider-one", {
    ownerId: "owner", businessName: "Real Provider", providerServiceType: serviceType,
    providerCategory: category, serviceCategories: [category], verificationStatus: "approved", publiclyVisible: true, isActive: true,
  }, {role: "provider", providerId: "provider-one", accountStatus: "active"})!;
  render(<ProviderProfile detail={{provider, packages: [], menuImages: [image]}} />);
  expect(screen.getByText("No public packages currently listed.")).toBeVisible();
  if (hasMenu) expect(screen.getByRole("button", {name: "View Chicken menu"})).toBeVisible();
  else expect(screen.queryByRole("heading", {name: "Menu & catalog"})).not.toBeInTheDocument();
});
