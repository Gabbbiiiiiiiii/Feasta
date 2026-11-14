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
