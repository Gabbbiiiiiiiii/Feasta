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
  expect(screen.queryByText(/No menu images yet/)).not.toBeInTheDocument();
});

it("keeps removal local until Save and persists the revised catalog", async () => {
  actions.load.mockResolvedValue({revision: 4, images: [image]});
  actions.save.mockResolvedValue({ok: true, menu: {revision: 5, images: []}});
  const user = userEvent.setup();
  render(<ProviderMenuManager />);
  await user.click(await screen.findByRole("button", {name: "Edit Chicken menu"}));
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", {name: "Remove image 1"}));
  expect(actions.save).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", {name: "Save menu"}));
  await waitFor(() => expect(actions.save).toHaveBeenCalledWith({revision: 4, images: []}));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText(/No menu images yet/)).toBeVisible();
});

it("keeps publication with its image through reordering and removal", async () => {
  const second = {...image, id: "desserts", title: "Desserts", isPublished: false};
  actions.load.mockResolvedValue({revision: 4, images: [image, second]});
  actions.save.mockResolvedValue({ok: true, menu: {revision: 5, images: [{...second, isPublished: true}]}});
  const user = userEvent.setup();
  render(<ProviderMenuManager />);
  await user.click(await screen.findByRole("button", {name: "Edit Chicken menu"}));
  const dialog = await screen.findByRole("dialog");
  const firstCard = within(dialog).getByRole("group", {name: "Selected image 1"});
  const secondCard = within(dialog).getByRole("group", {name: "Selected image 2"});
  expect(within(firstCard).getByRole("checkbox", {name: "Publish Chicken menu"})).toBeChecked();
  await user.click(within(secondCard).getByRole("checkbox", {name: "Publish Desserts"}));
  await user.click(within(secondCard).getByRole("button", {name: "Move image 2 earlier"}));
  expect(within(within(dialog).getByRole("group", {name: "Selected image 1"})).getByRole("checkbox", {name: "Publish Desserts"})).toBeChecked();
  await user.click(within(dialog).getByRole("button", {name: "Remove image 2"}));
  expect(actions.save).not.toHaveBeenCalled();
  expect(within(screen.getByRole("region", {name: "Menu image details"})).queryByRole("button", {name: "Save menu"})).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", {name: "Save menu"}));
  await waitFor(() => expect(actions.save).toHaveBeenCalledWith({revision: 4, images: [{...second, isPublished: true}]}));
});

it("keeps a configuration failure visible and retains menu changes for retry", async () => {
  actions.load.mockResolvedValue({revision: 4, images: [image]});
  actions.save.mockResolvedValue({ok: false, error: "Menu image verification is not configured. Contact FEASTA support."});
  const user = userEvent.setup();
  render(<ProviderMenuManager />);
  await user.click(await screen.findByRole("button", {name: "Edit Chicken menu"}));
  await screen.findByRole("dialog");
  await user.click(screen.getByRole("button", {name: "Save menu"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Menu uploads need server configuration. Contact FEASTA support, then retry saving.");
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(screen.getByLabelText("Title / category 1")).toHaveValue("Chicken menu");
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
