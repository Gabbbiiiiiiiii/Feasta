import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ProviderPackageForm} from "@/app/provider/packages/provider-package-form";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";
import type {SavedEditorDraft} from "@/lib/provider/provider-package-progress";
const api=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),complete:vi.fn(),retry:vi.fn(),pending:vi.fn(()=>false),save:vi.fn(),legacy:vi.fn()}));
vi.mock("@/lib/provider/provider-package-v2-client",()=>({packageV2Enabled:true,packageV2PublicationEnabled:false,createV2PackageDraft:api.create,updateV2PackageDraft:api.update,completeV2PackageProgress:api.complete,hasPendingV2Draft:api.pending,retryPendingV2Draft:api.retry}));
vi.mock("@/lib/provider/provider-package-client",()=>({createProviderPackage:api.legacy,updateProviderPackage:api.legacy}));
vi.mock("@/lib/provider/provider-package-progress",()=>({packageEditorProgressEnabled:true,savePackageProgress:api.save,packageProgressError:()=>"Progress failed"}));
const props={occasionCatalog:{options:[{id:"birthday",label:"Birthday",categoryCodes:["catering_service"]},{id:"wedding",label:"Wedding",categoryCodes:["catering_service"]}],catalogRevision:1,eligibilityModel: "global_v1" as const,maxSpecificOccasions:10},packageCategoryOptions:[{code:"catering_service",name:"Catering"}],eventTypesSupported:["birthday","wedding"],minGuestsPerEvent:1,maxGuestsPerEvent:100,onSaved:vi.fn(),onCancel:vi.fn()};
const packageValue:ProviderPackage={id:"pkg",providerId:"provider",name:"Catering draft",description:"Complete catering package.",eventType:"birthday",serviceCategoryCode:"catering_service",price:100,serviceOptions:{drop_off:{price:100,includedServices:["Delivery"]}},themeOptions:[],paymentPolicy:"full_payment",depositPercentage:100,downPaymentPercentage:100,balanceDueDaysBeforeEvent:null,minimumGuests:10,maximumGuests:50,imageUrl:"",imageUrls:[],foodInclusions:[],decorInclusions:[],furnitureInclusions:[],serviceInclusions:[],status:"draft",isActive:false,isPublished:false,providerPubliclyVisible:false,pricingModel:"per_pax",v2:{revision:7,offerStructure:"fixed",packageStyle:"Buffet Catering",occasionScope:"specific",occasionIds:["birthday","wedding"],equipmentInclusions:["Shared warmer"],serviceOptions:{drop_off:{price:100,includedServices:["Delivery"],equipmentInclusions:["Tier equipment"]}}}};
const chooseClassification=()=>{
 fireEvent.change(screen.getByRole("combobox",{name:/Package structure/}),
  {target:{value:"fixed"}});
 fireEvent.change(screen.getByRole("textbox",{name:/Package style/}),
  {target:{value:"Grazing Table"}});
};
const next=()=>fireEvent.click(screen.getByRole("button",{name:"Next"}));
const review=()=>{next();next();next();next();};
afterEach(()=>vi.unstubAllGlobals());
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("confirm",vi.fn(()=>true));api.pending.mockReturnValue(false);api.create.mockResolvedValue({packageId:"new",packageRevision:1,status:"draft"});api.update.mockResolvedValue({packageId:"pkg",packageRevision:8,status:"draft"});});
const servicesDraft = (offerStructure: "fixed" | "customizable"): SavedEditorDraft => ({
 editorSchemaVersion:2,editorDraftId:"editor",providerId:"provider",packageId:null,
 basePackageRevision:null,state:"incomplete",revision:3,currentStep:3,
 completedPackageId:null,completedPackageRevision:null,createdAt:"now",updatedAt:"now",
 progress:{offerStructure,packageStyle:"Buffet Catering",name:"Review catering",
  description:"Complete catering package for review.",serviceCategoryCode:"catering_service",
  occasion:{occasionSchemaVersion:2,occasionScope:"all",occasionIds:[]},
  pricingModel:"per_bundle",minimumGuestsText:"10",maximumGuestsText:"50",
  paymentPolicy:"full_payment",serviceInclusions:["Delivery retained"],
  ...(offerStructure === "customizable" ? {foodChoiceGroups:[{id:"main",title:"Main dish",selectionCount:1,
   options:[{id:"chicken",name:"Chicken"},{id:"fish",name:"Fish"}]}]} : {}),
  tiers:{drop_off:{enabled:true,priceText:"3500",includedServices:["Delivery"],
   decorInclusions:[],furnitureInclusions:[],equipmentInclusions:[]}}},
});
it.each([0, 1, 2, 3, 4] as const)("shares stable footer regions on step %s", (step) => {
 render(<ProviderPackageForm {...props} dialogLayout initialEditorProgress={{...servicesDraft("fixed"), currentStep:step}}/>);
 const footer = screen.getByRole("group", {name:"Package wizard actions"});
 const [left, helper, actions] = Array.from(footer.children);
 expect(footer).toHaveClass("grid", "min-w-0", "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,20rem)]");
 expect(footer.parentElement).toHaveClass("shrink-0", "border-t");
 expect(screen.getByRole("region", {name:"Package details"})).not.toContainElement(footer);
 expect(helper).toHaveClass("min-w-0", "text-center");
 expect(within(helper as HTMLElement).getByText(/Save Progress keeps unfinished editor state/)).toHaveClass("text-xs", "leading-5", "text-muted-foreground");
 expect(actions).toHaveClass("grid", "grid-cols-[minmax(0,1fr)_minmax(0,2fr)]", "gap-3");
 fireEvent.click(within(left as HTMLElement).getByRole("button", {name:"Cancel"}));
 expect(props.onCancel).toHaveBeenCalledTimes(1);
 const back = within(actions as HTMLElement).queryByRole("button", {name:"Back"});
 if (step === 0) {
  expect(back).not.toBeInTheDocument();
  expect(actions.firstElementChild).toHaveAttribute("aria-hidden", "true");
  expect(actions.firstElementChild).not.toHaveAttribute("tabindex");
 } else {
  expect(back).toBeEnabled();
  fireEvent.click(back!);
  expect(screen.getByRole("heading", {name:new RegExp(`^Step ${step}:`)})).toBeVisible();
  next();
 }
 if (step < 4) {
  expect(within(footer).queryByRole("button", {name:"Save Package Draft"})).not.toBeInTheDocument();
  next();
  expect(screen.getByRole("heading", {name:new RegExp(`^Step ${step + 2}:`)})).toBeVisible();
 } else {
  expect(within(footer).getByRole("button", {name:"Save Package Draft"})).toBeEnabled();
  expect(within(footer).queryByRole("button", {name:"Next"})).not.toBeInTheDocument();
 }
 expect(api.create).not.toHaveBeenCalled();
});
it.each(["fixed", "customizable"] as const)("offers only the two supported structures and selects %s", (structure) => {
 render(<ProviderPackageForm {...props}/>);
 const select = screen.getByRole("combobox", {name: /Package structure/});
 expect(within(select).getAllByRole("option").filter(option => option.getAttribute("value"))).toHaveLength(2);
 expect(within(select).getByRole("option", {name: "Fixed Package"})).toHaveValue("fixed");
 expect(within(select).getByRole("option", {name: "Customizable Package"})).toHaveValue("customizable");
 expect(within(select).queryByRole("option", {name: "Individual Food Item"})).not.toBeInTheDocument();
 fireEvent.change(select, {target: {value: structure}});
 expect(select).toHaveValue(structure);
});
it("retains the individual structure when editing a historical package", () => {
 render(<ProviderPackageForm {...props} initialPackage={{...packageValue, offerStructure: "individual", v2: {...packageValue.v2!, offerStructure: "individual"}}}/>);
 const select = screen.getByRole("combobox", {name: /Package structure/});
 expect(select).toHaveValue("individual");
 expect(within(select).getByRole("option", {name: "Individual Food Item"})).toBeDisabled();
 expect(api.update).not.toHaveBeenCalled();
});
it("retains individual progress on the classification step and saves without conversion", async () => {
 const initial: SavedEditorDraft = {...servicesDraft("fixed"), currentStep: 0,
  progress: {...servicesDraft("fixed").progress, offerStructure: "individual"}};
 api.save.mockResolvedValueOnce(initial);
 render(<ProviderPackageForm {...props} initialEditorProgress={initial} onProgressExit={vi.fn()}/>);
 const select = screen.getByRole("combobox", {name: /Package structure/});
 expect(select).toHaveValue("individual");
 expect(within(select).getByRole("option", {name: "Individual Food Item"})).toBeDisabled();
 fireEvent.click(screen.getByRole("button", {name: "Save Progress & Exit"}));
 await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
 expect(api.save.mock.calls[0][0].progress.offerStructure).toBe("individual");
});
it.each(["fixed", "customizable"] as const)("keeps %s Step 4 navigation separate from confirmation and all writes", async (structure)=>{
 render(<ProviderPackageForm {...props} dialogLayout initialEditorProgress={servicesDraft(structure)}/>);
 const navigation=screen.getByRole("button",{name:"Next"});
 next();
 expect(screen.getByRole("heading",{name:"Step 5: Review & save"})).toBeVisible();
 expect(screen.queryByRole("dialog",{name:"FEASTA Confirmation"})).not.toBeInTheDocument();
 expect(navigation).not.toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Save Package Draft"})).toHaveAttribute("type","button");
 expect(screen.getByText("Review catering")).toBeVisible();
 const region=screen.getByRole("region",{name:"Package details"});
 expect(region).toHaveClass("overflow-y-auto");
 expect(region).toHaveAttribute("tabindex","0");
 const summary=screen.getByRole("region",{name:"Package review"});
 expect(within(summary).getByText((_,element)=>element?.tagName === "P" &&
  /PHP\s+3,500\.00\s+fixed package/.test(element.textContent ?? ""))).toBeVisible();
 expect(within(summary).queryByText(/per person/i)).not.toBeInTheDocument();
 // Neither implicit form submission nor the original Next activation may save.
 fireEvent.submit(region.closest("form")!);
 await Promise.resolve();
 expect(screen.queryByRole("dialog",{name:"FEASTA Confirmation"})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Back"}));
 expect(screen.getByRole("heading",{name:"Step 4: Services & media"})).toBeVisible();
 expect(screen.getByLabelText("Service inclusions")).toHaveValue("Delivery retained");
 next();
 for (const action of ["Cancel", "Close dialog", "Escape"]) {
  fireEvent.click(screen.getByRole("button",{name:"Save Package Draft"}));
  const dialog=screen.getByRole("dialog",{name:"FEASTA Confirmation"});
  expect(within(dialog).getByText("Create private package draft?")).toBeVisible();
  if(action === "Escape") fireEvent.keyDown(dialog,{key:"Escape"});
  else fireEvent.click(within(dialog).getByRole("button",{name:action}));
  await waitFor(()=>expect(screen.queryByRole("dialog",{name:"FEASTA Confirmation"})).not.toBeInTheDocument());
 }
 for(const fn of [api.create,api.update,api.complete,api.save,api.legacy,api.retry]) expect(fn).not.toHaveBeenCalled();
 expect(screen.getByText("Review catering")).toBeVisible();
});
it("creates a new draft once after explicit confirmation and preserves review on failure",async()=>{
 let reject!: (reason: Error) => void;
 api.create.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r;}));
 render(<ProviderPackageForm {...props}/>);
 chooseClassification();
 fireEvent.change(screen.getByLabelText(/Package name/),{target:{value:"New catering"}});
 fireEvent.change(screen.getByLabelText(/Description/),{target:{value:"Complete new catering package."}});
 fireEvent.change(screen.getByLabelText(/Suitable occasions/),{target:{value:"birthday"}});
 fireEvent.click(screen.getByRole("button",{name:"Add selected occasion"}));
 next();
 fireEvent.change(screen.getByLabelText(/Minimum guests/),{target:{value:"10"}});
 fireEvent.change(screen.getByLabelText(/Maximum guests/),{target:{value:"50"}});
 fireEvent.click(screen.getByRole("checkbox",{name:/Drop-Off/}));
 fireEvent.change(screen.getByLabelText(/Drop-Off.*price/),{target:{value:"100"}});
 next();next();next();
 expect(api.create).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Save Package Draft"}));
 const button=within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Create Draft"});
 fireEvent.click(button);fireEvent.click(button);
 await waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
 expect(screen.getByRole("button",{name:/Creating package/})).toBeDisabled();
 expect(screen.getByRole("button",{name:"Cancel"})).toBeDisabled();
 expect(screen.getByRole("button",{name:"Back"})).toBeDisabled();
 reject(new Error("save failed"));
 await waitFor(()=>expect(screen.getByRole("alert")).toBeInTheDocument());
 expect(screen.getByText("New catering")).toBeVisible();
 expect(screen.getByRole("button",{name:"Save Package Draft"})).toBeEnabled();
 expect(props.onSaved).not.toHaveBeenCalled();
});
it("creates a real multi-occasion Fixed Bundle draft from the new wizard",async()=>{
 render(<ProviderPackageForm {...props}/>);
 chooseClassification();
 fireEvent.change(screen.getByLabelText(/Suitable occasions/),{target:{value:"birthday"}});
 fireEvent.click(screen.getByRole("button",{name:"Add selected occasion"}));
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
 expect(api.create).not.toHaveBeenCalled();
 expect(screen.getByText("Create private package draft?")).toBeInTheDocument();
 expect(screen.getByText("Your package will be saved as a private draft. It will not be published or visible to customers. You can review and edit your package later.")).toBeInTheDocument();
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Create Draft"}));
 await waitFor(()=>expect(api.create).toHaveBeenCalledTimes(1));
 expect(api.create.mock.calls[0][0]).toMatchObject({offerStructure:"fixed",packageStyle:"Grazing Table",occasionIds:["birthday","wedding"],pricingModel:"per_bundle",price:100,sharedContractVersion:2});
 expect(api.legacy).not.toHaveBeenCalled();
});
it("reopens V2 selections and preserves tier extensions with the server revision",async()=>{
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>); review();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(api.update.mock.calls[0][0]).toMatchObject({packageId:"pkg",expectedRevision:7,offerStructure:"fixed",packageStyle:"Buffet Catering",occasionIds:["birthday","wedding"],pricingModel:"per_pax",equipmentInclusions:["Shared warmer"],serviceOptions:{drop_off:{equipmentInclusions:["Tier equipment"]}}});
 expect(api.legacy).not.toHaveBeenCalled();
});
it("persists Fits All without inventing a scalar occasion",async()=>{
 render(<ProviderPackageForm {...props} initialPackage={{...packageValue,pricingModel:"per_bundle",v2:{...packageValue.v2!,occasionScope:"all",occasionIds:[]}}}/>);review();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(api.update.mock.calls[0][0]).toMatchObject({occasionScope:"all",occasionIds:[],pricingModel:"per_bundle"});
 expect(api.update.mock.calls[0][0]).not.toHaveProperty("eventType");
});
it("saves latest resumed progress before completing exactly that editor revision",async()=>{
 const draft={editorSchemaVersion:2 as const,editorDraftId:"editor",providerId:"provider",packageId:null,basePackageRevision:null,state:"incomplete" as const,revision:3,currentStep:4 as const,completedPackageId:null,completedPackageRevision:null,createdAt:"now",updatedAt:"now",progress:{offerStructure:"fixed" as const,packageStyle:"Buffet Catering",name:"Resumed package",description:"Completed catering progress.",serviceCategoryCode:"catering_service",occasion:{occasionSchemaVersion:2 as const,occasionScope:"all" as const,occasionIds:[]},pricingModel:"per_pax" as const,minimumGuestsText:"10",maximumGuestsText:"50",paymentPolicy:"full_payment" as const,tiers:{drop_off:{enabled:true,priceText:"100",includedServices:["Delivery"],decorInclusions:[],furnitureInclusions:[],equipmentInclusions:[]}}}};
 api.save.mockResolvedValue({...draft,revision:4});api.complete.mockResolvedValue({packageId:"new",packageRevision:1,status:"draft"});
 render(<ProviderPackageForm {...props} initialEditorProgress={draft}/>);
 fireEvent.click(screen.getByRole("button",{name:"Save Package Draft"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Create Draft"}));
 await waitFor(()=>expect(api.complete).toHaveBeenCalledTimes(1));
 expect(api.complete.mock.calls[0][0]).toMatchObject({editorDraftId:"editor",expectedRevision:4,expectedPackageRevision:null});
 expect(api.create).not.toHaveBeenCalled();
});
it("reports stale revisions without overwriting or falling back to legacy",async()=>{
 api.update.mockRejectedValue({code:"functions/aborted",details:{reason:"REVISION_CONFLICT"}});
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>);review();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("entries are still here"));
 expect(api.update.mock.calls[0][0].expectedRevision).toBe(7);expect(api.legacy).not.toHaveBeenCalled();
});
it("blocks missing package classifications at Step 1",()=>{
 render(<ProviderPackageForm {...props}/>);
 fireEvent.change(screen.getByLabelText(/Suitable occasions/),{target:{value:"birthday"}});
 fireEvent.click(screen.getByRole("button",{name:"Add selected occasion"}));
 fireEvent.change(screen.getByLabelText(/Package name/),
  {target:{value:"New catering"}});
 fireEvent.change(screen.getByLabelText(/Description/),
  {target:{value:"Complete catering description."}});
 next();
 expect(screen.getByRole("heading",{name:"Step 1: Package details"}))
  .toBeInTheDocument();
 expect(screen.getByRole("alert")).toHaveTextContent("Choose a package structure.");

 fireEvent.change(screen.getByRole("combobox",{name:/Package structure/}),
  {target:{value:"fixed"}});
 next();
 expect(screen.getByRole("alert"))
  .toHaveTextContent("Enter a package style between 2 and 80 characters.");
 expect(api.create).not.toHaveBeenCalled();
});

it("accepts an arbitrary provider-defined package style",()=>{
 render(<ProviderPackageForm {...props}/>);
 fireEvent.change(screen.getByLabelText(/Package name/),
  {target:{value:"Specialty catering"}});
 fireEvent.change(screen.getByLabelText(/Description/),
  {target:{value:"Complete specialty catering description."}});
 fireEvent.change(screen.getByRole("combobox",{name:/Package structure/}),
  {target:{value:"customizable"}});
 fireEvent.change(screen.getByRole("textbox",{name:/Package style/}),
  {target:{value:"Custom Grazing Experience"}});
 fireEvent.change(screen.getByRole("combobox",{name:/Suitable occasions/}),
  {target:{value:"birthday"}});
 fireEvent.click(screen.getByRole("button",{name:"Add selected occasion"}));
 next();
 expect(screen.getByRole("heading",{name:"Step 2: Pricing & capacity"}))
  .toBeInTheDocument();
});

it("restores stored package classifications for editing",()=>{
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>);
 expect(screen.getByRole("combobox",{name:/Package structure/}))
  .toHaveValue("fixed");
 expect(screen.getByRole("textbox",{name:/Package style/}))
  .toHaveValue("Buffet Catering");
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
 fireEvent.click(screen.getByText("Compatibility editor: saved category-specific inclusions"));
 fireEvent.change(screen.getByLabelText("Decoration inclusions for Drop-Off Catering"),
  {target:{value:"Table flowers\nBackdrop"}});
 fireEvent.change(screen.getByLabelText("Furniture inclusions for Drop-Off Catering"),
  {target:{value:"Chairs"}});
 fireEvent.change(screen.getByLabelText("Equipment inclusions for Drop-Off Catering"),
  {target:{value:"Serving trays"}});
 next();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(api.update.mock.calls[0][0].serviceOptions.drop_off).toMatchObject({
  decorInclusions:["Table flowers","Backdrop"],
  furnitureInclusions:["Chairs"],equipmentInclusions:["Serving trays"]});
});
it("cancels branded confirmation with Escape, X and Cancel while preserving wizard state",async()=>{
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>); review();
 for (const action of ["Cancel", "Close dialog", "Escape"]) {
  fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
  const dialog=screen.getByRole("dialog",{name:"FEASTA Confirmation"});
  if(action === "Escape") fireEvent.keyDown(dialog,{key:"Escape"});
  else fireEvent.click(within(dialog).getByRole("button",{name:action}));
  await waitFor(()=>expect(screen.queryByRole("dialog",{name:"FEASTA Confirmation"})).not.toBeInTheDocument());
  expect(screen.getByText("Catering draft")).toBeInTheDocument();
 }
 expect(api.update).not.toHaveBeenCalled();
});
it("submits once while saving and recovers after an error",async()=>{
 let reject!: (reason: Error) => void;
 api.update.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r;}));
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>); review();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 const button=within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Save changes"});
 fireEvent.click(button);fireEvent.click(button);
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(screen.getByRole("button",{name:/Saving/})).toBeDisabled();
 reject(new Error("save failed"));
 await waitFor(()=>expect(screen.getByRole("alert")).toBeInTheDocument());
 expect(screen.getByText("Catering draft")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(2));
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
 chooseClassification();
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
 fireEvent.change(screen.getByLabelText("Group Name"),{target:{value:"Main dish"}});
 fireEvent.change(screen.getByLabelText("Food option 1"),{target:{value:"Chicken Afritada"}});
 fireEvent.change(screen.getByLabelText("Food option 2"),{target:{value:"Pork Menudo"}});
 fireEvent.click(screen.getByRole("button",{name:"Add dish option"}));
 fireEvent.change(screen.getByLabelText("Food option 3"),{target:{value:"Sweet and Sour Fish"}});
 fireEvent.click(screen.getByRole("button",{name:"Save choice group"}));
 next();next();
 fireEvent.click(screen.getByRole("button",{name:"Save Package Draft"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Create Draft"}));
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
 fireEvent.click(screen.getByRole("button",{name:"Save choice group"}));
 expect(screen.getByRole("alert")).toHaveTextContent("Enter a group name");
 expect(api.update).not.toHaveBeenCalled();
});
it("resumes incomplete persisted groups without changing draft persistence",async()=>{
 const incomplete={id:"main",title:"Main dish",selectionCount:1,options:[{id:"a",name:""},{id:"b",name:""}]};
 api.save.mockResolvedValue({editorDraftId:"editor",revision:2});
 const exit=vi.fn();
 const progress={offerStructure:"fixed" as const,packageStyle:"Grazing Table",name:"Incomplete choices",serviceCategoryCode:"catering_service",foodChoiceGroups:[incomplete]};
 render(<ProviderPackageForm {...props} onProgressExit={exit} initialEditorProgress={{editorSchemaVersion:2,editorDraftId:"editor",providerId:"provider",packageId:null,basePackageRevision:null,state:"incomplete",revision:1,currentStep:2,completedPackageId:null,completedPackageRevision:null,createdAt:"now",updatedAt:"now",progress}}/>);
 fireEvent.click(screen.getByRole("button",{name:"Edit choice group 1"}));
 expect(screen.getByLabelText("Group Name")).toHaveValue("Main dish");
 expect(screen.getByLabelText("Food option 1")).toHaveValue("");
 fireEvent.click(screen.getByRole("button",{name:"Save choice group"}));
 expect(screen.getByRole("alert")).toHaveTextContent("Enter a group name");
 expect(api.update).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
 fireEvent.click(screen.getByRole("button",{name:"Save Progress & Exit"}));
 await waitFor(()=>expect(api.save).toHaveBeenCalledTimes(1));
 expect(api.save.mock.calls[0][0].progress.foodChoiceGroups).toEqual([incomplete]);
 await waitFor(()=>expect(exit).toHaveBeenCalledTimes(1));
});
it("reopens and updates existing private food-choice groups",async()=>{
 const original={id:"main",title:"Main dish",selectionCount:1,
  options:[{id:"chicken",name:"Chicken"},{id:"pork",name:"Pork"}]};
 const withChoices:ProviderPackage={...packageValue,v2:{...packageValue.v2!,foodChoiceGroups:[original]}};
 render(<ProviderPackageForm {...props} initialPackage={withChoices}/>);
 next();next();
 fireEvent.click(screen.getByRole("button",{name:"Edit choice group 1"}));
 expect(screen.getByLabelText("Group Name")).toHaveValue("Main dish");
 expect(screen.getByLabelText("Food option 2")).toHaveValue("Pork");
 fireEvent.change(screen.getByLabelText("Food option 2"),{target:{value:"Fish"}});
 fireEvent.click(screen.getByRole("button",{name:"Save choice group"}));
 next();next();fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(api.update.mock.calls[0][0].foodChoiceGroups[0].options[1].name).toBe("Fish");
});

// Step 3.5B-4: individual food draft save and resume
it("saves and restores unfinished individual food serving options", async () => {
  const exit = vi.fn();

  const initial = {
    editorSchemaVersion: 2 as const,
    editorDraftId: "individual-progress",
    providerId: "provider",
    packageId: null,
    basePackageRevision: null,
    state: "incomplete" as const,
    revision: 3,
    currentStep: 2 as const,
    completedPackageId: null,
    completedPackageRevision: null,
    createdAt: "now",
    updatedAt: "now",
    progress: {
      offerStructure: "individual" as const,
      name: "Individual catering",
      serviceCategoryCode: "catering_service",
      individualFoodDraft: {
        id: "individual_item",
        name: "",
        servingOptions: [{id:"family",name:"Family Size",minimumServingsText:"8",maximumServingsText:"",priceText:"1850.",minimumQuantityText:"",maximumQuantityText:""}],
      },
    },
  };

  api.save.mockImplementationOnce(async (request) => ({
    ...initial,
    revision: 4,
    currentStep: request.currentStep,
    progress: request.progress,
  }));

  const view = render(
    <ProviderPackageForm
      {...props}
      initialEditorProgress={initial}
      onProgressExit={exit}
    />
  );

  expect(screen.getByLabelText("Food product name")).toHaveValue("");

  fireEvent.change(screen.getByLabelText("Food product name"), {
    target: {value: "Pancit Canton Bilao"},
  });

  fireEvent.click(screen.getByRole("button", {
    name: "Save Progress & Exit",
  }));

  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(exit).toHaveBeenCalledTimes(1));

  const request = api.save.mock.calls[0][0];

  expect(request.editorDraftId).toBe("individual-progress");
  expect(request.expectedRevision).toBe(3);
  expect(request.currentStep).toBe(2);
  expect(request.progress.offerStructure).toBe("individual");

  expect(request.progress.individualFoodDraft).toMatchObject({
    id: "individual_item",
    name: "Pancit Canton Bilao",
    servingOptions: [{
      name: "Family Size",
      minimumServingsText: "8",
      maximumServingsText: "",
      priceText: "1850.",
      minimumQuantityText: "",
      maximumQuantityText: "",
    }],
  });

  expect(api.create).not.toHaveBeenCalled();
  expect(api.update).not.toHaveBeenCalled();
  expect(api.legacy).not.toHaveBeenCalled();
  expect(api.complete).not.toHaveBeenCalled();

  // Simulate closing the wizard after the successful save.
  view.unmount();

  // Reopen with the exact progress returned by the mocked save API.
  const returnedDraft = {
    ...initial,
    revision: 4,
    currentStep: request.currentStep,
    progress: request.progress,
  };

  render(
    <ProviderPackageForm
      {...props}
      initialEditorProgress={returnedDraft}
    />
  );

  expect(screen.getByLabelText("Food product name"))
    .toHaveValue("Pancit Canton Bilao");

  fireEvent.click(screen.getByRole("button", {name: "Edit serving option 1"}));

  expect(screen.getByLabelText("Serving name"))
    .toHaveValue("Family Size");

  expect(screen.getByLabelText("Minimum servings"))
    .toHaveValue("8");

  expect(screen.getByLabelText("Maximum servings"))
    .toHaveValue("");

  expect(screen.getByLabelText("Price (PHP)"))
    .toHaveValue("1850.");

  expect(screen.getByLabelText("Minimum quantity"))
    .toHaveValue("");

  expect(screen.getByLabelText("Maximum quantity"))
    .toHaveValue("");

  expect(api.create).not.toHaveBeenCalled();
  expect(api.complete).not.toHaveBeenCalled();
});

it.each(["fixed", "customizable"] as const)("keeps Rice and its dish through %s draft navigation and save",async(structure)=>{
 const choices=structure === "customizable" ? [{id:"main",title:"Main dishes",selectionCount:1,options:[{id:"chicken",name:"Chicken"},{id:"fish",name:"Fish"}]}] : [];
 render(<ProviderPackageForm {...props} initialPackage={{...packageValue,offerStructure:structure,foodInclusions:["Rice: Steamed Rice"],v2:{...packageValue.v2!,offerStructure:structure,foodChoiceGroups:choices}}}/>);
 next();next();next();fireEvent.click(screen.getByRole("button",{name:"Back"}));next();next();
 fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(api.update.mock.calls[0][0]).toMatchObject({foodInclusions:["Rice: Steamed Rice"],...(choices.length ? {foodChoiceGroups:choices} : {}),expectedRevision:7});expect(api.legacy).not.toHaveBeenCalled();
});

it.each(["Minimum guests", "Maximum guests"])("controls %s against business capacity and saves valid edits",async(label)=>{
 render(<ProviderPackageForm {...props} initialPackage={packageValue}/>);next();
 const input=screen.getByLabelText(new RegExp(label)) as HTMLInputElement;
 const original=label === "Minimum guests" ? "10" : "50";
 for(const value of ["200000000000000000000","0","-1","1.5","2e3","101"]) {
  fireEvent.change(input,{target:{value}});expect(input).toHaveValue(original);
  expect(input).toHaveAttribute("aria-invalid","true");
  input.setSelectionRange(0,original.length);fireEvent.paste(input,{clipboardData:{getData:()=>value}});expect(input).toHaveValue(original);
 }
 fireEvent.change(input,{target:{value:""}});expect(input).toHaveValue("");next();
 expect(screen.getByRole("heading",{name:"Step 2: Pricing & capacity"})).toBeVisible();
 fireEvent.change(input,{target:{value:"20"}});expect(input).toHaveValue("20");
 next();next();next();fireEvent.click(screen.getByRole("button",{name:"Save changes"}));
 fireEvent.click(within(screen.getByRole("dialog",{name:"FEASTA Confirmation"})).getByRole("button",{name:"Save changes"}));
 await waitFor(()=>expect(api.update).toHaveBeenCalledTimes(1));
 expect(api.update.mock.calls[0][0]).toMatchObject({minimumGuests:label === "Minimum guests" ? 20 : 10,maximumGuests:label === "Maximum guests" ? 20 : 50,
  serviceOptions:{drop_off:{price:100,includedServices:["Delivery"],equipmentInclusions:["Tier equipment"]}},equipmentInclusions:["Shared warmer"],occasionIds:["birthday","wedding"]});
});
it("enforces the 400 ceiling and revalidates maximum when minimum changes",()=>{
 render(<ProviderPackageForm {...props} maxGuestsPerEvent={500} initialPackage={packageValue}/>);next();
 const min=screen.getByLabelText(/Minimum guests/);const max=screen.getByLabelText(/Maximum guests/);
 fireEvent.change(max,{target:{value:"401"}});expect(max).toHaveValue("50");
 fireEvent.change(max,{target:{value:"400"}});expect(max).toHaveValue("400");
 fireEvent.change(min,{target:{value:"400"}});fireEvent.change(max,{target:{value:"399"}});
 expect(max).toHaveAttribute("aria-invalid","true");next();expect(api.update).not.toHaveBeenCalled();
 fireEvent.change(max,{target:{value:"400"}});expect(max).toHaveAttribute("aria-invalid","false");next();
 expect(screen.getByRole("heading",{name:"Step 3: Food menu"})).toBeVisible();
});

it("allows guest-count prefixes while enforcing the business minimum before saving",()=>{
 render(<ProviderPackageForm {...props} minGuestsPerEvent={20} initialPackage={{...packageValue,minimumGuests:20}}/>);next();
 const input=screen.getByLabelText(/Minimum guests/);
 fireEvent.change(input,{target:{value:"2"}});expect(input).toHaveValue("2");expect(input).toHaveAttribute("aria-invalid","true");
 next();expect(screen.getByRole("heading",{name:"Step 2: Pricing & capacity"})).toBeVisible();expect(api.update).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:"20"}});expect(input).toHaveAttribute("aria-invalid","false");next();
 expect(screen.getByRole("heading",{name:"Step 3: Food menu"})).toBeVisible();
});
