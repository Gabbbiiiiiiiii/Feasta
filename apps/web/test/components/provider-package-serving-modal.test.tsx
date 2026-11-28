import {Dialog, DialogContent, DialogTitle} from "@/components/ui/dialog";
import {useState} from "react";
import {fireEvent, render, screen, within, waitFor} from "@testing-library/react";
import {afterEach, expect, it, vi} from "vitest";
import {ProviderPackageIndividualFood, type IndividualFoodDraftV2} from "@/app/provider/packages/provider-package-individual-food";
const option = {id:"family",name:"Family",minimumServingsText:"8",maximumServingsText:"10",priceText:"1850.25",minimumQuantityText:"1",maximumQuantityText:"3"};
function Editor({onChange = vi.fn(), options = []}: {onChange?: (value: IndividualFoodDraftV2) => void; options?: typeof option[]}) {
 const [value,setValue]=useState<IndividualFoodDraftV2>({id:"food",name:"Pancit",servingOptions:options});
 return <ProviderPackageIndividualFood value={value} onChange={(next)=>{setValue(next);onChange(next);}}/>;
}
function fill(name="Family") {
 for(const [label,value] of [["Serving name",name],["Minimum servings","8"],["Maximum servings","10"],["Price (PHP)","1850.25"],["Minimum quantity","1"],["Maximum quantity","3"]]) fireEvent.change(screen.getByLabelText(label),{target:{value}});
}
afterEach(()=>vi.unstubAllGlobals());
it("opens locally, validates and saves only on explicit save",()=>{
 const change=vi.fn();render(<Editor onChange={change}/>);
 fireEvent.click(screen.getByRole("button",{name:"Add serving size"}));
 expect(screen.getByRole("dialog",{name:"Add Serving Size"})).toBeInTheDocument();expect(change).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Save Serving Size"}));expect(screen.getByRole("alert")).toHaveTextContent("serving name");
 fill();fireEvent.click(screen.getByRole("button",{name:"Save Serving Size"}));expect(change).toHaveBeenCalledTimes(1);
 expect(change.mock.calls[0][0].servingOptions[0].priceText).toBe("1850.25");expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("retains the saved option while editing and confirms discard",async()=>{
 const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);const change=vi.fn();render(<Editor options={[option]} onChange={change}/>);
 fireEvent.click(screen.getByRole("button",{name:"Edit serving option 1"}));fireEvent.change(screen.getByLabelText("Serving name"),{target:{value:"Changed"}});
 fireEvent.click(screen.getByRole("button",{name:"Cancel"}));expect(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).toBeInTheDocument();expect(change).not.toHaveBeenCalled();
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Discard Changes"}));await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());expect(screen.getByText("Family")).toBeInTheDocument();expect(change).not.toHaveBeenCalled();
});
it("edits without replacing identity and requires remove confirmation",async()=>{
 const confirm=vi.fn(()=>true);vi.stubGlobal("confirm",confirm);const change=vi.fn();render(<Editor options={[option]} onChange={change}/>);
 fireEvent.click(screen.getByRole("button",{name:"Edit serving option 1"}));fireEvent.change(screen.getByLabelText("Price (PHP)"),{target:{value:"20.01"}});fireEvent.click(screen.getByRole("button",{name:"Save Changes"}));
 expect(change.mock.calls[0][0].servingOptions[0]).toMatchObject({id:"family",priceText:"20.01"});confirm.mockReturnValue(false);
 fireEvent.click(screen.getByRole("button",{name:"Remove serving option 1"}));expect(change).toHaveBeenCalledTimes(1);fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Remove"}));await waitFor(()=>expect(change.mock.calls[1][0].servingOptions).toEqual([]));
});
it.each([["Minimum servings","11","serving counts"],["Minimum quantity","4","quantities"],["Price (PHP)","1.001","PHP price"],["Price (PHP)","10000000","PHP price"],["Serving name"," family ","already exists"]])("rejects invalid %s %s",(label,value,message)=>{
 render(<Editor options={[option]}/>);fireEvent.click(screen.getByRole("button",{name:"Add serving size"}));fill("Party");fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.click(screen.getByRole("button",{name:"Save Serving Size"}));expect(screen.getByRole("alert")).toHaveTextContent(message);
});

it("keeps the nested editor and parent open on backdrop and inside clicks", async () => {
 render(<Dialog defaultOpen><DialogContent onInteractOutside={(event) => event.preventDefault()}><DialogTitle>Package wizard</DialogTitle><Editor /></DialogContent></Dialog>);
 const parent = screen.getByRole("dialog", {name: "Package wizard"});
 const {default: userEvent} = await import("@testing-library/user-event");
 const user = userEvent.setup();
 await user.click(screen.getByRole("button", {name: "Add serving size"}));
 fireEvent.change(screen.getByLabelText("Serving name"), {target: {value: "Unfinished"}});
 const nested = screen.getByRole("dialog", {name: "Add Serving Size"});
 const overlays = document.querySelectorAll('[data-state="open"][class*="fixed inset-0"]');
 await user.click(overlays[overlays.length - 1]);
 await user.click(screen.getByLabelText("Serving name"));
 expect(nested).toBeVisible();
 expect(screen.getByLabelText("Serving name")).toHaveValue("Unfinished");
 expect(parent).toBeInTheDocument();
 expect(screen.queryByRole("dialog", {name: "FEASTA Confirmation"})).not.toBeInTheDocument();
});
