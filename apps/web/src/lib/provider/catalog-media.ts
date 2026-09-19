export const CATALOG_IMAGE_LIMIT = 8;
export const CATALOG_IMAGE_BYTES = 5 * 1024 * 1024;
export const CATALOG_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type CatalogImageDraft = {
  id: string;
  title: string;
  url: string;
  file?: File;
};

export function validateCatalogFiles(files: readonly File[], existingCount: number): void {
  if (existingCount + files.length > CATALOG_IMAGE_LIMIT) throw new Error("Choose at most 8 images.");
  for (const file of files) {
    if (!CATALOG_IMAGE_TYPES.includes(file.type)) throw new Error("Use JPEG, PNG, or WebP images.");
    if (file.size === 0 || file.size > CATALOG_IMAGE_BYTES) throw new Error("Each image must be between 1 byte and 5 MB.");
  }
}

export function packageImageDrafts(imageUrls?: readonly string[], imageUrl?: string): CatalogImageDraft[] {
  return (imageUrls?.length ? imageUrls : imageUrl ? [imageUrl] : []).slice(0, CATALOG_IMAGE_LIMIT)
    .map((url, index) => ({id: `existing-${index}`, title: "", url}));
}
