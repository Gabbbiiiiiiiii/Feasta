"use client";

import Link from "next/link";
import {ArrowLeft, Pencil, Plus, Search, Trash2} from "lucide-react";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {categoryKey, categoryNameError} from "@/lib/provider/package-food-inclusions";
import {loadDishLibrary, saveDishLibrary, type LibraryDish} from "./dish-library-actions";

type Library = Awaited<ReturnType<typeof loadDishLibrary>>;
type Props = {
  initialLibrary?: Library;
  onAdd?: (dishes: LibraryDish[]) => string | undefined;
  disabled?: boolean;
  destination?: string;
  limitLabel?: string;
};

function categoryRows(library: Library, includeEmpty: boolean) {
  const categories = new Map<string, {name: string; group: string; dishes: LibraryDish[]}>();
  for (const name of includeEmpty ? library.categories : []) {
    categories.set(categoryKey(name), {name, group: "", dishes: []});
  }
  for (const dish of library.dishes) {
    const key = categoryKey(dish.category);
    const row = categories.get(key) ?? {name: dish.category, group: "", dishes: []};
    row.group = dish.parentGroup ?? "";
    row.dishes.push(dish);
    categories.set(key, row);
  }
  return [...categories.values()];
}

export function ProviderDishLibrary({initialLibrary, ...props}: Props) {
  return initialLibrary ? <DishList initialLibrary={initialLibrary} /> : <DishPicker {...props} />;
}

function DishPicker({onAdd, disabled, destination = "Food product", limitLabel}: Props) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const rows = library ? categoryRows(library, false) : [];
  const filters = [...new Set(rows.map((row) => row.group || row.name))];
  const query = categoryKey(search);
  const matches = rows.flatMap((row) => {
    if (!review && filter && row.name !== filter && row.group !== filter) return [];
    const headingMatches = categoryKey(row.name).includes(query) || categoryKey(row.group).includes(query);
    const visible = row.dishes.filter((dish) => review ? selected.has(dish.id) : headingMatches || categoryKey(dish.name).includes(query));
    return visible.length ? [{...row, visible}] : [];
  });

  function select(dishes: LibraryDish[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const dish of dishes) checked ? next.add(dish.id) : next.delete(dish.id);
      return next;
    });
    setError("");
  }

  function close() {
    setLibrary(null);
    setSearch("");
    setFilter(null);
    setReview(false);
    setSelected(new Set());
    setExpanded(new Set());
    setError("");
  }

  async function open() {
    setLoading(true);
    setError("");
    try {
      setLibrary(await loadDishLibrary());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Dish Library could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  return <Dialog open={loading || library !== null} onOpenChange={(isOpen) => {
    if (isOpen) void open(); else if (!loading) close();
  }}>
    <DialogTrigger asChild>
      <Button type="button" variant="secondary" disabled={disabled}>Choose from Dish List</Button>
    </DialogTrigger>
    {!library && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogContent className="z-[90] grid max-h-[90dvh] min-w-0 max-w-2xl gap-2 overflow-y-auto p-4 sm:p-5" overlayClassName="z-[80]"
      onEscapeKeyDown={(event) => event.stopPropagation()} onInteractOutside={(event) => event.preventDefault()}>
      <DialogHeader>
        <DialogTitle>Dish Library</DialogTitle>
        <DialogDescription>{destination}</DialogDescription>
      </DialogHeader>
      {loading && <p role="status">Loading dishes...</p>}
      {library && <>
      {limitLabel && <p className="text-sm text-muted-foreground">{limitLabel}</p>}
      <Input type="search" aria-label="Search dishes" placeholder="Search dishes..." value={search} className="h-10 min-h-10 text-sm"
        onChange={(event) => {setSearch(event.target.value); setReview(false);}} />
      <div role="group" aria-label="Filter dishes" className="flex min-w-0 select-none gap-1.5 overflow-x-auto pb-1">
        <Button type="button" size="compact" className="h-9 min-h-9 min-w-fit shrink-0 rounded-full px-2.5 text-xs" variant={!review && !filter ? "primary" : "secondary"}
          aria-pressed={!review && !filter} onClick={() => {setFilter(null); setReview(false);}}>All ({library.dishes.length})</Button>
        <Button type="button" size="compact" className="h-9 min-h-9 min-w-fit shrink-0 rounded-full px-2.5 text-xs" variant={review ? "primary" : "secondary"}
          aria-pressed={review} onClick={() => {setReview(true); setSearch("");}}>Selected ({selected.size})</Button>
        {filters.map((name) => <Button key={name} type="button" size="compact" className="h-9 min-h-9 min-w-fit shrink-0 rounded-full px-2.5 text-xs"
          variant={!review && filter === name ? "primary" : "secondary"} aria-pressed={!review && filter === name}
          onClick={() => {setFilter(name); setReview(false);}}>{name}</Button>)}
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto overscroll-contain">
        {!library.dishes.length && <p className="text-sm">No saved dishes yet. <Link className="underline"
          href="/provider/packages/dishes" target="_blank" rel="noopener noreferrer">Open Dish List</Link></p>}
        {library.dishes.length > 0 && !matches.length && <p className="text-sm text-muted-foreground">
          {review ? "No dishes selected." : "No matching dishes."}
        </p>}
        {[...new Set(matches.map((row) => row.group))].map((group) => {
          const entries = matches.filter((row) => row.group === group);
          const groupDishes = entries.flatMap((row) => row.visible);
          const groupChecked = groupDishes.every((dish) => selected.has(dish.id));
          return <section key={group} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1">
              <h5 className="text-xs font-semibold uppercase text-muted-foreground">{group || "Categories"}</h5>
              {group && <label className="inline-flex items-center gap-1.5 text-xs">
                <input type="checkbox" className="accent-primary" checked={groupChecked} disabled={disabled}
                  aria-label={`${groupChecked ? "Clear" : "Select all"} ${group}`}
                  onChange={(event) => {
                    select(groupDishes, event.target.checked);
                    if (event.target.checked) setExpanded((current) => new Set([...current, ...entries.map((row) => row.name)]));
                  }} />
                {query ? `Select all ${groupDishes.length} matches` : `Select all ${group}`}
              </label>}
            </div>
            {entries.map(({name, dishes, visible}) => {
              const isOpen = review || Boolean(query) || expanded.has(name);
              const all = visible.every((dish) => selected.has(dish.id));
              return <section key={name} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-1 px-2">
                  <Button type="button" size="compact" variant="ghost" className="h-auto min-h-9 min-w-0 whitespace-normal px-2 py-1 text-left text-xs"
                    aria-expanded={isOpen} disabled={review || Boolean(query)} onClick={() => setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(name)) next.delete(name); else next.add(name);
                      return next;
                    })}>
                    {isOpen ? "▾" : "▸"} {name} ({dishes.length}) · {dishes.filter((dish) => selected.has(dish.id)).length} selected
                  </Button>
                  <label className="inline-flex items-center gap-1.5 px-1 text-xs">
                    <input type="checkbox" className="accent-primary" checked={all} disabled={disabled}
                      aria-label={query ? `${all ? "Clear" : "Select all"} ${visible.length} matches in ${name}` : `${all ? "Clear" : "Select all"} ${name}`}
                      onChange={(event) => select(visible, event.target.checked)} />
                    {query ? `Select all ${visible.length} matches` : "Select all"}
                  </label>
                </div>
                {isOpen && <div className="grid gap-2 border-t border-border p-2 sm:grid-cols-2 lg:grid-cols-3">
                  {visible.map((dish) => <label key={dish.id}
                    className={`flex min-w-0 items-center gap-2 rounded-md border p-2 text-sm ${selected.has(dish.id) ? "border-primary bg-secondary" : "border-border bg-muted/30"}`}>
                    <input type="checkbox" className="shrink-0 accent-primary" checked={selected.has(dish.id)} disabled={disabled}
                      onChange={(event) => select([dish], event.target.checked)} />
                    <span className="min-w-0 break-words">{dish.name}</span>
                  </label>)}
                </div>}
              </section>;
            })}
          </section>;
        })}
      </div>
      <Button type="button" size="compact" fullWidth disabled={disabled || !selected.size} onClick={() => {
        const message = onAdd?.(library.dishes.filter((dish) => selected.has(dish.id)));
        if (message) setError(message); else close();
      }}>{selected.size ? `Add ${selected.size} selected ${selected.size === 1 ? "dish" : "dishes"}` : "Add selected dishes"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </>}
    </DialogContent>
  </Dialog>;
}

function DishList({initialLibrary}: {initialLibrary: Library}) {
  const [library, setLibrary] = useState(initialLibrary);
  const [draft, setDraft] = useState<LibraryDish | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<{original: string; name: string} | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rows = categoryRows(library, true);
  const groups = [...new Set(rows.map((row) => row.group).filter(Boolean))];
  const filters = [...new Set([...groups, ...rows.map((row) => row.name)])];
  const active = filters.includes(filter) ? filter : "";
  const query = categoryKey(search);
  const visible = rows.flatMap((row) => {
    if (active && row.group !== active && row.name !== active) return [];
    if (categoryKey(row.name).includes(query) || categoryKey(row.group).includes(query)) return [row];
    const dishes = row.dishes.filter((dish) => categoryKey(dish.name).includes(query));
    return dishes.length ? [{...row, dishes}] : [];
  });

  async function save(dishes: LibraryDish[], categories: string[], complete: () => void = () => {}) {
    setBusy(true);
    setError("");
    try {
      setLibrary(await saveDishLibrary(library.revision, dishes, categories));
      complete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Dish Library could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  function saveDish(addAnother: boolean) {
    if (!draft || busy || !draft.name.trim() || !draft.category) return;
    const dishes = library.dishes.filter((dish) => dish.id !== draft.id).map((dish) =>
      categoryKey(dish.category) === categoryKey(draft.category) ? {...dish, parentGroup: draft.parentGroup} : dish);
    void save([...dishes, draft], library.categories, () => {
      setDraft(addAnother ? {...draft, id: crypto.randomUUID(), name: ""} : null);
    });
  }

  const editingDish = draft && library.dishes.some((dish) => dish.id === draft.id);
  return <section aria-label="Dish Library" className="space-y-5">
    <header className="space-y-3">
      <Link href="/provider/packages" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-strong hover:underline">
        <ArrowLeft size={16} aria-hidden="true" /> Back to packages
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Dish List</h1>
          <p className="text-sm text-muted-foreground">Manage the dishes, categories, and parent groups available for your packages.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy || Boolean(categoryDraft)}
            onClick={() => setCategoryDraft({original: "", name: ""})}><Plus size={16} aria-hidden="true" /> Add category</Button>
          <Button type="button" disabled={busy} onClick={() => setDraft({id: crypto.randomUUID(), name: "", category: ""})}>
            <Plus size={16} aria-hidden="true" /> Add dish
          </Button>
        </div>
      </div>
    </header>
    <Dialog open={draft !== null} onOpenChange={(open) => {
      if (!open && !busy) {setDraft(null); setError("");}
    }}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingDish ? "Edit dish" : "Add dish"}</DialogTitle>
          <DialogDescription>Set the category and name for this dish.</DialogDescription>
        </DialogHeader>
        {draft && <div className="space-y-3">
          <label className="block">Parent Group (optional)<Input value={draft.parentGroup ?? ""} list="dish-library-groups"
            disabled={busy} maxLength={120} onChange={(event) => setDraft({...draft, parentGroup: event.target.value})} /></label>
          <datalist id="dish-library-groups">{groups.map((group) => <option key={group} value={group} />)}</datalist>
          <p className="text-sm text-muted-foreground">This group applies to every dish in {draft.category || "the selected category"}.</p>
          <label className="block">Category Name<Select value={draft.category} disabled={busy} onChange={(event) => {
            const category = event.target.value;
            const previous = rows.find((row) => row.name === draft.category)?.group ?? "";
            const next = rows.find((row) => row.name === category)?.group ?? "";
            setDraft({...draft, category, parentGroup: (draft.parentGroup ?? "") === previous ? next : draft.parentGroup});
          }}>
            <option value="" disabled>Select a category</option>
            {rows.map(({name}) => <option key={name} value={name}>{name}</option>)}
          </Select></label>
          <Button type="button" variant="link" disabled={busy}
            onClick={() => {setError(""); setCategoryDraft({original: "", name: ""});}}>Add a category</Button>
          <label className="block">Dish Name<Input key={draft.id} autoFocus value={draft.name} maxLength={120} disabled={busy}
            onChange={(event) => setDraft({...draft, name: event.target.value})} /></label>
          {error && !categoryDraft && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="flex-wrap gap-2">
            <Button type="button" disabled={busy || !draft.name.trim() || !draft.category}
              onClick={() => saveDish(false)}>Save dish</Button>
            {!editingDish && <Button type="button" variant="secondary" disabled={busy || !draft.name.trim() || !draft.category}
              onClick={() => saveDish(true)}>Save &amp; Add Another</Button>}
            <Button type="button" variant="ghost" disabled={busy} onClick={() => {setDraft(null); setError("");}}>Cancel</Button>
          </DialogFooter>
        </div>}
      </DialogContent>
    </Dialog>
    <Dialog open={categoryDraft !== null} onOpenChange={(open) => {
      if (!open && !busy) {setCategoryDraft(null); setError("");}
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{categoryDraft?.original ? "Edit category" : "Add category"}</DialogTitle>
          <DialogDescription>Categories organize dishes in your Dish List.</DialogDescription>
        </DialogHeader>
        {categoryDraft && <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (busy || !categoryDraft.name.trim()) return;
          const name = categoryDraft.name.trim();
          const matches = (category: string) => categoryKey(category) === categoryKey(categoryDraft.original);
          const invalid = categoryNameError(name);
          if (invalid || rows.some((row) => !matches(row.name) && categoryKey(row.name) === categoryKey(name))) {
            setError(invalid ?? "That category already exists.");
            return;
          }
          void save(library.dishes.map((dish) => matches(dish.category) ? {...dish, category: name} : dish),
            [...library.categories.filter((category) => !matches(category)), name], () => {
              setCategoryDraft(null);
              setSearch("");
              setFilter("");
              setDraft((current) => current && (!categoryDraft.original || matches(current.category)) ? {...current, category: name} : current);
            });
        }}>
          <label className="block">Category name<Input autoFocus maxLength={120} value={categoryDraft.name} disabled={busy}
            onChange={(event) => setCategoryDraft({...categoryDraft, name: event.target.value})} /></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy}
              onClick={() => {setCategoryDraft(null); setError("");}}>Cancel category</Button>
            <Button type="submit" loading={busy} disabled={!categoryDraft.name.trim()}>Save category</Button>
          </DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
    {error && !categoryDraft && !draft && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-60">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search dishes" placeholder="Search dishes..." className="pl-9"
            value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <div role="group" aria-label="Filter dishes" className="flex w-full min-w-0 select-none gap-2 overflow-x-auto px-1 pb-2 pt-1">
          {["", ...filters].map((name) => <Button key={name} type="button" size="compact" className="shrink-0 whitespace-nowrap rounded-full"
            variant={active === name ? "primary" : "secondary"} aria-pressed={active === name}
            onClick={() => setFilter(name)}>{name || "All"}</Button>)}
        </div>
      </div>
      {!visible.length && <p className="py-6 text-center text-sm text-muted-foreground">
        {rows.length ? "No dishes or categories match your search." : "No saved dishes yet."}
      </p>}
      {[...new Set(visible.map((row) => row.group))].map((group) => <section key={group} className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group || "Categories"}</h2>
        {visible.filter((row) => row.group === group).map(({name, dishes}) => <section key={name} className="overflow-hidden rounded-xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3 py-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">{name}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{dishes.length}</span>
            </h3>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" disabled={busy || Boolean(categoryDraft)}
                aria-label={`Edit category ${name}`} onClick={() => setCategoryDraft({original: name, name})}><Pencil size={16} aria-hidden="true" /></Button>
              <Button type="button" variant="ghost" size="icon" disabled={busy} className="text-destructive"
                aria-label={`Delete category ${name}`} onClick={() => {
                  if (!window.confirm(`Delete ${name} and all its dishes from your Dish List?`)) return;
                  const matches = (category: string) => categoryKey(category) === categoryKey(name);
                  void save(library.dishes.filter((dish) => !matches(dish.category)), library.categories.filter((category) => !matches(category)), () => {
                    setDraft((current) => current && matches(current.category) ? null : current);
                    setCategoryDraft((current) => current && matches(current.original) ? null : current);
                  });
                }}><Trash2 size={16} aria-hidden="true" /></Button>
            </div>
          </div>
          {!dishes.length && <p className="border-t px-3 py-3 text-sm text-muted-foreground">No dishes in this category yet.</p>}
          {dishes.map((dish) => <div key={dish.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
            <span className="min-w-0 break-words text-sm">{dish.name}</span>
            <div className="flex gap-2">
              <Button type="button" size="compact" disabled={busy} aria-label={`Edit ${dish.name}`}
                onClick={() => setDraft({...dish, category: name})}>Edit</Button>
              <Button type="button" variant="destructive" size="compact" disabled={busy} aria-label={`Delete ${dish.name}`} onClick={() => {
                if (window.confirm(`Delete ${dish.name} from your Dish List?`)) {
                  void save(library.dishes.filter((row) => row.id !== dish.id), library.categories,
                    () => setDraft((current) => current?.id === dish.id ? null : current));
                }
              }}>Delete</Button>
            </div>
          </div>)}
        </section>)}
      </section>)}
    </div>
  </section>;
}
