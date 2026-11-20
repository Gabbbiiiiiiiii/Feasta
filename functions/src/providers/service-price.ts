import {HttpsError} from "firebase-functions/v2/https";
export function parseServicePrice(value: unknown, pricingType: string): number | null {
  if (pricingType==="custom_quote") return null;
  const minimum=pricingType==="fixed"?500:pricingType==="per_guest"?150:0.01;
  const maximum=pricingType==="per_guest"?50000:9999999;
  if (typeof value!=="number" || !Number.isFinite(value) || value<minimum ||
      value>maximum || !/^\d+(?:\.\d{1,2})?$/u.test(String(value))) {
    throw new HttpsError("invalid-argument",
      `Enter a service price from PHP ${minimum} to PHP ${maximum} ` +
      "with at most two decimal places.");
  }
  return value;
}
