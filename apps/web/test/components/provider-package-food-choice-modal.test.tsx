import {Dialog, DialogContent, DialogTitle} from "@/components/ui/dialog";
import {useState} from "react";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect, it, vi} from "vitest";
import type {FoodChoiceGroupV2} from "@feasta/shared-types/provider-package-v2";
import {ProviderPackageFoodChoices} from "@/app/provider/packages/provider-package-food-choices";
import {parseFoodChoiceGroupsV2} from "@/lib/provider/food-choice-groups-v2";
vi.mock("@/app/provider/packages/provider-dish-library",()=>({ProviderDishLibrary:({onAdd,disabled}:{onAdd:(rows:unknown[])=>void;disabled?:boolean})=><button disabled={disabled} onClick={()=>onAdd(["Chicken","Fish","Beef","Pork"].map((name,i)=>({id:String(i),name,category:"Meat"})))}>Choose from Dish List</button>}));
const group={id:"main",title:"Main dish",selectionCount:1,options:[{id:"a",name:"Chicken"},{id:"b",name:"Fish"}]};
function Editor({initial=[],change=vi.fn(),disabled=false}:{initial?:FoodChoiceGroupV2[];change?:(groups:FoodChoiceGroupV2[])=>void;disabled?:boolean}){const [value,setValue]=useState(initial);return <ProviderPackageFoodChoices value={value} disabled={disabled} onChange={next=>{setValue(next);change(next);}}/>;}
const click=(name:string)=>fireEvent.click(screen.getByRole("button",{name}));
const fill=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});
it("adds saved dishes without writing until the group is saved",()=>{
 const change=vi.fn();render(<Editor change={change}/>);click("Add choice group");fill("Group Name","Main dish");click("Choose from Dish List");
 expect(change).not.toHaveBeenCalled();fill("Minimum Selections","2");fill("Maximum Selections","2");click("Save choice group");
 const saved=change.mock.calls[0][0];expect(parseFoodChoiceGroupsV2(saved)).toEqual(saved);expect(saved[0].options.map((r:{name:string})=>r.name)).toEqual(["Chicken","Fish","Beef","Pork"]);expect(saved[0].selectionCount).toBe(2);
});
it("deduplicates saved dish names and preserves stable IDs",()=>{
 const change=vi.fn();render(<Editor initial={[group]} change={change}/>);click("Edit choice group 1");click("Choose from Dish List");click("Choose from Dish List");click("Save choice group");
 expect(change.mock.calls[0][0][0].options).toHaveLength(4);expect(change.mock.calls[0][0][0].options.slice(0,2)).toEqual(group.options);
});
it("rejects a duplicate group name",()=>{render(<Editor initial={[group]}/>);click("Add choice group");fill("Group Name"," main DISH ");click("Choose from Dish List");click("Save choice group");expect(screen.getByRole("alert")).toHaveTextContent("already exists");});
it.each(["", "Bad\u200B"])("retains name validation for %s",name=>{
 const change=vi.fn();const invalid={...group,options:[group.options[0],{id:"b",name}]};render(<Editor initial={[invalid]} change={change}/>);click("Edit choice group 1");click("Save choice group");expect(screen.getByRole("alert")).toBeVisible();expect(change).not.toHaveBeenCalled();
});
it("removes local dishes and preserves unrelated groups",()=>{
 const four={...group,selectionCount:4,options:[...group.options,{id:"c",name:"Beef"},{id:"d",name:"Pork"}]};const other={...group,id:"other",title:"Dessert"};const change=vi.fn();render(<Editor initial={[four,other]} change={change}/>);click("Edit choice group 1");click("Remove food option 4");click("Save choice group");expect(screen.getByRole("alert")).toHaveTextContent("Add at least 4");expect(change).not.toHaveBeenCalled();fill("Minimum Selections","2");fill("Maximum Selections","2");click("Save choice group");expect(change.mock.calls[0][0]).toEqual([{...four,selectionCount:2,options:four.options.slice(0,3)},other]);
});
it.each(["Minimum Selections","Maximum Selections"])("rejects invalid whole numbers in %s",label=>{
 const change=vi.fn();render(<Editor initial={[group]} change={change}/>);click("Edit choice group 1");const input=screen.getByLabelText(label) as HTMLInputElement;
 for(const value of ["200000000000000000000","0","-1","1.5","2e3","11","+1","abc","01"]){fireEvent.change(input,{target:{value}});expect(input).toHaveValue("1");expect(input).toHaveAttribute("aria-invalid","true");input.setSelectionRange(0,1);fireEvent.paste(input,{clipboardData:{getData:()=>value}});expect(input).toHaveValue("1");}
 fill(label,"2");expect(screen.getByRole("button",{name:"Save choice group"})).toBeDisabled();fill(label==="Minimum Selections"?"Maximum Selections":"Minimum Selections","2");click("Save choice group");expect(change.mock.calls[0][0][0].selectionCount).toBe(2);
});
it.each([1,2,3,4])("accepts exactly %s selections from four dishes",count=>{const four={...group,options:[...group.options,{id:"c",name:"Beef"},{id:"d",name:"Pork"}]};const change=vi.fn();render(<Editor initial={[four]} change={change}/>);click("Edit choice group 1");fill("Minimum Selections",String(count));fill("Maximum Selections",String(count));click("Save choice group");expect(change.mock.calls[0][0][0]).toEqual({...four,selectionCount:count});});
it.each(["Cancel","Close dialog","Escape"])("confirms dirty cancellation through %s and restores focus",async action=>{
 const user=userEvent.setup();const change=vi.fn();render(<Editor change={change}/>);const trigger=screen.getByRole("button",{name:"Add choice group"});await user.click(trigger);fill("Group Name","Unsaved");
 if(action==="Escape")await user.keyboard("{Escape}");else click(action);expect(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).toBeInTheDocument();click("Cancel");expect(screen.getByLabelText("Group Name")).toHaveValue("Unsaved");
 if(action==="Escape")await user.keyboard("{Escape}");else click(action);click("Discard Changes");await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());expect(change).not.toHaveBeenCalled();await waitFor(()=>expect(trigger).toHaveFocus());
});
it("keeps the ten-group bound and disabled state",()=>{const groups=Array.from({length:10},(_,i)=>({...group,id:"g"+i,title:"Group "+i}));render(<Editor initial={groups} disabled/>);expect(screen.getByRole("button",{name:"Add choice group"})).toBeDisabled();expect(screen.getByRole("button",{name:"Edit choice group 1"})).toBeDisabled();});
it("keeps a parent dialog open while editing a choice group",async()=>{const user=userEvent.setup();render(<Dialog defaultOpen><DialogContent onInteractOutside={e=>e.preventDefault()}><DialogTitle>Package wizard</DialogTitle><Editor/></DialogContent></Dialog>);const parent=screen.getByRole("dialog",{name:"Package wizard"});await user.click(screen.getByRole("button",{name:"Add choice group"}));fill("Group Name","Unfinished");const overlays=document.querySelectorAll('[data-state="open"][class*="fixed inset-0"]');await user.click(overlays[overlays.length-1]);expect(parent).toBeInTheDocument();expect(screen.getByRole("dialog",{name:"Add Food Choice Group"})).toBeVisible();});
