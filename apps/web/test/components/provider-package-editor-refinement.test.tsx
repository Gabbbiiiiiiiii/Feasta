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
vi.mock("@/app/provider/packages/dish-library-actions",()=>({loadDishLibrary:async()=>({revision:1,categories:["Soups"],dishes:[{id:"soup",name:"Provider soup",category:"Soups"}]})}));
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

describe("package saved dish picker",()=>{
 it("adds categorized saved dishes without editing the library",async()=>{render(<FoodHarness/>);fireEvent.click(screen.getByRole("button",{name:"Choose from Dish List"}));const picker=within(await screen.findByRole("dialog",{name:"Dish Library"}));fireEvent.click(await picker.findByRole("checkbox",{name:"Select all Soups"}));fireEvent.click(picker.getByRole("button",{name:"Add 1 selected dish"}));expect(screen.getByTestId("food-value")).toHaveTextContent("Soups: Provider soup");});
 it("keeps the parent open on Escape and restores trigger focus",async()=>{const user=userEvent.setup();render(<FoodHarness/>);const trigger=screen.getByRole("button",{name:"Choose from Dish List"});await user.click(trigger);await screen.findByRole("checkbox",{name:"Select all Soups"});await user.keyboard("{Escape}");expect(screen.getByRole("dialog",{name:"Package editor"})).toBeVisible();await waitFor(()=>expect(trigger).toHaveFocus());});
 it("preserves raw legacy dishes and removes only the requested item",()=>{render(<FoodHarness initial={"Legacy rice\nDrinks: Juice: Fresh\nOther: Legacy dessert"}/>);fireEvent.click(screen.getByRole("button",{name:"Remove Juice: Fresh",hidden:true}));expect(screen.getByTestId("food-value").textContent).toBe("Legacy rice\nOther: Legacy dessert");});
 it("never truncates invalid legacy data or weakens inclusion validation",()=>{const value=Array.from({length:51},(_,i)=>"Legacy "+i).join("\n");expect(parsePackageDishes(value)).toHaveLength(51);expect(foodInclusionsError(value)).toMatch(/50/);expect(foodInclusionsError("a".repeat(160))).toBeNull();expect(foodInclusionsError("a".repeat(161))).toMatch(/160/);expect(foodInclusionsError(["Legacy\nmenu"])).toMatch(/control/);expect(foodInclusionsError([""])).toMatch(/1.160/);expect(foodInclusionsError("Rice\n rice ")).toMatch(/Duplicate/);expect(categoryNameError("Drinks\nJuice")).toMatch(/control/);render(<FoodHarness initial={value}/>);expect(screen.getByTestId("food-value").textContent).toBe(value);});
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

it("restores categorized dishes from the saved package without recreating library data",()=>{render(<FoodHarness initial="Rice: Steamed Rice"/>);fireEvent.click(screen.getByText("Rice (1)"));expect(screen.getByText("Steamed Rice")).toBeVisible();expect(screen.getByRole("button",{name:"Remove Steamed Rice"})).toBeEnabled();expect(screen.getByTestId("food-value")).toHaveTextContent("Rice: Steamed Rice");});
