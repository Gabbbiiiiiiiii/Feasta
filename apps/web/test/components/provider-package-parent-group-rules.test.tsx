import {fireEvent, render, screen} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProviderPackageParentGroupRules} from "@/app/provider/packages/provider-package-food-choices";
import {loadDishLibrary} from "@/app/provider/packages/dish-library-actions";

vi.mock("@/app/provider/packages/dish-library-actions", () => ({loadDishLibrary: vi.fn()}));

it("snapshots only the selected Parent Group and rejects an impossible quantity", async () => {
  vi.mocked(loadDishLibrary).mockResolvedValue({
    revision: 1,
    categories: ["Rice", "Chicken"],
    dishes: [
      {id: "rice", name: "Garlic rice", category: "Rice", parentGroup: "Side Dish"},
      {id: "chicken", name: "Chicken adobo", category: "Chicken", parentGroup: "Main Dish"},
    ],
  });
  const onChange = vi.fn();
  render(<ProviderPackageParentGroupRules value={[]} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", {name: "Add Parent Group rule"}));
  fireEvent.change(await screen.findByRole("combobox", {name: "Parent Group"}), {target: {value: "Side Dish"}});
  const count = screen.getByRole("spinbutton", {name: "Number of dishes to choose"});
  fireEvent.change(count, {target: {value: "2"}});
  expect(screen.getByRole("button", {name: "Save rule"})).toBeDisabled();
  fireEvent.change(count, {target: {value: "1"}});
  fireEvent.click(screen.getByRole("button", {name: "Save rule"}));
  expect(onChange).toHaveBeenCalledWith([{
    id: expect.any(String), title: "Side Dish", selectionCount: 1,
    options: [{id: "rice", name: "Garlic rice"}],
  }]);
});
