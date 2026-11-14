import {CATALOG_IMAGE_LIMIT} from "./catalog-media";

export const MENU_SERVING_OPTION_LIMIT = 8;

export type ProviderMenuServingOption = {
  id: string;
  name: string;
  description: string;
  minimumGuests: number;
  maximumGuests: number;
  price: number;
};

export type ProviderMenuImage = {
  id: string;
  title: string;
  url: string;
  isPublished: boolean;
  description?: string;
  category?: string;
  servingOptions?: ProviderMenuServingOption[];
};
export type ProviderMenu = {revision: number; images: ProviderMenuImage[]};

export function menuAssetPublicId(url: string, ownerId: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com" ||
      parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) return null;
    const match = parsed.pathname.match(/^\/[^/]+\/image\/upload\/(?:v\d+\/)?(feasta\/providers\/([^/]+)\/services\/([a-zA-Z0-9_-]+)\/image)(?:\.(?:jpg|jpeg|png|webp))?$/u);
    return match?.[2] === ownerId ? match[1]! : null;
  } catch { return null; }
}

export function parseProviderMenu(value: unknown, ownerId: string): ProviderMenuImage[] {
  if (!Array.isArray(value) || value.length > CATALOG_IMAGE_LIMIT) throw new Error("Choose at most 8 menu images.");
  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid menu image.");
    const image = entry as Record<string, unknown>;
    if (typeof image.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/u.test(image.id) || ids.has(image.id) ||
      typeof image.title !== "string" || image.title.length > 80 || typeof image.url !== "string" || image.url.length > 2048 ||
      typeof image.isPublished !== "boolean" ||
      menuAssetPublicId(image.url, ownerId) !== `feasta/providers/${ownerId}/services/${image.id}/image`) {
      throw new Error("Invalid menu image.");
    }
    ids.add(image.id);
    const base: ProviderMenuImage = {
      id: image.id,
      title: image.title.trim(),
      url: image.url,
      isPublished: image.isPublished,
    };
    const hasStructuredFields = "description" in image || "category" in image || "servingOptions" in image;
    if (!hasStructuredFields) return base;
    const description = optionalText(image.description, 600, "Menu description");
    const category = optionalText(image.category, 80, "Menu category");
    const servingOptions = parseServingOptions(image.servingOptions);
    if (servingOptions.length && !base.title) throw new Error("Menu items with serving sizes need an item name.");
    return {...base, description, category, servingOptions};
  });
}

export function publicMenuImages(value: unknown, ownerId: string): ProviderMenuImage[] {
  try { return parseProviderMenu(value, ownerId).filter((image) => image.isPublished); }
  catch { return []; }
}

export function menuServingGuestLabel(minimumGuests: number, maximumGuests: number): string {
  if (minimumGuests === maximumGuests) {
    return `Good for ${minimumGuests.toLocaleString("en-PH")} ${minimumGuests === 1 ? "guest" : "guests"}`;
  }
  return `Good for ${minimumGuests.toLocaleString("en-PH")}–${maximumGuests.toLocaleString("en-PH")} guests`;
}

function parseServingOptions(value: unknown): ProviderMenuServingOption[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MENU_SERVING_OPTION_LIMIT) {
    throw new Error(`Choose at most ${MENU_SERVING_OPTION_LIMIT} serving sizes per menu item.`);
  }
  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Serving size ${index + 1} is invalid.`);
    const option = entry as Record<string, unknown>;
    if (typeof option.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/u.test(option.id) || ids.has(option.id)) {
      throw new Error(`Serving size ${index + 1} has an invalid identifier.`);
    }
    ids.add(option.id);
    const name = requiredText(option.name, 80, `Serving size ${index + 1} name`);
    const description = optionalText(option.description, 160, `Serving size ${index + 1} notes`);
    const minimumGuests = boundedGuestCount(option.minimumGuests, index);
    const maximumGuests = boundedGuestCount(option.maximumGuests, index);
    if (maximumGuests < minimumGuests) {
      throw new Error(`Serving size ${index + 1} maximum guests must be greater than or equal to minimum guests.`);
    }
    const normalizedPrice = typeof option.price === "number"
      ? Math.round((option.price + Number.EPSILON) * 100) / 100
      : Number.NaN;
    if (typeof option.price !== "number" || !Number.isFinite(option.price) ||
      option.price <= 0 || option.price > 100_000_000 || normalizedPrice !== option.price) {
      throw new Error(`Serving size ${index + 1} price is invalid.`);
    }
    return {
      id: option.id,
      name,
      description,
      minimumGuests,
      maximumGuests,
      price: normalizedPrice,
    };
  });
}

function boundedGuestCount(value: unknown, index: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000) {
    throw new Error(`Serving size ${index + 1} guest range is invalid.`);
  }
  return value;
}

function requiredText(value: unknown, maximumLength: number, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} is invalid.`);
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > maximumLength) throw new Error(`${field} is invalid.`);
  return normalized;
}

function optionalText(value: unknown, maximumLength: number, field: string): string {
  if (value === undefined) return "";
  if (typeof value !== "string") throw new Error(`${field} is invalid.`);
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length > maximumLength) throw new Error(`${field} is too long.`);
  return normalized;
}
