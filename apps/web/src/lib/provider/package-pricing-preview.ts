export const MAX_PACKAGE_PRICE_CENTAVOS = 1_000_000_000;

/** Editing permits empty text and an unfinished decimal; final parsing does not. */
export function isPackageMoneyEdit(value: string): boolean {
  return /^\d*(?:\.\d{0,2})?$/u.test(value);
}

export function packageMoneyCentavos(value: string): number | null {
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/u.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_PACKAGE_PRICE_CENTAVOS ? cents : null;
}

export function packagePreviewGuestCount(input: {
  guestCount: string; minimumGuests: string; maximumGuests: string;
  providerMinimumGuests: number; providerMaximumGuests: number;
}): number | null {
  const values = [input.guestCount, input.minimumGuests, input.maximumGuests];
  if (values.some((value) => !/^\d+$/u.test(value))) return null;
  const [guests, minimum, maximum] = values.map(Number);
  if (![guests, minimum, maximum].every(Number.isSafeInteger) || minimum < 1 ||
    minimum < input.providerMinimumGuests || maximum > input.providerMaximumGuests ||
    maximum > 100_000 || minimum > maximum || guests < minimum || guests > maximum) return null;
  return guests;
}

export function packagePreviewSubtotal(input: {
  pricingModel: "per_pax" | "per_bundle" | "legacy";
  unitPrice: string; guestCount: number | null; priceError?: string;
}): number | null {
  const unitCents = packageMoneyCentavos(input.unitPrice);
  if (input.priceError || unitCents === null || input.guestCount === null ||
    !Number.isSafeInteger(input.guestCount) || input.guestCount < 1) return null;
  const cents = unitCents * (input.pricingModel === "per_pax" ? input.guestCount : 1);
  return Number.isSafeInteger(cents) && cents <= MAX_PACKAGE_PRICE_CENTAVOS ? cents : null;
}

export const formatPackageCentavos = (cents: number) => "PHP " + (cents / 100).toLocaleString("en-PH", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
