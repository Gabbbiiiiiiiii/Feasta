import {useEffect, useState} from "react";
import {fireEvent, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect, it} from "vitest";
import {parseFreelanceServiceDetails, type FreelanceServiceDetails} from "@feasta/shared-types/freelance-service-details";
import {FreelanceServiceFields} from "@/app/provider/services/freelance-service-fields";

const empty: FreelanceServiceDetails = {deliverables: [], collaboration: "", collaborationNotes: "", addOns: [], travelZones: []};
const selector = () => screen.getByLabelText("How many hours will you cover the event? (optional)");
const input = () => screen.getByLabelText("Custom coverage (hours)") as HTMLInputElement;
const custom = () => fireEvent.change(selector(), {target: {value: "custom"}});
let current: FreelanceServiceDetails;
function Editor({category = "photographer", minutes}: {category?: string; minutes?: number}) {
  const [value, setValue] = useState<FreelanceServiceDetails>({...empty, coverageMinutes: minutes});
  useEffect(() => {current = value;}, [value]);
  return <form><FreelanceServiceFields category={category} value={value} onChange={setValue} /></form>;
}
it.each(["photographer", "videographer"])("validates optional coverage for %s", (category) => {
  render(<Editor category={category} />);
  custom();
  expect(input()).toHaveValue("");
  expect(current.coverageMinutes).toBeUndefined();
  for (const [hours, minutes] of [["1", 60], ["1.5", 90], ["2", 120], ["2.5", 150], ["0.05", 3], ["1.15", 69], ["24", 1440]] as const) {
    fireEvent.change(input(), {target: {value: hours}});
    expect(current.coverageMinutes).toBe(minutes);
    expect(input()).not.toHaveAttribute("aria-invalid");
    expect(input().checkValidity()).toBe(true);
  }
});
it.each(["0", "0.001", "1.0000000000000001", "."])("rejects %s and clears errors on correction or empty", (text) => {
  render(<Editor />);
  custom();
  fireEvent.change(input(), {target: {value: text}});
  expect(input()).toHaveAttribute("aria-invalid", "true");
  expect(input()).toHaveAccessibleDescription("Enter coverage between 1 minute and 24 hours, in whole minutes.");
  expect(input().checkValidity()).toBe(false);
  expect(() => parseFreelanceServiceDetails(current)).toThrow();
  fireEvent.change(input(), {target: {value: "1.5"}});
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(input()).not.toHaveAttribute("aria-describedby");
  fireEvent.change(input(), {target: {value: text}});
  fireEvent.change(input(), {target: {value: ""}});
  expect(current.coverageMinutes).toBeUndefined();
  expect(input().checkValidity()).toBe(true);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("supports decimal typing, Backspace, selection, and valid paste; blocks oversized paste atomically", async () => {
  const user = userEvent.setup();
  render(<Editor />);
  custom();
  await user.type(input(), "1.");
  expect(input()).toHaveValue("1.");
  await user.type(input(), "5");
  expect(current.coverageMinutes).toBe(90);
  await user.keyboard("{Backspace}");
  expect(input()).toHaveValue("1.");
  await user.clear(input());
  await user.paste("2.5");
  expect(current.coverageMinutes).toBe(150);
  input().select();
  await user.paste("9".repeat(1000));
  expect(input()).toHaveValue("2.5");
  expect(current.coverageMinutes).toBe(150);
  await user.paste("0.05");
  expect(input()).toHaveValue("0.05");
  expect(current.coverageMinutes).toBe(3);
  fireEvent.change(input(), {target: {value: "9".repeat(1000)}});
  expect(input()).toHaveValue("0.05");
});
it("saves and reopens every supported minute without rounding", () => {
  const view = render(<Editor />);
  custom();
  const coverage = input();
  for (let minutes = 1; minutes <= 1440; minutes++) {
    fireEvent.change(coverage, {target: {value: String(minutes / 60)}});
    const saved = parseFreelanceServiceDetails(current);
    expect(saved!.coverageMinutes).toBe(minutes);
  }
  fireEvent.change(input(), {target: {value: "1.15"}});
  const saved = parseFreelanceServiceDetails(current);
  view.unmount();
  render(<Editor minutes={saved!.coverageMinutes} />);
  expect(input()).toHaveValue("1.15");
  expect(current.coverageMinutes).toBe(69);
}, 60000);

it.each([1, 7, 61, 1439, 1440])("reopens saved %s minutes and preserves it during other edits", (minutes) => {
  const view = render(<Editor />);
  custom();
  fireEvent.change(input(), {target: {value: String(minutes / 60)}});
  const saved = parseFreelanceServiceDetails(current)!;
  view.unmount();
  render(<Editor minutes={saved.coverageMinutes} />);
  expect(input()).toHaveValue(String(minutes / 60));
  fireEvent.change(screen.getByLabelText("How many people will work? (optional)"), {target: {value: "2"}});
  expect(parseFreelanceServiceDetails(current)?.coverageMinutes).toBe(minutes);
  expect(input().checkValidity()).toBe(true);
});

it.each(["photographer", "videographer"])("selects, clears, saves, edits and reopens coverage for %s", async (category) => {
  const user = userEvent.setup();
  const view = render(<Editor category={category} />);
  for (const hours of [2, 4, 6, 8]) {
    await user.selectOptions(selector(), String(hours * 60));
    expect(current.coverageMinutes).toBe(hours * 60);
    expect(screen.getByRole("status")).toHaveTextContent(`Selected coverage: ${hours} hours`);
    expect(screen.queryByLabelText("Custom coverage (hours)")).toBeNull();
  }
  const saved = JSON.parse(JSON.stringify(parseFreelanceServiceDetails(current))) as FreelanceServiceDetails;
  view.unmount();
  const reopened = render(<Editor category={category} minutes={saved.coverageMinutes} />);
  expect(selector()).toHaveValue("480");
  custom();
  await user.type(input(), "2.5");
  const edited = JSON.parse(JSON.stringify(parseFreelanceServiceDetails(current))) as FreelanceServiceDetails;
  reopened.unmount();
  render(<Editor category={category} minutes={edited.coverageMinutes} />);
  expect(selector()).toHaveValue("custom");
  expect(input()).toHaveValue("2.5");
  await user.clear(input());
  expect(current.coverageMinutes).toBeUndefined();
  await user.selectOptions(selector(), "120");
  await user.selectOptions(selector(), "");
  expect(current.coverageMinutes).toBeUndefined();
  expect(screen.getByRole("status")).toHaveTextContent("No coverage duration selected.");
});
it("prevents invalid typing, replacement and paste without changing the duration", async () => {
  const user = userEvent.setup();
  render(<Editor />);
  custom();
  await user.type(input(), "wwwwww-+e");
  expect(input()).toHaveValue("");
  await user.type(input(), "2.5");
  for (const invalid of ["abc", "-1", "25", "1e1", "1.2.3", "9".repeat(1000)]) {
    input().select();
    await user.paste(invalid);
    expect(input()).toHaveValue("2.5");
    fireEvent.change(input(), {target: {value: invalid}});
    expect(input()).toHaveValue("2.5");
    expect(current.coverageMinutes).toBe(150);
  }
});
