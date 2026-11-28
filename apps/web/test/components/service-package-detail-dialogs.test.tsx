import {useState, type FormEvent} from "react";
import {fireEvent, render, screen, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import type {FreelanceServiceDetails} from "@feasta/shared-types/freelance-service-details";

import {FreelanceServiceFields} from "@/app/provider/services/freelance-service-fields";
import {Dialog, DialogContent, DialogDescription, DialogTitle} from "@/components/ui/dialog";

it("edits venue fees in a nested dialog without submitting or changing the package until saved", () => {
  const submitPackage = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
  function Editor() {
    const [value, setValue] = useState<FreelanceServiceDetails>({
      deliverables: [], collaboration: "", collaborationNotes: "", addOns: [], travelZones: [],
    });
    return <Dialog open>
      <DialogContent>
        <DialogTitle>Create event service</DialogTitle>
        <DialogDescription>Package editor</DialogDescription>
        <form onSubmit={submitPackage}><FreelanceServiceFields value={value} onChange={setValue} /></form>
      </DialogContent>
    </Dialog>;
  }
  render(<Editor />);

  fireEvent.click(screen.getByText("Travel Terms (Optional)"));
  fireEvent.click(screen.getByRole("button", {name: "Add venue fee"}));
  const add = within(screen.getByRole("dialog", {name: "Add venue fee"}));
  fireEvent.change(add.getByLabelText("Area or venue"), {target: {value: "Lake Danao"}});
  fireEvent.change(add.getByLabelText("Amount in pesos"), {target: {value: "1000"}});
  fireEvent.click(add.getByRole("button", {name: "Save"}));
  expect(screen.queryByLabelText("Area or venue")).not.toBeInTheDocument();
  expect(screen.getByText("Lake Danao")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", {name: "Edit Lake Danao"}));
  const edit = within(screen.getByRole("dialog", {name: "Edit venue fee"}));
  fireEvent.change(edit.getByLabelText("Area or venue"), {target: {value: "Changed"}});
  fireEvent.click(edit.getByRole("button", {name: "Cancel"}));
  expect(screen.getByText("Lake Danao")).toBeInTheDocument();
  expect(screen.queryByText("Changed")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", {name: "Remove Lake Danao"}));
  const remove = within(screen.getByRole("dialog", {name: "Remove venue fee"}));
  fireEvent.click(remove.getByRole("button", {name: "Remove"}));
  expect(screen.queryByText("Lake Danao")).not.toBeInTheDocument();
  expect(submitPackage).not.toHaveBeenCalled();
});

it("keeps an unsaved detail open on outside clicks and closes it with the X", async () => {
  const onChange = vi.fn();
  render(<FreelanceServiceFields value={{
    deliverables: [], collaboration: "", collaborationNotes: "", addOns: [], travelZones: [],
  }} onChange={onChange} />);
  fireEvent.click(screen.getByText("Travel Terms (Optional)"));
  fireEvent.click(screen.getByRole("button", {name: "Add venue fee"}));
  const dialog = screen.getByRole("dialog", {name: "Add venue fee"});
  fireEvent.change(within(dialog).getByLabelText("Area or venue"), {target: {value: "Lake Danao"}});
  await new Promise((resolve) => setTimeout(resolve, 0));
  fireEvent.pointerDown(document.body, {pointerType: "mouse"});
  fireEvent.keyDown(document, {key: "Escape"});
  expect(screen.getByRole("dialog", {name: "Add venue fee"})).toBeInTheDocument();
  expect(within(dialog).getByDisplayValue("Lake Danao")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", {name: "Close dialog"}));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
