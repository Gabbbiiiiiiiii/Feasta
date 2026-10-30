import type {FoodChoiceGroupV2, FoodChoiceSelectionV2} from "@feasta/shared-types/provider-package-v2";
export function foodChoiceSelectionError(groups: FoodChoiceGroupV2[], selections: FoodChoiceSelectionV2[]): string | null {
  if (selections.length !== groups.length || new Set(selections.map((s) => s.groupId)).size !== selections.length) {
    return "Select exactly the required number of dishes in each food-choice group.";
  }
  for (const group of groups) {
    const selected = selections.find((s) => s.groupId === group.id);
    if (!selected || selected.optionIds.length !== group.selectionCount ||
        new Set(selected.optionIds).size !== selected.optionIds.length ||
        selected.optionIds.some((id) => !group.options.some((o) => o.id === id))) {
      return `Choose exactly ${group.selectionCount} option(s) for ${group.title}.`;
    }
  }
  return null;
}
export function parseStoredFoodChoices(value: unknown): FoodChoiceSelectionV2[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) return null;
  const result: FoodChoiceSelectionV2[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || Object.keys(row).length !== 2 ||
        typeof row.groupId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(row.groupId) ||
        !Array.isArray(row.optionIds) || row.optionIds.length > 10 ||
        row.optionIds.some((id: unknown) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(id)) ||
        new Set(row.optionIds).size !== row.optionIds.length || result.some((r) => r.groupId === row.groupId)) return null;
    result.push({groupId:row.groupId,optionIds:[...row.optionIds]});
  }
  return result;
}

export function reconcileFoodChoiceSelections(groups: FoodChoiceGroupV2[], selections: FoodChoiceSelectionV2[]): FoodChoiceSelectionV2[] {
  return groups.flatMap((group) => {
    const row = selections.find((s) => s.groupId === group.id);
    return row ? [{groupId:group.id,optionIds:row.optionIds.filter((id) => group.options.some((o) => o.id === id))}] : [];
  });
}
