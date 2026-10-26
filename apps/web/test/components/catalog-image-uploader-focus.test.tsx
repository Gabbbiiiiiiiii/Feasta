import {useState} from "react";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {CatalogImageUploader, uploadCatalogImages} from "@/components/provider/catalog-image-uploader";
import {Dialog, DialogContent, DialogDescription, DialogTitle} from "@/components/ui/dialog";
import type {CatalogImageDraft} from "@/lib/provider/catalog-media";
import {uploadProviderServiceImage} from "@/lib/provider/provider-media-client";

vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: vi.fn()}));
const images: CatalogImageDraft[] = [
  {id: "one", title: "Garden", url: "https://example.test/one.png"},
  {id: "two", title: "Banquet", url: "https://example.test/two.png"},
];
function Uploader() {
  const [selected, setSelected] = useState(images);
  return <CatalogImageUploader images={selected} onChange={setSelected} />;
}
async function openPreview(user: ReturnType<typeof userEvent.setup>, index = 1) {
  const invoker = screen.getByRole("button", {name: `Preview image ${index}`});
  await user.click(invoker);
  const dialog = screen.getByRole("dialog", {name: "Image preview"});
  expect(dialog).toContainElement(document.activeElement as HTMLElement);
  return {invoker, dialog};
}

describe("catalog image preview focus", () => {
  it.each(["Escape", "close button"])("focuses the preview and restores the exact invoker using %s", async (method) => {
    const user = userEvent.setup();
    render(<Uploader />);
    for (const index of [1, 2]) {
      const {invoker, dialog} = await openPreview(user, index);
      if (method === "Escape") await user.keyboard("{Escape}");
      else await user.click(within(dialog).getByRole("button", {name: "Close dialog"}));
      await waitFor(() => expect(invoker).toHaveFocus());
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
  });

  it.each(["Setup Gallery editor", "Package Editor"])("keeps %s open and restores focus inside it", async (name) => {
    const user = userEvent.setup();
    render(<Dialog defaultOpen><DialogContent><DialogTitle>{name}</DialogTitle>
      <DialogDescription>Local editor fixture</DialogDescription><Uploader />
    </DialogContent></Dialog>);
    for (const method of ["Escape", "close button"]) {
      const {invoker, dialog} = await openPreview(user, 2);
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      if (method === "Escape") await user.keyboard("{Escape}");
      else await user.click(within(dialog).getByRole("button", {name: "Close dialog"}));
      await waitFor(() => expect(invoker).toHaveFocus());
      expect(screen.getByRole("dialog", {name})).toBeInTheDocument();
    }
  });

  it("uses the mounted uploader when the invoking image is removed, including when disabled", async () => {
    const user = userEvent.setup();
    const {rerender} = render(<CatalogImageUploader images={images} onChange={vi.fn()} />);
    const {invoker} = await openPreview(user);
    const focus = vi.spyOn(invoker, "focus");
    rerender(<CatalogImageUploader images={[]} onChange={vi.fn()} disabled />);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toContainElement(screen.getByRole("status")));
    expect(document.activeElement).not.toBe(document.body);
    expect(focus).not.toHaveBeenCalled();
  });

  it("does not focus a detached invoker when the uploader unmounts with its editor", async () => {
    const user = userEvent.setup();
    const {unmount} = render(<Uploader />);
    const {invoker} = await openPreview(user);
    const focus = vi.spyOn(invoker, "focus");
    unmount();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(focus).not.toHaveBeenCalled();
  });

  it("restores the same image button after reordering while the preview is open", async () => {
    const user = userEvent.setup();
    const {rerender} = render(<CatalogImageUploader images={images} onChange={vi.fn()} />);
    const {invoker} = await openPreview(user, 2);
    rerender(<CatalogImageUploader images={[images[1]!, images[0]!]} onChange={vi.fn()} />);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(invoker).toHaveFocus());
    expect(invoker).toHaveAccessibleName("Preview image 1");
  });
});

describe("catalog image operations", () => {
  it("selects files, reorders the cover, removes images and uploads through the existing owner-scoped client", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = vi.fn(() => "blob:local-image");
      static revokeObjectURL = vi.fn();
    });
    try {
      render(<Uploader />);
      await user.click(screen.getByRole("button", {name: "Move image 2 earlier"}));
      expect(screen.getByRole("button", {name: "Preview image 1"})).toContainElement(screen.getByAltText("Banquet"));
      await user.click(screen.getByRole("button", {name: "Remove image 2"}));
      expect(screen.queryByAltText("Garden")).not.toBeInTheDocument();
      const file = new File(["image"], "menu.png", {type: "image/png"});
      fireEvent.change(screen.getByLabelText("Package images"), {target: {files: [file]}});
      expect(screen.getByRole("status")).toHaveTextContent("2 of");
      expect(screen.getByAltText("Selected image 2")).toHaveAttribute("src", "blob:local-image");
      vi.mocked(uploadProviderServiceImage).mockResolvedValue({url: "https://example.test/uploaded.png"} as Awaited<ReturnType<typeof uploadProviderServiceImage>>);
      const onUploaded = vi.fn();
      const result = await uploadCatalogImages([{id: "new", title: "Menu", url: "blob:local-image", file}], onUploaded);
      expect(uploadProviderServiceImage).toHaveBeenCalledWith("new", file);
      expect(result).toEqual([{id: "new", title: "Menu", url: "https://example.test/uploaded.png"}]);
      expect(onUploaded).toHaveBeenCalledWith(result[0]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
