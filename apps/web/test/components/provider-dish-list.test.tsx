import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProviderDishLibrary} from "@/app/provider/packages/provider-dish-library";
import {loadDishLibrary, saveDishLibrary} from "@/app/provider/packages/dish-library-actions";

vi.mock("@/app/provider/packages/dish-library-actions", () => ({loadDishLibrary: vi.fn(), saveDishLibrary: vi.fn()}));

it("saves an empty category without showing Parent Group in Add category or Add dish", async () => {
  vi.mocked(saveDishLibrary).mockResolvedValue({revision: 1, dishes: [], categories: ["House Desserts"], parentGroups: {}});
  render(<ProviderDishLibrary initialLibrary={{revision: 0, dishes: [], categories: []}} />);
  fireEvent.click(screen.getByRole("button", {name: "Add category"}));
  expect(screen.queryByLabelText("Parent Group")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Add parent group"})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Category name"), {target: {value: "House Desserts"}});
  fireEvent.click(screen.getByRole("button", {name: "Save category"}));
  await screen.findByText("No dishes in this category yet.");
  fireEvent.click(screen.getByRole("button", {name: "Add dish"}));
  fireEvent.change(screen.getByRole("combobox", {name: "Category Name"}), {target: {value: "House Desserts"}});
  expect(screen.queryByRole("combobox", {name: "Parent Group"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Add parent group"})).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Assign to category"})).not.toBeInTheDocument();
  expect(screen.getByRole("option", {name: "House Desserts"})).toBeInTheDocument();
  expect(saveDishLibrary).toHaveBeenCalledWith(0, [], ["House Desserts"], {});
  expect(screen.getByText("No dishes in this category yet.")).toBeVisible();
});

it("filters saved dishes by parent group and search text", () => {
  render(<ProviderDishLibrary initialLibrary={{revision: 1, categories: [], dishes: [
    {id: "1", category: "Beef", parentGroup: "Meat Dishes", name: "Beef Steak"},
    {id: "2", category: "Beef", parentGroup: "Meat Dishes", name: "Beef Kare-Kare"},
    {id: "3", category: "Desserts", name: "Buko Pandan"},
    {id: "4", category: "Chicken Dishes", parentGroup: "Meat Dishes", name: "Chicken Joy"},
  ]}} />);
  fireEvent.change(screen.getByRole("combobox", {name: "Parent Group filter"}), {target: {value: "group:Meat Dishes"}});
  expect(screen.queryByText("Buko Pandan")).not.toBeInTheDocument();
  expect(screen.getByText("Chicken Joy")).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", {name: "Category filter"}), {target: {value: "Beef"}});
  expect(screen.queryByText("Chicken Joy")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "kare"}});
  expect(screen.getByText("Beef Kare-Kare")).toBeVisible();
  expect(screen.queryByText("Beef Steak")).not.toBeInTheDocument();
});

it("keeps picks across search and review when the destination rejects a batch", async () => {
  vi.mocked(loadDishLibrary).mockResolvedValue({
    revision: 1, categories: [], dishes: [
      {id: "1", category: "Beef", parentGroup: "Main Dish", name: "Beef Steak"},
      {id: "2", category: "Beef", parentGroup: "Main Dish", name: "Beef Kare-Kare"},
      {id: "3", category: "Rice", name: "Plain Rice", parentGroup: "Side Dish"},
    ],
  });
  const onAdd = vi.fn(() => "Choose fewer dishes.");
  render(<ProviderDishLibrary onAdd={onAdd} destination="Customer choice group" limitLabel="Up to 10 dishes per group" />);
  fireEvent.click(screen.getByRole("button", {name: "Choose from Dish List"}));
  expect(await screen.findByText("Up to 10 dishes per group")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "steak"}});
  fireEvent.click(screen.getByRole("checkbox", {name: "Select all 1 matches in Beef"}));
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "rice"}});
  fireEvent.click(screen.getByRole("checkbox", {name: "Plain Rice"}));
  fireEvent.click(screen.getByRole("button", {name: "Selected (2)"}));
  expect(screen.getByRole("checkbox", {name: "Beef Steak"})).toBeChecked();
  expect(screen.queryByRole("checkbox", {name: "Beef Kare-Kare"})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Add 2 selected dishes"}));
  expect(screen.getByRole("alert")).toHaveTextContent("Choose fewer dishes.");
  expect(screen.getByRole("checkbox", {name: "Plain Rice"})).toBeChecked();
});

it("keeps the category and parent group when saving and adding another dish", async () => {
  vi.mocked(saveDishLibrary).mockImplementation(async (revision, dishes, categories, parentGroups = {}) => ({
    revision: revision + 1, dishes: dishes.map((dish) => ({...dish, parentGroup: dish.parentGroup ?? ""})), categories, parentGroups,
  }));
  render(<ProviderDishLibrary initialLibrary={{revision: 0, dishes: [], categories: ["Chicken Dishes"], parentGroups: {"chicken dishes": "Meat Dishes"}}} />);
  fireEvent.click(screen.getByRole("button", {name: "Add dish"}));
  fireEvent.change(screen.getByRole("combobox", {name: "Category Name"}), {target: {value: "Chicken Dishes"}});
  fireEvent.change(screen.getByLabelText("Dish Name"), {target: {value: "Chicken Adobo"}});
  fireEvent.click(screen.getByRole("button", {name: "Save & Add Another"}));
  await waitFor(() => expect(saveDishLibrary).toHaveBeenCalledWith(0, [expect.objectContaining({name: "Chicken Adobo"})], ["Chicken Dishes"], {"chicken dishes": "Meat Dishes"}));
  await waitFor(() => expect(screen.getByLabelText("Dish Name")).toHaveValue(""));
  expect(screen.getByRole("combobox", {name: "Category Name"})).toHaveValue("Chicken Dishes");
  expect(screen.getByText("Parent Group: Meat Dishes")).toBeVisible();
  expect(screen.getByLabelText("Dish Name")).toHaveValue("");
  expect(screen.getByLabelText("Dish Name")).toHaveFocus();
});

it("saves a dish in an ungrouped category without showing the Parent Group assignment box", async () => {
  const existing = {id: "1", name: "Pancit", category: "Noodles", parentGroup: ""};
  vi.mocked(saveDishLibrary).mockImplementationOnce(async (revision, dishes, categories, parentGroups = {}) => ({
    revision: revision + 1,
    dishes: dishes.map((dish) => ({...dish, parentGroup: dish.parentGroup ?? ""})),
    categories,
    parentGroups,
  }));
  render(<ProviderDishLibrary initialLibrary={{revision: 0, dishes: [existing], categories: ["Noodles"]}} />);
  fireEvent.click(screen.getByRole("button", {name: "Add dish"}));
  fireEvent.change(screen.getByLabelText("Dish Name"), {target: {value: "Bihon"}});
  fireEvent.change(screen.getByRole("combobox", {name: "Category Name"}), {target: {value: "Noodles"}});
  expect(screen.queryByRole("combobox", {name: "Parent Group"})).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name: "Save dish"})).toBeEnabled();
  fireEvent.click(screen.getByRole("button", {name: "Save dish"}));
  await waitFor(() => expect(saveDishLibrary).toHaveBeenCalledWith(
    0,
    [existing, expect.objectContaining({name: "Bihon", category: "Noodles", parentGroup: ""})],
    ["Noodles"],
    {},
  ));
});

it("paginates dishes within a category and resets to the first page on search", () => {
  const dishes = Array.from({length: 12}, (_, index) => ({
    id: String(index), name: `Dish ${index + 1}`, category: "Rice", parentGroup: "Side Dish",
  }));
  render(<ProviderDishLibrary initialLibrary={{revision: 0, dishes, categories: ["Rice"]}} />);
  expect(screen.getByText("Showing 1–10 of 12 dishes")).toBeVisible();
  expect(screen.queryByText("Dish 12")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Next"}));
  expect(screen.getByText("Showing 11–12 of 12 dishes")).toBeVisible();
  expect(screen.getByText("Dish 12")).toBeVisible();
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "Dish 12"}});
  expect(screen.getByText("Showing 1 dish")).toBeVisible();
  expect(screen.queryByRole("combobox", {name: "Dishes per page"})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", {name: "Parent Group filter"}), {target: {value: "group:Side Dish"}});
  expect(screen.getByText("Showing 1 dish in Side Dish")).toBeVisible();
  expect(screen.queryByRole("navigation", {name: "Dish List pagination"})).not.toBeInTheDocument();
});

it("uses branded FEASTA Confirmation instead of window.confirm when deleting a category or dish", async () => {
  vi.mocked(saveDishLibrary).mockClear();
  const confirmSpy = vi.spyOn(window, "confirm").mockImplementation(() => true);
  vi.mocked(saveDishLibrary).mockImplementation(async (revision, dishes, categories, parentGroups = {}) => ({
    revision: revision + 1,
    dishes: dishes.map((dish) => ({...dish, parentGroup: dish.parentGroup ?? ""})),
    categories,
    parentGroups,
  }));

  render(
    <ProviderDishLibrary
      initialLibrary={{
        revision: 0,
        categories: ["Dessert"],
        dishes: [{id: "d1", name: "Leche Flan", category: "Dessert", parentGroup: ""}],
      }}
    />,
  );

  // Cancel dish deletion via FEASTA Confirmation -> does not call saveDishLibrary or window.confirm.
  fireEvent.click(screen.getByRole("button", {name: "Delete Leche Flan"}));
  const dishDialog = screen.getByRole("dialog", {name: "FEASTA Confirmation"});
  expect(within(dishDialog).getByText("Delete Leche Flan from your Dish List?")).toBeVisible();
  fireEvent.click(within(dishDialog).getByRole("button", {name: "Cancel"}));
  expect(saveDishLibrary).not.toHaveBeenCalled();

  // Confirm category deletion via FEASTA Confirmation.
  fireEvent.click(screen.getByRole("button", {name: "Delete category Dessert"}));
  const categoryDialog = screen.getByRole("dialog", {name: "FEASTA Confirmation"});
  expect(within(categoryDialog).getByText("Delete Dessert and its 1 dish from your Dish List?")).toBeVisible();
  fireEvent.click(within(categoryDialog).getByRole("button", {name: "Delete category"}));
  await waitFor(() => expect(saveDishLibrary).toHaveBeenCalledWith(0, [], [], {}));
  expect(confirmSpy).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});
