"use server";

import {adminDb} from "@/lib/firebase/admin";
import {requireApprovedProvider} from "@/lib/auth/session";
import {providerContentCapabilities} from "@/lib/provider/provider-content-capabilities";
import {categoryKey, categoryNameError} from "@/lib/provider/package-food-inclusions";

export type LibraryDish = {id: string; name: string; category: string; parentGroup?: string};

async function libraryRef() {
  const account = await requireApprovedProvider();
  if (!account.provider || !providerContentCapabilities(account.provider.providerServiceType, account.provider.serviceCategories).catering) {
    throw new Error("Dish Library is available to catering providers.");
  }
  return adminDb.collection("providers").doc(account.provider.id).collection("catalog").doc("dishLibrary");
}

export async function loadDishLibrary(): Promise<{revision: number; dishes: LibraryDish[]; categories: string[]}> {
  const snapshot = await (await libraryRef()).get();
  return {revision: snapshot.get("revision") ?? 0, dishes: snapshot.get("dishes") ?? [], categories: snapshot.get("categories") ?? []};
}

export async function saveDishLibrary(revision: number, input: LibraryDish[], savedCategories: string[]) {
  const ref = await libraryRef();
  if (!Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(input) || input.length > 500) {
    throw new Error("A dish library can have at most 500 dishes.");
  }
  if (!Array.isArray(savedCategories) || savedCategories.length > 500 ||
      savedCategories.some((name) => typeof name !== "string" || categoryNameError(name))) {
    throw new Error("Enter valid names for up to 500 categories.");
  }
  const categoryNames = Array.from(new Map(savedCategories.map((name) => [categoryKey(name), name.trim()])).values());
  const ids = new Set<string>();
  const names = new Set<string>();
  const categories = new Map<string, {category: string; parentGroup: string}>();
  const groups = new Map<string, string>();
  const dishes = input.map((dish) => {
    if (!dish || typeof dish.id !== "string" || !/^[a-f0-9-]{36}$/i.test(dish.id) ||
      typeof dish.name !== "string" || typeof dish.category !== "string") throw new Error("Invalid dish.");
    const name = dish.name.trim();
    const category = dish.category.trim();
    if (dish.parentGroup !== undefined && typeof dish.parentGroup !== "string") throw new Error("Invalid parent group.");
    const parentGroup = dish.parentGroup?.trim() ?? "";
    if (parentGroup && categoryNameError(parentGroup)) throw new Error("Enter a valid parent group.");
    const groupKey = categoryKey(parentGroup);
    const categoryId = categoryKey(category);
    const savedGroup = groups.get(groupKey) ?? parentGroup;
    groups.set(groupKey, savedGroup);
    const savedCategory = categories.get(categoryId) ?? {category, parentGroup: savedGroup};
    if (savedCategory.parentGroup !== savedGroup) throw new Error("Each category can belong to one parent group.");
    categories.set(categoryId, savedCategory);
    if (!name || name.length > 120 || categoryNameError(category) ||
        category.length + name.length + 2 > 160 || /[\p{Cc}\p{Cf}]/u.test(name)) {
      throw new Error("Enter a valid category and dish name.");
    }
    const key = JSON.stringify([categoryKey(category), categoryKey(name)]);
    if (ids.has(dish.id) || names.has(key)) throw new Error("That dish already exists in this category.");
    ids.add(dish.id);
    names.add(key);
    return {id: dish.id, name, ...savedCategory};
  });
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if ((snapshot.get("revision") ?? 0) !== revision) throw new Error("The library changed. Reopen it before editing.");
    transaction.set(ref, {revision: revision + 1, dishes, categories: categoryNames});
  });
  return {revision: revision + 1, dishes, categories: categoryNames};
}
