"use server";

import {adminDb} from "@/lib/firebase/admin";
import {requireProviderCatalogAccess} from "@/lib/auth/session";

export async function loadPrivatePackageOccasions(packageId?: string) {
  const account = await requireProviderCatalogAccess();
  if (!account.provider || account.provider.id !== account.providerId) {
    throw new Error("Provider access is required.");
  }
  if (packageId && !/^[A-Za-z0-9_-]{1,128}$/u.test(packageId)) {
    throw new Error("Invalid package ID.");
  }
  const provider = adminDb.collection("providers").doc(account.provider.id);
  const [library, selected] = await Promise.all([
    provider.collection("catalog").doc("privateOccasionLibrary").get(),
    packageId ? provider.collection("packagePrivateOccasions").doc(packageId).get() : null,
  ]);
  function labels(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((label): label is string => typeof label === "string") : [];
  }
  return {available: labels(library.get("labels")), selected: labels(selected?.get("labels"))};
}

export async function loadAllProviderPackageCustomOccasions(): Promise<Record<string, string[]>> {
  const account = await requireProviderCatalogAccess();
  if (!account.provider || account.provider.id !== account.providerId) {
    return {};
  }
  const snapshot = await adminDb
    .collection("providers")
    .doc(account.provider.id)
    .collection("packagePrivateOccasions")
    .get();
  const result: Record<string, string[]> = {};
  for (const doc of snapshot.docs) {
    const raw = doc.get("labels");
    if (Array.isArray(raw)) {
      const cleaned = raw.filter((label): label is string => typeof label === "string" && label.trim().length > 0);
      if (cleaned.length > 0) result[doc.id] = cleaned;
    }
  }
  return result;
}
