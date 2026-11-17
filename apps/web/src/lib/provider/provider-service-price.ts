export const MAX_SERVICE_PRICE = 9_999_999;
export function servicePriceBounds(pricingType: string) {
  return {minimum:pricingType==="fixed"?500:pricingType==="per_guest"?150:0.01,
    maximum:pricingType==="per_guest"?50000:MAX_SERVICE_PRICE};
}
export function isServicePriceAmount(value: unknown, pricingType="fixed"): value is number {
  const {minimum,maximum}=servicePriceBounds(pricingType);
  return typeof value==="number" && Number.isFinite(value) && value>=minimum &&
    value<=maximum && /^\d+(?:\.\d{1,2})?$/u.test(String(value));
}
export function parseServicePriceText(value: string, pricingType="fixed"): number | null {
  const normalized=value.trim();
  if (!/^(?:\d{1,7}(?:\.\d{1,2})?|\.\d{1,2})$/u.test(normalized)) return null;
  const amount=Number(normalized);
  return isServicePriceAmount(amount,pricingType)?amount:null;
}
export function servicePriceError(pricingType: string): string {
  const {minimum,maximum}=servicePriceBounds(pricingType);
  return `Enter a price from PHP ${minimum.toLocaleString("en-PH",{minimumFractionDigits:2})} to PHP ${maximum.toLocaleString("en-PH",{minimumFractionDigits:2})} with at most two decimal places.`;
}
