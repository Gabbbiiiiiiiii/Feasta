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

export async function loadDishLibrary(): Promise<{revision: number; dishes: LibraryDish[]; categories: string[]; parentGroups?: Record<string, string>; groupNames?: string[]}> {
  const snapshot = await (await libraryRef()).get();
  return {revision: snapshot.get("revision") ?? 0, dishes: snapshot.get("dishes") ?? [], categories: snapshot.get("categories") ?? [], parentGroups: snapshot.get("parentGroups") ?? {}, groupNames: snapshot.get("groupNames")};
}

export async function saveDishLibrary(revision: number, input: LibraryDish[], savedCategories: string[], categoryGroups: Record<string, string> = {}, groupNames?: string[], unassignedCategories: string[] = []) {
  const ref = await libraryRef();
  if (!Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(input) || input.length > 500) {
    throw new Error("A dish library can have at most 500 dishes.");
  }
  if (!Array.isArray(savedCategories) || savedCategories.length > 500 ||
      savedCategories.some((name) => typeof name !== "string" || categoryNameError(name))) {
    throw new Error("Enter valid names for up to 500 categories.");
  }
  const categoryNames = Array.from(new Map(savedCategories.map((name) => [categoryKey(name), name.trim()])).values());
  const parentGroups = Object.fromEntries(categoryNames.flatMap((name) => {
    const key = categoryKey(name);
    if (!Object.hasOwn(categoryGroups, key)) return [];
    const group = categoryGroups[key];
    if (typeof group !== "string" || categoryNameError(group)) throw new Error("Enter a valid parent group.");
    return [[key, group.trim()]];
  })) as Record<string, string>;
  if (groupNames && (!Array.isArray(groupNames) || groupNames.length > 500 ||
      groupNames.some((name) => typeof name !== "string" || categoryNameError(name)))) {
    throw new Error("Enter valid names for up to 500 parent groups.");
  }
  const unassigned = new Set(unassignedCategories.map(categoryKey));
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
    const assignedGroup = Object.hasOwn(parentGroups, categoryId) ? parentGroups[categoryId] : undefined;
    if (assignedGroup && categoryKey(assignedGroup) !== groupKey) throw new Error("A dish must use its category’s Parent Group.");
    const savedGroup = groups.get(groupKey) ?? parentGroup;
    groups.set(groupKey, savedGroup);
    const savedCategory = categories.get(categoryId) ?? {category, parentGroup: savedGroup};
    if (savedCategory.parentGroup && savedGroup && savedCategory.parentGroup !== savedGroup) throw new Error("Each category can belong to one parent group.");
    if (savedGroup) categories.set(categoryId, {category: savedCategory.category, parentGroup: savedGroup});
    if (!name || name.length > 120 || categoryNameError(category) ||
        category.length + name.length + 2 > 160 || /[\p{Cc}\p{Cf}]/u.test(name)) {
      throw new Error("Enter a valid category and dish name.");
    }
    const key = JSON.stringify([categoryKey(category), categoryKey(name)]);
    if (ids.has(dish.id) || names.has(key)) throw new Error("That dish already exists in this category.");
    ids.add(dish.id);
    names.add(key);
    return {id: dish.id, name, category: savedCategory.category, parentGroup: savedGroup};
  });
  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if ((snapshot.get("revision") ?? 0) !== revision) throw new Error("The library changed. Reopen it before editing.");
    const previous = new Map<string, LibraryDish>(
      ((snapshot.get("dishes") ?? []) as LibraryDish[]).map((dish) => [dish.id, dish]),
    );
    for (const dish of dishes) {
      if (dish.parentGroup) continue;
      const existing = previous.get(dish.id);
      if (!existing || existing.name !== dish.name ||
          (existing.parentGroup?.trim() && (!unassigned.has(categoryKey(dish.category)) ||
            categoryKey(existing.category) !== categoryKey(dish.category) || categories.has(categoryKey(dish.category))))) {
        throw new Error("Assign a Parent Group before saving a dish.");
      }
    }
    const storedGroups = groupNames ?? snapshot.get("groupNames");
    transaction.set(ref, {revision: revision + 1, dishes, categories: categoryNames, parentGroups,
      ...(storedGroups ? {groupNames: storedGroups} : {})});

  });
  return {revision: revision + 1, dishes, categories: categoryNames, parentGroups, ...(groupNames ? {groupNames} : {})};
}
