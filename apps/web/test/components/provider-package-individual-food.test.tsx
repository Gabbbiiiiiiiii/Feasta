import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import {
  ProviderPackageIndividualFood,
  type IndividualFoodDraftV2,
} from "@/app/provider/packages/provider-package-individual-food";

afterEach(() => vi.unstubAllGlobals());

function empty(): IndividualFoodDraftV2 {
  return {
    id: "individual_item",
    name: "",
    servingOptions: [],
  };
}

function withOption(): IndividualFoodDraftV2 {
  return {
    ...empty(),
    servingOptions: [{
      id: "family",
      name: "Family Size",
      minimumServingsText: "8",
      maximumServingsText: "",
      priceText: "",
      minimumQuantityText: "",
      maximumQuantityText: "",
    }],
  };
}

it("changes the food product name", () => {
  const onChange = vi.fn();
  render(
    <ProviderPackageIndividualFood
      value={empty()}
      onChange={onChange}
    />
  );

  fireEvent.change(screen.getByLabelText("Food product name"), {
    target: {value: "Pancit Canton Bilao"},
  });

  expect(onChange.mock.calls[0][0]).toEqual({
    id: "individual_item",
    name: "Pancit Canton Bilao",
    servingOptions: [],
  });
});

it("opens a local serving option without changing the list", () => {
  const onChange = vi.fn();

  render(
    <ProviderPackageIndividualFood
      value={empty()}
      onChange={onChange}
    />
  );

  fireEvent.click(
    screen.getByRole("button", {name: "Add serving size"})
  );

  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", {name: "Add Serving Size"})).toBeInTheDocument();
});

it("preserves unfinished price text exactly", () => {
  const onChange = vi.fn();

  render(
    <ProviderPackageIndividualFood
      value={withOption()}
      onChange={onChange}
    />
  );

  fireEvent.click(screen.getByRole("button", {name: "Edit serving option 1"}));
  const group = screen.getByRole("dialog");

  fireEvent.change(
    within(group).getByLabelText("Price (PHP)"),
    {target: {value: "1850."}}
  );

  expect(within(group).getByLabelText("Price (PHP)")).toHaveValue("1850.");
  expect(onChange).not.toHaveBeenCalled();
});

it("removes a serving option", async () => {
  const onChange = vi.fn();

  render(
    <ProviderPackageIndividualFood
      value={withOption()}
      onChange={onChange}
    />
  );

  fireEvent.click(screen.getByRole("button", {
    name: "Remove serving option 1",
  }));

  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog", {name: "FEASTA Confirmation"})).getByRole("button", {name: "Remove"}));
  await waitFor(() => expect(onChange.mock.calls[0][0].servingOptions).toEqual([]));
});

it("limits the editor to eight options", () => {
  const value = empty();

  value.servingOptions = Array.from({length: 8}, (_, index) => ({
    id: `option_${index}`,
    name: `Size ${index + 1}`,
    minimumServingsText: "",
    maximumServingsText: "",
    priceText: "",
    minimumQuantityText: "",
    maximumQuantityText: "",
  }));

  render(
    <ProviderPackageIndividualFood
      value={value}
      onChange={vi.fn()}
    />
  );

  expect(screen.getByRole("button", {
    name: "Add serving size",
  })).toBeDisabled();
});

it("disables editing while progress is saving", () => {
  render(
    <ProviderPackageIndividualFood
      value={withOption()}
      onChange={vi.fn()}
      disabled
    />
  );

  expect(screen.getByLabelText("Food product name")).toBeDisabled();
  expect(screen.getByRole("button", {
    name: "Add serving size",
  })).toBeDisabled();
});