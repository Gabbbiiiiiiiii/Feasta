export const PUBLIC_PROVIDER_MARKETPLACE_PATH = "/customer/providers";
export const PUBLIC_PACKAGE_MARKETPLACE_PATH = "/customer/packages";

export const PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER =
  "x-feasta-public-provider-marketplace";

export const PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER =
  "x-feasta-public-provider-marketplace-return";

const PUBLIC_PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

export function isPublicProviderId(value: string): boolean {
  return PUBLIC_PROVIDER_ID_PATTERN.test(value);
}

export function isPublicProviderDirectoryPath(pathname: string): boolean {
  return pathname === PUBLIC_PROVIDER_MARKETPLACE_PATH;
}

export function publicProviderIdFromPath(pathname: string): string | null {
  const prefix = `${PUBLIC_PROVIDER_MARKETPLACE_PATH}/`;
  if (!pathname.startsWith(prefix)) return null;
  const providerId = pathname.slice(prefix.length);
  return isPublicProviderId(providerId) ? providerId : null;
}

export function isPublicProviderMarketplacePath(pathname: string): boolean {
  return isPublicProviderDirectoryPath(pathname) ||
    publicProviderIdFromPath(pathname) !== null;
}

export function isPublicMarketplacePath(pathname: string): boolean {
  return isPublicProviderMarketplacePath(pathname) ||
    isPublicPackageMarketplacePath(pathname);
}

export function isPublicPackageMarketplacePath(pathname: string): boolean {
  if (pathname === PUBLIC_PACKAGE_MARKETPLACE_PATH) return true;
  const prefix = `${PUBLIC_PACKAGE_MARKETPLACE_PATH}/`;
  // Only the public detail page is guest-accessible; /book and other descendants
  // still pass through the existing protected-route authentication boundary.
  return pathname.startsWith(prefix) && isPublicProviderId(pathname.slice(prefix.length));
}

export function isPublicProviderMarketplaceReturnPath(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 1024 ||
    value.includes("#") ||
    /[\u0000-\u001F\u007F]/u.test(value)
  ) return false;

  const queryIndex = value.indexOf("?");
  const pathname = queryIndex === -1 ? value : value.slice(0, queryIndex);
  return isPublicProviderMarketplacePath(pathname);
}

export function isPublicMarketplaceReturnPath(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 1024 ||
    value.includes("#") ||
    /[\u0000-\u001F\u007F]/u.test(value)
  ) return false;

  const queryIndex = value.indexOf("?");
  const pathname = queryIndex === -1 ? value : value.slice(0, queryIndex);
  return isPublicMarketplacePath(pathname);
}
