"use server";

import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

export async function assertServiceCategoryUnused(code: string): Promise<void> {
  await requireAdmin();
  if (typeof code !== "string" || !/^[a-z0-9_]{2,100}$/.test(code)) {
    throw new Error("Invalid service category.");
  }

  // Hard usage only. Secondary serviceCategories multi-select leftovers must not
  // permanently block deactivate/delete when no primary provider, live service,
  // or live package depends on the category.
  const [primaryProviders, services, packages] = await Promise.all([
    adminDb
      .collection("providers")
      .where("providerCategory", "==", code)
      .limit(5)
      .get(),
    adminDb
      .collection("addons")
      .where("category", "==", code)
      .limit(5)
      .get(),
    adminDb
      .collection("packages")
      .where("serviceCategoryCode", "==", code)
      .limit(5)
      .get(),
  ]);

  const hasPrimaryProvider = primaryProviders.docs.some(
    (document) => document.data()?.isDeleted !== true,
  );
  const hasService = services.docs.some(
    (document) => document.data()?.isDeleted !== true,
  );
  const hasPackage = packages.docs.some((document) => {
    const data = document.data() ?? {};
    if (data.isDeleted === true) {
      return false;
    }

    return data.status === "draft" || data.status === "published";
  });

  if (hasPrimaryProvider || hasService || hasPackage) {
    throw new Error(
      "This service category is assigned to a provider or service. It cannot be deactivated or deleted.",
    );
  }
}
