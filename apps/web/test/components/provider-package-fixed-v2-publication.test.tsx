import {fireEvent, render, screen} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProviderPackageCard} from "@/app/provider/packages/provider-package-card";
import type {ProviderPackage} from "@/lib/provider/provider-package-client";
vi.mock("@/lib/provider/provider-package-v2-client",()=>({packageV2PublicationEnabled:true}));
const base:ProviderPackage={id:"draft",providerId:"provider",name:"Fixed catering",description:"Complete catering package.",eventType:"birthday",serviceCategoryCode:"catering_service",price:100,serviceOptions:{drop_off:{price:100,includedServices:[]}},themeOptions:[],paymentPolicy:"full_payment",depositPercentage:100,downPaymentPercentage:100,balanceDueDaysBeforeEvent:null,minimumGuests:10,maximumGuests:50,imageUrl:"",imageUrls:[],foodInclusions:["Rice"],decorInclusions:[],furnitureInclusions:[],serviceInclusions:[],status:"draft",isActive:false,isPublished:false,providerPubliclyVisible:false,offerStructure:"fixed",pricingModel:"per_pax"};
it.each(["fixed","customizable"] as const)("enables reviewed saved %s V2 contracts for either pricing model",(offerStructure)=>{
 for(const pricingModel of ["per_pax","per_bundle"] as const){
  const publish=vi.fn();const view=render(<ProviderPackageCard item={{...base,offerStructure,pricingModel,v2:{revision:1,publicationReady:true,occasionScope:"specific",occasionIds:["birthday"],serviceOptions:{drop_off:{price:100,includedServices:[]}},equipmentInclusions:[]}}} onPublish={publish} onEdit={vi.fn()} onArchive={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button",{name:"Publish Fixed catering"}));expect(publish).toHaveBeenCalledTimes(1);view.unmount();
 }
});
it.each([undefined,false])("blocks V2 contracts with saved readiness %s despite enabled flags",(publicationReady)=>{
 render(<ProviderPackageCard item={{...base,v2:{revision:1,publicationReady,occasionScope:"specific",occasionIds:["birthday"],serviceOptions:{drop_off:{price:100,includedServices:[]}},equipmentInclusions:[]}}} onPublish={vi.fn()} onEdit={vi.fn()} onArchive={vi.fn()}/>);
 expect(screen.getByRole("button",{name:"Publish Fixed catering"})).toBeDisabled();
});
it("keeps incomplete Fixed drafts available for review without allowing publication",()=>{
 const edit=vi.fn();render(<ProviderPackageCard item={base} onPublish={vi.fn()} onEdit={edit} onArchive={vi.fn()}/>);
 expect(screen.getByRole("button",{name:"Publish Fixed catering"})).toBeDisabled();
 expect(screen.getByText(/This draft has no saved V2 contract/)).toBeVisible();
 fireEvent.click(screen.getByRole("button",{name:"Edit Fixed catering"}));expect(edit).toHaveBeenCalledTimes(1);
});
it("blocks Individual Food even if saved readiness and client flags are true",()=>{
 render(<ProviderPackageCard item={{...base,offerStructure:"individual",v2:{revision:1,publicationReady:true,occasionScope:"specific",occasionIds:["birthday"],serviceOptions:{drop_off:{price:100,includedServices:[]}},equipmentInclusions:[]}}} onPublish={vi.fn()} onEdit={vi.fn()} onArchive={vi.fn()}/>);
 expect(screen.getByRole("button",{name:"Publish Fixed catering"})).toBeDisabled();
});
it("shows Edit, View, and Archive actions for published packages and hides Edit for archived packages",()=>{
 const edit=vi.fn();
 const published:ProviderPackage={...base,id:"pub-1",status:"published",isActive:true,isPublished:true,providerPubliclyVisible:true,paymentPolicy:"deposit_then_balance",fullPaymentAllowed:true,depositPercentage:50};
 const view=render(<ProviderPackageCard item={published} onPublish={vi.fn()} onEdit={edit} onArchive={vi.fn()}/>);
 expect(screen.getByText("50% Down Payment & Full Payment")).toBeVisible();
 expect(screen.queryByText("Down payment")).not.toBeInTheDocument();
 expect(screen.queryByText("Balance due")).not.toBeInTheDocument();
 expect(screen.queryByText("Short notice")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Edit Fixed catering"}));
 expect(edit).toHaveBeenCalledTimes(1);
 expect(screen.getByRole("button",{name:"View Fixed catering"})).toBeVisible();
 expect(screen.getByRole("button",{name:"Archive Fixed catering"})).toBeVisible();
 expect(screen.queryByRole("button",{name:"Publish Fixed catering"})).toBeNull();
 view.unmount();

 render(<ProviderPackageCard item={{...base,id:"arch-1",status:"archived"}} onPublish={vi.fn()} onEdit={vi.fn()} onArchive={vi.fn()}/>);
 expect(screen.queryByRole("button",{name:"Edit Fixed catering"})).toBeNull();
});
