export const PROVIDER_SERVICE_AREAS = [
  {
    key: "ormoc-city|leyte",
    city: "Ormoc City",
    province: "Leyte",
    label: "Ormoc City, Leyte",
    aliases: ["Ormoc", "Ormoc City", "City of Ormoc"],
  },
  {
    key: "albuera|leyte",
    city: "Albuera",
    province: "Leyte",
    label: "Albuera, Leyte",
    aliases: ["Albuera", "Municipality of Albuera"],
  },
  {
    key: "kananga|leyte",
    city: "Kananga",
    province: "Leyte",
    label: "Kananga, Leyte",
    aliases: ["Kananga", "Municipality of Kananga"],
  },
  {
    key: "isabel|leyte",
    city: "Isabel",
    province: "Leyte",
    label: "Isabel, Leyte",
    aliases: ["Isabel", "Municipality of Isabel"],
  },
  {
    key: "baybay-city|leyte",
    city: "Baybay City",
    province: "Leyte",
    label: "Baybay City, Leyte",
    aliases: ["Baybay", "Baybay City", "City of Baybay"],
  },
] as const;

export type ProviderServiceArea = (typeof PROVIDER_SERVICE_AREAS)[number];
export type ProviderServiceAreaKey = ProviderServiceArea["key"];
export type ProviderServiceAreaLabel = ProviderServiceArea["label"];

const normalizeLookupValue = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/gu, " ")
    .replace(/\s*,\s*/gu, ",");

const SERVICE_AREA_LOOKUP = new Map<string, ProviderServiceArea>(
  PROVIDER_SERVICE_AREAS.flatMap((area) => {
    const values = [area.key, area.label, area.city, ...area.aliases];
    return values.flatMap((value) => [
      [normalizeLookupValue(value), area] as const,
      [normalizeLookupValue(`${value}, ${area.province}`), area] as const,
    ]);
  }),
);

/**
 * Resolves a supported FEASTA municipality/city without maps or coordinates.
 * The optional province may be supplied separately by address-component callers.
 */
export function normalizeProviderServiceArea(
  value: unknown,
  province?: unknown,
): ProviderServiceArea | null {
  if (typeof value !== "string" || value.length > 100) return null;
  if (province !== undefined && typeof province !== "string") return null;
  if (typeof province === "string" && province.length > 100) return null;

  const combined = typeof province === "string" && province.trim().length > 0
    ? `${value}, ${province}`
    : value;
  return SERVICE_AREA_LOOKUP.get(normalizeLookupValue(combined)) ?? null;
}

export function normalizeExistingProviderServiceAreas(value: unknown): {
  supported: ProviderServiceAreaLabel[];
  unsupported: string[];
} {
  if (!Array.isArray(value)) return {supported: [], unsupported: []};

  const supported: ProviderServiceAreaLabel[] = [];
  const unsupported: string[] = [];
  const seen = new Set<ProviderServiceAreaKey>();

  for (const item of value) {
    const area = normalizeProviderServiceArea(item);
    if (area) {
      if (!seen.has(area.key)) {
        seen.add(area.key);
        supported.push(area.label);
      }
      continue;
    }
    if (typeof item === "string") {
      const legacy = item.trim();
      if (legacy && legacy.length <= 100 && !unsupported.includes(legacy)) {
        unsupported.push(legacy);
      }
    }
  }

  return {supported, unsupported};
}
