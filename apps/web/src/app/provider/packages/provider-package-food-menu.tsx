"use client";

import {ChevronDown, ChevronRight, X} from "lucide-react";
import {useId, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {categoryKey, foodInclusionsError, parsePackageDishes, serializePackageDish, type PackageDish} from "@/lib/provider/package-food-inclusions";
import {loadDishLibrary, type LibraryDish} from "./dish-library-actions";
import {ProviderDishLibrary} from "./provider-dish-library";
import {usePackageConfirmation} from "./use-package-confirmation";

type CategoryDishCandidate = {
  id: string;
  name: string;
  raw: string;
};

type CategoryEditDraft = {
  category: string;
  candidates: CategoryDishCandidate[];
  selectedIds: string[];
};

function mergeCategoryCandidates(
  libraryDishes: LibraryDish[],
  savedItems: PackageDish[],
  category: string,
): {candidates: CategoryDishCandidate[]; initialSelectedIds: string[]} {
  const targetKey = category === "Uncategorized" ? "" : categoryKey(category);
  const matchingLibrary = targetKey
    ? libraryDishes.filter((dish) => categoryKey(dish.category) === targetKey)
    : [];

  const savedByName = new Map<string, PackageDish>();
  for (const item of savedItems) {
    const normalized = categoryKey(item.name);
    if (normalized && !savedByName.has(normalized)) savedByName.set(normalized, item);
  }

  const usedSavedIds = new Set<string>();
  const candidates: CategoryDishCandidate[] = [];
  const initialSelectedIds: string[] = [];
  const seenKeys = new Set<string>();

  for (const dish of matchingLibrary) {
    const normalizedName = categoryKey(dish.name);
    const matchedSaved = savedByName.get(normalizedName);
    const raw = matchedSaved ? matchedSaved.raw : serializePackageDish(dish.category, dish.name);
    const dedupeKey = categoryKey(raw);
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    const id = matchedSaved ? matchedSaved.id : dish.id;
    candidates.push({id, name: matchedSaved ? matchedSaved.name : dish.name, raw});
    if (matchedSaved) {
      usedSavedIds.add(matchedSaved.id);
      initialSelectedIds.push(id);
    }
  }

  for (const item of savedItems) {
    if (usedSavedIds.has(item.id)) continue;
    const dedupeKey = categoryKey(item.raw);
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    candidates.push({id: item.id, name: item.name, raw: item.raw});
    initialSelectedIds.push(item.id);
  }

  return {candidates, initialSelectedIds};
}

export function ProviderPackageFoodMenu({value, onChange, disabled = false}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const {confirm, confirmationDialog} = usePackageConfirmation();
  const idPrefix = useId();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<CategoryEditDraft | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const originalSelected = useRef("");
  const openRequestId = useRef(0);
  const opener = useRef<HTMLButtonElement | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const categories = new Map<string, PackageDish[]>();
  const dishes = parsePackageDishes(value);
  for (const dish of dishes) {
    const category = dish.category || "Uncategorized";
    categories.set(category, [...(categories.get(category) ?? []), dish]);
  }

  function toggleCategoryExpanded(category: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function removeCategory(category: string, count: number) {
    if (
      count > 1 &&
      !await confirm({
        message: `Remove ${category} and its ${count} included dishes?`,
        confirmLabel: "Remove category",
      })
    ) return;
    setExpandedCategories((current) => {
      if (!current.has(category)) return current;
      const next = new Set(current);
      next.delete(category);
      return next;
    });
    onChange(dishes.filter((row) => (row.category || "Uncategorized") !== category).map((row) => row.raw));
  }

  async function openCategoryEditor(button: HTMLButtonElement, category: string, items: PackageDish[]) {
    const requestId = ++openRequestId.current;
    const initialCandidates: CategoryDishCandidate[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      raw: item.raw,
    }));
    const initialIds = initialCandidates.map((item) => item.id);
    opener.current = button;
    originalSelected.current = JSON.stringify(initialIds);
    setLoadError(null);
    setSaveError(null);
    setEditing({category, candidates: initialCandidates, selectedIds: initialIds});
    setLoadingCategory(true);
    try {
      const library = await loadDishLibrary();
      if (openRequestId.current !== requestId) return;
      const {candidates, initialSelectedIds} = mergeCategoryCandidates(library.dishes, items, category);
      originalSelected.current = JSON.stringify(initialSelectedIds);
      setEditing({category, candidates, selectedIds: initialSelectedIds});
    } catch {
      if (openRequestId.current !== requestId) return;
      setLoadError("Could not load additional dishes from your Dish List. You can still review or remove current dishes, or close and try again.");
    } finally {
      if (openRequestId.current === requestId) setLoadingCategory(false);
    }
  }

  async function closeCategoryEditor() {
    if (
      editing &&
      JSON.stringify(editing.selectedIds) !== originalSelected.current &&
      !await confirm({
        message: "Discard unsaved dish changes?",
        confirmLabel: "Discard Changes",
      })
    ) return;
    openRequestId.current += 1;
    setEditing(null);
    setLoadError(null);
    setSaveError(null);
  }

  function setCandidateSelection(targetIds: string[], checked: boolean) {
    if (!editing || disabled || loadingCategory) return;
    const targetSet = new Set(targetIds);
    const currentSet = new Set(editing.selectedIds);
    if (checked) {
      for (const id of targetSet) currentSet.add(id);
    } else {
      for (const id of targetSet) currentSet.delete(id);
    }
    const nextSelectedIds = editing.candidates
      .filter((candidate) => currentSet.has(candidate.id))
      .map((candidate) => candidate.id);
    setEditing({...editing, selectedIds: nextSelectedIds});
    setSaveError(null);
  }

  function saveCategoryEditor() {
    if (!editing || disabled || loadingCategory) return;
    const selectedSet = new Set(editing.selectedIds);
    const firstIndex = dishes.findIndex((row) => (row.category || "Uncategorized") === editing.category);
    const remaining = dishes
      .filter((row) => (row.category || "Uncategorized") !== editing.category)
      .map((row) => row.raw);
    const existingKeys = new Set(remaining.map(categoryKey));
    const additions: string[] = [];
    for (const candidate of editing.candidates) {
      if (!selectedSet.has(candidate.id)) continue;
      const key = categoryKey(candidate.raw);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      additions.push(candidate.raw);
    }
    const insertAt = firstIndex === -1 ? remaining.length : Math.min(firstIndex, remaining.length);
    const next = [
      ...remaining.slice(0, insertAt),
      ...additions,
      ...remaining.slice(insertAt),
    ];
    const invalid = foodInclusionsError(next);
    if (invalid) {
      setSaveError(invalid);
      return;
    }
    onChange(next);
    openRequestId.current += 1;
    setEditing(null);
    setLoadError(null);
    setSaveError(null);
  }

  const editingSelectedSet = new Set(editing?.selectedIds ?? []);
  const editingAllSelected = Boolean(
    editing && editing.candidates.length > 0 && editing.selectedIds.length === editing.candidates.length,
  );

  return <section ref={sectionRef} className="space-y-4 rounded-xl border border-border bg-card p-4" aria-label="Food menu editor">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h4 className="font-bold">Included dishes</h4>
        <p className="text-sm text-muted-foreground">Every listed dish is included in this package.</p>
      </div>
      <ProviderDishLibrary destination="Fixed inclusions" includeUngrouped disabled={disabled} onAdd={(dishes) => {
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
    </div>
    {[...categories].map(([category, items], index) => {
      const isOpen = expandedCategories.has(category);
      const panelId = `${idPrefix}-category-${index}`;
      return (
        <div
          key={category}
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 px-3 py-2">
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggleCategoryExpanded(category)}
              className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left transition-colors duration-fast hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {isOpen ? (
                <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 break-words text-sm font-semibold text-foreground">
                {category} ({items.length})
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="compact"
                className="h-8 min-h-8 min-w-0 px-3 py-1 text-xs"
                disabled={disabled}
                aria-label={`Edit ${category} category`}
                onClick={(event) => void openCategoryEditor(event.currentTarget, category, items)}
              >
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="compact"
                className="h-8 min-h-8 min-w-0 px-3 py-1 text-xs text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
                disabled={disabled}
                aria-label={`Remove ${category} category`}
                onClick={() => void removeCategory(category, items.length)}
              >
                Remove
              </Button>
            </div>
          </div>
          <div id={panelId} hidden={!isOpen} className="border-t border-border bg-card p-3">
            <ul className="flex max-h-44 flex-wrap gap-2 overflow-y-auto" aria-label={`${category} included dishes`}>
              {items.map((dish) => (
                <li
                  key={dish.id}
                  className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-border bg-muted/30 py-0.5 pl-3 pr-1 text-xs font-medium text-foreground"
                >
                  <span className="min-w-0 break-words">{dish.name}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`Remove ${dish.name}`}
                    onClick={() => onChange(dishes.filter((row) => row.id !== dish.id).map((row) => row.raw))}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast hover:bg-destructive-subtle hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    })}
    <Dialog open={editing !== null} onOpenChange={(isOpen) => {if (!isOpen) void closeCategoryEditor();}}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        className="z-[70] flex max-h-[calc(100dvh-2rem)] min-w-0 max-w-2xl flex-col gap-0 overflow-hidden p-0"
        overlayClassName="z-[60]"
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const fallback = sectionRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
          (opener.current?.isConnected ? opener.current : fallback)?.focus();
        }}
      >
        <DialogHeader className="shrink-0 border-b p-6 pr-14">
          <DialogTitle>{editing ? `Edit ${editing.category}` : "Edit included dishes"}</DialogTitle>
          <DialogDescription>
            {editing
              ? `Select which dishes from ${editing.category} are included in this package.`
              : "Select which dishes are included in this package."}
          </DialogDescription>
        </DialogHeader>
        {editing ? <>
          <div className="min-h-0 space-y-4 overflow-y-auto p-6">
            {loadingCategory ? <p role="status" className="text-sm text-muted-foreground">Loading dishes...</p> : null}
            {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
            <section className="rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-1 px-3 py-2">
                <p className="text-xs font-semibold text-foreground" aria-live="polite">
                  {editing.category} ({editing.candidates.length}) · {editing.selectedIds.length} selected
                </p>
                <label className="inline-flex cursor-pointer items-center gap-1.5 px-1 text-xs">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={editingAllSelected}
                    disabled={disabled || loadingCategory || editing.candidates.length === 0}
                    aria-label={`${editingAllSelected ? "Clear" : "Select all"} ${editing.category}`}
                    onChange={(event) => setCandidateSelection(editing.candidates.map((item) => item.id), event.target.checked)}
                  />
                  Select all
                </label>
              </div>
              <div className="grid max-h-64 gap-2 overflow-y-auto overscroll-contain border-t border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
                {editing.candidates.map((dish) => {
                  const isSelected = editingSelectedSet.has(dish.id);
                  return (
                    <label
                      key={dish.id}
                      className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors duration-fast motion-reduce:transition-none ${
                        isSelected
                          ? "border-primary bg-secondary"
                          : "border-border bg-muted/30"
                      } ${disabled || loadingCategory ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="shrink-0 accent-primary"
                        checked={isSelected}
                        disabled={disabled || loadingCategory}
                        onChange={(event) => setCandidateSelection([dish.id], event.target.checked)}
                      />
                      <span className="min-w-0 break-words">{dish.name}</span>
                    </label>
                  );
                })}
              </div>
            </section>
            {editing.selectedIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Saving with 0 selected will remove {editing.category} from this package.
              </p>
            ) : null}
            {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
          </div>
          <DialogFooter className="shrink-0 border-t p-4">
            <Button type="button" variant="secondary" onClick={() => void closeCategoryEditor()}>Cancel</Button>
            <Button type="button" disabled={disabled || loadingCategory} onClick={saveCategoryEditor}>Save dishes</Button>
          </DialogFooter>
        </> : null}
      </DialogContent>
    </Dialog>
    {confirmationDialog}
  </section>;
}
