import {Dialog, DialogContent, DialogTitle} from "@/components/ui/dialog";
import {useState} from "react";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, expect, it, vi} from "vitest";
import type {FoodChoiceGroupV2} from "@feasta/shared-types/provider-package-v2";
import {ProviderPackageFoodChoices} from "@/app/provider/packages/provider-package-food-choices";
import {loadDishLibrary} from "@/app/provider/packages/dish-library-actions";
import {parseFoodChoiceGroupsV2} from "@/lib/provider/food-choice-groups-v2";

vi.mock("@/app/provider/packages/dish-library-actions", () => ({
  loadDishLibrary: vi.fn(),
}));

const defaultLibrary = {
  revision: 1,
  categories: ["Meat", "Rice", "Empty Cat"],
  parentGroups: {meat: "Main dish", rice: "Side dish"},
  groupNames: ["Main dish", "Side dish", "Dessert"],
  dishes: [
    {id: "0", name: "Chicken", category: "Meat", parentGroup: "Main dish"},
    {id: "1", name: "Fish", category: "Meat", parentGroup: "Main dish"},
    {id: "2", name: "Beef", category: "Meat", parentGroup: "Main dish"},
    {id: "3", name: "Pork", category: "Meat", parentGroup: "Main dish"},
    {id: "4", name: "Garlic Rice", category: "Rice", parentGroup: "Side dish"},
    {id: "5", name: "Steamed Rice", category: "Rice", parentGroup: "Side dish"},
  ],
};

const group: FoodChoiceGroupV2 = {
  id: "main",
  title: "Main dish",
  selectionCount: 1,
  options: [
    {id: "a", name: "Chicken"},
    {id: "b", name: "Fish"},
  ],
};

function Editor({
  initial = [],
  change = vi.fn(),
  disabled = false,
}: {
  initial?: FoodChoiceGroupV2[];
  change?: (groups: FoodChoiceGroupV2[]) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ProviderPackageFoodChoices
      value={value}
      disabled={disabled}
      onChange={(next) => {
        setValue(next);
        change(next);
      }}
    />
  );
}

const click = (name: string) => fireEvent.click(screen.getByRole("button", {name}));
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), {target: {value}});

beforeEach(() => {
  vi.mocked(loadDishLibrary).mockResolvedValue(defaultLibrary);
});

it("uses Parent Group dropdown, hides Dish List picker, and uses single Number of dishes to choose field", async () => {
  const change = vi.fn();
  render(<Editor change={change} />);
  click("Add choice group");

  expect(await screen.findByRole("option", {name: "Main dish"})).toBeInTheDocument();
  expect(screen.getByRole("option", {name: "Side dish"})).toBeInTheDocument();
  expect(screen.queryByRole("button", {name: "Choose from Dish List"})).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Minimum Selections")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Maximum Selections")).not.toBeInTheDocument();

  fill("Group Name", "Main dish");
  expect(screen.getByText("4 eligible dishes")).toBeVisible();
  expect(change).not.toHaveBeenCalled();

  fill("Number of dishes to choose", "2");
  click("Save choice group");

  const saved = change.mock.calls[0][0];
  expect(parseFoodChoiceGroupsV2(saved)).toEqual(saved);
  expect(saved[0].title).toBe("Main dish");
  expect(saved[0].options.map((r: {name: string}) => r.name)).toEqual(["Chicken", "Fish", "Beef", "Pork"]);
  expect(saved[0].selectionCount).toBe(2);
});

it("disables already-added Parent Groups in the dropdown and prevents saving empty Parent Groups", async () => {
  render(<Editor initial={[group]} />);
  click("Add choice group");

  const mainOption = await screen.findByRole("option", {name: "Main dish (already added)"});
  expect(mainOption).toBeDisabled();

  fill("Group Name", "Dessert");
  expect(screen.getByText("0 eligible dishes")).toBeVisible();
  expect(screen.getByRole("button", {name: "Save choice group"})).toBeDisabled();
});

it("validates Number of dishes to choose against 1..10 and available group dishes", async () => {
  const change = vi.fn();
  render(<Editor initial={[group]} change={change} />);
  click("Edit choice group 1");
  await screen.findByRole("option", {name: "Side dish"});

  const input = screen.getByLabelText("Number of dishes to choose") as HTMLInputElement;
  for (const value of ["200000000000000000000", "0", "-1", "1.5", "2e3", "11", "+1", "abc", "01"]) {
    fireEvent.change(input, {target: {value}});
    expect(input).toHaveValue("1");
    expect(input).toHaveAttribute("aria-invalid", "true");
    input.setSelectionRange(0, 1);
    fireEvent.paste(input, {clipboardData: {getData: () => value}});
    expect(input).toHaveValue("1");
  }

  // Group has 2 saved options -> 3 exceeds available dishes and disables save.
  fill("Number of dishes to choose", "3");
  expect(screen.getByRole("alert")).toHaveTextContent("Only 2 dishes available in Main dish");
  expect(screen.getByRole("button", {name: "Save choice group"})).toBeDisabled();

  // Valid count 2 saves cleanly and preserves existing saved options.
  fill("Number of dishes to choose", "2");
  click("Save choice group");
  expect(change.mock.calls[0][0][0]).toEqual({...group, selectionCount: 2});
});

it.each(["Cancel", "Close dialog", "Escape"])("confirms dirty cancellation through %s and restores focus", async (action) => {
  const user = userEvent.setup();
  const change = vi.fn();
  render(<Editor change={change} />);
  const trigger = screen.getByRole("button", {name: "Add choice group"});
  await user.click(trigger);
  await screen.findByRole("option", {name: "Side dish"});
  fill("Group Name", "Side dish");

  if (action === "Escape") await user.keyboard("{Escape}");
  else click(action);
  expect(screen.getByRole("dialog", {name: "FEASTA Confirmation"})).toBeInTheDocument();
  click("Cancel");
  expect(screen.getByLabelText("Group Name")).toHaveValue("Side dish");

  if (action === "Escape") await user.keyboard("{Escape}");
  else click(action);
  click("Discard Changes");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(change).not.toHaveBeenCalled();
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("keeps the ten-group bound and disabled state", () => {
  const groups = Array.from({length: 10}, (_, i) => ({...group, id: "g" + i, title: "Group " + i}));
  render(<Editor initial={groups} disabled />);
  expect(screen.getByRole("button", {name: "Add choice group"})).toBeDisabled();
  expect(screen.getByRole("button", {name: "Edit choice group 1"})).toBeDisabled();
});

it("keeps a parent dialog open while editing a choice group", async () => {
  const user = userEvent.setup();
  render(
    <Dialog defaultOpen>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogTitle>Package wizard</DialogTitle>
        <Editor />
      </DialogContent>
    </Dialog>,
  );
  const parent = screen.getByRole("dialog", {name: "Package wizard"});
  await user.click(screen.getByRole("button", {name: "Add choice group"}));
  await screen.findByRole("option", {name: "Main dish"});
  fill("Group Name", "Main dish");
  const overlays = document.querySelectorAll('[data-state="open"][class*="fixed inset-0"]');
  await user.click(overlays[overlays.length - 1]);
  expect(parent).toBeInTheDocument();
  expect(screen.getByRole("dialog", {name: "Add Food Choice Group"})).toBeVisible();
});

it("lets providers toggle dish checkboxes, use category/group Select all, collapse categories, and validates against selected count", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  vi.mocked(loadDishLibrary).mockResolvedValue({
    ...defaultLibrary,
    categories: ["Seafoods", "Meat", "Rice"],
    parentGroups: {seafoods: "Main dish", meat: "Main dish", rice: "Side dish"},
    dishes: [
      {id: "s1", name: "Fish Fillet", category: "Seafoods", parentGroup: "Main dish"},
      {id: "s2", name: "Calamari", category: "Seafoods", parentGroup: "Main dish"},
      {id: "m1", name: "Chicken", category: "Meat", parentGroup: "Main dish"},
      {id: "m2", name: "Pork", category: "Meat", parentGroup: "Main dish"},
    ],
  });
  render(<Editor change={change} />);
  await user.click(screen.getByRole("button", {name: "Add choice group"}));
  await screen.findByRole("option", {name: "Main dish"});

  fill("Group Name", "Main dish");
  expect(screen.getByText("4 eligible dishes")).toBeVisible();
  expect(screen.getByText("4 selected")).toBeVisible();
  expect(screen.getByRole("button", {name: "▾ Seafoods (2) · 2 selected"})).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", {name: "▾ Meat (2) · 2 selected"})).toHaveAttribute("aria-expanded", "true");

  const fishFillet = screen.getByRole("checkbox", {name: "Fish Fillet"});
  const calamari = screen.getByRole("checkbox", {name: "Calamari"});
  const chicken = screen.getByRole("checkbox", {name: "Chicken"});
  const pork = screen.getByRole("checkbox", {name: "Pork"});
  for (const checkbox of [fishFillet, calamari, chicken, pork]) {
    expect(checkbox).toBeChecked();
  }

  // Collapse and re-expand a category card.
  await user.click(screen.getByRole("button", {name: "▾ Meat (2) · 2 selected"}));
  expect(screen.getByRole("button", {name: "▸ Meat (2) · 2 selected"})).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("checkbox", {name: "Chicken"})).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name: "▸ Meat (2) · 2 selected"}));
  expect(screen.getByRole("checkbox", {name: "Chicken"})).toBeChecked();

  // Deselect a whole category via its Select all checkbox.
  await user.click(screen.getByRole("checkbox", {name: "Clear Meat"}));
  expect(screen.getByRole("checkbox", {name: "Chicken"})).not.toBeChecked();
  expect(screen.getByRole("checkbox", {name: "Pork"})).not.toBeChecked();
  expect(screen.getByText("2 selected")).toBeVisible();
  expect(screen.getByRole("button", {name: "▾ Meat (2) · 0 selected"})).toBeVisible();

  // Count exceeding selected dishes disables save and offers recovery guidance.
  fill("Number of dishes to choose", "3");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Only 2 dishes available in Main dish. Select more dishes or enter 2 or fewer.",
  );
  expect(screen.getByRole("button", {name: "Save choice group"})).toBeDisabled();

  // Clear Seafoods too -> 0 selected disables save with a clear prompt.
  await user.click(screen.getByRole("checkbox", {name: "Clear Seafoods"}));
  expect(screen.getByText("0 selected")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Select at least 1 dish to save this choice group.");
  expect(screen.getByRole("button", {name: "Save choice group"})).toBeDisabled();

  // Group-level Select all selects every category, then uncheck Pork with keyboard Space and save 3 dishes.
  await user.click(screen.getByRole("checkbox", {name: "Select all Main dish"}));
  expect(screen.getByText("4 selected")).toBeVisible();
  const porkCheckbox = screen.getByRole("checkbox", {name: "Pork"});
  porkCheckbox.focus();
  await user.keyboard(" ");
  expect(porkCheckbox).not.toBeChecked();
  expect(screen.getByText("3 selected")).toBeVisible();
  expect(screen.getByRole("button", {name: "Save choice group"})).toBeEnabled();

  await user.click(screen.getByRole("button", {name: "Save choice group"}));
  expect(change).toHaveBeenCalledTimes(1);
  const saved = change.mock.calls[0][0][0];
  expect(saved.selectionCount).toBe(3);
  expect(saved.options.map((option: {name: string}) => option.name)).toEqual(["Fish Fillet", "Calamari", "Chicken"]);
  expect(parseFoodChoiceGroupsV2(change.mock.calls[0][0])).toEqual(change.mock.calls[0][0]);
});

it("shows unselected library dishes alongside saved dishes when editing and preserves original option IDs", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  render(<Editor initial={[group]} change={change} />);
  await user.click(screen.getByRole("button", {name: "Edit choice group 1"}));
  await screen.findByRole("option", {name: "Side dish"});

  expect(screen.getByText("4 eligible dishes")).toBeVisible();
  expect(screen.getByText("2 selected")).toBeVisible();
  expect(screen.getByRole("button", {name: "▾ Meat (4) · 2 selected"})).toBeVisible();
  expect(screen.getByRole("checkbox", {name: "Chicken"})).toBeChecked();
  expect(screen.getByRole("checkbox", {name: "Fish"})).toBeChecked();
  expect(screen.getByRole("checkbox", {name: "Beef"})).not.toBeChecked();
  expect(screen.getByRole("checkbox", {name: "Pork"})).not.toBeChecked();

  // Add Beef and remove Fish while preserving Chicken's original ID ("a").
  await user.click(screen.getByRole("checkbox", {name: "Beef"}));
  await user.click(screen.getByRole("checkbox", {name: "Fish"}));
  expect(screen.getByText("2 selected")).toBeVisible();

  await user.click(screen.getByRole("button", {name: "Save choice group"}));
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0][0][0]).toEqual({
    ...group,
    options: [
      {id: "a", name: "Chicken"},
      {id: "2", name: "Beef"},
    ],
  });
});

it("collapses choice group pills by default and confirms before removing multi-dish groups", async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  const singleDishGroup: FoodChoiceGroupV2 = {
    id: "side",
    title: "Side dish",
    selectionCount: 1,
    options: [{id: "r1", name: "Garlic Rice"}],
  };
  render(<Editor initial={[group, singleDishGroup]} change={change} />);

  // Collapsed by default, expands to show read-only dish pills without per-dish Remove buttons.
  const toggle = screen.getByRole("button", {name: "Main dish"});
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByText("Chicken")).not.toBeVisible();
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Chicken")).toBeVisible();
  expect(screen.getByText("Fish")).toBeVisible();
  expect(screen.queryByRole("button", {name: "Remove Chicken"})).not.toBeInTheDocument();

  // Multi-dish group Remove prompts confirmation; Cancel preserves it.
  await user.click(screen.getByRole("button", {name: "Remove choice group 1"}));
  const dialog = await screen.findByRole("dialog", {name: "FEASTA Confirmation"});
  expect(dialog).toHaveTextContent("Remove Main dish and its 2 dishes?");
  await user.click(screen.getByRole("button", {name: "Cancel"}));
  await waitFor(() => expect(screen.queryByRole("dialog", {name: "FEASTA Confirmation"})).not.toBeInTheDocument());
  expect(change).not.toHaveBeenCalled();

  // Confirming removes Main dish.
  await user.click(screen.getByRole("button", {name: "Remove choice group 1"}));
  await user.click(screen.getByRole("button", {name: "Remove group"}));
  await waitFor(() => expect(change).toHaveBeenLastCalledWith([singleDishGroup]));

  // Single-dish group removes directly without confirmation.
  await user.click(screen.getByRole("button", {name: "Remove choice group 1"}));
  expect(screen.queryByRole("dialog", {name: "FEASTA Confirmation"})).not.toBeInTheDocument();
  expect(change).toHaveBeenLastCalledWith([]);
});
