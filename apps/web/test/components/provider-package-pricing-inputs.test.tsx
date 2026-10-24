import {useState} from "react";
import {fireEvent, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {ProviderPackageMoneyInput} from "@/app/provider/packages/provider-package-money-input";
import {ProviderPackagePricePreview} from "@/app/provider/packages/provider-package-price-preview";
import {ProviderPackageOfferBuilder, createProviderPackageOfferDraft, serializeProviderPackageOfferDraft} from "@/app/provider/packages/provider-package-offer-builder";
import {packageMoneyCentavos, packagePreviewGuestCount, packagePreviewSubtotal} from "@/lib/provider/package-pricing-preview";

vi.mock("@/lib/provider/provider-media-client", () => ({uploadProviderServiceImage: vi.fn()}));

function MoneyHarness({initial = ""}: {initial?: string}) {
  const [field, setField] = useState<{value: string; error?: string}>({value: initial});
  return <label>Tier price<ProviderPackageMoneyInput {...field} onChange={(value, error) => setField({value, error})} /></label>;
}

function PreviewHarness() {
  const [model, setModel] = useState<"per_pax" | "per_bundle">("per_pax");
  const [guests, setGuests] = useState("");
  const [tier, setTier] = useState("");
  const [maximum, setMaximum] = useState("30");
  const [draft, setDraft] = useState(createProviderPackageOfferDraft({serviceOptions: {
    drop_off: {price: 12.35, includedServices: []}, buffet_setup: {price: 28.75, includedServices: []},
  }}));
  const validated = packagePreviewGuestCount({guestCount: guests, minimumGuests: "10", maximumGuests: maximum,
    providerMinimumGuests: 5, providerMaximumGuests: 200});
  return <>
    <label>Pricing model<select value={model} onChange={(event) => setModel(event.target.value as typeof model)}><option value="per_pax">Per Pax</option><option value="per_bundle">Per Bundle</option></select></label>
    <label>Package maximum<input value={maximum} onChange={(event) => setMaximum(event.target.value)} /></label>
    <ProviderPackagePricePreview name="Test" pricingModel={model} minimumGuests="10" maximumGuests={maximum}
      guestCount={guests} onGuestCountChange={setGuests} validatedGuestCount={validated}
      selectedTier={tier} onTierChange={setTier} offerDraft={draft} />
    <ProviderPackageOfferBuilder section="pricing" value={draft} onChange={setDraft} />
  </>;
}

describe("decimal tier prices", () => {
  it.each(["1e3", "1E3", "+1", "-1", "Infinity", "NaN", "1.234", "1..2", "1,000"])("rejects %s without truncation or losing the saved price", (invalid) => {
    render(<MoneyHarness initial="123.45" />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("inputmode", "decimal");
    fireEvent.change(input, {target: {value: invalid}});
    expect(input).toHaveValue("123.45");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Exponents and signs are not allowed");
  });

  it("supports typing, selection replacement, paste, and deletion without making empty zero", async () => {
    const user = userEvent.setup();
    render(<MoneyHarness />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input).toHaveValue("");
    await user.type(input, "193.45");
    input.setSelectionRange(1, 2);
    await user.paste("8");
    expect(input).toHaveValue("183.45");
    await user.clear(input);
    expect(input).toHaveValue("");
    expect(packageMoneyCentavos(input.value)).toBeNull();
    await user.paste("42.75");
    expect(input).toHaveValue("42.75");
    await user.keyboard("{Control>}a{/Control}");
    await user.paste("1e3");
    expect(input).toHaveValue("42.75");
  });

  it("stages IME text and validates only the completed composition", () => {
    render(<MoneyHarness initial="12.35" />);
    const input = screen.getByRole("textbox");
    fireEvent.compositionStart(input);
    fireEvent.change(input, {target: {value: "１２"}});
    expect(input).toHaveValue("１２");
    fireEvent.compositionEnd(input);
    expect(input).toHaveValue("12.35");
    fireEvent.compositionStart(input);
    fireEvent.change(input, {target: {value: "45.67"}});
    fireEvent.compositionEnd(input);
    expect(input).toHaveValue("45.67");
  });

  it("enforces precision and bounds, preserves saved values, and creates no preset prices", () => {
    const draft = createProviderPackageOfferDraft();
    expect(Object.values(draft.serviceOptions).every((option) => option.price === "")).toBe(true);
    const hydrated = createProviderPackageOfferDraft({serviceOptions: {drop_off: {price: 123.45, includedServices: []}}});
    expect(hydrated.serviceOptions.drop_off.price).toBe("123.45");
    for (const value of ["", ".", "1e3", "1.234", "10000000.01"]) {
      hydrated.serviceOptions.drop_off.price = value;
      expect(serializeProviderPackageOfferDraft(hydrated).error).not.toBeNull();
    }
    expect(packageMoneyCentavos("10000000")).toBe(1_000_000_000);
    expect(packageMoneyCentavos("0")).toBe(0);
    expect(packageMoneyCentavos(".25")).toBe(25);
  });
});

describe("dynamic price preview", () => {
  it("uses each entered tier price and explicit guest count, and keeps bundles fixed", () => {
    render(<PreviewHarness />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Enter a price and guest count to preview the total.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Preview service tier"), {target: {value: "drop_off"}});
    fireEvent.change(screen.getByLabelText("Preview guest count"), {target: {value: "12"}});
    expect(screen.getByRole("status")).toHaveTextContent("PHP 148.20 estimated subtotal");
    fireEvent.change(screen.getByLabelText("Preview guest count"), {target: {value: "20"}});
    expect(screen.getByRole("status")).toHaveTextContent("PHP 247.00 estimated subtotal");
    fireEvent.change(screen.getByLabelText("Preview service tier"), {target: {value: "buffet_setup"}});
    expect(screen.getByRole("status")).toHaveTextContent("PHP 575.00 estimated subtotal");
    fireEvent.change(screen.getByLabelText("Pricing model"), {target: {value: "per_bundle"}});
    expect(screen.getByRole("status")).toHaveTextContent("PHP 28.75 fixed package = PHP 28.75 estimated subtotal");
    fireEvent.change(screen.getByLabelText("Preview guest count"), {target: {value: "10"}});
    expect(screen.getByRole("status")).toHaveTextContent("PHP 28.75 estimated subtotal");
  });

  it("clears stale totals after invalid prices, missing counts, disabled tiers, or changed capacity", () => {
    render(<PreviewHarness />);
    const guestCount = screen.getByLabelText("Preview guest count");
    fireEvent.change(screen.getByLabelText("Preview service tier"), {target: {value: "drop_off"}});
    fireEvent.change(guestCount, {target: {value: "12"}});
    expect(screen.getByRole("status")).toBeVisible();
    const price = screen.getByLabelText(/Drop-Off Catering price/);
    fireEvent.change(price, {target: {value: "1e3"}});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.change(price, {target: {value: "13.25"}});
    expect(screen.getByRole("status")).toHaveTextContent("PHP 159.00 estimated subtotal");
    fireEvent.change(screen.getByLabelText("Package maximum"), {target: {value: "11"}});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Package maximum"), {target: {value: "30"}});
    fireEvent.change(guestCount, {target: {value: ""}});
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.change(guestCount, {target: {value: "12"}});
    fireEvent.click(screen.getByRole("checkbox", {name: /Drop-Off Catering/}));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(packagePreviewSubtotal({pricingModel: "per_pax", unitPrice: "10000000", guestCount: 2})).toBeNull();
  });
});
