"use client";

import {CheckCircle2, UtensilsCrossed} from "lucide-react";
import type {
  FoodChoiceGroupV2,
  FoodChoiceSelectionV2,
} from "@feasta/shared-types/provider-package-v2";

export function FoodChoiceSelector({
  groups,
  value,
  onChange,
}: {
  groups: FoodChoiceGroupV2[];
  value: FoodChoiceSelectionV2[];
  onChange: (value: FoodChoiceSelectionV2[]) => void;
}) {
  if (groups.length === 0) return null;

  const completeCount = groups.filter((group) => {
    const selected = value.find((entry) => entry.groupId === group.id)?.optionIds ?? [];
    return selected.length === group.selectionCount;
  }).length;

  return (
    <section aria-labelledby="required-dishes-title" className="grid gap-4">
      <div className="rounded-2xl border border-feasta-border-soft bg-feasta-canvas p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-strong">
              <UtensilsCrossed aria-hidden="true" className="size-5" />
            </span>
            <div>
              <h3 id="required-dishes-title" className="text-base font-extrabold text-foreground">
                Choose your dishes
              </h3>
              <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">
                Required: complete each group using the number of dishes shown.
              </p>
            </div>
          </div>
          <span
            aria-live="polite"
            className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary-strong"
          >
            {completeCount} of {groups.length} groups complete
          </span>
        </div>
      </div>

      {groups.map((group) => {
        const selected = value.find((entry) => entry.groupId === group.id)?.optionIds ?? [];
        const complete = selected.length === group.selectionCount;

        return (
          <fieldset
            key={group.id}
            className="min-w-0 rounded-2xl border border-feasta-border-soft bg-white p-4"
          >
            <legend className="px-2 text-base font-bold text-foreground">
              {group.title}
            </legend>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-feasta-text-secondary">
                Choose exactly {group.selectionCount}
              </span>
              <span
                aria-live="polite"
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                  complete
                    ? "bg-secondary text-primary-strong"
                    : "bg-feasta-surface-muted text-feasta-text-secondary",
                ].join(" ")}
              >
                {complete ? <CheckCircle2 aria-hidden="true" className="size-4" /> : null}
                {selected.length} of {group.selectionCount} selected
              </span>
            </div>

            {complete ? <div className="mb-3 rounded-xl bg-feasta-canvas p-3">
              <p className="text-sm font-semibold">{group.options.filter(option => selected.includes(option.id)).map(option => option.name).join(", ")}</p>
            </div> : null}
            <div className="grid gap-2 sm:grid-cols-2">
              {group.options.map((option) => {
                const checked = selected.includes(option.id);
                const atLimit = !checked && selected.length >= group.selectionCount;

                return (
                  <label
                    key={option.id}
                    className={[
                      "flex min-h-12 min-w-0 items-center gap-3 rounded-xl border px-3 py-2",
                      "transition-colors focus-within:ring-2 focus-within:ring-primary",
                      checked
                        ? "border-primary bg-secondary/50"
                        : "border-feasta-border-soft bg-white",
                      atLimit ? "opacity-60" : "cursor-pointer",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atLimit}
                      onChange={() => onChange([
                        ...value.filter((entry) => entry.groupId !== group.id),
                        {
                          groupId: group.id,
                          optionIds: checked
                            ? selected.filter((id) => id !== option.id)
                            : [...selected, option.id],
                        },
                      ])}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 text-sm font-medium text-foreground">
                      {option.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}
