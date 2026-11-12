export type PortfolioPhoto = {
  url: string;
  id: string;
  altText: string;
  thumbnailUrl: string;
  width: number;
  height: number;
};

export type ServicePortfolio = {coverAssetId: string | null; photos: PortfolioPhoto[]};
export type ServicePortfolioInput = {
  coverAssetId: string | null;
  photos: {id: string; altText: string}[];
};

export function readServicePortfolio(value: unknown): ServicePortfolio | null {
  if (!value || typeof value !== "object") return null;
  const {coverAssetId, photos} = value as ServicePortfolio;
  if (!Array.isArray(photos) || photos.length > 20) return null;
  const validUrl = (url: unknown) => typeof url === "string" && url.startsWith("https://res.cloudinary.com/");
  if (!photos.every((photo) => photo && typeof photo.id === "string" &&
      typeof photo.altText === "string" && validUrl(photo.url) && validUrl(photo.thumbnailUrl) &&
      Number.isSafeInteger(photo.width) && Number.isSafeInteger(photo.height))) return null;
  if (photos.length ? !photos.some((photo) => photo.id === coverAssetId) : coverAssetId !== null) return null;
  return {coverAssetId, photos: photos.map(({id, altText, url, thumbnailUrl, width, height}) =>
    ({id, altText, url, thumbnailUrl, width, height}))};
}
