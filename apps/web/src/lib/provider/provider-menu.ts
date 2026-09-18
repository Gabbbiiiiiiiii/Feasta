import {CATALOG_IMAGE_LIMIT} from "./catalog-media";

export type ProviderMenuImage = {id: string; title: string; url: string; isPublished: boolean};
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
      typeof image.isPublished !== "boolean" || !menuAssetPublicId(image.url, ownerId)) throw new Error("Invalid menu image.");
    ids.add(image.id);
    return {id: image.id, title: image.title.trim(), url: image.url, isPublished: image.isPublished};
  });
}

export function publicMenuImages(value: unknown, ownerId: string): ProviderMenuImage[] {
  try { return parseProviderMenu(value, ownerId).filter((image) => image.isPublished); }
  catch { return []; }
}
