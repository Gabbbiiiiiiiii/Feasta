import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
vi.mock("@/app/provider/packages/dish-library-actions", () => ({
 loadDishLibrary: async () => ({
  revision: 1,
  dishes: [
   {id:"chicken", name:"Chicken Afritada", category:"Chicken", parentGroup:"Meat Dishes"},
   {id:"pork", name:"Pork Menudo", category:"Pork", parentGroup:"Meat Dishes"},
   {id:"fish", name:"Sweet and Sour Fish", category:"Fish", parentGroup:"Meat Dishes"},
   {id:"beef", name:"Beef Caldereta", category:"Beef", parentGroup:"Meat Dishes"},
  ],
 }),
}));
const api=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),complete:vi.fn(),retry:vi.fn(),pending:vi.fn(()=>false),save:vi.fn(),legacy:vi.fn()}));
vi.mock("@/lib/provider/provider-package-v2-client",()=>({packageV2Enabled:false,packageV2PublicationEnabled:false,createV2PackageDraft:api.create,updateV2PackageDraft:api.update,completeV2PackageProgress:api.complete,hasPendingV2Draft:api.pending,retryPendingV2Draft:api.retry}));
vi.mock("@/lib/provider/provider-package-client",()=>({createProviderPackage:api.legacy,updateProviderPackage:api.legacy,publishProviderPackage:vi.fn()}));
vi.mock("@/lib/provider/provider-package-progress",()=>({packageEditorProgressEnabled:true,savePackageProgress:api.save,packageProgressError:()=>"Progress failed"}));
const props={occasionCatalog:{options:[{id:"birthday",label:"Birthday",categoryCodes:["catering_service"]},{id:"wedding",label:"Wedding",categoryCodes:["catering_service"]}],catalogRevision:1,eligibilityModel: "global_v1" as const,maxSpecificOccasions:10},packageCategoryOptions:[{code:"catering_service",name:"Catering"}],eventTypesSupported:["birthday","wedding"],minGuestsPerEvent:1,maxGuestsPerEvent:100,onSaved:vi.fn(),onCancel:vi.fn()};
const next=()=>fireEvent.click(screen.getByRole("button",{name:"Next"}));
afterEach(()=>vi.unstubAllGlobals());
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("confirm",vi.fn(()=>true));api.pending.mockReturnValue(false);api.create.mockResolvedValue({packageId:"new",packageRevision:1,status:"draft"});api.update.mockResolvedValue({packageId:"pkg",packageRevision:8,status:"draft"});});
it.each(["per_pax", "per_bundle"] as const)("creates Fixed %s through V2 with client flags off",async(pricingModel)=>{
 render(<ProviderPackageForm {...props}/>);
 fireEvent.change(screen.getByLabelText(/Package name/),{target:{value:"Fixed catering"}});
 fireEvent.change(screen.getByLabelText(/Description/),{target:{value:"Complete fixed catering description."}});
 fireEvent.change(screen.getByRole("combobox",{name:/Suitable occasions/}),{target:{value:"birthday"}});
 fireEvent.click(screen.getByRole("button",{name:"Add selected occasion"}));next();
 fireEvent.change(screen.getByLabelText(/Pricing model/),{target:{value:pricingModel}});
 fireEvent.change(screen.getByLabelText(/Minimum guests/),{target:{value:"10"}});
 fireEvent.change(screen.getByLabelText(/Maximum guests/),{target:{value:"50"}});
 fireEvent.click(screen.getByRole("checkbox",{name:/Drop-Off/}));
 fireEvent.change(screen.getByLabelText(/Drop-Off.*price/),{target:{value:"100"}});
 if (pricingModel === "per_bundle") {
  const limit = screen.getByLabelText(/Max quantity per order/);
  const cases: ReadonlyArray<readonly [string, string]> = [
   ["", "Enter a number from 1 to 100."],
   ["aaa", "Use numbers only (1 to 100)."],
   ["0", "Must be at least 1 per order."],
   ["1.5", "Use numbers only (1 to 100)."],
   ["111", "Maximum is 100 per order."],
   ["101", "Maximum is 100 per order."],
  ];
  for (const [value, message] of cases) {
   fireEvent.change(limit, {target: {value}});
   expect(limit).toHaveValue("");
   expect(limit).toHaveAttribute("aria-invalid", "true");
   expect(screen.getAllByRole("alert").some((node) => node.textContent?.includes(message))).toBe(true);
   next();
   expect(screen.getByRole("heading", {name: "Step 2: Pricing & capacity"})).toBeVisible();
  }
  fireEvent.change(limit, {target: {value: "5"}});
  expect(limit).toHaveValue("5");
  expect(limit).not.toHaveAttribute("aria-invalid", "true");
 } else {
  expect(screen.queryByLabelText(/Max quantity per order/)).not.toBeInTheDocument();
 }
 next();
 expect(screen.queryByLabelText(/Package structure/)).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button", {name: "Choose from Dish List"}));
 const picker = within(await screen.findByRole("dialog", {name: "Dish Library"}));
 fireEvent.click(await picker.findByRole("checkbox", {name: "Select all Chicken"}));
 fireEvent.click(picker.getByRole("button", {name: "Add 1 selected dish"}));
 next();next();
 const review = within(screen.getByRole("region", {name: "Package review"}));
 expect(review.getByRole("heading", {name: "Pricing, capacity & service tiers"})).toBeVisible();
 if (pricingModel === "per_bundle") {
  expect(review.getByText("Max quantity per order (Drop-Off)")).toBeVisible();
  expect(review.getByText("Up to 5 packages")).toBeVisible();
 } else {
  expect(review.queryByText(/Max quantity per order/i)).not.toBeInTheDocument();
 }
 fireEvent.click(screen.getByRole("button",{name:"Save as Draft"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Save as Draft"}));
 await waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
 expect(api.create.mock.calls[0][0]).toMatchObject({offerStructure:"fixed",pricingModel,sharedContractVersion:2,offerSchemaVersion:2,occasionSchemaVersion:2,minimumGuests:10,maximumGuests:50,paymentPolicy:"full_payment",depositPercentage:100});
 if (pricingModel === "per_bundle") expect(api.create.mock.calls[0][0].maxDropOffOrderQuantity).toBe(5);
 else expect(api.create.mock.calls[0][0]).not.toHaveProperty("maxDropOffOrderQuantity");
 expect(api.legacy).not.toHaveBeenCalled();
});
