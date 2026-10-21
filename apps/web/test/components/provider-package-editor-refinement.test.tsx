import {useState} from "react";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, describe, expect, it, vi} from "vitest";
import {Dialog, DialogContent, DialogDescription, DialogTitle} from "@/components/ui/dialog";
import {ProviderPackageFoodMenu} from "@/app/provider/packages/provider-package-food-menu";
import {ProviderPackageOfferBuilder, createProviderPackageOfferDraft} from "@/app/provider/packages/provider-package-offer-builder";
import {categoryNameError, foodInclusionsError, parsePackageDishes} from "@/lib/provider/package-food-inclusions";
import {providerPackageSaveError} from "@/lib/provider/provider-package-save-error";

vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: vi.fn()}));
afterEach(() => vi.unstubAllGlobals());

function FoodHarness({initial = ""}: {initial?: string}) {
  const [value, setValue] = useState(initial === "" ? [] : initial.split("\n"));
  const [open, setOpen] = useState(true);
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent>
    <DialogTitle>Package editor</DialogTitle><DialogDescription>Local form</DialogDescription>
    <ProviderPackageFoodMenu value={value} onChange={setValue} /><output data-testid="food-value">{value.join("\n")}</output>
  </DialogContent></Dialog>;
}

function ThemeHarness() {
  const [value, setValue] = useState(createProviderPackageOfferDraft({
    serviceOptions: {buffet_setup: {price: 100, includedServices: []}},
    themeOptions: [{id: "saved_theme", name: "Garden", description: "Original", imageUrls: []}],
  }));
  return <Dialog open><DialogContent><DialogTitle>Package editor</DialogTitle><DialogDescription>Local form</DialogDescription>
    <ProviderPackageOfferBuilder section="themes" value={value} onChange={setValue} /><output data-testid="theme-value">{JSON.stringify(value.themeOptions)}</output>
  </DialogContent></Dialog>;
}

describe("package food sub-modal", () => {
  it("creates package categories locally and rejects blank, duplicate, and delimited names", () => {
    render(<FoodHarness />);
    fireEvent.click(screen.getByRole("button", {name: "Add Category"}));
    fireEvent.click(within(screen.getByRole("dialog", {name: "Add Category"})).getByRole("button", {name: "Add Category"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a category");
    for (const [name, error] of [[" chicken ", "already exists"], ["Rice: Meals", "colons"]]) {
      fireEvent.change(screen.getByLabelText("Category name"), {target: {value: name}});
      fireEvent.click(within(screen.getByRole("dialog", {name: "Add Category"})).getByRole("button", {name: "Add Category"}));
      expect(screen.getByRole("alert")).toHaveTextContent(error);
    }
    fireEvent.change(screen.getByLabelText("Category name"), {target: {value: "Lechon Specials"}});
    fireEvent.click(within(screen.getByRole("dialog", {name: "Add Category"})).getByRole("button", {name: "Add Category"}));
    expect(screen.getByTestId("food-value")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", {name: "Add Dish"}));
    expect(screen.getByRole("option", {name: "Lechon Specials"})).toBeInTheDocument();
  });

  it("creates a category from a dish without opening a third dialog, then saves another dish", () => {
    render(<FoodHarness />);
    fireEvent.click(screen.getByRole("button", {name: "Add Dish"}));
    fireEvent.change(screen.getByLabelText("Dish name"), {target: {value: "Provider soup"}});
    fireEvent.change(screen.getByLabelText("Category"), {target: {value: ":create:"}});
    expect(screen.getAllByRole("dialog", {hidden: true})).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Category name"), {target: {value: "Soups"}});
    fireEvent.click(within(screen.getByRole("dialog", {name: "Add Category"})).getByRole("button", {name: "Add Category"}));
    expect(screen.getByLabelText("Dish name")).toHaveValue("Provider soup");
    expect(screen.getByLabelText("Category")).toHaveValue("Soups");
    fireEvent.click(screen.getByRole("button", {name: "Save & Add Another"}));
    expect(screen.getByLabelText("Dish name")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Dish name"), {target: {value: "Second soup"}});
    fireEvent.click(screen.getByRole("button", {name: "Save Dish"}));
    expect(screen.getByTestId("food-value").textContent).toBe("Soups: Provider soup\nSoups: Second soup");
  });

  it("hydrates custom categories, preserves legacy strings, cancels edits, and removes deliberately", () => {
    const initial = "Legacy rice\nDrinks: Juice: Fresh\nOther: Legacy dessert";
    render(<FoodHarness initial={initial} />);
    fireEvent.click(screen.getByRole("button", {name: "Edit dish Juice: Fresh"}));
    expect(screen.getByLabelText("Category")).toHaveValue("Drinks");
    fireEvent.change(screen.getByLabelText("Dish name"), {target: {value: "Discard me"}});
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
    expect(screen.getByTestId("food-value").textContent).toBe(initial);
    fireEvent.click(screen.getByRole("button", {name: "Edit dish Juice: Fresh"}));
    fireEvent.change(screen.getByLabelText("Dish name"), {target: {value: "Fresh juice"}});
    fireEvent.click(screen.getByRole("button", {name: "Save Dish"}));
    expect(screen.getByTestId("food-value").textContent).toBe("Legacy rice\nDrinks: Fresh juice\nOther: Legacy dessert");
    fireEvent.click(screen.getByRole("button", {name: "Edit dish Fresh juice"}));
    fireEvent.click(screen.getByRole("button", {name: "Remove Dish"}));
    expect(screen.getByTestId("food-value").textContent).toBe("Legacy rice\nOther: Legacy dessert");
  });

  it("keeps the parent open on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<FoodHarness />);
    const trigger = screen.getByRole("button", {name: "Add Dish"});
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", {name: "Package editor"})).toBeVisible();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("rejects duplicates, ambiguous uncategorized delimiters, and overlength combined values", () => {
    render(<FoodHarness initial="Rice Meals: Rice" />);
    fireEvent.click(screen.getByRole("button", {name: "Add Dish"}));
    fireEvent.change(screen.getByLabelText("Dish name"), {target: {value: "Soup: Hot"}});
    fireEvent.click(screen.getByRole("button", {name: "Save Dish"}));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a category");
    fireEvent.change(screen.getByLabelText("Category"), {target: {value: "Rice Meals"}});
    fireEvent.change(screen.getByLabelText("Dish name"), {target: {value: "rice"}});
    fireEvent.click(screen.getByRole("button", {name: "Save Dish"}));
    expect(screen.getByRole("alert")).toHaveTextContent("already exists");
    fireEvent.change(screen.getByLabelText("Dish name"), {target: {value: "x".repeat(160)}});
    fireEvent.click(screen.getByRole("button", {name: "Save Dish"}));
    expect(screen.getByRole("alert")).toHaveTextContent("160 characters");
  });

  it("never truncates invalid legacy data and enforces inclusion limits", () => {
    const value = Array.from({length: 51}, (_, index) => "Legacy " + index).join("\n");
    expect(parsePackageDishes(value)).toHaveLength(51);
    expect(foodInclusionsError(value)).toMatch(/50/);
    expect(foodInclusionsError("a".repeat(160))).toBeNull();
    expect(foodInclusionsError("a".repeat(161))).toMatch(/160/);
    expect(parsePackageDishes(["Legacy\nmenu"])[0].raw).toBe("Legacy\nmenu");
    expect(parsePackageDishes(["Legacy\nmenu"])).toHaveLength(1);
    expect(foodInclusionsError(["Legacy\nmenu"])).toMatch(/control/);
    expect(foodInclusionsError([""])).toMatch(/1–160/);
    expect(foodInclusionsError("Rice\n rice ")).toMatch(/Duplicate/);
    expect(categoryNameError("Drinks\nJuice")).toMatch(/control/);
    render(<FoodHarness initial={value} />);
    expect(screen.getByRole("button", {name: "Add Dish"})).toBeDisabled();
    expect(screen.getByTestId("food-value").textContent).toBe(value);
  });
});

describe("theme sub-modal", () => {
  it("retains selected image previews after saving the sub-modal and releases them with the editor", () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = () => "blob:local-theme-preview";
      static revokeObjectURL = revoke;
    });
    const view = render(<ThemeHarness />);
    fireEvent.click(screen.getByRole("button", {name: "Edit theme Garden"}));
    fireEvent.change(screen.getByLabelText("Theme images"), {target: {files: [new File(["image"], "theme.png", {type: "image/png"})]}});
    fireEvent.click(screen.getByRole("button", {name: "Save Theme"}));
    expect(revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", {name: "Edit theme Garden"}));
    expect(screen.getByRole("img", {name: "Selected image 1"})).toHaveAttribute("src", "blob:local-theme-preview");
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
    view.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:local-theme-preview");
  });
  it("cancels changes, preserves saved IDs, validates, edits, and removes themes", () => {
    render(<ThemeHarness />);
    fireEvent.click(screen.getByRole("button", {name: "Edit theme Garden"}));
    fireEvent.change(screen.getByLabelText("Theme name"), {target: {value: "Discard"}});
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
    expect(screen.getByTestId("theme-value")).toHaveTextContent('"name":"Garden"');
    fireEvent.click(screen.getByRole("button", {name: "Edit theme Garden"}));
    fireEvent.change(screen.getByLabelText("Theme name"), {target: {value: ""}});
    fireEvent.click(screen.getByRole("button", {name: "Save Theme"}));
    expect(screen.getByRole("alert")).toHaveTextContent("name between");
    fireEvent.change(screen.getByLabelText("Theme name"), {target: {value: "Updated Garden"}});
    fireEvent.click(screen.getByRole("button", {name: "Save Theme"}));
    expect(screen.getByTestId("theme-value")).toHaveTextContent('"id":"saved_theme"');
    expect(screen.getByTestId("theme-value")).toHaveTextContent('"name":"Updated Garden"');
    fireEvent.click(screen.getByRole("button", {name: "Edit theme Updated Garden"}));
    fireEvent.click(screen.getByRole("button", {name: "Remove Theme"}));
    expect(screen.getByTestId("theme-value")).toHaveTextContent("[]");
  });
});

describe("safe package save errors", () => {
  it("recognizes only verified unsupported-model messages and never exposes arbitrary details", () => {
    expect(providerPackageSaveError({code: "functions/invalid-argument", message: "Unsupported package fields: pricingModel."})).toMatch(/does not support this pricing model/);
    expect(providerPackageSaveError({code: "functions/invalid-argument", message: "private secret diagnostic"})).not.toContain("private secret");
    expect(providerPackageSaveError({code: "functions/unavailable"})).toMatch(/could not be reached/);
    expect(providerPackageSaveError(new Error("private secret"))).not.toContain("private secret");
  });
});
