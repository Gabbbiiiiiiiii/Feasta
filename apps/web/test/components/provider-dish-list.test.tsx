import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProviderDishLibrary} from "@/app/provider/packages/provider-dish-library";
import {loadDishLibrary, saveDishLibrary} from "@/app/provider/packages/dish-library-actions";

vi.mock("@/app/provider/packages/dish-library-actions", () => ({loadDishLibrary: vi.fn(), saveDishLibrary: vi.fn()}));

it("saves an empty category before opening the dish form", async () => {
  vi.mocked(saveDishLibrary).mockResolvedValue({revision: 1, dishes: [], categories: ["House Desserts"], parentGroups: {"house desserts": "Dessert"}});
  render(<ProviderDishLibrary initialLibrary={{revision: 0, dishes: [], categories: []}} />);
  fireEvent.click(screen.getByRole("button", {name: "Add category"}));
  fireEvent.change(screen.getByLabelText("Category name"), {target: {value: "House Desserts"}});
  fireEvent.change(screen.getByLabelText("Parent Group"), {target: {value: "Dessert"}});
  fireEvent.click(screen.getByRole("button", {name: "Save category"}));
  await screen.findByText("No dishes in this category yet.");
  fireEvent.click(screen.getByRole("button", {name: "Add dish"}));
  fireEvent.change(screen.getByRole("combobox", {name: "Category Name"}), {target: {value: "House Desserts"}});
  expect(screen.getByText("Parent Group: Dessert")).toBeVisible();
  expect(screen.getByRole("option", {name: "House Desserts"})).toBeInTheDocument();
  expect(saveDishLibrary).toHaveBeenCalledWith(0, [], ["House Desserts"], {"house desserts": "Dessert"});
  expect(screen.getByText("No dishes in this category yet.")).toBeVisible();
});

it("filters saved dishes by parent group and search text", () => {
  render(<ProviderDishLibrary initialLibrary={{revision: 1, categories: [], dishes: [
    {id: "1", category: "Beef", parentGroup: "Meat Dishes", name: "Beef Steak"},
    {id: "2", category: "Beef", parentGroup: "Meat Dishes", name: "Beef Kare-Kare"},
    {id: "3", category: "Desserts", name: "Buko Pandan"},
    {id: "4", category: "Chicken Dishes", parentGroup: "Meat Dishes", name: "Chicken Joy"},
  ]}} />);
  fireEvent.click(screen.getByRole("button", {name: "Meat Dishes"}));
  expect(screen.queryByText("Buko Pandan")).not.toBeInTheDocument();
  expect(screen.getByText("Chicken Joy")).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Beef"}));
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

it("assigns an ungrouped category without losing the pending dish name", async () => {
  const existing = {id: "1", name: "Pancit", category: "Noodles", parentGroup: ""};
  vi.mocked(saveDishLibrary).mockResolvedValueOnce({
    revision: 1, categories: ["Noodles"], parentGroups: {noodles: "Main Dish"},
    dishes: [{...existing, parentGroup: "Main Dish"}],
  });
  render(<ProviderDishLibrary initialLibrary={{revision: 0, dishes: [existing], categories: ["Noodles"]}} />);
  fireEvent.click(screen.getByRole("button", {name: "Add dish"}));
  fireEvent.change(screen.getByLabelText("Dish Name"), {target: {value: "Bihon"}});
  fireEvent.change(screen.getByRole("combobox", {name: "Category Name"}), {target: {value: "Noodles"}});
  expect(screen.getByRole("button", {name: "Save dish"})).toBeDisabled();
  fireEvent.change(screen.getByRole("combobox", {name: "Parent Group"}), {target: {value: "Main Dish"}});
  fireEvent.click(screen.getByRole("button", {name: "Assign to category"}));
  expect(await screen.findByText("Parent Group: Main Dish")).toBeVisible();
  expect(saveDishLibrary).toHaveBeenCalledWith(0, [{...existing, parentGroup: "Main Dish"}], ["Noodles"], {noodles: "Main Dish"});
  expect(screen.getByLabelText("Dish Name")).toHaveValue("Bihon");
  expect(screen.getByRole("button", {name: "Save dish"})).toBeEnabled();
});
