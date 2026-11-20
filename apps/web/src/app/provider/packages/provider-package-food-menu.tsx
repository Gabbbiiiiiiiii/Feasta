"use client";

import {Button} from "@/components/ui/button";
import {categoryKey, foodInclusionsError, parsePackageDishes, serializePackageDish} from "@/lib/provider/package-food-inclusions";
import {ProviderDishLibrary} from "./provider-dish-library";

export function ProviderPackageFoodMenu({value, onChange, disabled = false}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const categories = new Map<string, ReturnType<typeof parsePackageDishes>>();
  const dishes = parsePackageDishes(value);
  for (const dish of dishes) {
    const category = dish.category || "Uncategorized";
    categories.set(category, [...(categories.get(category) ?? []), dish]);
  }
  return <section className="space-y-4" aria-label="Food menu editor">
    <h4 className="font-bold">Included dishes</h4>
    <p className="text-sm text-muted-foreground">Every listed dish is included in this package.</p>
    <ProviderDishLibrary destination="Fixed inclusions" disabled={disabled} onAdd={(dishes) => {
      const inclusions = [...value];
      const existing = new Set(value.map(categoryKey));
      for (const dish of dishes) {
        const raw = serializePackageDish(dish.category, dish.name);
        if (existing.has(categoryKey(raw))) continue;
        inclusions.push(raw);
        existing.add(categoryKey(raw));
      }
      const invalid = foodInclusionsError(inclusions);
      if (invalid) return invalid;
      onChange(inclusions);
    }} />
    {[...categories].map(([category, items]) => <details key={category} className="rounded-lg border border-border px-3 py-2">
      <summary className="cursor-pointer font-medium">{category} ({items.length})</summary>
      <ul className="divide-y divide-border">
        {items.map((dish) => <li key={dish.id} className="flex items-center justify-between gap-3">
          <span>{dish.name}</span>
          <Button type="button" variant="ghost" disabled={disabled} aria-label={`Remove ${dish.name}`}
            onClick={() => onChange(dishes.filter((row) => row.id !== dish.id).map((row) => row.raw))}>Remove</Button>
        </li>)}
      </ul>
    </details>)}
  </section>;
}
