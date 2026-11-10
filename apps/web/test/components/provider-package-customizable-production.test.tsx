import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
const api=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),complete:vi.fn(),retry:vi.fn(),pending:vi.fn(()=>false),save:vi.fn(),legacy:vi.fn()}));
vi.mock("@/lib/provider/provider-package-v2-client",()=>({packageV2Enabled:false,packageV2PublicationEnabled:false,createV2PackageDraft:api.create,updateV2PackageDraft:api.update,completeV2PackageProgress:api.complete,hasPendingV2Draft:api.pending,retryPendingV2Draft:api.retry}));
vi.mock("@/lib/provider/provider-package-client",()=>({createProviderPackage:api.legacy,updateProviderPackage:api.legacy}));
vi.mock("@/lib/provider/provider-package-progress",()=>({packageEditorProgressEnabled:true,savePackageProgress:api.save,packageProgressError:()=>"Progress failed"}));
const props={occasionCatalog:{options:[{id:"birthday",label:"Birthday",categoryCodes:["catering_service"]},{id:"wedding",label:"Wedding",categoryCodes:["catering_service"]}],catalogRevision:1,eligibilityModel: "global_v1" as const,maxSpecificOccasions:10},packageCategoryOptions:[{code:"catering_service",name:"Catering"}],eventTypesSupported:["birthday","wedding"],minGuestsPerEvent:1,maxGuestsPerEvent:100,onSaved:vi.fn(),onCancel:vi.fn()};
const chooseClassification=()=>{
 fireEvent.change(screen.getByRole("combobox",{name:/Package structure/}),
  {target:{value:"fixed"}});
 fireEvent.change(screen.getByRole("textbox",{name:/Package style/}),
  {target:{value:"Grazing Table"}});
};
const next=()=>fireEvent.click(screen.getByRole("button",{name:"Next"}));
afterEach(()=>vi.unstubAllGlobals());
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("confirm",vi.fn(()=>true));api.pending.mockReturnValue(false);api.create.mockResolvedValue({packageId:"new",packageRevision:1,status:"draft"});api.update.mockResolvedValue({packageId:"pkg",packageRevision:8,status:"draft"});});
it.each(["per_pax", "per_bundle"] as const)("creates customizable %s through V2 with client flags off", async(pricingModel)=>{
 render(<ProviderPackageForm {...props}/>);
 chooseClassification();
 fireEvent.change(screen.getByRole("combobox",{name:/Package structure/}),{target:{value:"customizable"}});
 fireEvent.change(screen.getByLabelText(/Package name/),{target:{value:"Choice catering"}});
 fireEvent.change(screen.getByLabelText(/Description/),{target:{value:"Complete food-choice catering description."}});
 fireEvent.change(screen.getByRole("combobox",{name:/Suitable occasions/}),{target:{value:"birthday"}});
 fireEvent.click(screen.getByRole("button",{name:"Add selected occasion"}));next();
 fireEvent.change(screen.getByLabelText(/Pricing model/),{target:{value:pricingModel}});
 fireEvent.change(screen.getByLabelText(/Minimum guests/),{target:{value:"10"}});
 fireEvent.change(screen.getByLabelText(/Maximum guests/),{target:{value:"50"}});
 fireEvent.click(screen.getByRole("checkbox",{name:/Drop-Off/}));
 fireEvent.change(screen.getByLabelText(/Drop-Off.*price/),{target:{value:"100"}});
 next();
 fireEvent.click(screen.getByRole("button",{name:"Add choice group"}));
 fireEvent.change(screen.getByLabelText("Group Name"),{target:{value:"Main dish"}});
 fireEvent.change(screen.getByLabelText("Food option 1"),{target:{value:"Chicken Afritada"}});
 fireEvent.change(screen.getByLabelText("Food option 2"),{target:{value:"Pork Menudo"}});
 fireEvent.click(screen.getByRole("button",{name:"Add dish option"}));
 fireEvent.change(screen.getByLabelText("Food option 3"),{target:{value:"Sweet and Sour Fish"}});
 fireEvent.click(screen.getByRole("button",{name:"Save choice group"}));
 next();next();
 expect(screen.queryByRole("dialog",{name:"FEASTA Confirmation"})).not.toBeInTheDocument();
 expect(api.create).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Save Package Draft"}));
 expect(api.create).not.toHaveBeenCalled();
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Create Draft"}));
 await waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
 const received=api.create.mock.calls[0][0];
 expect(received.foodInclusions).toEqual([]);
 expect(received.foodChoiceGroups).toMatchObject([{title:"Main dish",selectionCount:1,
   options:[{name:"Chicken Afritada"},{name:"Pork Menudo"},{name:"Sweet and Sour Fish"}]}]);
 expect(received.sharedContractVersion).toBe(2);
 expect(received.pricingModel).toBe(pricingModel);
 expect(api.legacy).not.toHaveBeenCalled();
});

it.each(["per_pax", "per_bundle"] as const)("creates Fixed %s through V2 with client flags off",async(pricingModel)=>{
 render(<ProviderPackageForm {...props}/>);chooseClassification();
 fireEvent.change(screen.getByLabelText(/Package name/),{target:{value:"Fixed catering"}});
 fireEvent.change(screen.getByLabelText(/Description/),{target:{value:"Complete fixed catering description."}});
 fireEvent.change(screen.getByRole("combobox",{name:/Suitable occasions/}),{target:{value:"birthday"}});
 fireEvent.click(screen.getByRole("button",{name:"Add selected occasion"}));next();
 fireEvent.change(screen.getByLabelText(/Pricing model/),{target:{value:pricingModel}});
 fireEvent.change(screen.getByLabelText(/Minimum guests/),{target:{value:"10"}});
 fireEvent.change(screen.getByLabelText(/Maximum guests/),{target:{value:"50"}});
 fireEvent.click(screen.getByRole("checkbox",{name:/Drop-Off/}));
 fireEvent.change(screen.getByLabelText(/Drop-Off.*price/),{target:{value:"100"}});
 next();next();next();
 fireEvent.click(screen.getByRole("button",{name:"Save Package Draft"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Create Draft"}));
 await waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
 expect(api.create.mock.calls[0][0]).toMatchObject({offerStructure:"fixed",pricingModel,sharedContractVersion:2,offerSchemaVersion:2,occasionSchemaVersion:2,minimumGuests:10,maximumGuests:50,paymentPolicy:"full_payment",depositPercentage:100});
 expect(api.legacy).not.toHaveBeenCalled();
});
