import {fireEvent,render,screen} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import {FoodChoiceSelector} from "@/components/customer/bookings/food-choice-selector";
import {foodChoiceSelectionError,parseStoredFoodChoices} from "@/lib/customer/bookings/food-choice-selection";
const groups=[{id:"main",title:"Main dish",selectionCount:1,options:[{id:"a",name:"Chicken"},{id:"b",name:"Pork"}]}];
it("shows required count and selects IDs",()=>{
 const change=vi.fn();render(<FoodChoiceSelector groups={groups} value={[]} onChange={change}/>);
 expect(screen.getByText(/choose exactly 1/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("checkbox",{name:"Chicken"}));
 expect(change).toHaveBeenCalledWith([{groupId:"main",optionIds:["a"]}]);
});
it("limits count and allows deselection",()=>{
 const change=vi.fn();render(<FoodChoiceSelector groups={groups} value={[{groupId:"main",optionIds:["a"]}]} onChange={change}/>);
 expect(screen.getByRole("checkbox",{name:"Pork"})).toBeDisabled();
 fireEvent.click(screen.getByRole("checkbox",{name:"Chicken"}));
 expect(change).toHaveBeenCalledWith([{groupId:"main",optionIds:[]}]);
});
it("validates counts, unknown options and legacy packages",()=>{
 expect(foodChoiceSelectionError(groups,[])).toBeTruthy();
 expect(foodChoiceSelectionError(groups,[{groupId:"main",optionIds:["x"]}])).toBeTruthy();
 expect(foodChoiceSelectionError(groups,[{groupId:"main",optionIds:["a"]}])).toBeNull();
 expect(foodChoiceSelectionError([],[])).toBeNull();
});
it("restores choices and rejects stored rules",()=>{
 expect(parseStoredFoodChoices([{groupId:"main",optionIds:["a"]}])).toEqual([{groupId:"main",optionIds:["a"]}]);
 expect(parseStoredFoodChoices([{groupId:"main",optionIds:["a"],selectionCount:0}])).toBeNull();
});
