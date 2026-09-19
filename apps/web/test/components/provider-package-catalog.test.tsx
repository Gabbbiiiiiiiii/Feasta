import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {ProviderPackagesClient} from "@/app/provider/packages/provider-packages-client";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
import {ImageGallery} from "@/components/customer/discovery/image-gallery";
import {CatalogImageUploader} from "@/components/provider/catalog-image-uploader";
import {packageImageDrafts, validateCatalogFiles} from "@/lib/provider/catalog-media";
import {providerContentCapabilities} from "@/lib/provider/provider-content-capabilities";
import {parseProviderMenu, publicMenuImages} from "@/lib/provider/provider-menu";
import {normalizePublicPackage} from "@/lib/customer/discovery/public-package-normalization";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";

const mocks = vi.hoisted(() => ({create: vi.fn(), update: vi.fn(), upload: vi.fn(), list: vi.fn()}));
vi.mock("@/lib/provider/provider-package-client", () => ({
  createProviderPackage: mocks.create, updateProviderPackage: mocks.update,
  listProviderPackages: mocks.list, publishProviderPackage: vi.fn(), archiveProviderPackage: vi.fn(),
}));
vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: mocks.upload}));

const props = {eventTypesSupported: ["birthday"], minGuestsPerEvent: 10, maxGuestsPerEvent: 200};
const image = "https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/owner/services/asset/image.png";
const record: ProviderPackage = {
  id: "package-one", providerId: "provider-one", name: "Party package", description: "A celebration package.", eventType: "birthday",
  price: 10000, downPaymentPercentage: 20, minimumGuests: 10, maximumGuests: 50, imageUrl: image,
  foodInclusions: [], decorInclusions: [], furnitureInclusions: [], serviceInclusions: [],
  status: "draft", isActive: false, isPublished: false, providerPubliclyVisible: false,
};

beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({success: true});
  mocks.update.mockReset().mockResolvedValue({success: true});
  mocks.upload.mockReset().mockResolvedValue({url: image, publicId: "asset"});
  mocks.list.mockReset().mockResolvedValue([record]);
});

describe("provider package modal and media", () => {
  it("retains all saved inclusion groups when editing an unrelated field", async () => {
    const inclusions = {foodInclusions: ["Rice"], decorInclusions: ["Backdrop"], furnitureInclusions: ["Chairs"], serviceInclusions: ["Setup"]};
    render(<ProviderPackageForm {...props} initialPackage={{...record, ...inclusions}} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Optional — add inclusions/)).toBeVisible();
    for (const label of ["Food inclusions", "Decoration inclusions", "Furniture inclusions", "Service inclusions"]) {
      expect(screen.getByLabelText(label)).not.toBeRequired();
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
    fireEvent.change(screen.getByRole("textbox", {name: /Package name/}), {target: {value: "Updated package"}});
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(record.id, expect.objectContaining({name: "Updated package", ...inclusions})));
  });
  it("edits the actual package in the shared dialog, preserves the listing and restores opener focus", async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue([{...record, imageUrls: [image, image.replace("asset", "second")], foodInclusions: ["Rice"]}]);
    render(<ProviderPackagesClient {...props} providerId="provider-one" />);
    const edit = await screen.findByRole("button", {name: "Edit Party package"});
    await user.click(edit);
    const dialog = screen.getByRole("dialog", {name: "Edit package"});
    expect(within(dialog).getByRole("textbox", {name: /Package name/})).toHaveValue(record.name);
    expect(within(dialog).getByRole("textbox", {name: /Description/})).toHaveValue(record.description);
    expect(within(dialog).getByRole("spinbutton", {name: /Package price/})).toHaveValue(record.price);
    expect(within(dialog).getByRole("textbox", {name: "Food inclusions"})).toHaveValue("Rice");
    expect(within(dialog).getAllByRole("img").map((img) => img.getAttribute("src"))).toEqual([image, image.replace("asset", "second")]);
    expect(document.querySelector('section[aria-label="Provider package results"]')).toBeInTheDocument();
    expect(screen.getAllByRole("heading", {name: "Edit package", hidden: true})).toHaveLength(1);
    await user.click(within(dialog).getByRole("button", {name: "Cancel"}));
    await waitFor(() => expect(edit).toHaveFocus());
    await user.click(edit);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(edit).toHaveFocus());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("saves persisted and local images through the edit modal and prevents dismissal during upload", async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, "createObjectURL", {configurable: true, value: vi.fn(() => "blob:new")});
    Object.defineProperty(URL, "revokeObjectURL", {configurable: true, value: vi.fn()});
    let finishUpload!: (value: {url: string}) => void;
    mocks.upload.mockImplementation(() => new Promise((resolve) => { finishUpload = resolve; }));
    render(<ProviderPackagesClient {...props} providerId="provider-one" />);
    await user.click(await screen.findByRole("button", {name: "Edit Party package"}));
    fireEvent.change(screen.getByLabelText("Package images"), {target: {files: [new File(["new"], "new.png", {type: "image/png"})]}});
    expect(mocks.upload).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", {name: "Move image 2 earlier"}));
    await user.click(screen.getByRole("button", {name: "Save changes"}));
    expect(screen.getByRole("button", {name: "Cancel"})).toBeDisabled();
    expect(screen.queryByRole("button", {name: "Close dialog"})).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", {name: "Edit package"})).toBeVisible();
    finishUpload({url: image.replace("asset", "new")});
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(record.id, expect.objectContaining({imageUrl: image.replace("asset", "new"), imageUrls: [image.replace("asset", "new"), image]})));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", {name: "Edit Party package"})).toHaveFocus();
  });

  it("opens the creation dialog over the retained listing and restores focus on Escape", async () => {
    const user = userEvent.setup();
    render(<ProviderPackagesClient {...props} providerId="provider-one" />);
    const trigger = screen.getByRole("button", {name: "New package"});
    await waitFor(() => expect(trigger).toBeEnabled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("dialog", {name: "Create package"})).toBeVisible();
    expect(document.querySelector('section[aria-label="Provider package results"]')).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    const body = screen.getByRole("region", {name: "Package details"});
    expect(within(body).queryByRole("button", {name: "Cancel"})).not.toBeInTheDocument();
    expect(within(body).queryByRole("heading", {name: "Create package"})).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Cancel"}));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(screen.getByRole("region", {name: "Provider package results"})).toBeInTheDocument();
  });

  it("preserves a legacy image and permits saving with every inclusion empty", async () => {
    const saved = vi.fn();
    render(<ProviderPackageForm {...props} initialPackage={record} onSaved={saved} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(record.id, expect.objectContaining({
      imageUrl: image, imageUrls: [image], foodInclusions: [], decorInclusions: [], furnitureInclusions: [], serviceInclusions: [],
    })));
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalled();
  });

  it("keeps selection local until save, then uploads in order with the first image as cover", async () => {
    const createObjectURL = vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    Object.defineProperty(URL, "createObjectURL", {configurable: true, value: createObjectURL});
    Object.defineProperty(URL, "revokeObjectURL", {configurable: true, value: vi.fn()});
    mocks.upload.mockResolvedValueOnce({url: image}).mockResolvedValueOnce({url: image.replace("asset", "second")});
    render(<ProviderPackageForm {...props} initialPackage={{...record, imageUrl: ""}} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const first = new File(["one"], "one.png", {type: "image/png"});
    const second = new File(["two"], "two.png", {type: "image/png"});
    fireEvent.change(screen.getByLabelText("Package images"), {target: {files: [first, second]}});
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("2 of 8 images selected");
    expect(screen.getByRole("button", {name: "Move image 1 earlier"})).toBeDisabled();
    expect(screen.getByRole("button", {name: "Move image 2 later"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button", {name: "Move image 1 later"}));
    expect(screen.getAllByRole("img")[0]).toHaveAttribute("src", "blob:second");
    expect(screen.getByText("Cover").closest("div.border-t")?.parentElement).toContainElement(screen.getAllByRole("img")[0]!);
    expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(record.id, expect.objectContaining({imageUrl: image, imageUrls: [image, image.replace("asset", "second")]})));
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(mocks.upload).toHaveBeenNthCalledWith(1, expect.any(String), second);
    expect(mocks.upload).toHaveBeenNthCalledWith(2, expect.any(String), first);
  });

  it("offers keyboard file selection, appends images, enforces the limit and updates removal count", async () => {
    const user = userEvent.setup();
    Object.defineProperty(URL, "createObjectURL", {configurable: true, value: vi.fn(() => "blob:added")});
    Object.defineProperty(URL, "revokeObjectURL", {configurable: true, value: vi.fn()});
    render(<ProviderPackageForm {...props} initialPackage={{...record, imageUrls: Array.from({length: 7}, (_, i) => image.replace("asset", `asset-${i}`))}} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByLabelText("Package images");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("multiple");
    const click = vi.spyOn(input, "click");
    screen.getByRole("button", {name: "Add more images"}).focus();
    await user.keyboard("{Enter}");
    expect(click).toHaveBeenCalledOnce();
    const file = new File(["image"], "menu.png", {type: "image/png"});
    fireEvent.change(input, {target: {files: [file, file]}});
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at most 8 images.");
    expect(screen.getAllByRole("img")).toHaveLength(7);
    fireEvent.change(input, {target: {files: [file]}});
    expect(screen.getByRole("status")).toHaveTextContent("8 of 8 images selected");
    expect(screen.getAllByRole("img")[0]).toHaveAttribute("src", image.replace("asset", "asset-0"));
    expect(screen.getByRole("button", {name: "Add more images"})).toBeDisabled();
    await user.click(screen.getByRole("button", {name: "Remove image 8"}));
    expect(screen.getByRole("status")).toHaveTextContent("7 of 8 images selected");
    expect(screen.getByRole("button", {name: "Add more images"})).toBeEnabled();
    expect(mocks.upload).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it("associates the existing validation message with its field instead of the action footer", () => {
    render(<ProviderPackageForm {...props} dialogLayout onSaved={vi.fn()} onCancel={vi.fn()} />);
    const name = screen.getByRole("textbox", {name: /Package name/});
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription("Package name must be between 2 and 120 characters.");
    expect(screen.getByRole("region", {name: "Package details"})).toContainElement(screen.getByRole("alert"));
    expect(screen.getByRole("button", {name: "Create draft package"})).toBeDisabled();
  });

  it("allows removing and reordering selected images without uploading", () => {
    const onChange = vi.fn();
    const drafts = packageImageDrafts([image, image.replace("asset", "second")]);
    render(<CatalogImageUploader images={drafts} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", {name: "Move image 2 earlier"}));
    expect(onChange).toHaveBeenLastCalledWith([drafts[1], drafts[0]]);
    fireEvent.click(screen.getByRole("button", {name: "Remove image 1"}));
    expect(onChange).toHaveBeenLastCalledWith([drafts[1]]);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("hides catering fields for photographers and keeps service inclusions optional", () => {
    render(<ProviderPackageForm {...props} providerServiceType="addon" serviceCategories={["photographer"]} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByLabelText("Food inclusions")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Furniture inclusions")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Service inclusions")).not.toBeRequired();
  });
});

describe("catalog validation and customer gallery", () => {
  it("bounds file count, MIME, and bytes", () => {
    expect(() => validateCatalogFiles([new File(["x"], "x.svg", {type: "image/svg+xml"})], 0)).toThrow(/JPEG/);
    expect(() => validateCatalogFiles([new File([], "x.png", {type: "image/png"})], 0)).toThrow(/5 MB/);
    expect(() => validateCatalogFiles([new File([new Uint8Array(5 * 1024 * 1024 + 1)], "x.png", {type: "image/png"})], 0)).toThrow(/5 MB/);
    expect(() => validateCatalogFiles([new File(["x"], "x.png", {type: "image/png"})], 8)).toThrow(/8/);
  });

  it("uses canonical catering capabilities instead of names or descriptions", () => {
    expect(providerContentCapabilities("both", ["photographer"]).catering).toBe(true);
    expect(providerContentCapabilities("addon", ["food_trays_packed_meals"]).catering).toBe(true);
    expect(providerContentCapabilities("addon", ["photographer", "event_coordinator"]).catering).toBe(false);
  });

  it("rejects another owner's media, duplicate IDs, and private menu entries", () => {
    const menuImage = {id: "asset", title: "Chicken", url: image, isPublished: true};
    expect(parseProviderMenu([menuImage], "owner")).toEqual([menuImage]);
    expect(() => parseProviderMenu([menuImage], "other-owner")).toThrow();
    expect(() => parseProviderMenu([menuImage, menuImage], "owner")).toThrow();
    expect(publicMenuImages([{...menuImage, isPublished: false}], "owner")).toEqual([]);
    expect(publicMenuImages([{...menuImage, url: "javascript:alert(1)"}], "owner")).toEqual([]);
  });

  it("normalizes ordered package images and retains single-image documents", () => {
    const raw = {...record, status: "published", isActive: true, isPublished: true, providerPubliclyVisible: true};
    const names = new Map([[record.providerId, "Provider"]]);
    expect(normalizePublicPackage(record.id, raw, names)).toMatchObject({imageUrl: image, imageUrls: [image]});
    expect(normalizePublicPackage(record.id, {...raw, imageUrls: ["javascript:bad", image.replace("asset", "second"), image]}, names))
      .toMatchObject({imageUrl: image.replace("asset", "second"), imageUrls: [image.replace("asset", "second"), image]});
  });

  it("opens posters in a dialog with next/previous, zoom and Escape", async () => {
    const user = userEvent.setup();
    render(<ImageGallery label="Menu" images={[{url: image, title: "Chicken"}, {url: image, title: "Desserts"}]} />);
    await user.click(screen.getByRole("button", {name: "View Chicken"}));
    expect(screen.getByRole("dialog", {name: "Chicken"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Next image"}));
    expect(screen.getByRole("dialog", {name: "Desserts"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Zoom in"}));
    expect(screen.getByRole("button", {name: "Fit image"})).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", {name: "Previous image"}));
    expect(screen.getByRole("dialog", {name: "Chicken"})).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
