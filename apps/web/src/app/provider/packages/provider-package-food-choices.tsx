"use client";

import type {FoodChoiceGroupV2} from "@feasta/shared-types/provider-package-v2";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";

export function ProviderPackageFoodChoices({value, onChange, disabled = false}: {
  value: FoodChoiceGroupV2[];
  onChange: (groups: FoodChoiceGroupV2[]) => void;
  disabled?: boolean;
}) {
  const setGroup = (id: string, update: (group: FoodChoiceGroupV2) => FoodChoiceGroupV2) =>
    onChange(value.map((group) => group.id === id ? update(group) : group));
  return (
    <section aria-label="Customer-selectable food groups" className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="font-bold">Customer-selectable food groups</h4>
          <p className="text-sm text-muted-foreground">Example: Main dish — offer 3 dishes, customer chooses exactly 1. Separate from dishes already included.</p>
        </div>
        <Button type="button" variant="secondary" disabled={disabled || value.length >= 10} onClick={() =>
          onChange([...value, {id: crypto.randomUUID(), title: "", selectionCount: 1,
            options: [{id: crypto.randomUUID(), name: ""}, {id: crypto.randomUUID(), name: ""}]}])}>
          Add choice group
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Private draft only — customer booking cannot use these choices yet. Up to 10 groups, 10 dishes per group, 50 choices total.</p>
      {value.map((group, groupIndex) => (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3" key={group.id}>
          <div className="flex items-center justify-between gap-2">
            <h5 className="text-sm font-semibold">Choice group {groupIndex + 1}</h5>
            <Button type="button" variant="ghost" disabled={disabled} aria-label={`Remove choice group ${groupIndex + 1}`}
              onClick={() => onChange(value.filter((row) => row.id !== group.id))}>Remove group</Button>
          </div>
          <label className="grid gap-2 text-sm font-medium">Group name {groupIndex + 1}
            <Input aria-label={`Choice group ${groupIndex + 1} name`} maxLength={80} value={group.title}
              disabled={disabled} placeholder="e.g., Main dish"
              onChange={(event) => setGroup(group.id, (row) => ({...row, title: event.target.value}))} />
          </label>
          <label className="grid gap-2 text-sm font-medium">Number of dishes customer must choose
            <Select aria-label={`Choice group ${groupIndex + 1} selection count`} value={String(group.selectionCount)} disabled={disabled}
              onChange={(event) => setGroup(group.id, (row) => ({...row, selectionCount: Number(event.target.value)}))}>
              {Array.from({length: Math.max(1, group.options.length)}, (_, i) => i + 1).map((n) =>
                <option key={n} value={n}>Choose exactly {n}</option>)}
            </Select>
          </label>
          <div className="space-y-2">
            {group.options.map((option, index) => <div className="flex items-end gap-2" key={option.id}>
              <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">Dish option {index + 1}
                <Input aria-label={`Choice group ${groupIndex + 1} dish ${index + 1}`} maxLength={120} disabled={disabled}
                  value={option.name} placeholder="e.g., Chicken Afritada"
                  onChange={(event) => setGroup(group.id, (row) => ({...row, options: row.options.map((item) =>
                    item.id === option.id ? {...item, name: event.target.value} : item)}))} />
              </label>
              <Button type="button" variant="secondary" disabled={disabled || group.options.length <= 2}
                aria-label={`Remove choice group ${groupIndex + 1} dish ${index + 1}`}
                onClick={() => setGroup(group.id, (row) => ({...row,
                  selectionCount: Math.min(row.selectionCount, row.options.length - 1),
                  options: row.options.filter((item) => item.id !== option.id)}))}>Remove</Button>
            </div>)}
          </div>
          <Button type="button" variant="secondary" disabled={disabled || group.options.length >= 10 ||
            value.reduce((total, row) => total + row.options.length, 0) >= 50}
          onClick={() => setGroup(group.id, (row) => ({...row, options: [...row.options,
            {id: crypto.randomUUID(), name: ""}]}))}>Add dish option</Button>
        </div>
      ))}
    </section>
  );
}
