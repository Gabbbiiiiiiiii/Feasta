import {describe, expect, it} from "vitest";
import {parseFoodChoiceGroupsV2} from "@/lib/provider/food-choice-groups-v2";

const main = () => [{id:"main",title:"Main dish",selectionCount:1,options:[
  {id:"chicken",name:"Chicken Afritada"}, {id:"pork",name:"Pork Menudo"},
  {id:"fish",name:"Sweet and Sour Fish"},
]}];

describe("private V2 customer-selectable food-choice validation", () => {
  it("accepts exactly one of three while leaving zero groups backwards-compatible", () => {
    expect(parseFoodChoiceGroupsV2(main())).toEqual(main());
    expect(parseFoodChoiceGroupsV2([])).toEqual([]);
  });
  it("rejects duplicate options and impossible selection rules", () => {
    const duplicate=main(); duplicate[0].options[1].name="  chicken  afritada ";
    expect(()=>parseFoodChoiceGroupsV2(duplicate)).toThrow("INVALID_FOOD_CHOICE_GROUP");
    const tooMany=main(); tooMany[0].selectionCount=4;
    expect(()=>parseFoodChoiceGroupsV2(tooMany)).toThrow("INVALID_FOOD_CHOICE_GROUP");
  });
  it("permits unfinished options in saved editor progress, never in a package write", () => {
    const unfinished=main(); unfinished[0].options[0].name="";
    expect(parseFoodChoiceGroupsV2(unfinished,true)[0].options[0].name).toBe("");
    expect(()=>parseFoodChoiceGroupsV2(unfinished)).toThrow("INVALID_FOOD_CHOICE_GROUP");
  });
  it("rejects unknown fields, controls, empty groups, and duplicate normalized names", () => {
    expect(()=>parseFoodChoiceGroupsV2([{...main()[0], hacked:true}])).toThrow();
    expect(()=>parseFoodChoiceGroupsV2([{...main()[0],title:"Bad\nname"}])).toThrow();
    expect(()=>parseFoodChoiceGroupsV2([{...main()[0],options:[]}])).toThrow();
    expect(()=>parseFoodChoiceGroupsV2([main()[0],{...main()[0],id:"other",title:"main dish"}])).toThrow();
  });
});
