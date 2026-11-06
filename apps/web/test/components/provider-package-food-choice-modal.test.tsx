import {Dialog, DialogContent, DialogTitle} from "@/components/ui/dialog";
import {useState} from "react";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, expect, it, vi} from "vitest";
import type {FoodChoiceGroupV2} from "@feasta/shared-types/provider-package-v2";
import {ProviderPackageFoodChoices} from "@/app/provider/packages/provider-package-food-choices";
import {parseFoodChoiceGroupsV2} from "@/lib/provider/food-choice-groups-v2";
const group = {id:"main",title:"Main dish",selectionCount:1,options:[{id:"a",name:"Chicken"},{id:"b",name:"Fish"}]};
function Editor({initial = [], change = vi.fn()}: {initial?: FoodChoiceGroupV2[]; change?: (groups: FoodChoiceGroupV2[]) => void}) {
 const [value,setValue] = useState(initial);
 return <ProviderPackageFoodChoices value={value} onChange={(next)=>{setValue(next);change(next);}}/>;
}
const click=(name:string)=>fireEvent.click(screen.getByRole("button",{name}));
const fill=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
function complete() {fill("Group Name","Main dish");fill("Food option 1","Chicken");fill("Food option 2","Fish");}
afterEach(()=>vi.unstubAllGlobals());
it("saves four distinct dishes with exactly two selections under the V2 contract",()=>{
 const change=vi.fn();render(<Editor change={change}/>);click("Add choice group");
 expect(screen.queryByRole("alert")).not.toBeInTheDocument();
 fill("Group Name","Main Dish");
 const dishes=["Chicken Adobo","Buttered Chicken","Pork Menudo","Shanghai Rolls"];
 dishes.forEach((dish,index)=>{if(index>=2) click("Add dish option");fill(`Food option ${index+1}`,dish);});
 fill("Minimum Selections","2");fill("Maximum Selections","2");click("Save choice group");
 expect(change).toHaveBeenCalledTimes(1);
 const saved=change.mock.calls[0][0];
 expect(parseFoodChoiceGroupsV2(saved)).toEqual(saved);
 expect(saved[0]).toMatchObject({title:"Main Dish",selectionCount:2,options:dishes.map(name=>({name}))});
 expect(Object.keys(saved[0]).sort()).toEqual(["id","options","selectionCount","title"]);
 expect(screen.queryByRole("alert")).not.toBeInTheDocument();
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("clears obsolete errors on correction and retains V2 name constraints",()=>{
 const change=vi.fn();render(<Editor change={change}/>);click("Add choice group");complete();
 fill("Food option 2","Fish\u200B");click("Save choice group");
 expect(screen.getByRole("alert")).toHaveTextContent("Use 2 to 10 food options per group");
 expect(change).not.toHaveBeenCalled();
 fill("Food option 2","Fish");expect(screen.queryByRole("alert")).not.toBeInTheDocument();
 expect(screen.getByLabelText("Group Name")).toHaveValue("Main dish");
 click("Save choice group");expect(change).toHaveBeenCalledTimes(1);
});
it("creates only on Save and adds/removes local options",()=>{
 const change=vi.fn();render(<Editor change={change}/>);click("Add choice group");
 expect(screen.getByRole("dialog",{name:"Add Food Choice Group"})).toBeInTheDocument();expect(change).not.toHaveBeenCalled();
 complete();click("Add dish option");fill("Food option 3","Beef");click("Remove food option 2");click("Save choice group");
 expect(change).toHaveBeenCalledTimes(1);expect(change.mock.calls[0][0][0]).toMatchObject({title:"Main dish",selectionCount:1,options:[{name:"Chicken"},{name:"Beef"}]});expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("prefills, edits stable IDs, and removes compact cards",()=>{
 const change=vi.fn();render(<Editor initial={[group]} change={change}/>);expect(screen.queryByRole("textbox")).not.toBeInTheDocument();click("Edit choice group 1");expect(screen.getByLabelText("Group Name")).toHaveValue("Main dish");fill("Food option 2","Beef");click("Save choice group");
 expect(change.mock.calls[0][0][0]).toEqual({...group,options:[group.options[0],{id:"b",name:"Beef"}]});click("Remove choice group 1");expect(change.mock.calls[1][0]).toEqual([]);
});
it.each([["Group Name","","Enter a group name"],["Maximum Selections","2","must match"],["Food option 2"," chicken ","unique"]])("validates %s",(label,value,message)=>{
 const change=vi.fn();render(<Editor change={change}/>);click("Add choice group");complete();fill(label,value);click("Save choice group");expect(screen.getByRole("alert")).toHaveTextContent(message);expect(change).not.toHaveBeenCalled();
});
it("rejects duplicate group names and enforces option limits",()=>{
 render(<Editor initial={[group]}/>);click("Add choice group");complete();click("Save choice group");expect(screen.getByRole("alert")).toHaveTextContent("already exists");
 for(let i=0;i<8;i++) click("Add dish option");expect(screen.getByRole("button",{name:"Add dish option"})).toBeDisabled();
});
it.each(["Cancel","Close dialog","Escape"])("confirms dirty cancellation through %s and restores focus",async(action)=>{
 const confirm=vi.fn(()=>false);vi.stubGlobal("confirm",confirm);const change=vi.fn();const user=userEvent.setup();render(<Editor change={change}/>);
 const trigger=screen.getByRole("button",{name:"Add choice group"});await user.click(trigger);expect(screen.getByLabelText("Group Name")).toHaveFocus();complete();
 if(action==="Escape") await user.keyboard("{Escape}");else click(action);
 expect(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).toBeInTheDocument();click("Cancel");expect(screen.getByLabelText("Food option 1")).toHaveValue("Chicken");
 if(action==="Escape") await user.keyboard("{Escape}");else click(action);
 click("Discard Changes");await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());expect(change).not.toHaveBeenCalled();await waitFor(()=>expect(trigger).toHaveFocus());
});
it("cancels cleanly without prompting and traps keyboard focus",async()=>{
 const confirm=vi.fn();vi.stubGlobal("confirm",confirm);const user=userEvent.setup();render(<Editor/>);await user.click(screen.getByRole("button",{name:"Add choice group"}));
 await user.tab({shift:true});expect(screen.getByRole("button",{name:"Close dialog"})).toHaveFocus();await user.tab();expect(screen.getByLabelText("Group Name")).toHaveFocus();click("Cancel");expect(confirm).not.toHaveBeenCalled();
});
it("enforces total and group V2 limits",()=>{
 const groups=Array.from({length:5},(_,i)=>({...group,id:`g${i}`,title:`Group ${i}`,options:Array.from({length:10},(_,j)=>({id:`o${j}`,name:`Option ${j}`}))}));
 render(<Editor initial={groups}/>);expect(screen.getByRole("button",{name:"Add choice group"})).toBeDisabled();click("Edit choice group 1");expect(screen.getByRole("button",{name:"Add dish option"})).toBeDisabled();
});

it.each(["Minimum Selections", "Maximum Selections"])("rejects invalid changes and pastes in %s without changing accepted values", (label)=>{
 const change=vi.fn();render(<Editor initial={[{...group,options:[...group.options,{id:"c",name:"Beef"},{id:"d",name:"Pork"}]}]} change={change}/>);click("Edit choice group 1");
 const input=screen.getByLabelText(label) as HTMLInputElement;
 for(const value of ["200000000000000000000","0","-1","1.5","2e3","5","+1","abc","01"]) {
  fireEvent.change(input,{target:{value}});expect(input).toHaveValue("1");expect(input).toHaveAttribute("aria-invalid","true");
  click("Save choice group");expect(change).not.toHaveBeenCalled();
  input.setSelectionRange(0,1);fireEvent.paste(input,{clipboardData:{getData:()=>value}});expect(input).toHaveValue("1");
 }
 fireEvent.change(input,{target:{value:"2"}});expect(input).toHaveValue("2");
 expect(screen.getByRole("button",{name:"Save choice group"})).toBeDisabled();
 fill(label === "Minimum Selections" ? "Maximum Selections" : "Minimum Selections","2");
 click("Save choice group");expect(change.mock.calls[0][0][0].selectionCount).toBe(2);
});
it("revalidates immediately when options shrink and preserves unrelated groups",()=>{
 const four={...group,selectionCount:4,options:[...group.options,{id:"c",name:"Beef"},{id:"d",name:"Pork"}]};
 const other={...group,id:"other",title:"Dessert"};const change=vi.fn();
 render(<Editor initial={[four,other]} change={change}/>);click("Edit choice group 1");click("Remove food option 4");
 expect(screen.getByLabelText("Minimum Selections")).toHaveValue("4");
 expect(screen.getByRole("button",{name:"Save choice group"})).toBeDisabled();expect(change).not.toHaveBeenCalled();
 fill("Minimum Selections","3");fill("Maximum Selections","2");expect(screen.getByText(/no greater than/)).toBeInTheDocument();
 fill("Minimum Selections","");expect(screen.getByLabelText("Minimum Selections")).toHaveValue("");expect(screen.getByRole("button",{name:"Save choice group"})).toBeDisabled();
 fill("Minimum Selections","2");click("Save choice group");expect(change.mock.calls[0][0][1]).toEqual(other);
 expect(change.mock.calls[0][0][0]).toEqual({...four,selectionCount:2,options:four.options.slice(0,3)});
});
it("supports keyboard clearing, replacement, and whole-value paste",async()=>{
 const user=userEvent.setup();render(<Editor initial={[group]}/>);click("Edit choice group 1");const input=screen.getByLabelText("Minimum Selections");
 await user.click(input);await user.keyboard("{Backspace}");expect(input).toHaveValue("");
 await user.type(input,"2");await user.keyboard("{Control>}a{/Control}");await user.paste("1");expect(input).toHaveValue("1");
 await user.clear(input);await user.paste("200000000000000000000");expect(input).toHaveValue("");
 await user.paste("2");expect(input).toHaveValue("2");
});

it.each([1,2,3,4])("accepts exactly %s selections for four food options",(count)=>{
 const four={...group,options:[...group.options,{id:"c",name:"Beef"},{id:"d",name:"Pork"}]};const change=vi.fn();
 render(<Editor initial={[four]} change={change}/>);click("Edit choice group 1");
 fill("Minimum Selections",String(count));fill("Maximum Selections",String(count));click("Save choice group");
 expect(change.mock.calls[0][0][0]).toEqual({...four,selectionCount:count});
});

it("keeps the nested editor and parent open on backdrop and inside clicks", async () => {
 render(<Dialog defaultOpen><DialogContent onInteractOutside={(event) => event.preventDefault()}><DialogTitle>Package wizard</DialogTitle><Editor /></DialogContent></Dialog>);
 const parent = screen.getByRole("dialog", {name: "Package wizard"});
 const {default: userEvent} = await import("@testing-library/user-event");
 const user = userEvent.setup();
 await user.click(screen.getByRole("button", {name: "Add choice group"}));
 fireEvent.change(screen.getByLabelText("Group Name"), {target: {value: "Unfinished"}});
 const nested = screen.getByRole("dialog", {name: "Add Food Choice Group"});
 const overlays = document.querySelectorAll('[data-state="open"][class*="fixed inset-0"]');
 await user.click(overlays[overlays.length - 1]);
 await user.click(screen.getByLabelText("Group Name"));
 expect(nested).toBeVisible();
 expect(screen.getByLabelText("Group Name")).toHaveValue("Unfinished");
 expect(parent).toBeInTheDocument();
 expect(screen.queryByRole("dialog", {name: "FEASTA Confirmation"})).not.toBeInTheDocument();
});
