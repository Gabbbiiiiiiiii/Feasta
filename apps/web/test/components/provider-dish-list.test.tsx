import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProviderDishLibrary} from "@/app/provider/packages/provider-dish-library";
import {loadDishLibrary, saveDishLibrary} from "@/app/provider/packages/dish-library-actions";

vi.mock("@/app/provider/packages/dish-library-actions", () => ({loadDishLibrary: vi.fn(), saveDishLibrary: vi.fn()}));

it("saves an empty category and selects it in the open dish form", async () => {
  vi.mocked(saveDishLibrary).mockResolvedValue({revision: 1, dishes: [], categories: ["House Desserts"]});
  render(<ProviderDishLibrary initialLibrary={{revision: 0, dishes: [], categories: []}} />);
  fireEvent.click(screen.getByRole("button", {name: "Add dish"}));
  fireEvent.click(screen.getByRole("button", {name: "Add a category"}));
  fireEvent.change(screen.getByLabelText("Category name"), {target: {value: "House Desserts"}});
  fireEvent.click(screen.getByRole("button", {name: "Save category"}));
  await waitFor(() => expect(screen.getByRole("combobox", {name: "Category Name"})).toHaveValue("House Desserts"));
  expect(screen.getByRole("option", {name: "House Desserts"})).toBeInTheDocument();
  expect(saveDishLibrary).toHaveBeenCalledWith(0, [], ["House Desserts"]);
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
      {id: "1", category: "Beef", name: "Beef Steak"},
      {id: "2", category: "Beef", name: "Beef Kare-Kare"},
      {id: "3", category: "Rice", name: "Plain Rice"},
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
  vi.mocked(saveDishLibrary).mockImplementation(async (revision, dishes, categories) => ({
    revision: revision + 1, dishes: dishes.map((dish) => ({...dish, parentGroup: dish.parentGroup ?? ""})), categories,
  }));
  render(<ProviderDishLibrary initialLibrary={{revision: 0, dishes: [], categories: ["Chicken Dishes"]}} />);
  fireEvent.click(screen.getByRole("button", {name: "Add dish"}));
  fireEvent.change(screen.getByRole("combobox", {name: "Category Name"}), {target: {value: "Chicken Dishes"}});
  fireEvent.change(screen.getByLabelText("Parent Group (optional)"), {target: {value: "Meat Dishes"}});
  fireEvent.change(screen.getByLabelText("Dish Name"), {target: {value: "Chicken Adobo"}});
  fireEvent.click(screen.getByRole("button", {name: "Save & Add Another"}));
  await waitFor(() => expect(saveDishLibrary).toHaveBeenCalledWith(0, [expect.objectContaining({name: "Chicken Adobo"})], ["Chicken Dishes"]));
  await waitFor(() => expect(screen.getByLabelText("Dish Name")).toHaveValue(""));
  expect(screen.getByRole("combobox", {name: "Category Name"})).toHaveValue("Chicken Dishes");
  expect(screen.getByLabelText("Parent Group (optional)")).toHaveValue("Meat Dishes");
  expect(screen.getByLabelText("Dish Name")).toHaveValue("");
  expect(screen.getByLabelText("Dish Name")).toHaveFocus();
});
