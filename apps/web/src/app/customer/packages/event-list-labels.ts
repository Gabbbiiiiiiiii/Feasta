"use server";
import {getPublicPackageDetail} from "@/lib/customer/discovery/package-detail-service";
import {readPublishedProviderSetups} from "@/lib/provider/provider-setup-gallery-service";

/** Public catalog only; saved configuration and prices stay in browser storage. */
export async function loadEventListPackageLabels(providerId: string, packageId: string) {
  if (![providerId, packageId].every(id => /^[A-Za-z0-9_-]{1,128}$/u.test(id))) return null;
  const detail = await getPublicPackageDetail(packageId);
  if (detail?.provider.id !== providerId || detail.packageRecord.providerId !== providerId || detail.packageRecord.id !== packageId) return null;
  const setups = await readPublishedProviderSetups(providerId).catch(() => []);
  return {...detail, setupLabels: setups.map(({id, title}) => ({id, title}))};
}
