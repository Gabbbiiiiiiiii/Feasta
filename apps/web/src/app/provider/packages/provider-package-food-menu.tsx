"use client";

import {useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {categoryKey, categoryNameError, foodInclusionsError, parsePackageDishes,
  serializePackageDish, SUGGESTED_FOOD_CATEGORIES, type PackageDish} from "@/lib/provider/package-food-inclusions";

type DishDraft = {id: string | null; category: string; name: string};

export function ProviderPackageFoodMenu({value, onChange}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const rows = parsePackageDishes(value);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [mode, setMode] = useState<"dish" | "category" | null>(null);
  const [draft, setDraft] = useState<DishDraft>({id: null, category: "", name: ""});
  const [categoryName, setCategoryName] = useState("");
  const [returnToDish, setReturnToDish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const addDishTrigger = useRef<HTMLButtonElement>(null);
  const dishNameInput = useRef<HTMLInputElement>(null);
  const packageCategories = Array.from(new Set([...rows.map((row) => row.category).filter(Boolean), ...customCategories]));
  const categories = [...packageCategories, ...SUGGESTED_FOOD_CATEGORIES.filter((suggestion) =>
    !packageCategories.some((category) => categoryKey(category) === categoryKey(suggestion)),
  )];
  const groups = Array.from(new Set(rows.map((row) => row.category)));

  function openDish(button: HTMLButtonElement, row?: PackageDish) {
    opener.current = button;
    setDraft(row ? {id: row.id, category: row.category, name: row.name} : {id: null, category: "", name: ""});
    setError(null);
    setMode("dish");
  }

  function openCategory(button?: HTMLButtonElement) {
    if (button) opener.current = button;
    setReturnToDish(mode === "dish");
    setCategoryName("");
    setError(null);
    setMode("category");
  }

  function cancelCategory() {
    setError(null);
    setMode(returnToDish ? "dish" : null);
    if (returnToDish) requestAnimationFrame(() => dishNameInput.current?.focus());
  }

  function saveCategory() {
    const name = categoryName.trim().replace(/\s+/gu, " ");
    const invalid = categoryNameError(categoryName);
    if (invalid) { setError(invalid); return; }
    if (categories.some((category) => categoryKey(category) === categoryKey(name))) {
      setError("That category already exists. Choose it from the category selector.");
      return;
    }
    setCustomCategories((current) => [...current, name]);
    if (returnToDish) setDraft((current) => ({...current, category: name}));
    setError(null);
    setMode(returnToDish ? "dish" : null);
    if (returnToDish) requestAnimationFrame(() => dishNameInput.current?.focus());
  }

  function saveDish(another: boolean) {
    const raw = serializePackageDish(draft.category, draft.name);
    if (!draft.name.trim()) { setError("Enter a dish name."); return; }
    if (!draft.category && draft.name.includes(": ") && rows.find((row) => row.id === draft.id)?.raw !== draft.name) {
      setError("Choose a category for a dish containing ': ' so it restores correctly when edited.");
      return;
    }
    if (draft.category && categoryNameError(draft.category)) { setError(categoryNameError(draft.category)); return; }
    if (raw.length > 160 || /[\p{Cc}\p{Cf}]/u.test(raw)) {
      setError("Category and dish together must use at most 160 characters without control characters.");
      return;
    }
    if (rows.some((row) => row.id !== draft.id && categoryKey(row.raw) === categoryKey(raw))) {
      setError("This dish already exists in that category.");
      return;
    }
    if (!draft.id && rows.length >= 50) { setError("A package can have at most 50 food inclusions."); return; }
    const next = draft.id ? rows.map((row) => row.id === draft.id ? raw : row.raw) : [...rows.map((row) => row.raw), raw];
    onChange(next);
    setError(null);
    if (another) {
      setDraft({id: null, category: draft.category, name: ""});
      requestAnimationFrame(() => dishNameInput.current?.focus());
    } else setMode(null);
  }

  return (
    <section className="space-y-4" aria-label="Food menu editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="font-bold">Included dishes</h4><p className="text-sm text-muted-foreground">Every listed dish is included in this package.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={(event) => openCategory(event.currentTarget)}>Add Category</Button>
          <Button ref={addDishTrigger} type="button" disabled={rows.length >= 50} onClick={(event) => openDish(event.currentTarget)}>Add Dish</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Categories belong to this package. A category needs at least one saved dish to persist when the package is saved. Empty categories are available only during this editing session.</p>
      {foodInclusionsError(value) ? <p role="alert" className="text-sm text-destructive">{foodInclusionsError(value)}</p> : null}
      {rows.length === 0 ? <p className="rounded-xl border border-dashed p-4 text-sm">No dishes added. Add the food your package includes.</p> : null}
      {groups.map((category) => (
        <section key={category} className="overflow-hidden rounded-xl border" aria-label={category || "Uncategorized"}>
          <h5 className="bg-muted/40 px-4 py-2 text-sm font-bold">{category || "Uncategorized"}</h5>
          <ul className="divide-y">{rows.filter((row) => row.category === category).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0 break-words text-sm">{row.name || "Empty legacy inclusion"}</span>
              <Button type="button" variant="ghost" size="compact" aria-label={"Edit dish " + row.name} onClick={(event) => openDish(event.currentTarget, row)}>Edit</Button>
            </li>
          ))}</ul>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">{rows.length}/50 dishes. Category and dish together: at most 160 characters.</p>
      <Dialog open={mode !== null} onOpenChange={(open) => { if (!open) { setMode(null); setError(null); } }}>
        <DialogContent className="z-[70] max-w-lg" overlayClassName="z-[60]" onCloseAutoFocus={(event) => {
          event.preventDefault();
          (opener.current?.isConnected ? opener.current : addDishTrigger.current)?.focus();
        }} onEscapeKeyDown={(event) => {
          event.stopPropagation();
          if (mode === "category" && returnToDish) { event.preventDefault(); cancelCategory(); }
        }}>
          <DialogHeader><DialogTitle>{mode === "category" ? "Add Category" : draft.id ? "Edit Dish" : "Add Dish"}</DialogTitle>
            <DialogDescription>{mode === "category" ? "Create a package category. It persists with its first dish." : "Changes stay local until you save the package."}</DialogDescription></DialogHeader>
          {mode === "category" ? (
            <label className="grid gap-2 text-sm font-medium">Category name<Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} autoFocus /></label>
          ) : (
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium">Category<Select value={draft.category} onChange={(event) => {
                if (event.target.value === ":create:") openCategory();
                else setDraft({...draft, category: event.target.value});
              }}><option value="">Uncategorized</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}<option value=":create:">Create a custom category…</option></Select></label>
              <label className="grid gap-2 text-sm font-medium">Dish name<Input ref={dishNameInput} value={draft.name} onChange={(event) => setDraft({...draft, name: event.target.value})} /></label>
              <p className="text-xs text-muted-foreground">{serializePackageDish(draft.category, draft.name).length}/160 characters including the category.</p>
            </div>
          )}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="flex-wrap">
            {mode === "dish" && draft.id ? <Button type="button" variant="secondary" onClick={() => {
              onChange(rows.filter((row) => row.id !== draft.id).map((row) => row.raw)); setMode(null);
            }}>Remove Dish</Button> : null}
            <Button type="button" variant="secondary" onClick={() => mode === "category" ? cancelCategory() : setMode(null)}>Cancel</Button>
            {mode === "dish" ? <Button type="button" variant="secondary" onClick={() => saveDish(true)}>Save &amp; Add Another</Button> : null}
            <Button type="button" onClick={() => mode === "category" ? saveCategory() : saveDish(false)}>{mode === "category" ? "Add Category" : "Save Dish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
