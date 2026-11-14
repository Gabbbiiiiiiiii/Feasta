import type {OfferV2, ServiceOptionV2, Tier} from "@feasta/shared-types/provider-package-v2";
import {exact, invalid, normalizedText, plainText, record} from "./v2-validation.js";
import {parseFoodChoiceGroupsV2, FoodChoiceValidationError} from "./food-choice-groups-v2.js";

const tiers: readonly Tier[] = ["drop_off", "buffet_setup", "full_service"];

/** Convert the exact decimal representation once; do not round excess precision. */
export function phpCentavos(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 10_000_000) {
    return invalid("INVALID_PRICE");
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return invalid("INVALID_PRICE");
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return invalid("INVALID_PRICE");
  return cents;
}

export function inclusionList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50) return invalid("INVALID_INCLUSION");
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const display = plainText(item, 1, 160, "INVALID_INCLUSION", true);
    const key = normalizedText(display);
    if (!seen.has(key)) {
      result.push(display);
      seen.add(key);
    }
  }
  return result;
}

function optionalInclusions(v: Record<string, unknown>, key: string): {[key: string]: string[]} {
  return Object.hasOwn(v, key) ? {[key]: inclusionList(v[key])} : {};
}

export function parseServiceOptionV2(value: unknown): ServiceOptionV2 {
  const v = exact(value, ["price", "includedServices"],
    ["decorInclusions", "furnitureInclusions", "equipmentInclusions"], "INVALID_INCLUSION");
  phpCentavos(v.price);
  return {price: v.price as number, includedServices: inclusionList(v.includedServices),
    ...optionalInclusions(v, "decorInclusions"), ...optionalInclusions(v, "furnitureInclusions"),
    ...optionalInclusions(v, "equipmentInclusions")};
}

/** allowHistoricalStandalone must be determined by the server, never accepted from a request. */
export function parseOfferV2(value: unknown, allowHistoricalStandalone = false): OfferV2 {
  const v = exact(value, ["offerSchemaVersion", "serviceOptions", "serviceInclusions",
    "decorInclusions", "furnitureInclusions", "foodInclusions", "price"],
  ["equipmentInclusions", "pricingModel", "foodChoiceGroups"], "INVALID_INCLUSION");
  if (v.offerSchemaVersion !== 2 || Object.hasOwn(v, "pricingModel") &&
      v.pricingModel !== "per_pax" && v.pricingModel !== "per_bundle") {
    return invalid("INVALID_INCLUSION");
  }
  const options = record(v.serviceOptions, "INVALID_INCLUSION");
  if (Object.keys(options).some((k) => !tiers.includes(k as Tier))) {
    return invalid("INVALID_INCLUSION");
  }
  const serviceOptions: OfferV2["serviceOptions"] = {};
  for (const tier of tiers) {
    if (Object.hasOwn(options, tier)) serviceOptions[tier] = parseServiceOptionV2(options[tier]);
  }
  const prices = Object.values(serviceOptions).map((o) => phpCentavos(o.price));
  const starting = phpCentavos(v.price);
  if (!prices.length && !allowHistoricalStandalone ||
      prices.length && starting !== Math.min(...prices)) {
    return invalid("INVALID_PRICE");
  }
  return {
    offerSchemaVersion: 2, serviceOptions, price: v.price as number,
    serviceInclusions: inclusionList(v.serviceInclusions),
    decorInclusions: inclusionList(v.decorInclusions),
    furnitureInclusions: inclusionList(v.furnitureInclusions),
    foodInclusions: inclusionList(v.foodInclusions),
    ...(Object.hasOwn(v, "foodChoiceGroups") ?
      {foodChoiceGroups: parseMealGroups(v.foodChoiceGroups)} : {}),
    ...optionalInclusions(v, "equipmentInclusions"),
    ...(Object.hasOwn(v, "pricingModel") ?
      {pricingModel: v.pricingModel as "per_pax" | "per_bundle"} : {}),
  };
}

function parseMealGroups(value: unknown) {
  try {return parseFoodChoiceGroupsV2(value);}
  catch (error) {
    if (error instanceof FoodChoiceValidationError) return invalid("INVALID_FOOD_CHOICE_GROUP");
    throw error;
  }
}

function sharedFirst(shared: string[], selected: string[] = []): string[] {
  const seen = new Set<string>();
  return [...shared, ...selected].filter((item) => {
    const key = normalizedText(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolveOfferV2(
  value: unknown, selectedTier: unknown, allowHistoricalStandalone = false,
) {
  const offer = parseOfferV2(value, allowHistoricalStandalone);
  const hasTiers = Object.keys(offer.serviceOptions).length > 0;
  const tier = typeof selectedTier === "string" && tiers.includes(selectedTier as Tier) ?
    selectedTier as Tier : null;
  if (hasTiers ? !tier || !offer.serviceOptions[tier] : selectedTier !== null) {
    return invalid("INVALID_INCLUSION");
  }
  const option = tier ? offer.serviceOptions[tier] : undefined;
  return {
    tier, unitCentavos: phpCentavos(option?.price ?? offer.price),
    serviceInclusions: sharedFirst(offer.serviceInclusions, option?.includedServices),
    decorInclusions: sharedFirst(offer.decorInclusions, option?.decorInclusions),
    furnitureInclusions: sharedFirst(offer.furnitureInclusions, option?.furnitureInclusions),
    equipmentInclusions: sharedFirst(offer.equipmentInclusions ?? [], option?.equipmentInclusions),
    foodInclusions: [...offer.foodInclusions],
  };
}

/** Isolated arithmetic only. Existing booking/payment calculations remain authoritative. */
export function offerTotalCentavos(
  unitCentavos: number, guests: number, minimum: number, maximum: number,
  model?: "per_pax" | "per_bundle",
): number {
  if (![guests, minimum, maximum].every((n) => Number.isSafeInteger(n) && n >= 1 && n <= 100_000) ||
      minimum > maximum || guests < minimum || guests > maximum ||
      !Number.isSafeInteger(unitCentavos) || unitCentavos < 1 || unitCentavos > 1_000_000_000 ||
      model !== undefined && model !== "per_pax" && model !== "per_bundle") {
    return invalid("INVALID_PRICE");
  }
  const total = unitCentavos * (model === "per_pax" ? guests : 1);
  if (!Number.isSafeInteger(total)) return invalid("INVALID_PRICE");
  return total;
}
