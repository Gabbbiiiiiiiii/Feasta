import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect, it, vi} from "vitest";
import {ProviderServiceForm} from "@/app/provider/services/provider-service-form";
import {ProviderServicesClient} from "@/app/provider/services/provider-services-client";
import {offerNameError, offerDescriptionError, offerNameKey, serviceGuestLimitsError} from "@/lib/provider/provider-offer-policy";
import {parseServicePriceText} from "@/lib/provider/provider-service-price";
const mutations=vi.hoisted(() => ({create:vi.fn(),update:vi.fn(),list:vi.fn(),publish:vi.fn()}));
vi.mock("@/lib/provider/provider-service-client", () => ({
  createProviderService:mutations.create, updateProviderService:mutations.update,
  listProviderServices:mutations.list, publishProviderService:mutations.publish, archiveProviderService:vi.fn(),
}));
import type {ProviderService} from "@/lib/provider/provider-service-client";
vi.mock("@/lib/provider/provider-media-client", () => ({deleteProviderServiceImage:vi.fn(),uploadProviderServiceImage:vi.fn(),uploadServicePortfolioPhoto:vi.fn()}));
function mount(existingServices: {id:string;name:string;isDeleted:boolean}[]=[]) {
  render(<ProviderServiceForm existingServices={existingServices} serviceCategories={["photo_booth"]} serviceCategoryOptions={[{code:"photo_booth",name:"Photo Booth",serviceType:"addon",status:"active"}]} onSaved={vi.fn()} onCancel={vi.fn()} />);
  return {name:screen.getByRole("textbox",{name:/Service name/}),price:screen.getByRole("textbox",{name:/^Price/})};
}
it.each(["", "  ", "a", "ab", "12345", "!!!", "Wedding qqqqq", "A".repeat(81)])("blocks invalid offer name %j", (value) => expect(offerNameError(value)).not.toBeNull());
it.each(["Wedding Package", "  Niño's Party  ", "摄影套餐", "Party & Photos - 2026"])("accepts legitimate offer name %s", (value) => expect(offerNameError(value)).toBeNull());
it("trims names for case-insensitive duplicate comparison", () => expect(offerNameKey("  Wedding   PHOTO ")).toBe(offerNameKey("wedding photo")));
it.each(["", "   ", "A useful package description."])("permits blank or meaningful optional descriptions", (value) => expect(offerDescriptionError(value)).toBeNull());
it.each(["a", "Too short", "x".repeat(501)])("rejects short or overlong descriptions", (value) => expect(offerDescriptionError(value)).not.toBeNull());
it("uses pricing-specific price floors and ceilings", () => {
  expect(parseServicePriceText("499.99","fixed")).toBeNull();
  expect(parseServicePriceText("500","fixed")).toBe(500);
  expect(parseServicePriceText("9999999.00","fixed")).toBe(9999999);
  expect(parseServicePriceText("9999999.01","fixed")).toBeNull();
  expect(parseServicePriceText("150","per_guest")).toBe(150);
  expect(parseServicePriceText("50000","per_guest")).toBe(50000);
  expect(parseServicePriceText("50000.01","per_guest")).toBeNull();
});
it("checks guest limits only for per-guest offers", () => {
  expect(serviceGuestLimitsError("fixed",null,null)).toBeNull();
  expect(serviceGuestLimitsError("per_guest",10,50)).toBeNull();
  for (const [minimum,maximum] of [[0,50],[10,9],[10,10001],[10.5,50]]) expect(serviceGuestLimitsError("per_guest",minimum,maximum)).not.toBeNull();
});
it("shows the live name counter and duplicate error", () => {
  const {name}=mount([{id:"other",name:"Wedding Photo",isDeleted:false}]);
  expect(name).toHaveAttribute("maxlength","80");
  fireEvent.change(name,{target:{value:"  wedding PHOTO  "}});
  expect(name).toHaveAccessibleDescription("You already have a package with this name.");
  expect(screen.getByText("17 / 80")).toBeInTheDocument();
});
it("guards typed and pasted currency and formats it on blur", async () => {
  const user=userEvent.setup();
  const {price}=mount();
  await user.click(price);
  await user.type(price,"12000.25");
  expect(price).toHaveValue("12000.25");
  await user.tab();
  expect(price).toHaveValue("12,000.25");
  await user.click(price);
  fireEvent.change(price,{target:{value:"11111111111111111"}});
  expect(price).toHaveValue("12000.25");
  expect(price).toHaveAttribute("aria-invalid","true");
  expect(price.className).toContain("aria-invalid:focus-visible:ring-red-500/20");
  fireEvent.change(price,{target:{value:"500.00"}});
  expect(price).not.toHaveAttribute("aria-invalid","true");
  const event=new KeyboardEvent("keydown",{key:"e",bubbles:true,cancelable:true});
  price.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});
it("requires guest limits when per-guest pricing is selected", () => {
  mount();
  fireEvent.change(screen.getByRole("combobox",{name:/Pricing type/}),{target:{value:"per_guest"}});
  const minimum=screen.getByRole("textbox",{name:/Minimum guests/});
  expect(minimum).toBeRequired();
  expect(minimum).toHaveAttribute("aria-invalid","true");
  fireEvent.change(minimum,{target:{value:"10"}});
  fireEvent.change(screen.getByRole("textbox",{name:/Maximum guests/}),{target:{value:"50"}});
  expect(minimum).not.toHaveAttribute("aria-invalid","true");
});

const serviceRecord: ProviderService={id:"existing-offer",providerId:"provider",name:"Wedding Photos",description:"",category:"photo_booth",pricingType:"fixed",price:500,imageUrl:"https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/owner/services/existing-offer/photo.png",imagePublicId:"photo",status:"draft",isActive:false,isAvailable:false,isPublished:false,isDeleted:false};
it("displays a stale duplicate-name rejection beside the package name",async()=>{
  const spy=vi.spyOn(console,"error").mockImplementation(()=>{});
  mutations.update.mockRejectedValueOnce(new Error("You already have a package with this name."));
  render(<ProviderServiceForm initialService={serviceRecord} serviceCategories={["photo_booth"]} serviceCategoryOptions={[{code:"photo_booth",name:"Photo Booth",serviceType:"addon",status:"active"}]} onSaved={vi.fn()} onCancel={vi.fn()} />);
  const name=screen.getByRole("textbox",{name:/Service name/});
  fireEvent.submit(name.closest("form")!);
  await waitFor(()=>expect(name).toHaveAccessibleDescription("You already have a package with this name."));
  expect(screen.getAllByText("You already have a package with this name.")).toHaveLength(1);
  fireEvent.change(name,{target:{value:"Other Wedding Photos"}});
  expect(name).not.toHaveAttribute("aria-invalid","true");
  spy.mockRestore();
});
it("restores and submits per-guest capacity without dropping saved limits",async()=>{
  mutations.update.mockResolvedValueOnce({success:true});
  render(<ProviderServiceForm initialService={{...serviceRecord,pricingType:"per_guest",price:150,minimumGuests:10,maximumGuests:50}} serviceCategories={["photo_booth"]} serviceCategoryOptions={[{code:"photo_booth",name:"Photo Booth",serviceType:"addon",status:"active"}]} onSaved={vi.fn()} onCancel={vi.fn()} />);
  const minimum=screen.getByRole("textbox",{name:/Minimum guests/});
  expect(minimum).toHaveValue("10");
  fireEvent.submit(minimum.closest("form")!);
  await waitFor(()=>expect(mutations.update).toHaveBeenCalledWith("existing-offer",expect.objectContaining({price:150,minimumGuests:10,maximumGuests:50})));
});

it("leaves missing legacy guest limits blank and saves only provider-entered limits", async () => {
  mutations.update.mockClear().mockResolvedValueOnce({success:true});
  render(<ProviderServiceForm initialService={{...serviceRecord,pricingType:"per_guest",price:150}}
    serviceCategories={["photo_booth"]} serviceCategoryOptions={[{code:"photo_booth",name:"Photo Booth",serviceType:"addon",status:"active"}]}
    onSaved={vi.fn()} onCancel={vi.fn()} />);
  const minimum = screen.getByRole("textbox", {name:/Minimum guests/});
  const maximum = screen.getByRole("textbox", {name:/Maximum guests/});
  expect(minimum).toHaveValue("");
  expect(maximum).toHaveValue("");
  const form = minimum.closest("form")!;
  fireEvent.submit(form);
  expect(mutations.update).not.toHaveBeenCalled();
  fireEvent.change(minimum, {target:{value:"15"}});
  fireEvent.change(maximum, {target:{value:"75"}});
  fireEvent.submit(form);
  await waitFor(() => expect(mutations.update).toHaveBeenCalledWith(
    "existing-offer", expect.objectContaining({minimumGuests:15,maximumGuests:75,expectedRevision:0}),
  ));
});

it("routes a legacy draft to the editor and still displays a published legacy service", async () => {
  const draft = {...serviceRecord, name:"Legacy draft", pricingType:"per_guest", price:150};
  mutations.list.mockResolvedValue([
    draft,
    {...draft, id:"published-offer", name:"Published legacy offer", status:"published",
      isActive:true, isPublished:true, isAvailable:true},
  ]);
  render(<ProviderServicesClient providerId="provider" serviceCategories={["photo_booth"]}
    serviceCategoryOptions={[{code:"photo_booth",name:"Photo Booth",serviceType:"addon",status:"active"}]} />);
  const setLimits = await screen.findByRole("button", {name:"Set guest limits for Legacy draft"});
  expect(screen.getByRole("button", {name:"View Published legacy offer"})).toBeVisible();
  expect(screen.queryByRole("button", {name:"Publish Legacy draft"})).toBeNull();
  fireEvent.click(setLimits);
  expect(screen.getByRole("textbox", {name:/Minimum guests/})).toHaveValue("");
  expect(mutations.publish).not.toHaveBeenCalled();
});
