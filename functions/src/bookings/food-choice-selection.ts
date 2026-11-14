import {HttpsError} from "firebase-functions/v2/https";
import type {FoodChoiceSelectionV2, FoodChoiceSnapshotV2} from "@feasta/shared-types/provider-package-v2";
import {parseFoodChoiceGroupsV2} from "../packages/food-choice-groups-v2.js";

const fail = (): never => {throw new HttpsError("invalid-argument",
  "Select exactly the required number of dishes in each food-choice group.", {reason: "INVALID_FOOD_CHOICES"});};
/** Parse IDs only; never accept rules, names, or prices from customers. */
export function parseFoodChoiceSelections(value: unknown): FoodChoiceSelectionV2[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) return fail();
  const seen = new Set<string>();
  const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/u.test(v);
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        Object.keys(row).length !== 2 || !Object.hasOwn(row,"groupId") || !Object.hasOwn(row,"optionIds") ||
        !id(row.groupId) || seen.has(row.groupId) || !Array.isArray(row.optionIds) || row.optionIds.length > 10 ||
        !row.optionIds.every(id) || new Set(row.optionIds).size !== row.optionIds.length) return fail();
    seen.add(row.groupId);
    return {groupId: row.groupId, optionIds: [...row.optionIds].sort()};
  }).sort((a,b) => a.groupId.localeCompare(b.groupId));
}
/** Call inside the booking transaction with the freshly read package document. */
export function resolveFoodChoiceSelections(packageData: Readonly<Record<string, unknown>>,
  selections: FoodChoiceSelectionV2[]): FoodChoiceSnapshotV2[] {
  let groups;
  try {groups = parseFoodChoiceGroupsV2(Object.hasOwn(packageData, "foodChoiceGroups") ? packageData.foodChoiceGroups : []);}
  catch {throw new HttpsError("failed-precondition", "Package food choices are unavailable.");}
  if (groups.length !== selections.length) return fail();
  return groups.map((group) => {
    const selected = selections.find((s) => s.groupId === group.id);
    if (!selected || selected.optionIds.length !== group.selectionCount ||
        new Set(selected.optionIds).size !== selected.optionIds.length ||
        selected.optionIds.some((id) => !group.options.some((o) => o.id === id))) return fail();
    return {groupId: group.id, title: group.title, selectionCount: group.selectionCount,
      options: group.options.filter((option) => selected.optionIds.includes(option.id)).map((o) => ({...o}))};
  });
}
