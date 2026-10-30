import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";
const api=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),complete:vi.fn(),retry:vi.fn(),pending:vi.fn(()=>false),save:vi.fn(),legacy:vi.fn()}));
vi.mock("@/lib/provider/provider-package-v2-client",()=>({packageV2Enabled:true,packageV2PublicationEnabled:false,createV2PackageDraft:api.create,updateV2PackageDraft:api.update,completeV2PackageProgress:api.complete,hasPendingV2Draft:api.pending,retryPendingV2Draft:api.retry}));
vi.mock("@/lib/provider/provider-package-client",()=>({createProviderPackage:api.legacy,updateProviderPackage:api.legacy}));
vi.mock("@/lib/provider/provider-package-progress",()=>({packageEditorProgressEnabled:true,savePackageProgress:api.save,packageProgressError:()=>"Progress failed"}));
const props={occasionCatalog:{options:[{id:"birthday",label:"Birthday",categoryCodes:["catering_service"]},{id:"wedding",label:"Wedding",categoryCodes:["catering_service"]}],catalogRevision:1,providerEligibilityRevision:1,maxSpecificOccasions:10},packageCategoryOptions:[{code:"catering_service",name:"Catering"}],eventTypesSupported:["birthday","wedding"],minGuestsPerEvent:1,maxGuestsPerEvent:100,onSaved:vi.fn(),onCancel:vi.fn()};
const packageValue:ProviderPackage={id:"pkg",providerId:"provider",name:"Catering draft",description:"Complete catering package.",eventType:"birthday",serviceCategoryCode:"catering_service",price:100,serviceOptions:{drop_off:{price:100,includedServices:["Delivery"]}},themeOptions:[],paymentPolicy:"full_payment",depositPercentage:100,downPaymentPercentage:100,balanceDueDaysBeforeEvent:null,minimumGuests:10,maximumGuests:50,imageUrl:"",imageUrls:[],foodInclusions:[],decorInclusions:[],furnitureInclusions:[],serviceInclusions:[],status:"draft",isActive:false,isPublished:false,providerPubliclyVisible:false,pricingModel:"per_pax",v2:{revision:7,occasionScope:"specific",occasionIds:["birthday","wedding"],equipmentInclusions:["Shared warmer"],serviceOptions:{drop_off:{price:100,includedServices:["Delivery"],equipmentInclusions:["Tier equipment"]}}}};
const next=()=>fireEvent.click(screen.getByRole("button",{name:"Next"}));
const review=()=>{next();next();next();next();};
afterEach(()=>vi.unstubAllGlobals());
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("confirm",vi.fn(()=>true));api.pending.mockReturnValue(false);api.create.mockResolvedValue({packageId:"new",packageRevision:1,status:"draft"});api.update.mockResolvedValue({packageId:"pkg",packageRevision:8,status:"draft"});});
it("creates a real multi-occasion Fixed Bundle draft from the new wizard",async()=>{
 render(<ProviderPackageForm {...props}/>);
 fireEvent.change(screen.getByLabelText(/Package name/),{target:{value:"New catering"}});
 fireEvent.change(screen.getByLabelText(/Description/),{target:{value:"Complete new catering package."}});
 fireEvent.change(screen.getByRole("combobox",{name:/Suitable occasions/}),{target:{value:"wedding"}});
 fireEvent.click(screen.getByRole("button",{name:"Add selected occasion"})); next();
 fireEvent.change(screen.getByLabelText(/Pricing model/),{target:{value:"per_bundle"}});
 fireEvent.change(screen.getByLabelText(/Minimum guests/),{target:{value:"10"}});
 fireEvent.change(screen.getByLabelText(/Maximum guests/),{target:{value:"50"}});
 fireEvent.click(screen.getByRole("checkbox",{name:/Drop-Off/}));
 fireEvent.change(screen.getByLabelText(/Drop-Off.*price/),{target:{value:"100"}});
 next();next();next();
 fireEvent.click(screen.getByRole("button",{name:"Save Package Draft"}));
 await waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
 expect(api.create.mock.calls[0][0]).toMatchObject({occasionIds:["birthday","wedding"],pricingModel:"per_bundle",price:100,sharedContractVersion:2});
 expect(api.legacy).not.toHaveBeenCalled();
});
it("reopens V2 selections and preserves tier extensions with the server revision",async()=>{
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>); review();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(api.update.mock.calls[0][0]).toMatchObject({packageId:"pkg",expectedRevision:7,occasionIds:["birthday","wedding"],pricingModel:"per_pax",equipmentInclusions:["Shared warmer"],serviceOptions:{drop_off:{equipmentInclusions:["Tier equipment"]}}});
 expect(api.legacy).not.toHaveBeenCalled();
});
it("persists Fits All without inventing a scalar occasion",async()=>{
 render(<ProviderPackageForm {...props} initialPackage={{...packageValue,pricingModel:"per_bundle",v2:{...packageValue.v2!,occasionScope:"all",occasionIds:[]}}}/>);review();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(api.update.mock.calls[0][0]).toMatchObject({occasionScope:"all",occasionIds:[],pricingModel:"per_bundle"});
 expect(api.update.mock.calls[0][0]).not.toHaveProperty("eventType");
});
it("saves latest resumed progress before completing exactly that editor revision",async()=>{
 const draft={editorSchemaVersion:2 as const,editorDraftId:"editor",providerId:"provider",packageId:null,basePackageRevision:null,state:"incomplete" as const,revision:3,currentStep:4 as const,completedPackageId:null,completedPackageRevision:null,createdAt:"now",updatedAt:"now",progress:{name:"Resumed package",description:"Completed catering progress.",serviceCategoryCode:"catering_service",occasion:{occasionSchemaVersion:2 as const,occasionScope:"all" as const,occasionIds:[]},pricingModel:"per_pax" as const,minimumGuestsText:"10",maximumGuestsText:"50",paymentPolicy:"full_payment" as const,tiers:{drop_off:{enabled:true,priceText:"100",includedServices:["Delivery"],decorInclusions:[],furnitureInclusions:[],equipmentInclusions:[]}}}};
 api.save.mockResolvedValue({...draft,revision:4});api.complete.mockResolvedValue({packageId:"new",packageRevision:1,status:"draft"});
 render(<ProviderPackageForm {...props} initialEditorProgress={draft}/>);
 fireEvent.click(screen.getByRole("button",{name:"Save Package Draft"}));
 await waitFor(()=>expect(api.complete).toHaveBeenCalledTimes(1));
 expect(api.complete.mock.calls[0][0]).toMatchObject({editorDraftId:"editor",expectedRevision:4,expectedPackageRevision:null});
 expect(api.create).not.toHaveBeenCalled();
});
it("reports stale revisions without overwriting or falling back to legacy",async()=>{
 api.update.mockRejectedValue({code:"functions/aborted",details:{reason:"REVISION_CONFLICT"}});
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>);review();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("entries are still here"));
 expect(api.update.mock.calls[0][0].expectedRevision).toBe(7);expect(api.legacy).not.toHaveBeenCalled();
});
it("locks uncertain saves and retries the recorded request",async()=>{
 api.pending.mockReturnValue(true);api.retry.mockResolvedValue({packageId:"new",packageRevision:1,status:"draft"});
 render(<ProviderPackageForm {...props}/>);
 expect(screen.getByLabelText(/Package name/)).toBeDisabled();
 fireEvent.click(screen.getByRole("button",{name:"Retry pending save"}));
 await waitFor(()=>expect(api.retry).toHaveBeenCalledTimes(1));expect(api.create).not.toHaveBeenCalled();
});

// Stage F regression: the V2 editor must persist newly edited per-tier extras.
it("edits and saves separate per-tier inclusions without overwriting existing values", async()=>{
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>);
 next();next();next();
 fireEvent.change(screen.getByLabelText("Decoration inclusions for Drop-Off Catering"),
  {target:{value:"Table flowers\nBackdrop"}});
 fireEvent.change(screen.getByLabelText("Furniture inclusions for Drop-Off Catering"),
  {target:{value:"Chairs"}});
 fireEvent.change(screen.getByLabelText("Equipment inclusions for Drop-Off Catering"),
  {target:{value:"Serving trays"}});
 next();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(api.update.mock.calls[0][0].serviceOptions.drop_off).toMatchObject({
  decorInclusions:["Table flowers","Backdrop"],
  furnitureInclusions:["Chairs"],equipmentInclusions:["Serving trays"]});
});
it("requires explicit V2 save confirmation and makes no request when declined",async()=>{
 vi.stubGlobal("confirm",vi.fn(()=>false));
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>); review();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 expect(api.update).not.toHaveBeenCalled();
 expect(screen.getByRole("button",{name:"Save changes"})).toBeEnabled();
});
it("exits only after a confirmed progress save",async()=>{
 const exit=vi.fn();const result={editorDraftId:"resume",revision:1};
 api.save.mockResolvedValue(result);
 render(<ProviderPackageForm {...props} onProgressExit={exit}/>);
 fireEvent.click(screen.getByRole("button",{name:"Save Progress & Exit"}));
 await waitFor(()=>expect(exit).toHaveBeenCalledTimes(1));
 expect(api.save).toHaveBeenCalledTimes(1);
});
it("keeps the editor open if Save Progress & Exit fails",async()=>{
 const exit=vi.fn();api.save.mockRejectedValue(new Error("simulated failure"));
 render(<ProviderPackageForm {...props} onProgressExit={exit}/>);
 fireEvent.click(screen.getByRole("button",{name:"Save Progress & Exit"}));
 await waitFor(() => expect(screen.getByText("Progress failed")).toHaveAttribute("role", "alert"));
 expect(exit).not.toHaveBeenCalled();
});

// Stage F2: a private V2 package preserves exactly-one-of-three meal choices.
it("creates a private V2 draft with customer-selectable food groups, without modifying included dishes", async()=>{
 render(<ProviderPackageForm {...props}/>);
 fireEvent.change(screen.getByLabelText(/Package name/),{target:{value:"Choice catering"}});
 fireEvent.change(screen.getByLabelText(/Description/),{target:{value:"Complete food-choice catering description."}});
 fireEvent.change(screen.getByRole("combobox",{name:/Suitable occasions/}),{target:{value:"birthday"}});
 fireEvent.click(screen.getByRole("button",{name:"Add selected occasion"}));next();
 fireEvent.change(screen.getByLabelText(/Minimum guests/),{target:{value:"10"}});
 fireEvent.change(screen.getByLabelText(/Maximum guests/),{target:{value:"50"}});
 fireEvent.click(screen.getByRole("checkbox",{name:/Drop-Off/}));
 fireEvent.change(screen.getByLabelText(/Drop-Off.*price/),{target:{value:"100"}});
 next();
 fireEvent.click(screen.getByRole("button",{name:"Add choice group"}));
 fireEvent.change(screen.getByLabelText("Choice group 1 name"),{target:{value:"Main dish"}});
 fireEvent.change(screen.getByLabelText("Choice group 1 dish 1"),{target:{value:"Chicken Afritada"}});
 fireEvent.change(screen.getByLabelText("Choice group 1 dish 2"),{target:{value:"Pork Menudo"}});
 fireEvent.click(screen.getByRole("button",{name:"Add dish option"}));
 fireEvent.change(screen.getByLabelText("Choice group 1 dish 3"),{target:{value:"Sweet and Sour Fish"}});
 next();next();
 fireEvent.click(screen.getByRole("button",{name:"Save Package Draft"}));
 await waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
 const received=api.create.mock.calls[0][0];
 expect(received.foodInclusions).toEqual([]);
 expect(received.foodChoiceGroups).toMatchObject([{title:"Main dish",selectionCount:1,
   options:[{name:"Chicken Afritada"},{name:"Pork Menudo"},{name:"Sweet and Sour Fish"}]}]);
 expect(received.sharedContractVersion).toBe(2);
});
it("blocks invalid food choices at Step 3 without invoking package creation",()=>{
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>);
 next();next();
 fireEvent.click(screen.getByRole("button",{name:"Add choice group"}));
 next();
 expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("Complete each food-choice group"))).toBe(true);
 expect(api.update).not.toHaveBeenCalled();
});
it("saves incomplete food-choice groups in private editor progress and resumes existing groups",async()=>{
 api.save.mockResolvedValue({editorDraftId:"editor",revision:1});
 const exit=vi.fn();
 const {unmount}=render(<ProviderPackageForm {...props} onProgressExit={exit}/>);
 fireEvent.change(screen.getByLabelText(/Package name/),{target:{value:"Incomplete choices"}});
 fireEvent.change(screen.getByLabelText(/Description/),{target:{value:"Catering with unfinished food choices."}});
 next();
 fireEvent.change(screen.getByLabelText(/Minimum guests/),{target:{value:"10"}});
 fireEvent.change(screen.getByLabelText(/Maximum guests/),{target:{value:"50"}});
 fireEvent.click(screen.getByRole("checkbox",{name:/Drop-Off/}));
 fireEvent.change(screen.getByLabelText(/Drop-Off.*price/),{target:{value:"100"}});
 next();
 fireEvent.click(screen.getByRole("button",{name:"Add choice group"}));
 fireEvent.change(screen.getByLabelText("Choice group 1 name"),{target:{value:"Main dish"}});
 fireEvent.click(screen.getByRole("button",{name:"Save Progress & Exit"}));
 await waitFor(()=>expect(api.save).toHaveBeenCalledTimes(1));
 expect(api.save.mock.calls[0][0].progress.foodChoiceGroups).toMatchObject([{title:"Main dish",selectionCount:1,
   options:[{name:""},{name:""}]}]);
 expect(exit).toHaveBeenCalledTimes(1);
 const saved=api.save.mock.calls[0][0];
 unmount();
 render(<ProviderPackageForm {...props} initialEditorProgress={{editorSchemaVersion:2,editorDraftId:"editor",providerId:"provider",packageId:null,basePackageRevision:null,state:"incomplete",revision:1,currentStep:saved.currentStep,completedPackageId:null,completedPackageRevision:null,createdAt:"now",updatedAt:"now",progress:saved.progress}}/>);
 expect(screen.getByLabelText("Choice group 1 name")).toHaveValue("Main dish");
 expect(screen.getByLabelText("Choice group 1 dish 1")).toHaveValue("");
 expect(screen.getByLabelText("Choice group 1 dish 2")).toHaveValue("");
});
it("reopens and updates existing private food-choice groups",async()=>{
 const original={id:"main",title:"Main dish",selectionCount:1,
  options:[{id:"chicken",name:"Chicken"},{id:"pork",name:"Pork"}]};
 const withChoices:ProviderPackage={...packageValue,v2:{...packageValue.v2!,foodChoiceGroups:[original]}};
 render(<ProviderPackageForm {...props} initialPackage={withChoices}/>);
 next();next();
 expect(screen.getByLabelText("Choice group 1 name")).toHaveValue("Main dish");
 expect(screen.getByLabelText("Choice group 1 dish 2")).toHaveValue("Pork");
 fireEvent.change(screen.getByLabelText("Choice group 1 dish 2"),{target:{value:"Fish"}});
 next();next();fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(api.update.mock.calls[0][0].foodChoiceGroups[0].options[1].name).toBe("Fish");
});
