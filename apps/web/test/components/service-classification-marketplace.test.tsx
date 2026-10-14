import {beforeEach, expect, it, vi} from "vitest";
const store = vi.hoisted(() => ({filters: [] as Array<[string, string, unknown]>}));
vi.mock("@/lib/firebase/admin", () => ({adminDb: {
  collection: () => {
    const query = {
      where: (field: string, operator: string, value: unknown) => {store.filters.push([field, operator, value]); return query;},
      orderBy: () => query, limit: () => query,
      get: async () => ({docs: ["catering", "addon", "both"].filter(type => store.filters.every(([field, , value]) => field !== "providerServiceType" || type === value)).map(type => ({
        id: `provider-${type}`, data: () => ({ownerId: `owner-${type}`, businessName: type, providerServiceType: type, providerCategory: "photographer", serviceCategories: ["photographer"], verificationStatus: "approved", publiclyVisible: true, isActive: true, isSuspended: false, isDeleted: false}),
      }))}),
      doc: (id: string) => ({id}),
    };
    return query;
  },
  getAll: async (...refs: Array<{id: string}>) => refs.map(ref => ({id: ref.id, exists: true, data: () => ({role: "provider", providerId: ref.id.replace("owner-", "provider-"), accountStatus: "active", isActive: true, isBlocked: false})})),
}}));
import {getPublicProviderPage} from "@/lib/customer/providers/provider-discovery-service";
import {parseProviderDiscoveryFilters, providerDiscoveryHref} from "@/lib/customer/providers/provider-query";
import {providerServiceTypeLabel} from "@/lib/customer/providers/provider-catalog";
beforeEach(() => {store.filters.length = 0;});
it.each(["catering", "addon", "both"] as const)("%s display retains URL identifier, Firestore query, and matching provider results", async (serviceType) => {
  const filters = parseProviderDiscoveryFilters({service: serviceType});
  expect(providerDiscoveryHref(filters)).toContain(`service=${serviceType}`);
  const page = await getPublicProviderPage(filters);
  expect(store.filters).toContainEqual(["providerServiceType", "==", serviceType]);
  expect(page.providers.map(provider => provider.id)).toEqual([`provider-${serviceType}`]);
  expect(page.providers[0].categories).toEqual(["photographer"]);
  expect(providerServiceTypeLabel(page.providers[0].serviceType)).toBe(serviceType === "catering" ? "Catering" : serviceType === "addon" ? "Other Event Services" : "Catering & Other Event Services");
});
