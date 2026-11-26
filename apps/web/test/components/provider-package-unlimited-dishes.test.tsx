import {fireEvent, render, screen} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProviderPackageFoodChoices} from "@/app/provider/packages/provider-package-food-choices";
import {parseFoodChoiceGroupsV2} from "@/lib/provider/food-choice-groups-v2";

vi.mock("@/app/provider/packages/dish-library-actions", () => ({
  loadDishLibrary: async () => ({
    revision: 1,
    categories: ["Pork"],
    parentGroups: {pork: "Side Dishes"},
    groupNames: ["Side Dishes"],
    dishes: Array.from({length: 61}, (_, i) => ({
      id: "dish_" + i,
      name: "Dish " + i,
      category: "Pork",
      parentGroup: "Side Dishes",
    })),
  }),
}));

it("loads and saves all 61 dishes from a Parent Group without dish caps", async () => {
  const change = vi.fn();
  render(<ProviderPackageFoodChoices value={[]} onChange={change} />);
  fireEvent.click(screen.getByRole("button", {name: "Add choice group"}));
  await screen.findByRole("option", {name: "Side Dishes"});
  fireEvent.change(screen.getByLabelText("Group Name"), {target: {value: "Side Dishes"}});
  expect(screen.getByText("61 eligible dishes")).toBeVisible();
  fireEvent.click(screen.getByRole("button", {name: "Save choice group"}));
  expect(change).toHaveBeenCalledTimes(1);
  const groups = change.mock.calls[0][0];
  expect(groups[0].options).toHaveLength(61);
  expect(parseFoodChoiceGroupsV2(groups)).toEqual(groups);
});
