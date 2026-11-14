import {useState} from "react";
import {fireEvent, render, screen, within} from "@testing-library/react";
import {expect, it} from "vitest";
import {parseFreelanceServiceDetails, readFreelanceServiceDetails, type FreelanceServiceDetails} from "@feasta/shared-types/freelance-service-details";
import {FreelanceServiceFields} from "@/app/provider/services/freelance-service-fields";

const empty: FreelanceServiceDetails = {deliverables: [], collaboration: "", collaborationNotes: "", addOns: [], travelZones: []};
function Editor({initial = empty, category = "photographer"}: {initial?: FreelanceServiceDetails; category?: string}) {
  const [value, setValue] = useState(initial);
  return <><FreelanceServiceFields category={category} value={value} onChange={setValue} /><output data-testid="value">{JSON.stringify(value)}</output></>;
}
const saved = () => JSON.parse(screen.getByTestId("value").textContent!) as FreelanceServiceDetails;
it("leaves coverage unset and restores saved hours and collaboration", () => {
  const view = render(<Editor />);
  expect(screen.getByLabelText("How many hours will you cover the event? (optional)")).toHaveValue("");
  expect(saved().coverageMinutes).toBeUndefined();
  view.unmount();
  render(<Editor initial={{...empty, coverageMinutes: 360, collaboration: "team"}} />);
  expect(screen.getByLabelText("How many hours will you cover the event? (optional)")).toHaveValue("360");
  expect(screen.getByLabelText("Who will handle the event?")).toHaveValue("team");
});
it.each(["digital_files", "gallery", "in_person"] as const)("round-trips a single deadline and %s method through the real parser", (method) => {
  render(<Editor />);
  fireEvent.click(screen.getByRole("button", {name: "Add delivery item"}));
  const dialog = within(screen.getByRole("dialog", {name: "Add photos or videos to deliver"}));
  fireEvent.change(dialog.getByLabelText("What will you give the customer?"), {target: {value: "100 edited photos"}});
  fireEvent.change(dialog.getByLabelText("How will customers receive it?"), {target: {value: method}});
  fireEvent.change(dialog.getByLabelText("When will it be ready after the event?"), {target: {value: "14"}});
  fireEvent.change(dialog.getByLabelText("Time unit"), {target: {value: "days"}});
  fireEvent.click(dialog.getByRole("button", {name: "Save"}));
  expect(readFreelanceServiceDetails(parseFreelanceServiceDetails(saved()))?.deliverables[0]).toMatchObject({min: 14, max: 14, method, unit: "days"});
  fireEvent.click(screen.getByRole("button", {name: "Edit 100 edited photos"}));
  expect(screen.getByLabelText("Give a delivery time range instead")).not.toBeChecked();
  expect(screen.getByLabelText("When will it be ready after the event?")).toHaveValue(14);
});
it("restores a range, requires an explicit collapse choice and keeps both modes' values", () => {
  const initial = {...empty, deliverables: [{id: "photos", name: "Photos", min: 7, max: 14, unit: "days" as const, method: "gallery" as const}]};
  render(<Editor initial={initial} />);
  fireEvent.click(screen.getByRole("button", {name: "Edit Photos"}));
  expect(screen.getByLabelText("Give a delivery time range instead")).toBeChecked();
  expect(screen.getByLabelText("Earliest delivery")).toHaveValue(7);
  fireEvent.click(screen.getByLabelText("Give a delivery time range instead"));
  expect(screen.getByLabelText("Earliest delivery")).toHaveValue(7);
  fireEvent.click(screen.getByRole("button", {name: "Use latest time as deadline"}));
  fireEvent.change(screen.getByLabelText("When will it be ready after the event?"), {target: {value: "12"}});
  fireEvent.click(screen.getByLabelText("Give a delivery time range instead"));
  expect(screen.getByLabelText("Earliest delivery")).toHaveValue(7);
  expect(screen.getByLabelText("Latest delivery")).toHaveValue(14);
  fireEvent.click(screen.getByLabelText("Give a delivery time range instead"));
  fireEvent.click(screen.getByRole("button", {name: "Use previous deadline (12 days)"}));
  expect(screen.getByLabelText("When will it be ready after the event?")).toHaveValue(12);
  fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
  expect(saved()).toEqual(initial);
});
it("uses a scalar-method fallback and generic delivery labels for other categories", () => {
  render(<Editor category="makeup_artist" />);
  expect(screen.getByText("Service Delivery")).toBeInTheDocument();
  expect(screen.queryByText("Photo & Video Delivery")).not.toBeInTheDocument();
  expect(screen.getByText("Providing both online and physical copies? Add a delivery item for each.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Add delivery item"}));
  expect(screen.getByLabelText("How will customers receive it?")).not.toHaveAttribute("multiple");
  expect(screen.getByLabelText("Item name")).toBeInTheDocument();
});
it("associates coverage and delivery errors with their fields", () => {
  render(<Editor initial={{...empty, coverageMinutes: -1}} />);
  expect(screen.getByLabelText("Custom coverage (hours)")).toHaveAttribute("aria-invalid", "true");
  fireEvent.click(screen.getByRole("button", {name: "Add delivery item"}));
  const input = screen.getByLabelText("When will it be ready after the event?");
  fireEvent.invalid(input);
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("Enter when this item will be ready.");
});
it.each([-1, 0, 1.5, 366])("rejects invalid day deadlines %s with the unchanged parser", (deadline) => {
  expect(() => parseFreelanceServiceDetails({...empty, deliverables: [{id: "x", name: "Photos", min: deadline, max: deadline, unit: "days", method: "digital_files"}]})).toThrow();
});
