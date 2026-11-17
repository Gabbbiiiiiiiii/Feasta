"use server";

import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

export async function assertServiceCategoryUnused(code: string): Promise<void> {
  await requireAdmin();
  if (typeof code !== "string" || !/^[a-z0-9_]{2,100}$/.test(code)) {
    throw new Error("Invalid service category.");
  }
  const providers = adminDb.collection("providers");
  const [primaryProviders, assignedProviders, services] = await Promise.all([
    providers.where("providerCategory", "==", code).limit(1).get(),
    providers.where("serviceCategories", "array-contains", code).limit(1).get(),
    adminDb.collection("addons").where("category", "==", code).limit(1).get(),
  ]);
  if (!primaryProviders.empty || !assignedProviders.empty || !services.empty) {
    throw new Error("This service category is assigned to a provider or service. It cannot be deactivated or deleted.");
  }
}
