import {useState} from "react";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach,expect,it,vi} from "vitest";
import {ProviderPackageFoodMenu} from "@/app/provider/packages/provider-package-food-menu";
import {packageFoodCategoryOptions,parsePackageDishes} from "@/lib/provider/package-food-inclusions";
const load=vi.hoisted(()=>vi.fn());vi.mock("@/app/provider/packages/dish-library-actions",()=>({loadDishLibrary:load}));
beforeEach(()=>{load.mockResolvedValue({revision:1,categories:[],dishes:[{id:"rice",name:"Steamed Rice",category:"Rice"},{id:"suman",name:"Suman",category:"Native Delicacies"}]});});
function Editor({initial=[],change=vi.fn(),disabled=false}:{initial?:string[];change?:(value:string[])=>void;disabled?:boolean}){const[value,setValue]=useState(initial);return <ProviderPackageFoodMenu value={value} disabled={disabled} onChange={next=>{setValue(next);change(next);}}/>;}
async function pick(){fireEvent.click(screen.getByRole("button",{name:"Choose from Dish List"}));return within(await screen.findByRole("dialog",{name:"Dish Library"}));}
it("shows grouped and ungrouped categories and saves dishes with their categories", async () => {
  load.mockResolvedValueOnce({
    revision: 1,
    categories: ["Seafoods", "Rice"],
    dishes: [
      {id: "fish", name: "Grilled Fish", category: "Seafoods", parentGroup: "Main dish"},
      {id: "rice", name: "Steamed Rice", category: "Rice"},
    ],
  });
  const change = vi.fn();
  render(<Editor change={change}/>);
  const picker = await pick();
  expect(await picker.findByRole("button", {name: "All (2)"})).toBeVisible();
  expect(picker.getByRole("button", {name: "Main dish"})).toBeVisible();
  expect(picker.getByRole("heading", {name: "Categories"})).toBeVisible();
  fireEvent.click(picker.getByRole("button", {name: "Rice"}));
  fireEvent.click(picker.getByRole("checkbox", {name: "Select all Rice"}));
  fireEvent.click(picker.getByRole("button", {name: "Add 1 selected dish"}));
  expect(change).toHaveBeenLastCalledWith(["Rice: Steamed Rice"]);
});
it("preserves legacy raw strings and removes only the chosen dish",()=>{const change=vi.fn();render(<Editor initial={["Other: Legacy dish"," rice : Steamed Rice"]} change={change}/>);fireEvent.click(screen.getByRole("button",{name:"Remove Legacy dish",hidden:true}));expect(change).toHaveBeenLastCalledWith([" rice : Steamed Rice"]);});
it("deduplicates dishes already included",async()=>{const change=vi.fn();render(<Editor initial={["Rice: Steamed Rice"]} change={change}/>);const picker=await pick();fireEvent.click(picker.getByRole("checkbox",{name:"Select all Rice"}));fireEvent.click(picker.getByRole("button",{name:"Add 1 selected dish"}));expect(change).toHaveBeenLastCalledWith(["Rice: Steamed Rice"]);});
it("leaves included dishes intact if the library cannot load",async()=>{load.mockRejectedValueOnce(new Error("Library unavailable"));const change=vi.fn();render(<Editor initial={["Rice: Steamed Rice"]} change={change}/>);await pick().catch(()=>undefined);expect(await screen.findByRole("alert")).toHaveTextContent("Library unavailable");expect(change).not.toHaveBeenCalled();});
it("disables dish selection and removal during saving",()=>{render(<Editor initial={["Rice: Steamed Rice"]} disabled/>);expect(screen.getByRole("button",{name:"Choose from Dish List"})).toBeDisabled();expect(screen.getByRole("button",{name:"Edit Rice category"})).toBeDisabled();expect(screen.getByRole("button",{name:"Remove Rice category"})).toBeDisabled();expect(screen.getByRole("button",{name:"Remove Steamed Rice",hidden:true})).toBeDisabled();});
it("confirms removing a multi-dish category, removes a single-dish category directly, and toggles removable dish chips",async()=>{
  const change = vi.fn();
  render(<Editor initial={["Inclusions: Ice", "Pork: Adobo", "Inclusions: Water"]} change={change}/>);

  // Collapsed by default, expands into removable chips.
  const toggle = screen.getByRole("button",{name:"Inclusions (2)"});
  expect(toggle).toHaveAttribute("aria-expanded","false");
  expect(screen.getByText("Ice")).not.toBeVisible();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded","true");
  expect(screen.getByText("Ice")).toBeVisible();
  expect(screen.getByText("Water")).toBeVisible();

  // Multi-dish category Remove prompts confirmation; Cancel preserves it.
  fireEvent.click(screen.getByRole("button",{name:"Remove Inclusions category"}));
  const dialog = await screen.findByRole("dialog",{name:"FEASTA Confirmation"});
  expect(dialog).toHaveTextContent("Remove Inclusions and its 2 included dishes?");
  fireEvent.click(within(dialog).getByRole("button",{name:"Cancel"}));
  await waitFor(()=>expect(screen.queryByRole("dialog",{name:"FEASTA Confirmation"})).not.toBeInTheDocument());
  expect(change).not.toHaveBeenCalled();

  // Confirming removes the entire multi-dish category while preserving Pork.
  fireEvent.click(screen.getByRole("button",{name:"Remove Inclusions category"}));
  const confirmDialog = await screen.findByRole("dialog",{name:"FEASTA Confirmation"});
  fireEvent.click(within(confirmDialog).getByRole("button",{name:"Remove category"}));
  await waitFor(()=>expect(change).toHaveBeenLastCalledWith(["Pork: Adobo"]));
  expect(screen.queryByText("Inclusions (2)")).not.toBeInTheDocument();
  expect(screen.getByText("Pork (1)")).toBeVisible();

  // Single-dish category removes directly without a confirmation dialog.
  fireEvent.click(screen.getByRole("button",{name:"Remove Pork category"}));
  expect(screen.queryByRole("dialog",{name:"FEASTA Confirmation"})).not.toBeInTheDocument();
  expect(change).toHaveBeenLastCalledWith([]);
});
it("edits dishes in a category using the consistent checkbox grid and preserves other categories",async()=>{
  load.mockResolvedValueOnce({
    revision: 1,
    categories: ["Pork", "Rice"],
    dishes: [
      {id: "p1", name: "Pork Menudo", category: "Pork"},
      {id: "p2", name: "Lechon Kawali", category: "Pork"},
      {id: "r1", name: "Steamed Rice", category: "Rice"},
    ],
  });
  const change = vi.fn();
  render(<Editor initial={["Rice: Steamed Rice", "Pork: Pork Menudo"]} change={change}/>);
  fireEvent.click(screen.getByRole("button",{name:"Edit Pork category"}));
  const dialog = within(await screen.findByRole("dialog",{name:"Edit Pork"}));
  expect(await dialog.findByRole("checkbox",{name:"Lechon Kawali"})).not.toBeChecked();
  expect(dialog.getByRole("checkbox",{name:"Pork Menudo"})).toBeChecked();
  expect(dialog.queryByRole("checkbox",{name:"Steamed Rice"})).not.toBeInTheDocument();

  fireEvent.click(dialog.getByRole("checkbox",{name:"Lechon Kawali"}));
  fireEvent.click(dialog.getByRole("button",{name:"Save dishes"}));
  expect(change).toHaveBeenLastCalledWith(["Rice: Steamed Rice", "Pork: Pork Menudo", "Pork: Lechon Kawali"]);
});
it("removes the category when all dishes are unchecked and saved from Edit",async()=>{
  load.mockResolvedValueOnce({
    revision: 1,
    categories: ["Pork"],
    dishes: [{id: "p1", name: "Pork Menudo", category: "Pork"}],
  });
  const change = vi.fn();
  render(<Editor initial={["Rice: Steamed Rice", "Pork: Pork Menudo"]} change={change}/>);
  fireEvent.click(screen.getByRole("button",{name:"Edit Pork category"}));
  const dialog = within(await screen.findByRole("dialog",{name:"Edit Pork"}));
  fireEvent.click(await dialog.findByRole("checkbox",{name:"Clear Pork"}));
  expect(dialog.getByText("Saving with 0 selected will remove Pork from this package.")).toBeVisible();
  fireEvent.click(dialog.getByRole("button",{name:"Save dishes"}));
  expect(change).toHaveBeenLastCalledWith(["Rice: Steamed Rice"]);
});
it("keeps historical category spelling and raw strings intact",()=>{const raw=[" chicken : Adobo","Other: Old dish","Native Delicacies: Suman"];expect(parsePackageDishes(raw).map(d=>d.raw)).toEqual(raw);const options=packageFoodCategoryOptions(parsePackageDishes(raw).map(d=>d.category));expect(options).toContain(" chicken ");expect(options).not.toContain("Chicken");expect(options).toContain("Native Delicacies");expect(options).not.toContain("Other");});
