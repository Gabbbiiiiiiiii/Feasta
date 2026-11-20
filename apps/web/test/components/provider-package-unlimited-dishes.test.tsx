import {fireEvent, render, screen, within} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProviderPackageFoodChoices} from "@/app/provider/packages/provider-package-food-choices";
import {parseFoodChoiceGroupsV2} from "@/lib/provider/food-choice-groups-v2";
vi.mock("@/app/provider/packages/dish-library-actions", () => ({loadDishLibrary: async () => ({revision:1, categories:["Pork"], dishes:Array.from({length:61}, (_,i)=>({id:"dish_"+i,name:"Dish "+i,category:"Pork"}))})}));
it("adds and saves all 61 dishes without dish caps", async () => {
 const change=vi.fn(); render(<ProviderPackageFoodChoices value={[]} onChange={change}/>);
 fireEvent.click(screen.getByRole("button", {name:"Add choice group"}));
 fireEvent.change(screen.getByLabelText("Group Name"), {target:{value:"Side Dishes"}});
 fireEvent.click(screen.getByRole("button", {name:"Choose from Dish List"}));
 const picker=within(await screen.findByRole("dialog", {name:"Dish Library"}));
 fireEvent.click(await picker.findByRole("checkbox", {name:"Select all Pork"}));
 expect(picker.queryByText(/Up to 10 dishes/)).not.toBeInTheDocument();
 fireEvent.click(picker.getByRole("button", {name:"Add 61 selected dishes"}));
 fireEvent.click(screen.getByRole("button", {name:"Save choice group"}));
 expect(change).toHaveBeenCalledTimes(1);
 const groups=change.mock.calls[0][0]; expect(groups[0].options).toHaveLength(61);
 expect(parseFoodChoiceGroupsV2(groups)).toEqual(groups);
});
