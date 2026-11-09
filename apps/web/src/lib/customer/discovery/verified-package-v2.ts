import "server-only";
import {isCurrentCustomerPackageV2, isV2PaymentPolicyValid,
  isCustomerProviderV2, isPackageWithinProviderV2} from "@feasta/shared-types/customer-package-v2";
import {adminDb} from "@/lib/firebase/admin";
/** Admin reads must perform the same current-generation check as the callable gateway. */
export async function verifiedPublicPackageV2(id: string): Promise<Record<string, unknown> | null> {
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
  if (!project) return null;
  return adminDb.runTransaction(async tx => {
    const p = (await tx.get(adminDb.doc("packages/" + id))).data();
    if (!p || typeof p.providerId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(p.providerId) ||
        p.status !== "published" || p.isActive !== true || p.isPublished !== true ||
        p.isDeleted !== false || p.providerPubliclyVisible !== true || !p.publishedAt) return null;
    const [policy, catalog, authority, provider, maintenance, payment] = await Promise.all([
      tx.get(adminDb.doc("contractPolicies/providerPackageV2")), tx.get(adminDb.doc("occasionCatalog/current")),
      tx.get(adminDb.doc("providerEligibilityAuthorities/" + p.providerId)),
      tx.get(adminDb.doc("providers/" + p.providerId)), tx.get(adminDb.doc("maintenanceControls/intake")),
      tx.get(adminDb.doc("appSettings/platform")),
    ]);
    const providerData = provider.data();
    if (!providerData || typeof providerData.ownerId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(providerData.ownerId)) return null;
    const owner = await tx.get(adminDb.doc("users/" + providerData.ownerId));
    if (!isCustomerProviderV2(p.providerId, providerData, owner.data() ?? {}) ||
        !isV2PaymentPolicyValid(p, payment.data()) || !isPackageWithinProviderV2(p, providerData)) return null;
    const c = catalog.data(), a = authority.data(), policyData = policy.data(), m = maintenance.data();
    if (!c || !a || !policyData || policyData.effectiveEnvironment !== project ||
        c.activationState !== "stable" || m?.schemaVersion !== 1 || !Number.isSafeInteger(m.revision) ||
        m.revision < 1 || !Number.isSafeInteger(policyData.revision) || policyData.revision < 1 ||
        typeof m.intake !== "boolean" || m.publication !== false) return null;
    const category = await tx.get(adminDb.doc("serviceCategories/" + String(p.serviceCategoryCode)));
    if (category.data()?.code !== p.serviceCategoryCode || typeof category.data()?.name !== "string" ||
        !category.data()?.name.trim() || category.data()?.status !== "active" || category.data()?.serviceType !== "catering") return null;
    const rows = await tx.get(adminDb.collection("occasions").where("active", "==", true).limit(1001));
    if (rows.size > 1000 || rows.docs.some(d => d.data().id !== d.id)) return null;
    return isCurrentCustomerPackageV2(p, {enabled: policyData.featureGates?.customerDiscovery === true,
      catalogRevision: c.revision, providerEligibilityRevision: a.revision,
      maxSpecificOccasions: policyData.maxSpecificOccasions, maxThemeImages: policyData.maxThemeImages, approvedOccasionIds: a.approvedOccasionIds,
      approvedCategoryCodes: a.approvedCategoryCodes, catalog: rows.docs.map(d => d.data())}) ? p : null;
  });
}
