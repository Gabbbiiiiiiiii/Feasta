import {CATALOG_IMAGE_LIMIT} from "./catalog-media";
import {menuAssetPublicId} from "./provider-menu";

/** Matches the current catalog item bound, which is stricter than a 12-setup gallery. */
export const PROVIDER_SETUP_LIMIT = CATALOG_IMAGE_LIMIT;
/** Stricter than the 8-image catalog list bound. */
export const PROVIDER_SETUP_IMAGE_LIMIT = 6;
export const PROVIDER_SETUP_THEME_TAG_LIMIT = 8;
/** Matches structured menu title length. */
export const PROVIDER_SETUP_TITLE_LIMIT = 80;
/** Matches structured menu description length. */
export const PROVIDER_SETUP_DESCRIPTION_LIMIT = 600;
export const PROVIDER_SETUP_THEME_TAG_LENGTH = 40;

const SETUP_ID_PATTERN = /^[A-Za-z0-9_-]{2,80}$/u;

export const PROVIDER_SETUP_EVENT_TYPES = [
  "birthday",
  "wedding",
  "debut",
  "corporate",
  "anniversary",
  "other",
] as const;

export type ProviderSetupEventType = (typeof PROVIDER_SETUP_EVENT_TYPES)[number];

export const PROVIDER_SETUP_EVENT_TYPE_LABELS: Record<ProviderSetupEventType, string> = {
  birthday: "Birthday",
  wedding: "Wedding",
  debut: "Debut",
  corporate: "Corporate",
  anniversary: "Anniversary",
  other: "Other",
};

export type ProviderSetup = {
  id: string;
  title: string;
  description: string;
  eventType: ProviderSetupEventType;
  themeTags: string[];
  imageUrls: string[];
  isPublished: boolean;
};

export type ProviderSetupGallery = {
  revision: number;
  setups: ProviderSetup[];
};

const DISALLOWED_SETUP_FIELDS = [
  "price",
  "deposit",
  "depositPercentage",
  "downPaymentPercentage",
  "paymentPercentage",
  "subtotal",
  "total",
  "totalAmount",
  "providerEarning",
  "downPaymentAmount",
  "remainingBalance",
  "bookingStatus",
  "paymentStatus",
] as const;

export function parseProviderSetups(value: unknown, ownerId: string): ProviderSetup[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > PROVIDER_SETUP_LIMIT) {
    throw new Error(`Choose at most ${PROVIDER_SETUP_LIMIT} setups.`);
  }
  const ids = new Set<string>();
  return value.map((entry, index) => parseSetup(entry, ownerId, index, ids));
}

export function publicProviderSetups(value: unknown, ownerId: string): ProviderSetup[] {
  try {
    return parseProviderSetups(value, ownerId).filter((setup) => setup.isPublished && setup.imageUrls.length > 0);
  } catch {
    return [];
  }
}

function parseSetup(entry: unknown, ownerId: string, index: number, ids: Set<string>): ProviderSetup {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`Setup ${index + 1} is invalid.`);
  }
  const setup = entry as Record<string, unknown>;
  if (DISALLOWED_SETUP_FIELDS.some((field) => field in setup)) {
    throw new Error("Setup records cannot include pricing or booking terms.");
  }
  const id = requiredId(setup.id, `Setup ${index + 1}`);
  if (ids.has(id)) throw new Error("Setup identifiers must be unique.");
  ids.add(id);
  const title = requiredText(setup.title, PROVIDER_SETUP_TITLE_LIMIT, `Setup ${index + 1} title`);
  const description = optionalText(setup.description, PROVIDER_SETUP_DESCRIPTION_LIMIT, `Setup ${index + 1} description`);
  const eventType = parseEventType(setup.eventType, index);
  const themeTags = parseThemeTags(setup.themeTags, index);
  const imageUrls = parseSetupImages(setup.imageUrls, ownerId, index);
  if (typeof setup.isPublished !== "boolean") {
    throw new Error(`Setup ${index + 1} publication status is invalid.`);
  }
  if (setup.isPublished && imageUrls.length === 0) {
    throw new Error(`Setup ${index + 1} needs at least one photo before publishing.`);
  }
  return {id, title, description, eventType, themeTags, imageUrls, isPublished: setup.isPublished};
}

function parseEventType(value: unknown, index: number): ProviderSetupEventType {
  if (typeof value !== "string" || !(PROVIDER_SETUP_EVENT_TYPES as readonly string[]).includes(value)) {
    throw new Error(`Setup ${index + 1} event type is invalid.`);
  }
  return value as ProviderSetupEventType;
}

function parseThemeTags(value: unknown, index: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > PROVIDER_SETUP_THEME_TAG_LIMIT) {
    throw new Error(`Setup ${index + 1} can have at most ${PROVIDER_SETUP_THEME_TAG_LIMIT} styles.`);
  }
  const result = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") throw new Error(`Setup ${index + 1} has an invalid style.`);
    const normalized = item.trim().replace(/\s+/gu, " ");
    if (!normalized || normalized.length > PROVIDER_SETUP_THEME_TAG_LENGTH) {
      throw new Error(`Setup ${index + 1} has an invalid style.`);
    }
    result.add(normalized);
  }
  return [...result];
}

function parseSetupImages(value: unknown, ownerId: string, index: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > PROVIDER_SETUP_IMAGE_LIMIT) {
    throw new Error(`Setup ${index + 1} can have at most ${PROVIDER_SETUP_IMAGE_LIMIT} photos.`);
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length > 2048 || !menuAssetPublicId(item, ownerId)) {
      throw new Error(`Setup ${index + 1} contains an invalid photo.`);
    }
    if (result.includes(item)) throw new Error(`Setup ${index + 1} contains a duplicate photo.`);
    result.push(item);
  }
  return result;
}

function requiredId(value: unknown, field: string): string {
  if (typeof value !== "string" || !SETUP_ID_PATTERN.test(value)) {
    throw new Error(`${field} identifier is invalid.`);
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
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${field} is invalid.`);
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length > maximumLength) throw new Error(`${field} is too long.`);
  return normalized;
}
