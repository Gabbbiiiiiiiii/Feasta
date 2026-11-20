import userEvent from "@testing-library/user-event";
import {useState} from "react";
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {supportsServicePackageDetails, type FreelanceServiceDetails} from "@feasta/shared-types/freelance-service-details";
import {FreelanceServiceFields} from "@/app/provider/services/freelance-service-fields";
import {FreelanceServiceSummary} from "@/components/shared/freelance-service-summary";

const empty: FreelanceServiceDetails = {deliverables: [], collaboration: "", collaborationNotes: "", addOns: [], travelZones: []};
function Editor({category = "photographer", initial = empty}: {category?: string; initial?: FreelanceServiceDetails}) {
  const [value, setValue] = useState(initial);
  return <><FreelanceServiceFields category={category} value={value} onChange={setValue} /><output data-testid="saved">{JSON.stringify(value)}</output></>;
}
const saved = () => JSON.parse(screen.getByTestId("saved").textContent!) as FreelanceServiceDetails;

it.each([
  ["photographer", ["Edited Photos", "Printed Photos", "Photo Album", "Original Photos"], "Highlight Video"],
  ["videographer", ["Highlight Video", "Full-Event Video", "Same-Day Edit", "Original Video Footage"], "Edited Photos"],
] as const)("offers only user-triggered %s suggestions without delivery promises", (category, labels, absent) => {
  render(<Editor category={category} />);
  expect(saved()).toEqual(empty);
  expect(screen.queryByRole("button", {name: "Add " + absent})).not.toBeInTheDocument();
  for (const label of labels) {
    fireEvent.click(screen.getByRole("button", {name: "Add " + label}));
    fireEvent.click(screen.getByRole("button", {name: "Add " + label}));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Cancel"}));
  }
  expect(saved().inclusions?.map((row) => row.label)).toEqual(labels);
  expect(saved().deliverables).toEqual([]);
  expect(saved().addOns).toEqual([]);
});

it("allows browsing both suggestion groups and preserves added items when suggestions or categories change", () => {
  const view = render(<Editor />);
  fireEvent.click(screen.getByRole("radio", {name: "Videography"}));
  fireEvent.click(screen.getByRole("button", {name: "Add Highlight Video"}));
  fireEvent.click(screen.getByRole("radio", {name: "Photography"}));
  fireEvent.click(screen.getByRole("button", {name: "Add Edited Photos"}));
  expect(screen.getByRole("button", {name: "Add Edited Photos"})).toHaveAttribute("aria-pressed", "true");
  const before = saved();
  fireEvent.click(screen.getByRole("radio", {name: "Videography"}));
  expect(saved()).toEqual(before);
  expect(screen.getByText(/does not list your service in both categories/)).toBeInTheDocument();
  view.rerender(<Editor category="makeup_artist" />);
  expect(screen.queryByRole("radiogroup", {name: "Inclusion suggestions"})).not.toBeInTheDocument();
  expect(saved()).toEqual(before);
  view.rerender(<Editor category="videographer" />);
  expect(screen.getByRole("button", {name: "Add Highlight Video"})).toHaveAttribute("aria-pressed", "true");
  expect(saved()).toEqual(before);
});

it("deduplicates existing inclusions and delivery names without changing saved terms", () => {
  const initial: FreelanceServiceDetails = {...empty,
    inclusions: [{id: "album", kind: "keepsake", label: "  PHOTO   ALBUM "}],
    deliverables: [{id: "photos", name: "edited PHOTOS", min: 2, max: 4, unit: "weeks", method: "gallery"}],
    addOns: [{id: "extra", name: "Drone", priceCentavos: 250000, unit: "booking"}],
    coverageMinutes: 360, crewSize: 2, collaboration: "named_lead", collaborationNotes: "Maria leads",
    clientRequirements: "Timeline", planning: {consultationIncluded: true, customShotListIncluded: true},
    travelZones: [{id: "travel", name: "Venue", mode: "fixed_fee", feeCentavos: 10000}],
    distanceSurcharge: {from: "City hall", afterKm: 20, feeCentavos: 50000},
  };
  render(<Editor initial={initial} />);
  expect(screen.getByRole("button", {name: "Add Edited Photos"})).toBeDisabled();
  expect(screen.getByRole("button", {name: "Add Photo Album"})).toBeEnabled();
  for (const title of ["Planning with the customer (optional)", "Travel Terms (Optional)", "Additional Services (Optional)"]) {
    fireEvent.click(screen.getByText(title)); fireEvent.click(screen.getByText(title));
  }
  expect(saved()).toEqual(initial);
  fireEvent.click(screen.getByRole("button", {name: "Add Printed Photos"}));
  expect(saved()).toEqual({...initial, inclusions: [...initial.inclusions!, expect.objectContaining({label: "Printed Photos", kind: "keepsake"})]});
});

it("edits, reopens and removes a suggestion using existing row dialogs", () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole("button", {name: "Add Edited Photos"}));
  fireEvent.click(screen.getByRole("button", {name: "Edit Edited Photos"}));
  fireEvent.change(screen.getByLabelText("Included item"), {target: {value: "Selected edited photos"}});
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Save"}));
  fireEvent.click(screen.getByRole("button", {name: "Edit Selected edited photos"}));
  expect(screen.getByLabelText("Included item")).toHaveValue("Selected edited photos");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Cancel"}));
  const value = saved();
  const view = render(<FreelanceServiceFields category="photographer" value={value} onChange={vi.fn()} />);
  expect(screen.getAllByText("Selected edited photos")).toHaveLength(2);
  view.unmount();
  fireEvent.click(screen.getByRole("button", {name: "Remove Selected edited photos"}));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Remove"}));
  expect(saved().inclusions).toEqual([]);
});

it("keeps optional sections collapsed and opens required lead details", () => {
  const view = render(<Editor />);
  for (const title of ["Planning with the customer (optional)", "Travel Terms (Optional)", "Additional Services (Optional)"]) {
    expect(screen.getByText(title).closest("details")).not.toHaveAttribute("open");
  }
  fireEvent.change(screen.getByLabelText("Who will handle the event?"), {target: {value: "named_lead"}});
  expect(screen.getByText("Planning with the customer (optional)").closest("details")).toHaveAttribute("open");
  expect(screen.getByLabelText("Main photographer/videographer or special arrangements")).toBeRequired();
  view.rerender(<Editor category="catering_service" />);
  expect(screen.queryByRole("button", {name: "Add Edited Photos"})).not.toBeInTheDocument();
});

it("retains category eligibility and clearly quotes extras separately in the preview", () => {
  expect(supportsServicePackageDetails(undefined, "photographer")).toBe(true);
  expect(supportsServicePackageDetails(undefined, "videographer")).toBe(true);
  expect(supportsServicePackageDetails(undefined, "catering_service")).toBe(false);
  expect(supportsServicePackageDetails("individual", "makeup_artist")).toBe(true);
  render(<FreelanceServiceSummary details={{...empty, addOns: [{id: "extra", name: "Extra hour", priceCentavos: 10000, unit: "hour"}]}} />);
  expect(screen.getByText("Optional extras by separate quote")).toBeInTheDocument();
  expect(screen.getByText(/Extra hour/)).toHaveTextContent("100.00 per hour");
  expect(screen.queryByText(/When & how/)).not.toBeInTheDocument();
});

it("preserves a venue amount when its conditional amount field is hidden and shown", () => {
  render(<Editor initial={{...empty, travelZones: [{id: "venue", name: "Lake Danao", mode: "fixed_fee", feeCentavos: 120000}]}} />);
  fireEvent.click(screen.getByText("Travel Terms (Optional)"));
  fireEvent.click(screen.getByRole("button", {name: "Edit Lake Danao"}));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("Travel fee"), {target: {value: "included"}});
  expect(dialog.queryByLabelText("Amount in pesos")).not.toBeInTheDocument();
  fireEvent.change(dialog.getByLabelText("Travel fee"), {target: {value: "fixed_fee"}});
  expect(dialog.getByLabelText("Amount in pesos")).toHaveValue(1200);
  fireEvent.click(dialog.getByRole("button", {name: "Save"}));
  expect(saved().travelZones[0].feeCentavos).toBe(120000);
});

it("respects the existing ten-row limit without replacing any information", () => {
  const initial = {...empty, inclusions: Array.from({length: 10}, (_, index) => ({id: String(index), kind: "other" as const, label: "Item " + index}))};
  render(<Editor initial={initial} />);
  expect(screen.getByRole("button", {name: "Add Edited Photos"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button", {name: "Add Edited Photos"}));
  expect(saved()).toEqual(initial);
});

it("supports keyboard suggestion browsing without changing form data", async () => {
  const user = userEvent.setup();
  render(<Editor initial={{...empty, crewSize: 3}} />);
  const photo = screen.getByRole("radio", {name: "Photography"});
  photo.focus();
  expect(photo).toHaveFocus();
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", {name: "Videography"})).toBeChecked();
  expect(screen.getByRole("radio", {name: "Videography"})).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", {name: "Add Highlight Video"})).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", {name: "Add Highlight Video"})).toHaveAttribute("aria-pressed", "true");
  expect(saved().crewSize).toBe(3);
  expect(saved().inclusions).toHaveLength(1);
  expect(screen.getByRole("radiogroup", {name: "Inclusion suggestions"})).toHaveClass("max-w-full", "flex-wrap");
  expect(screen.getByRole("button", {name: "Add Highlight Video"})).toHaveClass("rounded-full", "max-w-full");
});


it("adds custom inclusions with inline validation, keyboard entry and safe removal", async () => {
  const user = userEvent.setup();
  render(<form onSubmit={(event) => {event.preventDefault(); throw new Error("Must not submit parent");}}><Editor /></form>);
  const input = screen.getByRole("textbox", {name: "Custom included item"});
  const add = screen.getByRole("button", {name: /^Add$/});
  expect(screen.queryByRole("button", {name: "Add included item"})).not.toBeInTheDocument();
  expect(input).toHaveAttribute("placeholder", "e.g. Behind-the-scenes photos");
  expect(add).toHaveClass("h-12");
  expect(add).toBeDisabled();
  fireEvent.change(input, {target: {value: "   "}});
  expect(add).toBeDisabled();
  fireEvent.change(input, {target: {value: "x".repeat(121)}});
  fireEvent.click(add);
  expect(input).toHaveAccessibleDescription("Enter an included item with 1 to 120 characters.");
  expect(saved().inclusions).toBeUndefined();
  fireEvent.change(input, {target: {value: "Behind-the-scenes photos"}});
  expect(add).toBeEnabled();
  fireEvent.click(add);
  expect(input).toHaveValue("");
  expect(input).toHaveFocus();
  expect(add).toBeDisabled();
  expect(screen.getByText("Included in your service (1)")).toBeInTheDocument();
  fireEvent.change(input, {target: {value: "  BEHIND-THE-SCENES   PHOTOS "}});
  await user.keyboard("{Enter}");
  expect(screen.getByRole("alert")).toHaveTextContent("already included");
  expect(saved().inclusions).toHaveLength(1);
  fireEvent.change(input, {target: {value: "Edited Photos"}});
  await user.keyboard("{Enter}");
  expect(saved().inclusions).toHaveLength(2);
  fireEvent.click(screen.getByRole("radio", {name: "Videography"}));
  expect(screen.getByText("Included in your service (2)")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", {name: "Photography"}));
  const chip = screen.getByRole("button", {name: "Add Edited Photos"});
  fireEvent.click(chip);
  expect(saved().inclusions).toHaveLength(2);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Cancel"}));
  await waitFor(() => expect(chip).toHaveFocus());
  fireEvent.click(chip);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Remove"}));
  expect(saved().inclusions).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", {name: "Remove Behind-the-scenes photos"}));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Remove"}));
  expect(saved().inclusions).toHaveLength(0);
  await waitFor(() => expect(input).toHaveFocus());
});
