import {cateringPackageServiceTierLabel, normalizeCateringPackageServiceTier} from "@/lib/catering/catering-service-tier";

export type RequestPackageSnapshot = {
  v2: boolean;
  tier: string | null;
  pricingModel: string | null;
  price: number | null;
  theme: {name: string; description: string | null; images: string[]} | null;
  foodChoices: {title: string; dishes: string[]}[];
  inclusions: {title: string; items: string[]}[];
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string | null => typeof value === "string" ? value.trim().slice(0, 2048) || null : null;
const strings = (value: unknown): string[] => {
  const seen = new Set<string>();
  return Array.isArray(value) ? value.slice(0, 50).map(text).filter((s): s is string => {
    if (!s) return false;
    const key = s.normalize("NFKC").toLocaleLowerCase("en-PH").replace(/\s+/gu, " ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) : [];
};
const money = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/** Only stored booking records enter this projection; never consult the editable package. */
export function requestPackageSnapshot(data: Record<string, unknown>, parent: Record<string, unknown> | null = null): RequestPackageSnapshot {
  const offer = record(data.packageOfferSnapshotV2);
  const tier = normalizeCateringPackageServiceTier(data.serviceTier);
  const themeName = text(data.packageThemeName);
  const v2 = Object.keys(offer).length > 0;
  const selections = data.foodChoiceSelections ?? parent?.foodChoiceSelections;
  // Submission stores a package-only service row, separate from add-ons and request totals.
  const packageRows = Array.isArray(data.services) ? data.services.map(record).filter(row =>
    row.category === "catering_package" && typeof data.packageId === "string" && row.serviceId === data.packageId) : [];
  const categories = [
    ["Fixed food inclusions", offer.foodInclusions ?? data.selectedFoods ?? parent?.selectedFoods],
    ["Decoration inclusions", offer.decorInclusions ?? data.selectedDecorations ?? parent?.selectedDecorations],
    ["Furniture inclusions", offer.furnitureInclusions ?? data.selectedFurniture ?? parent?.selectedFurniture],
    ["Equipment inclusions", offer.equipmentInclusions],
    ["Included services", offer.serviceInclusions ?? data.serviceTierIncludedServices],
  ] as const;
  return {
    v2,
    tier: text(data.serviceTierLabel) ?? (tier ? cateringPackageServiceTierLabel(tier) : null),
    pricingModel: offer.pricingModel === "per_pax" ? "Per guest" : offer.pricingModel === "per_bundle" ? "Per bundle" : offer.pricingModel === "legacy" ? "Fixed package price" : null,
    price: money(data.packagePrice) ?? money(parent?.packagePrice) ?? (packageRows.length === 1 ? money(packageRows[0].price) : null),
    theme: themeName ? {name: themeName, description: text(data.packageThemeDescription), images: strings(data.packageThemeImageUrls).filter(url => /^https?:\/\//u.test(url))} : null,
    foodChoices: Array.isArray(selections) ? selections.slice(0, 10).flatMap(value => {
      const row = record(value), title = text(row.title);
      const dishes = Array.isArray(row.options) ? row.options.map(option => text(record(option).name)).filter((s): s is string => !!s) : [];
      return title && dishes.length ? [{title, dishes}] : [];
    }) : [],
    inclusions: categories.flatMap(([title, value]) => {
      const items = strings(value);
      return items.length ? [{title, items}] : [];
    }),
  };
}
