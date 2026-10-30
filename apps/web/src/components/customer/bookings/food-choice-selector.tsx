"use client";
import type {FoodChoiceGroupV2, FoodChoiceSelectionV2} from "@feasta/shared-types/provider-package-v2";
export function FoodChoiceSelector({groups, value, onChange}: {
  groups: FoodChoiceGroupV2[]; value: FoodChoiceSelectionV2[]; onChange: (value: FoodChoiceSelectionV2[]) => void;
}) {
  return <div className="grid gap-4">{groups.map((group) => {
    const selected = value.find((s) => s.groupId === group.id)?.optionIds ?? [];
    return <fieldset key={group.id} className="rounded-lg border p-4">
      <legend>{group.title} ? choose exactly {group.selectionCount}</legend>
      {group.options.map((option) => <label key={option.id} className="flex min-h-12 items-center gap-3">
        <input type="checkbox" checked={selected.includes(option.id)}
          disabled={!selected.includes(option.id) && selected.length >= group.selectionCount}
          onChange={() => onChange([...value.filter((s) => s.groupId !== group.id), {groupId: group.id,
            optionIds: selected.includes(option.id) ? selected.filter((id) => id !== option.id) : [...selected, option.id]}])}/>
        {option.name}
      </label>)}
    </fieldset>;
  })}</div>;
}
