import {useState} from "react";
import {fireEvent, render, screen, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProviderPackageFoodMenu} from "@/app/provider/packages/provider-package-food-menu";
import {packageFoodCategoryOptions, parsePackageDishes} from "@/lib/provider/package-food-inclusions";

const standards = ["Appetizers", "Beef", "Chicken", "Desserts", "Drinks", "Fish/Seafood", "Main Dish", "Pasta/Noodles", "Pork", "Rice", "Soup", "Vegetables"];
function Editor({initial = [], change = vi.fn()}: {initial?: string[]; change?: (value: string[]) => void}) {
  const [value, setValue] = useState(initial);
  return <ProviderPackageFoodMenu value={value} onChange={(next) => {setValue(next); change(next);}} />;
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", {name}));
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), {target: {value}});
function create(name: string) {
  fill("Category name", name);
  fireEvent.click(within(screen.getByRole("dialog", {name: "Add Category"})).getByRole("button", {name: "Add Category"}));
}

it("shows all twelve alphabetical standards before the fallback and custom action", () => {
  render(<Editor />); click("Add Dish");
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([...standards, "Uncategorized", "Create a custom category…"]);
  expect(screen.getByLabelText("Category")).toHaveValue("");
  expect(screen.queryByRole("option", {name: "Other"})).not.toBeInTheDocument();
});

it("saves Rice and restores its category and dish after reopening", () => {
  const change = vi.fn(); const view = render(<Editor change={change} />);
  click("Add Dish"); fill("Category", "Rice"); fill("Dish name", "Steamed Rice"); click("Save Dish");
  expect(change).toHaveBeenLastCalledWith(["Rice: Steamed Rice"]);
  view.unmount(); render(<Editor initial={change.mock.calls[0][0]} />);
  click("Edit dish Steamed Rice");
  expect(screen.getByLabelText("Category")).toHaveValue("Rice");
  expect(screen.getByLabelText("Dish name")).toHaveValue("Steamed Rice");
});

it("preserves historical Other dishes while excluding Other from newly added dishes", () => {
  const initial = ["Other: Legacy dish", "Rice: Steamed Rice"];
  const change = vi.fn(); render(<Editor initial={initial} change={change} />);
  click("Add Dish"); expect(screen.queryByRole("option", {name: "Other"})).not.toBeInTheDocument(); click("Cancel");
  click("Edit dish Legacy dish"); expect(screen.getByLabelText("Category")).toHaveValue("Other");
  click("Save Dish"); expect(change).toHaveBeenLastCalledWith(initial);
  click("Edit dish Legacy dish"); fill("Category", "Beef"); click("Save Dish");
  expect(change).toHaveBeenLastCalledWith(["Beef: Legacy dish", initial[1]]);
});

it("does not carry historical Other into Save & Add Another", () => {
  render(<Editor initial={["Other: Legacy dish"]} />); click("Edit dish Legacy dish"); click("Save & Add Another");
  expect(screen.getByLabelText("Category")).toHaveValue("");
  expect(screen.queryByRole("option", {name: "Other"})).not.toBeInTheDocument();
});

it("creates package-specific categories from a dish and persists only categories with dishes", () => {
  const change = vi.fn(); const view = render(<Editor change={change} />);
  click("Add Category"); create("Empty Category"); expect(change).not.toHaveBeenCalled();
  click("Add Dish"); expect(screen.getByRole("option", {name: "Empty Category"})).toBeInTheDocument();
  fill("Dish name", "Suman"); fill("Category", ":create:"); create("Native Delicacies"); click("Save Dish");
  expect(change).toHaveBeenLastCalledWith(["Native Delicacies: Suman"]);
  view.unmount(); const saved = render(<Editor initial={change.mock.calls[0][0]} />);
  click("Add Dish"); expect(screen.getByRole("option", {name: "Native Delicacies"})).toBeInTheDocument();
  expect(screen.queryByRole("option", {name: "Empty Category"})).not.toBeInTheDocument();
  saved.unmount(); render(<Editor />); click("Add Dish");
  expect(screen.queryByRole("option", {name: "Native Delicacies"})).not.toBeInTheDocument();
});

it.each([" rice ", " MAIN   dish ", "native   delicacies", "Uncategorized"])("rejects duplicate or fallback custom name %s", (name) => {
  const change = vi.fn(); render(<Editor initial={["Native Delicacies: Suman"]} change={change} />);
  click("Add Category"); create(name);
  expect(screen.getByRole("alert")).toHaveTextContent("already exists"); expect(change).not.toHaveBeenCalled();
});

it("keeps stored standard spelling and raw strings intact", () => {
  const raw = [" chicken : Adobo", "Other: Old dish", "Native Delicacies: Suman"];
  expect(parsePackageDishes(raw).map((dish) => dish.raw)).toEqual(raw);
  const options = packageFoodCategoryOptions(parsePackageDishes(raw).map((dish) => dish.category));
  expect(options).toContain(" chicken "); expect(options).not.toContain("Chicken");
  expect(options).toContain("Native Delicacies"); expect(options).not.toContain("Other");
});
