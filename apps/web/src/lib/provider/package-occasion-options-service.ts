import "server-only";
import {requireProviderCatalogAccess} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import type {PackageOccasionOptions} from "./package-occasion-options";

/** Read-only snapshot. Missing policy, authority, or complete catalog fails closed. */
export async function getPackageOccasionOptions(): Promise<PackageOccasionOptions | null> {
  const account = await requireProviderCatalogAccess();
  if (!account.providerId) return null;
  try {
    return await adminDb.runTransaction(async (tx) => {
      const [policySnap, catalogSnap, authoritySnap, providerSnap, userSnap] = await Promise.all([
        tx.get(adminDb.doc("contractPolicies/providerPackageV2")),
        tx.get(adminDb.doc("occasionCatalog/current")),
        tx.get(adminDb.collection("providerEligibilityAuthorities").doc(account.providerId!)),
        tx.get(adminDb.collection("providers").doc(account.providerId!)),
        tx.get(adminDb.collection("users").doc(account.uid)),
      ]);
      const policy = policySnap.data(), catalog = catalogSnap.data(), authority = authoritySnap.data();
      const provider = providerSnap.data(), user = userSnap.data();
      const project = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const positive = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
      if (!project || policy?.effectiveEnvironment !== project || policy?.featureGates?.occasionCatalogReads !== true ||
        !positive(policy.revision) || !positive(policy.maxSpecificOccasions) || policy.maxSpecificOccasions > 100 ||
        catalog?.activationState !== "stable" || !positive(catalog.revision) || !positive(authority?.revision) ||
        !Array.isArray(authority.approvedOccasionIds) || authority.approvedOccasionIds.some((id: unknown) => typeof id !== "string") ||
        provider?.ownerId !== account.uid || user?.providerId !== account.providerId || user.role !== "provider" ||
        user.accountStatus !== "active" || user.isActive === false || user.isBlocked === true ||
        provider.isActive !== true || provider.isBlocked === true || provider.isSuspended === true || provider.isDeleted === true ||
        provider.verificationStatus !== "approved" || !Array.isArray(provider.serviceCategories)) return null;
      const rows = await tx.get(adminDb.collection("occasions").where("active", "==", true).limit(201));
      if (rows.size > 200) return null;
      const options: PackageOccasionOptions["options"] = [];
      for (const doc of rows.docs) {
        const row = doc.data();
        if (row.active !== true || row.id !== doc.id || !/^[a-z][a-z0-9_]{1,63}$/u.test(doc.id) || row.moderationState !== "approved" ||
          typeof row.label !== "string" || !row.label.trim() || !positive(row.revision) ||
          !Array.isArray(row.applicableServiceCategoryCodes) || row.applicableServiceCategoryCodes.some((code: unknown) => typeof code !== "string")) return null;
        if (authority.approvedOccasionIds.includes(doc.id)) options.push({id: doc.id, label: row.label,
          categoryCodes: row.applicableServiceCategoryCodes.filter((code: string) => provider.serviceCategories.includes(code))});
      }
      return {options: options.sort((a, b) => a.label.localeCompare(b.label)), catalogRevision: catalog.revision,
        providerEligibilityRevision: authority.revision, maxSpecificOccasions: policy.maxSpecificOccasions};
    });
  } catch { return null; }
}
