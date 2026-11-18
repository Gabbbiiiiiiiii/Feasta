import {fireEvent, render, screen} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {ProviderServiceForm} from "@/app/provider/services/provider-service-form";
import {isServicePriceAmount, parseServicePriceText} from "@/lib/provider/provider-service-price";
const mocks=vi.hoisted(() => ({create:vi.fn(),update:vi.fn()}));
vi.mock("@/lib/provider/provider-service-client", () => ({createProviderService:mocks.create,updateProviderService:mocks.update}));
vi.mock("@/lib/provider/provider-media-client", () => ({deleteProviderServiceImage:vi.fn(),uploadProviderServiceImage:vi.fn(),uploadServicePortfolioPhoto:vi.fn()}));
it.each(["", " ", "1e3", "-1", "+1", "1.234", "1,000", "NaN", "Infinity", "10000000.00", "99999999999999999999", ".", "12."])("rejects invalid price text %j", (value) => {
  expect(parseServicePriceText(value)).toBeNull();
});
it.each([["500",500],["500.29",500.29],["501.01",501.01],["25000.50",25000.5],["9999999.00",9999999]])("accepts exact currency %s", (value, amount) => {
  expect(parseServicePriceText(String(value))).toBe(amount);
  expect(isServicePriceAmount(amount)).toBe(true);
});
it.each([null,undefined,NaN,Infinity,-1,1.234,100000000.01])("rejects malformed numeric save amounts %s", (value) => {
  expect(isServicePriceAmount(value)).toBe(false);
});
function mount() {
  render(<ProviderServiceForm serviceCategories={["photo_booth"]} serviceCategoryOptions={[{code:"photo_booth",name:"Photo Booth",serviceType:"addon",status:"active"}]} onSaved={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.change(screen.getByRole("textbox",{name:/Service name/}),{target:{value:"Photo booth package"}});
}
it("shows a required-price error and blocks a blank save", () => {
  mount();
  const price=screen.getByRole("textbox",{name:/^Price/});
  expect(price).toHaveValue("");
  expect(price).toHaveAttribute("aria-invalid","true");
  expect(price).toHaveAccessibleDescription("Enter a service price.");
  fireEvent.submit(price.closest("form")!);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("rejects excess decimals without replacing the previous value and clears the error after correction", () => {
  mount();
  const price=screen.getByRole("textbox",{name:/^Price/});
  fireEvent.change(price,{target:{value:"12.345"}});
  expect(price).toHaveValue("");
  expect(price).toHaveAttribute("aria-invalid","true");
  expect(price).toHaveAccessibleDescription(/2 decimal places/);
  fireEvent.change(price,{target:{value:"1200.35"}});
  expect(price).not.toHaveAttribute("aria-invalid","true");
});
