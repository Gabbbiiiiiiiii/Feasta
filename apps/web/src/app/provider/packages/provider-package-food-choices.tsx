"use client";
import {ProviderPackageIntegerInput, isPackageIntegerEdit} from "./provider-package-integer-input";
import {usePackageConfirmation} from "./use-package-confirmation";

import {ChevronDown, ChevronRight} from "lucide-react";
import {useId, useRef, useState} from "react";
import type {FoodChoiceGroupV2} from "@feasta/shared-types/provider-package-v2";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {parseFoodChoiceGroupsV2} from "@/lib/provider/food-choice-groups-v2";

import {Select} from "@/components/ui/select";
import {loadDishLibrary} from "./dish-library-actions";

type DishLibraryResult = Awaited<ReturnType<typeof loadDishLibrary>>;
type FoodChoiceOption = FoodChoiceGroupV2["options"][number];
type EligibleDish = FoodChoiceOption & {category: string};
type Draft = {
  group: FoodChoiceGroupV2;
  count: string;
  countError?: string;
};

const key = (text: string) => text.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleLowerCase("en-PH");
const toOption = ({id, name}: {id: string; name: string}): FoodChoiceOption => ({id, name});

function buildParentGroupDishes(library: DishLibraryResult) {
  const groups = new Map<string, EligibleDish[]>();
  const labels = new Map<string, string>();
  const register = (raw: string | undefined) => {
    const trimmed = raw?.trim();
    if (!trimmed) return "";
    const existing = labels.get(key(trimmed));
    if (existing) return existing;
    labels.set(key(trimmed), trimmed);
    groups.set(trimmed, []);
    return trimmed;
  };

  for (const name of library.groupNames ?? []) register(name);
  for (const group of Object.values(library.parentGroups ?? {})) register(group);

  const categoryParent = (category: string) => {
    const parentGroups = library.parentGroups ?? {};
    const categoryId = key(category);
    return Object.hasOwn(parentGroups, categoryId) ? parentGroups[categoryId] : "";
  };

  const nameCounts = new Map<string, number>();
  for (const dish of library.dishes) {
    const parent = register(dish.parentGroup?.trim() || categoryParent(dish.category));
    if (!parent) continue;
    const nameKey = JSON.stringify([key(parent), key(dish.name)]);
    nameCounts.set(nameKey, (nameCounts.get(nameKey) ?? 0) + 1);
  }

  for (const dish of library.dishes) {
    const parent = register(dish.parentGroup?.trim() || categoryParent(dish.category));
    if (!parent) continue;
    const items = groups.get(parent) ?? [];
    const nameKey = JSON.stringify([key(parent), key(dish.name)]);
    const suffix = ` (${dish.category})`;
    const name = (nameCounts.get(nameKey) ?? 0) > 1
      ? dish.name.slice(0, Math.max(0, 120 - suffix.length)) + suffix.slice(0, 120)
      : dish.name;
    items.push({id: dish.id, name, category: dish.category.trim() || "Uncategorized"});
    groups.set(parent, items);
  }

  return {groups, labels};
}

function mergeEligibleDishes(
  libraryOptions: EligibleDish[],
  savedOptions: FoodChoiceOption[],
): EligibleDish[] {
  const usedSavedIds = new Set<string>();
  const savedById = new Map(savedOptions.map((option) => [option.id, option]));
  const savedByName = new Map<string, FoodChoiceOption>();
  for (const option of savedOptions) {
    if (option.name.trim()) {
      const normalized = key(option.name);
      if (!savedByName.has(normalized)) savedByName.set(normalized, option);
    }
  }

  const merged: EligibleDish[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const libOption of libraryOptions) {
    const matched =
      savedById.get(libOption.id) ??
      (libOption.name.trim() ? savedByName.get(key(libOption.name)) : undefined);
    const candidate: EligibleDish = matched && !usedSavedIds.has(matched.id)
      ? {id: matched.id, name: matched.name, category: libOption.category}
      : {...libOption};
    if (matched && candidate.id === matched.id) usedSavedIds.add(matched.id);
    if (seenIds.has(candidate.id)) continue;
    const normalized = candidate.name.trim() ? key(candidate.name) : "";
    if (normalized && seenNames.has(normalized)) continue;
    seenIds.add(candidate.id);
    if (normalized) seenNames.add(normalized);
    merged.push(candidate);
  }

  for (const savedOption of savedOptions) {
    if (usedSavedIds.has(savedOption.id) || seenIds.has(savedOption.id)) continue;
    const normalized = savedOption.name.trim() ? key(savedOption.name) : "";
    if (normalized && seenNames.has(normalized)) continue;
    seenIds.add(savedOption.id);
    if (normalized) seenNames.add(normalized);
    merged.push({id: savedOption.id, name: savedOption.name, category: "Saved dishes"});
  }

  return merged;
}

function groupDishesByCategory(dishes: EligibleDish[]) {
  const categories = new Map<string, {name: string; dishes: EligibleDish[]}>();
  for (const dish of dishes) {
    const label = dish.category.trim() || "Uncategorized";
    const categoryId = key(label);
    const row = categories.get(categoryId) ?? {name: label, dishes: []};
    row.dishes.push(dish);
    categories.set(categoryId, row);
  }
  return [...categories.values()];
}

export function ProviderPackageFoodChoices({value, onChange, disabled = false}: {
  value: FoodChoiceGroupV2[];
  onChange: (groups: FoodChoiceGroupV2[]) => void;
  disabled?: boolean;
}) {
  const {confirm, confirmationDialog} = usePackageConfirmation();
  const idPrefix = useId();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [initialGroup, setInitialGroup] = useState<{title: string; options: FoodChoiceOption[]} | null>(null);
  const [parentGroups, setParentGroups] = useState<Map<string, EligibleDish[]> | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => new Set());
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const original = useRef("");
  const openRequestId = useRef(0);
  const opener = useRef<HTMLButtonElement | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const otherGroups = value.filter((group) => group.id !== draft?.group.id);
  const isEditing = Boolean(draft && value.some((group) => group.id === draft.group.id));

  async function open(button: HTMLButtonElement, group?: FoodChoiceGroupV2) {
    const requestId = ++openRequestId.current;
    const initialOptions = group ? group.options.map(toOption) : [];
    const next: Draft = {
      group: group
        ? {...group, options: initialOptions.map(toOption)}
        : {id: crypto.randomUUID(), title: "", selectionCount: 1, options: []},
      count: String(group?.selectionCount ?? 1),
    };
    opener.current = button;
    original.current = JSON.stringify(next);
    setError(null);
    setLoadError(null);
    setCollapsedCategories(new Set());
    setInitialGroup(group ? {title: group.title, options: initialOptions} : null);
    setDraft(next);
    setParentGroups(null);
    setLoadingGroups(true);
    try {
      const library = await loadDishLibrary();
      if (openRequestId.current !== requestId) return;
      const {groups, labels} = buildParentGroupDishes(library);
      if (group?.title.trim()) {
        const matched = labels.get(key(group.title));
        if (!matched) {
          groups.set(group.title, group.options.map((option) => ({...toOption(option), category: "Saved dishes"})));
        } else if (matched !== group.title) {
          setInitialGroup((current) =>
            current && key(current.title) === key(matched)
              ? {...current, title: matched}
              : current,
          );
          setDraft((current) => {
            if (!current || current.group.id !== group.id || current.group.title !== group.title) return current;
            const aligned: Draft = {...current, group: {...current.group, title: matched}};
            if (JSON.stringify(current) === original.current) {
              original.current = JSON.stringify(aligned);
            }
            return aligned;
          });
        }
      }
      setParentGroups(groups);
    } catch {
      if (openRequestId.current !== requestId) return;
      if (group?.title.trim()) {
        setParentGroups(new Map([[group.title, group.options.map((option) => ({...toOption(option), category: "Saved dishes"}))]]));
      }
      setLoadError("Could not load Parent Groups from your Dish List. Close and try again.");
    } finally {
      if (openRequestId.current === requestId) setLoadingGroups(false);
    }
  }

  async function close() {
    if (draft && JSON.stringify(draft) !== original.current && !await confirm({
      message: "Discard unsaved food choice group changes?",
      confirmLabel: "Discard Changes",
    })) return;
    openRequestId.current += 1;
    setDraft(null);
    setInitialGroup(null);
    setParentGroups(null);
    setCollapsedCategories(new Set());
    setLoadError(null);
    setError(null);
  }

  function updateDraft(next: Draft) {
    setDraft(next);
    setError(null);
  }

  function selectParentGroup(selectedTitle: string) {
    if (!draft) return;
    const libraryOptions = parentGroups?.get(selectedTitle) ?? [];
    const initialForTitle =
      initialGroup && key(initialGroup.title) === key(selectedTitle)
        ? initialGroup.options
        : [];
    const nextOptions = mergeEligibleDishes(libraryOptions, initialForTitle).map(toOption);
    setCollapsedCategories(new Set());
    updateDraft({
      ...draft,
      group: {
        ...draft.group,
        title: selectedTitle,
        options: nextOptions,
      },
    });
  }

  const parsedCount = draft && isPackageIntegerEdit(draft.count, 10) ? Number(draft.count) : Number.NaN;
  const hasSelectedGroup = Boolean(draft?.group.title.trim());
  const eligibleDishes: EligibleDish[] = (() => {
    if (!draft || !hasSelectedGroup) return [];
    const libraryOptions = parentGroups?.get(draft.group.title) ?? [];
    const initialForTitle =
      initialGroup && key(initialGroup.title) === key(draft.group.title)
        ? initialGroup.options
        : [];
    if (parentGroups === null) {
      const source = initialForTitle.length > 0 ? initialForTitle : draft.group.options;
      return source.map((option) => ({...toOption(option), category: "Saved dishes"}));
    }
    return mergeEligibleDishes(libraryOptions, initialForTitle);
  })();
  const categorySections = groupDishesByCategory(eligibleDishes);
  const eligibleCount = eligibleDishes.length;
  const selectedCount = draft?.group.options.length ?? 0;
  const selectedIds = new Set(draft?.group.options.map((option) => option.id) ?? []);
  const allEligibleSelected = eligibleCount > 0 && selectedCount === eligibleCount;

  function setDishesSelected(dishes: EligibleDish[], checked: boolean) {
    if (!draft || disabled || loadingGroups) return;
    const targetIds = new Set(dishes.map((dish) => dish.id));
    let nextOptions: FoodChoiceOption[];
    if (!checked) {
      nextOptions = draft.group.options.filter((option) => !targetIds.has(option.id));
    } else {
      const existingIds = new Set(draft.group.options.map((option) => option.id));
      const additions = dishes.filter((dish) => !existingIds.has(dish.id));
      if (additions.length === 0) return;
      const indexById = new Map(eligibleDishes.map((item, index) => [item.id, index]));
      nextOptions = [...draft.group.options];
      for (const dish of additions) {
        const targetIndex = indexById.get(dish.id) ?? Number.MAX_SAFE_INTEGER;
        const insertAt = nextOptions.findIndex(
          (item) => (indexById.get(item.id) ?? Number.MAX_SAFE_INTEGER) > targetIndex,
        );
        if (insertAt === -1) nextOptions.push(toOption(dish));
        else nextOptions.splice(insertAt, 0, toOption(dish));
      }
    }
    updateDraft({
      ...draft,
      group: {
        ...draft.group,
        options: nextOptions,
      },
    });
  }

  function toggleCategory(categoryName: string) {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryName)) next.delete(categoryName);
      else next.add(categoryName);
      return next;
    });
  }

  const selectionError = draft?.countError || (
    !draft
      ? null
      : draft.count === ""
        ? "Enter how many dishes customers should choose."
        : !Number.isSafeInteger(parsedCount) || parsedCount < 1 || parsedCount > 10
          ? "Enter a number from 1 to 10."
          : hasSelectedGroup && selectedCount > 0 && parsedCount > selectedCount
            ? selectedCount < eligibleCount
              ? `Only ${selectedCount} ${selectedCount === 1 ? "dish" : "dishes"} available in ${draft.group.title}. Select more dishes or enter ${selectedCount} or fewer.`
              : `Only ${selectedCount} ${selectedCount === 1 ? "dish" : "dishes"} available in ${draft.group.title}. Enter ${selectedCount} or fewer.`
            : null
  );

  const canSave = Boolean(
    draft &&
    !disabled &&
    !loadingGroups &&
    hasSelectedGroup &&
    selectedCount > 0 &&
    !selectionError,
  );

  function save() {
    if (!draft || disabled || selectionError) return;
    const {group, count} = draft;
    const selectionCount = Number(count);
    let message: string | null = null;
    if (!group.title.trim()) {
      message = "Select a Parent Group from your Dish List.";
    } else if (eligibleCount === 0) {
      message = `Add dishes to ${group.title} in your Dish List first.`;
    } else if (group.options.length === 0) {
      message = `Select at least 1 dish from ${group.title} first.`;
    } else if (group.options.some((option) => !option.name.trim())) {
      message = "Every dish in this group needs a valid name.";
    } else if (!Number.isSafeInteger(selectionCount) || selectionCount < 1 || selectionCount > 10) {
      message = "Enter a number from 1 to 10.";
    } else if (selectionCount > group.options.length) {
      message = group.options.length < eligibleCount
        ? `Only ${group.options.length} ${group.options.length === 1 ? "dish" : "dishes"} available in ${group.title}. Select more dishes or enter ${group.options.length} or fewer.`
        : `Only ${group.options.length} ${group.options.length === 1 ? "dish" : "dishes"} available in ${group.title}. Enter ${group.options.length} or fewer.`;
    } else if (otherGroups.some((row) => key(row.title) === key(group.title))) {
      message = "This Parent Group has already been added.";
    } else if (new Set(group.options.map((option) => key(option.name))).size !== group.options.length) {
      message = "Food options must be unique within this group.";
    }
    const saved: FoodChoiceGroupV2 = {...group, selectionCount};
    const next = value.some((row) => row.id === group.id)
      ? value.map((row) => row.id === group.id ? saved : row)
      : [...value, saved];
    if (!message) {
      try {
        parseFoodChoiceGroupsV2(next);
      } catch {
        message = "Check the group and dish names. Use up to 80 characters for group names and 120 for dish names.";
      }
    }
    if (message) {
      setError(message);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    onChange(next);
    openRequestId.current += 1;
    setDraft(null);
    setInitialGroup(null);
    setParentGroups(null);
    setCollapsedCategories(new Set());
    setLoadError(null);
    setError(null);
  }

  const groupNames = parentGroups ? [...parentGroups.keys()] : draft?.group.title ? [draft.group.title] : [];

  function toggleGroupExpanded(groupId: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  async function removeGroup(group: FoodChoiceGroupV2, index: number) {
    if (
      group.options.length > 1 &&
      !await confirm({
        message: `Remove ${group.title || `Choice group ${index + 1}`} and its ${group.options.length} dishes?`,
        confirmLabel: "Remove group",
      })
    ) return;
    setExpandedGroups((current) => {
      if (!current.has(group.id)) return current;
      const next = new Set(current);
      next.delete(group.id);
      return next;
    });
    onChange(value.filter((row) => row.id !== group.id));
  }

  return (
    <section aria-label="Customer-selectable food groups" className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-bold">Customer-selectable food groups</h4>
          <p className="text-sm text-muted-foreground">
            Choose a Parent Group from your Dish List and set how many dishes customers pick (for example: choose 2 from Main dish). Up to 10 groups.
          </p>
        </div>
        <Button
          ref={addButton}
          type="button"
          variant="secondary"
          size="compact"
          className="h-9 min-h-9 min-w-0 px-3.5 py-1.5 text-sm"
          disabled={disabled || value.length >= 10}
          onClick={(event) => void open(event.currentTarget)}
        >
          Add choice group
        </Button>
      </div>
      {value.map((group, index) => {
        const isOpen = expandedGroups.has(group.id);
        const panelId = `${idPrefix}-group-${group.id}`;
        const label = group.title || `Choice group ${index + 1}`;
        return (
          <div key={group.id} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
                <h5 className="min-w-0">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleGroupExpanded(group.id)}
                    className="inline-flex min-h-8 items-center gap-2 rounded-md px-1 py-1 text-left text-sm font-semibold text-foreground transition-colors duration-fast hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  >
                    {isOpen ? (
                      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="break-words">{label}</span>
                  </button>
                </h5>
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary-tint px-2.5 py-0.5 text-xs font-medium text-primary">
                  Choose {group.selectionCount} from {group.options.length} {group.options.length === 1 ? "dish" : "dishes"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  className="h-8 min-h-8 min-w-0 px-3 py-1 text-xs"
                  disabled={disabled}
                  aria-label={`Edit choice group ${index + 1}`}
                  onClick={(event) => void open(event.currentTarget, group)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="compact"
                  className="h-8 min-h-8 min-w-0 px-3 py-1 text-xs text-muted-foreground hover:bg-destructive-subtle hover:text-destructive"
                  disabled={disabled}
                  aria-label={`Remove choice group ${index + 1}`}
                  onClick={() => void removeGroup(group, index)}
                >
                  Remove
                </Button>
              </div>
            </div>
            <div id={panelId} hidden={!isOpen} className="border-t border-border bg-card p-3">
              <ul className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto" aria-label={`${label} dishes`}>
                {group.options.map((option) => (
                  <li
                    key={option.id}
                    className="inline-flex max-w-full items-center rounded-full border border-border bg-muted/30 px-3 py-1 text-xs font-medium text-foreground"
                  >
                    <span className="min-w-0 break-words">{option.name || "Unnamed option"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
      <Dialog open={draft !== null} onOpenChange={(isOpen) => {if (!isOpen) void close();}}>
        <DialogContent
          onInteractOutside={(event) => event.preventDefault()}
          className="z-[70] flex max-h-[calc(100dvh-2rem)] min-w-0 max-w-2xl flex-col gap-0 overflow-hidden p-0"
          overlayClassName="z-[60]"
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (opener.current?.isConnected ? opener.current : addButton.current)?.focus();
          }}
        >
          <DialogHeader className="shrink-0 border-b p-6 pr-14">
            <DialogTitle>{isEditing ? "Edit Food Choice Group" : "Add Food Choice Group"}</DialogTitle>
            <DialogDescription>
              Select a Parent Group from your Dish List, choose which dishes to include, and set how many dishes customers can pick.
            </DialogDescription>
          </DialogHeader>
          {draft ? <>
            <div className="min-h-0 space-y-4 overflow-y-auto p-6">
              <label className="grid gap-2 text-sm font-medium">
                Group Name
                <Select
                  autoFocus
                  required
                  disabled={disabled || loadingGroups}
                  value={draft.group.title}
                  onChange={(event) => selectParentGroup(event.target.value)}
                >
                  <option value="" disabled>
                    {loadingGroups ? "Loading Parent Groups..." : "Select a Parent Group"}
                  </option>
                  {groupNames.map((groupName) => {
                    const usedByOther = otherGroups.some((item) => key(item.title) === key(groupName));
                    return (
                      <option key={groupName} value={groupName} disabled={usedByOther}>
                        {groupName}{usedByOther ? " (already added)" : ""}
                      </option>
                    );
                  })}
                </Select>
              </label>

              {!loadingGroups && !loadError && parentGroups && parentGroups.size === 0 ? (
                <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  No Parent Groups found yet. Create a Parent Group and assign dishes in your Dish List first.
                </p>
              ) : null}

              {loadError ? (
                <p role="alert" className="text-sm text-destructive">{loadError}</p>
              ) : null}

              <label className="grid gap-2 text-sm font-medium">
                Number of dishes to choose
                <ProviderPackageIntegerInput
                  label="Number of dishes to choose"
                  minimum={1}
                  maximum={10}
                  disabled={disabled}
                  invalid={Boolean(selectionError)}
                  showInlineError={false}
                  overflowMessage="Choose at most 10 dishes per group."
                  value={draft.count}
                  onChange={(count, countError) => updateDraft({...draft, count, countError})}
                />
              </label>

              {selectionError ? (
                <p role="alert" className="text-sm text-destructive">{selectionError}</p>
              ) : null}

              {hasSelectedGroup ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-sm font-medium text-foreground">
                        {eligibleCount} eligible {eligibleCount === 1 ? "dish" : "dishes"}
                      </p>
                      {eligibleCount > 0 ? (
                        <span className="text-xs text-muted-foreground" aria-live="polite">
                          {selectedCount} selected
                        </span>
                      ) : null}
                    </div>
                    {categorySections.length > 1 ? (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={allEligibleSelected}
                          disabled={disabled || loadingGroups}
                          aria-label={`${allEligibleSelected ? "Clear" : "Select all"} ${draft.group.title}`}
                          onChange={(event) => {
                            setDishesSelected(eligibleDishes, event.target.checked);
                            if (event.target.checked) setCollapsedCategories(new Set());
                          }}
                        />
                        Select all {draft.group.title}
                      </label>
                    ) : null}
                  </div>
                  {eligibleCount > 0 ? (
                    <>
                      <div className="max-h-64 space-y-2 overflow-y-auto overscroll-contain" aria-label="Eligible dishes">
                        {categorySections.map(({name: categoryName, dishes}) => {
                          const isOpen = !collapsedCategories.has(categoryName);
                          const categorySelectedCount = dishes.filter((dish) => selectedIds.has(dish.id)).length;
                          const allInCategory = dishes.length > 0 && categorySelectedCount === dishes.length;
                          return (
                            <section key={categoryName} className="rounded-lg border border-border bg-card">
                              <div className="flex flex-wrap items-center justify-between gap-1 px-2">
                                <Button
                                  type="button"
                                  size="compact"
                                  variant="ghost"
                                  className="h-auto min-h-9 min-w-0 whitespace-normal px-2 py-1 text-left text-xs"
                                  aria-expanded={isOpen}
                                  onClick={() => toggleCategory(categoryName)}
                                >
                                  {isOpen ? "▾" : "▸"} {categoryName} ({dishes.length}) · {categorySelectedCount} selected
                                </Button>
                                <label className="inline-flex cursor-pointer items-center gap-1.5 px-1 text-xs">
                                  <input
                                    type="checkbox"
                                    className="accent-primary"
                                    checked={allInCategory}
                                    disabled={disabled || loadingGroups}
                                    aria-label={`${allInCategory ? "Clear" : "Select all"} ${categoryName}`}
                                    onChange={(event) => setDishesSelected(dishes, event.target.checked)}
                                  />
                                  Select all
                                </label>
                              </div>
                              {isOpen ? (
                                <div className="grid gap-2 border-t border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
                                  {dishes.map((dish) => {
                                    const isSelected = selectedIds.has(dish.id);
                                    return (
                                      <label
                                        key={dish.id}
                                        className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors duration-fast motion-reduce:transition-none ${
                                          isSelected
                                            ? "border-primary bg-secondary"
                                            : "border-border bg-muted/30"
                                        } ${disabled || loadingGroups ? "cursor-not-allowed opacity-50" : ""}`}
                                      >
                                        <input
                                          type="checkbox"
                                          className="shrink-0 accent-primary"
                                          checked={isSelected}
                                          disabled={disabled || loadingGroups}
                                          onChange={(event) => setDishesSelected([dish], event.target.checked)}
                                        />
                                        <span className="min-w-0 break-words">{dish.name || "Unnamed dish"}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </section>
                          );
                        })}
                      </div>
                      {selectedCount === 0 ? (
                        <p role="alert" className="text-xs text-destructive">
                          Select at least 1 dish to save this choice group.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                      No dishes in {draft.group.title} yet. Assign dishes to this Parent Group in your Dish List first.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  0 eligible dishes — select a Parent Group above to load its dishes from your Dish List.
                </p>
              )}

              {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p> : null}
            </div>
            <DialogFooter className="shrink-0 border-t p-4">
              <Button type="button" variant="secondary" onClick={() => void close()}>Cancel</Button>
              <Button type="button" disabled={!canSave} onClick={save}>Save choice group</Button>
            </DialogFooter>
          </> : null}
        </DialogContent>
      </Dialog>
      {confirmationDialog}
    </section>
  );
}


export function ProviderPackageParentGroupRules({value, onChange, disabled = false}: {
  value: FoodChoiceGroupV2[];
  onChange: (groups: FoodChoiceGroupV2[]) => void;
  disabled?: boolean;
}) {
  const [groups, setGroups] = useState<Map<string, EligibleDish[]> | null>(null);
  const [editing, setEditing] = useState<FoodChoiceGroupV2 | null>(null);
  const [selected, setSelected] = useState("");
  const [count, setCount] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const options = (groups?.get(selected) ?? []).map(toOption);

  async function open(group: FoodChoiceGroupV2 | null) {
    setEditing(group);
    setSelected(group?.title ?? "");
    setCount(String(group?.selectionCount ?? 1));
    setError("");
    setGroups(null);
    setLoading(true);
    try {
      const library = await loadDishLibrary();
      const {groups: next, labels} = buildParentGroupDishes(library);
      setSelected(group ? labels.get(key(group.title)) ?? "" : "");
      setGroups(next);
    } catch {
      setError("Could not load the Dish List. Try reopening the rule.");
    } finally {
      setLoading(false);
    }
  }

  function save() {
    const selectionCount = Number(count);
    if (!selected || !isPackageIntegerEdit(count, 10) || selectionCount < 1 ||
        selectionCount > options.length) {
      setError("Choose a Parent Group and enter a quantity it can fill.");
      return;
    }
    const rule = {id: editing?.id ?? crypto.randomUUID(), title: selected, selectionCount, options};
    const next = editing ? value.map((group) => group.id === editing.id ? rule : group) : [...value, rule];
    try {
      onChange(parseFoodChoiceGroupsV2(next));
      setGroups(null);
    } catch {
      setError("Choose a different Parent Group, or check that its name is at most 80 characters.");
    }
  }

  return <section aria-label="Parent Group rules" className="space-y-4 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h4 className="font-bold">Parent Group rules</h4>
        <p className="text-sm text-muted-foreground">Set how many dishes customers choose from each group. Options come from your Dish List.</p>
      </div>
      <Button type="button" variant="secondary" disabled={disabled || loading || value.length >= 10}
        onClick={() => void open(null)}>Add Parent Group rule</Button>
    </div>
    {value.map((group) => <div key={group.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div>
        <h5 className="font-semibold">{group.title}</h5>
        <p className="text-sm text-muted-foreground">Choose {group.selectionCount} from {group.options.length} dishes</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={disabled || loading} onClick={() => void open(group)}>Edit rule</Button>
        <Button type="button" variant="ghost" disabled={disabled || loading}
          onClick={() => {onChange(value.filter((item) => item.id !== group.id)); setGroups(null);}}>Remove rule</Button>
      </div>
    </div>)}
    {loading ? <p role="status">Loading Dish List…</p> : null}
    {groups && <div className="grid gap-3 rounded-lg border p-3">
      <label className="grid gap-1 text-sm">Parent Group
        <Select value={selected} disabled={disabled} onChange={(event) => {setSelected(event.target.value); setError("");}}>
          <option value="">Select a Parent Group</option>
          {[...groups.keys()].map((group) => <option key={group} value={group}
            disabled={value.some((item) => item.id !== editing?.id && key(item.title) === key(group))}>{group}</option>)}
        </Select>
      </label>
      {!groups.size && <p className="text-sm">Add dishes to an assigned category in your Dish List first.</p>}
      <label className="grid gap-1 text-sm">Number of dishes to choose
        <Input type="number" min={1} max={10} value={count} disabled={disabled} onChange={(event) => setCount(event.target.value)} />
      </label>
      <p className="text-sm">{options.length} eligible dishes</p>
      {selected && Number(count) > options.length && <p className="text-sm text-destructive">This group does not have enough dishes for that quantity.</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={disabled || !selected || Number(count) > options.length} onClick={save}>Save rule</Button>
        <Button type="button" variant="ghost" onClick={() => {setGroups(null); setError("");}}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>}
  </section>;
}
