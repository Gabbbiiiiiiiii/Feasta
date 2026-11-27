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
import {usePackageConfirmation} from "./use-package-confirmation";

type Library = Awaited<ReturnType<typeof loadDishLibrary>>;
type Props = {
  initialLibrary?: Library;
  onAdd?: (dishes: LibraryDish[]) => string | undefined;
  disabled?: boolean;
  destination?: string;
  limitLabel?: string;
  parentGroup?: string;
  includeUngrouped?: boolean;
};

function categoryRows(library: Library, includeEmpty: boolean) {
  const parentGroupFor = (name: string) => Object.hasOwn(library.parentGroups ?? {}, categoryKey(name)) ? library.parentGroups?.[categoryKey(name)] ?? "" : "";
  const categories = new Map<string, {name: string; group: string; dishes: LibraryDish[]}>();
  for (const name of includeEmpty ? library.categories : []) {
    categories.set(categoryKey(name), {name, group: parentGroupFor(name), dishes: []});
  }
  for (const dish of library.dishes) {
    const key = categoryKey(dish.category);
    const row = categories.get(key) ?? {name: dish.category, group: "", dishes: []};
    row.group = dish.parentGroup?.trim() || row.group;
    row.dishes.push(dish);
    categories.set(key, row);
  }
  return [...categories.values()];
}

export function ProviderDishLibrary({initialLibrary, ...props}: Props) {
  return initialLibrary ? <DishList initialLibrary={initialLibrary} /> : <DishPicker {...props} />;
}

function DishPicker({onAdd, disabled, destination = "Food product", limitLabel, parentGroup, includeUngrouped}: Props) {
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
      for (const dish of dishes) {
        if (checked) next.add(dish.id); else next.delete(dish.id);
      }
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
      const loaded = await loadDishLibrary();
      const dishes = loaded.dishes.filter((dish) => {
        const group = dish.parentGroup?.trim();
        if (!group) return includeUngrouped && parentGroup === undefined;
        return parentGroup === undefined || categoryKey(group) === categoryKey(parentGroup);
      });
      setLibrary({...loaded, dishes});
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
      <Button type="button" variant="secondary" size="compact" className="h-9 min-h-9 min-w-0 px-3.5 py-1.5 text-sm" disabled={disabled}>Choose from Dish List</Button>
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
        {!library.dishes.length && <p className="text-sm">{parentGroup !== undefined ? "No dishes match this Parent Group." : includeUngrouped ? "No dishes in your Dish List yet." : "No dishes with a Parent Group yet."} <Link className="underline"
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

const MINIMUM_DISH_PAGE_SIZE = 10;

function DishList({initialLibrary}: {initialLibrary: Library}) {
  const {confirm, confirmationDialog} = usePackageConfirmation();
  const [library, setLibrary] = useState(initialLibrary);
  const [draft, setDraft] = useState<LibraryDish | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<{original: string; name: string; parentGroup: string; newGroup?: string} | null>(null);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(MINIMUM_DISH_PAGE_SIZE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rows = categoryRows(library, true);
  const groups = [...new Map([...(library.groupNames ?? []), ...rows.map((row) => row.group).filter(Boolean)]
    .map((group) => [categoryKey(group), group])).values()];
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupDraft, setGroupDraft] = useState<{original: string; name: string; categories: string[]} | null>(null);

  const groupOptions = [...new Map([...groups, ...(library.groupNames === undefined ? ["Main Dish", "Side Dish", "Dessert"] : [])].reverse().map((group) => [categoryKey(group), group])).values()];
  const [notice, setNotice] = useState("");
  const activeGroup = groups.some((group) => `group:${group}` === groupFilter) ? groupFilter : "";
  const groupRows = rows.filter((row) => !activeGroup || `group:${row.group}` === activeGroup);
  const activeCategory = groupRows.some((row) => row.name === categoryFilter) ? categoryFilter : "";
  function filterGroup(value: string) {
    setGroupFilter(value);
    setCategoryFilter("");
    setPage(1);
  }
  const query = categoryKey(search);
  const visible = groupRows.flatMap((row) => {
    if (activeCategory && row.name !== activeCategory) return [];
    if (categoryKey(row.name).includes(query) || categoryKey(row.group).includes(query)) return [row];
    const dishes = row.dishes.filter((dish) => categoryKey(dish.name).includes(query));
    return dishes.length ? [{...row, dishes}] : [];
  });

  const orderedRows = [...new Set(visible.map((row) => row.group))]
    .flatMap((group) => visible.filter((row) => row.group === group));
  const totalDishes = orderedRows.reduce((total, row) => total + row.dishes.length, 0);
  const showPagination = totalDishes > MINIMUM_DISH_PAGE_SIZE;
  const filterName = activeCategory || activeGroup.slice("group:".length);
  const dishCount = `${totalDishes} ${totalDishes === 1 ? "dish" : "dishes"}`;
  const filterContext = filterName ? ` in ${filterName}` : "";
  const pageCount = Math.max(1, Math.ceil(totalDishes / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalDishes);
  let offset = 0;
  const pageRows = orderedRows.flatMap((row) => {
    const rowStart = offset;
    offset += row.dishes.length;
    if (!row.dishes.length) {
      const emptyRowPage = Math.min(pageCount, Math.floor(rowStart / pageSize) + 1);
      return emptyRowPage === currentPage ? [{...row, count: 0}] : [];
    }
    const dishes = row.dishes.slice(Math.max(0, start - rowStart), Math.max(0, end - rowStart));
    return dishes.length ? [{...row, dishes, count: row.dishes.length}] : [];
  });

  async function save(dishes: LibraryDish[], categories: string[], complete: () => void = () => {}, parentGroups = library.parentGroups ?? {}, groupNames?: string[], unassigned?: string[]) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const saved = groupNames
        ? await saveDishLibrary(library.revision, dishes, categories, parentGroups, groupNames, unassigned)
        : await saveDishLibrary(library.revision, dishes, categories, parentGroups);
      setLibrary({...saved, groupNames: saved.groupNames ?? library.groupNames});
      complete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Dish Library could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  function saveDish(addAnother: boolean) {
    if (!draft || busy || !draft.name.trim() || !draft.category) return;
    const dishes = library.dishes.filter((dish) => dish.id !== draft.id);
    void save([...dishes, draft], library.categories, () => {
      setDraft(addAnother ? {...draft, id: crypto.randomUUID(), name: ""} : null);
    });
  }

  const [groupToDelete, setGroupToDelete] = useState("");
  const [replacementGroup, setReplacementGroup] = useState("");
  const deletionNeedsReplacement = !!groupToDelete && rows.some((row) => categoryKey(row.group) === categoryKey(groupToDelete));
  function saveGroup(draftToSave = groupDraft) {
    if (!draftToSave || busy) return;
    const name = draftToSave.name.trim();
    const original = categoryKey(draftToSave.original);
    if (categoryNameError(name) || groupOptions.some((group) =>
        categoryKey(group) === categoryKey(name) && categoryKey(group) !== original)) {
      setError(categoryNameError(name) ?? "That parent group already exists.");
      return;
    }
    const selected = new Set(draftToSave.categories);
    const parentGroups = {...library.parentGroups};
    const unassigned: string[] = [];
    for (const row of rows) {
      const key = categoryKey(row.name);
      if (selected.has(key)) parentGroups[key] = name;
      else if (original && categoryKey(row.group) === original) {
        delete parentGroups[key];
        unassigned.push(row.name);
      }
    }
    const dishes = library.dishes.map((dish) => {
      const key = categoryKey(dish.category);
      if (selected.has(key)) return {...dish, parentGroup: name};
      if (original && categoryKey(dish.parentGroup ?? "") === original) return {...dish, parentGroup: ""};
      return dish;
    });
    const nextGroups = groupOptions.filter((group) => categoryKey(group) !== original);
    nextGroups.push(name);
    void save(dishes, rows.map((row) => row.name), () => {
      setGroupDraft(null);
      setGroupToDelete("");
      filterGroup("");
      setNotice("Parent group saved.");
    }, parentGroups, nextGroups, unassigned);
  }

  function deleteGroup(group: string) {
    setError("");
    setReplacementGroup("");
    setGroupToDelete(group);
  }

  function confirmGroupDeletion() {
    const original = categoryKey(groupToDelete);
    const affected = new Set(rows.filter((row) => categoryKey(row.group) === original)
      .map((row) => categoryKey(row.name)));
    if (affected.size && (!replacementGroup || !groupOptions.includes(replacementGroup) ||
        categoryKey(replacementGroup) === original)) return;

    const parentGroups = {...library.parentGroups};
    for (const category of affected) parentGroups[category] = replacementGroup;
    const dishes = library.dishes.map((dish) => affected.has(categoryKey(dish.category))
      ? {...dish, parentGroup: replacementGroup} : dish);
    const nextGroups = groupOptions.filter((group) => categoryKey(group) !== original);
    void save(dishes, rows.map((row) => row.name), () => {
      setGroupToDelete("");
      setGroupDraft(null);
      filterGroup("");
      setNotice("Parent Group deleted.");
    }, parentGroups, nextGroups);
  }

  const editingDish = draft && library.dishes.some((dish) => dish.id === draft.id);
  return <section aria-label="Dish Library" className="space-y-5">
    {confirmationDialog}
    <header className="space-y-3">
      <Link href="/provider/packages" className="inline-flex items-center gap-2 text-sm font-semibold text-primary-strong hover:underline">
        <ArrowLeft size={16} aria-hidden="true" /> Back to packages
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold">Dish List</h1>
          <p className="text-sm text-muted-foreground">Manage the dishes, categories, and parent groups available for your packages.</p></div>
          <Button type="button" disabled={busy} onClick={() => setDraft({id: crypto.randomUUID(), name: "", category: ""})}>
            <Plus size={16} aria-hidden="true" /> Add dish
          </Button>
      </div>
    </header>
    <Dialog open={groupsOpen} onOpenChange={(open) => {
      if (!busy) {setGroupsOpen(open); setGroupDraft(null); setGroupToDelete(""); setError("");}
    }}>
      <DialogContent className={groupDraft ? "max-h-[90dvh] max-w-xl overflow-y-auto" : "max-h-[90dvh] max-w-lg overflow-y-auto"}>
        {groupDraft && !groupToDelete && <Button type="button" variant="link" disabled={busy}
          className="w-fit px-0" onClick={() => {setGroupDraft(null); setError("");}}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to all parent groups
        </Button>}
        <DialogHeader>
          <DialogTitle>{groupDraft ? groupDraft.original ? "Edit Parent Group" : "Add Parent Group" : "Manage parent groups"}</DialogTitle>
          <DialogDescription>{groupDraft ? "Checked categories and their dishes will be assigned to this group." : "Organize your dishes by grouping related categories."}</DialogDescription>
        </DialogHeader>
        {groupToDelete ? <div className="grid gap-4">
          <p>Delete {groupToDelete}?</p>
          {deletionNeedsReplacement && <label className="grid gap-2">
            Move its categories and dishes to another Parent Group
            <Select value={replacementGroup} disabled={busy} onChange={(event) => setReplacementGroup(event.target.value)}>
              <option value="">Choose a Parent Group</option>
              {groupOptions.filter((group) => categoryKey(group) !== categoryKey(groupToDelete))
                .map((group) => <option key={group} value={group}>{group}</option>)}
            </Select>
          </label>}
          {deletionNeedsReplacement && groupOptions.length < 2 && <p>Create another Parent Group before deleting this one.</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => {setGroupToDelete(""); setError("");}}>Cancel</Button>
            <Button type="button" variant="destructive" loading={busy}
              disabled={deletionNeedsReplacement && !replacementGroup} onClick={confirmGroupDeletion}>
              {deletionNeedsReplacement ? "Reassign & Delete" : "Delete Group"}
            </Button>
          </DialogFooter>
        </div> : groupDraft ? <form className="grid gap-4" onSubmit={(event) => {
          event.preventDefault();
          saveGroup();
        }}>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parent Group name
            <Input className="normal-case tracking-normal" required maxLength={120} value={groupDraft.name} disabled={busy}
              onChange={(event) => setGroupDraft({...groupDraft, name: event.target.value})} />
          </label>
          <fieldset className="grid gap-2" disabled={busy}>
            <legend className="w-full pb-1 text-sm font-semibold">Categories
              <span className="float-right font-normal text-muted-foreground">{rows.length} total</span>
            </legend>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {rows.map((row) => {
              const key = categoryKey(row.name);
              const checked = groupDraft.categories.includes(key);
              return <label key={key} className={`flex min-h-10 cursor-pointer items-center gap-2 px-3 py-2 text-sm ${checked ? "bg-secondary" : ""}`}>
                <input type="checkbox" className="shrink-0 accent-primary" checked={checked} onChange={(event) => {
                  setGroupDraft({...groupDraft, categories: event.target.checked
                    ? [...groupDraft.categories, key] : groupDraft.categories.filter((item) => item !== key)});
                }} />
                <span className="min-w-0 flex-1 break-words">{row.name}</span>
                <span className={row.group ? "rounded-full bg-muted px-2 py-0.5 text-xs" : "text-xs text-muted-foreground"}>
                  {row.group || "Unassigned"}
                </span>
              </label>;
            })}
            {!rows.length && <p className="p-3 text-sm text-muted-foreground">No categories yet.</p>}
            </div>
          </fieldset>
          <DialogFooter className="flex-col sm:items-center">
            {groupDraft.original && <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" disabled={busy}
              onClick={() => deleteGroup(groupDraft.original)}>Delete Group</Button>}
            <Button type="button" variant="secondary" disabled={busy} onClick={() => {setGroupDraft(null); setError("");}}>Cancel</Button>
            <Button type="submit" loading={busy}>Save group</Button>
          </DialogFooter>
        </form> : <div className="grid gap-4">
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Current Groups</h3>
            {groupOptions.length ? <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {groupOptions.map((group) => <li key={group} className="flex min-h-12 items-center gap-2 px-3 py-1">
                <span className="min-w-0 flex-1 break-words text-sm font-medium">{group}</span>
                <Button type="button" variant="ghost" size="icon" disabled={busy}
                  aria-label={`Edit ${group}`} onClick={() => setGroupDraft({
                    original: group,
                    name: group,
                    categories: rows.filter((row) => categoryKey(row.group) === categoryKey(group)).map((row) => categoryKey(row.name)),
                  })}><Pencil size={16} aria-hidden="true" /></Button>
                <Button type="button" variant="ghost" size="icon" disabled={busy}
                  aria-label={`Delete ${group}`} onClick={() => deleteGroup(group)}>
                  <Trash2 size={16} aria-hidden="true" />
                </Button>
              </li>)}
            </ul> : <p className="text-sm text-muted-foreground">No parent groups yet.</p>}
          </div>
          <Button type="button" className="w-full" disabled={busy}
            onClick={() => setGroupDraft({original: "", name: "", categories: []})}>
            <Plus size={16} aria-hidden="true" /> Add parent group
          </Button>
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-primary-strong">{notice}</p>}
      </DialogContent>
    </Dialog>
    <Dialog open={draft !== null} onOpenChange={(open) => {
      if (!open && !busy) {setDraft(null); setError("");}
    }}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingDish ? "Edit dish" : "Add dish"}</DialogTitle>
          <DialogDescription>Set the category and name for this dish.</DialogDescription>
        </DialogHeader>
        {draft && <div className="space-y-3">
          <label className="block">Category Name<Select value={draft.category} disabled={busy} onChange={(event) => {
            const category = event.target.value;
            const next = rows.find((row) => row.name === category)?.group ?? "";
            setError("");
            setDraft({...draft, category, parentGroup: next});
          }}>
            <option value="" disabled>Select a category</option>
            {rows.map(({name}) => <option key={name} value={name}>{name}</option>)}
          </Select></label>
          {draft.category && draft.parentGroup ? (
            <p className="text-sm text-muted-foreground">Parent Group: {draft.parentGroup}</p>
          ) : null}
          {!rows.length && <p className="text-sm text-muted-foreground">Create a category from the Dish List before adding a dish.</p>}
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
        {categoryDraft && (() => {
          const isEditingCategory = Boolean(categoryDraft.original);
          const selectedParentGroup = categoryDraft.newGroup?.trim() ?? categoryDraft.parentGroup;
          const canSubmitCategory = Boolean(categoryDraft.name.trim()) && (
            !isEditingCategory ||
            categoryDraft.newGroup === undefined ||
            Boolean(categoryDraft.newGroup.trim())
          );
          return <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (busy || !categoryDraft.name.trim()) return;
            const name = categoryDraft.name.trim();
            const creatingGroup = isEditingCategory && categoryDraft.newGroup !== undefined;
            const parentGroup = isEditingCategory ? selectedParentGroup : "";
            if (creatingGroup) {
              if (!parentGroup) return;
              const invalidGroup = categoryNameError(parentGroup);
              if (invalidGroup || groupOptions.some((group) => categoryKey(group) === categoryKey(parentGroup))) {
                setError(invalidGroup ?? "That parent group already exists. Select it from the list.");
                return;
              }
            }
            const matches = (category: string) => categoryKey(category) === categoryKey(categoryDraft.original);
            const invalid = categoryNameError(name);
            if (invalid || rows.some((row) => !matches(row.name) && categoryKey(row.name) === categoryKey(name))) {
              setError(invalid ?? "That category already exists.");
              return;
            }
            const parentGroups = {...library.parentGroups};
            if (isEditingCategory) delete parentGroups[categoryKey(categoryDraft.original)];
            if (parentGroup) parentGroups[categoryKey(name)] = parentGroup;
            const count = isEditingCategory ? library.dishes.filter((dish) => matches(dish.category)).length : 0;
            void save(
              isEditingCategory
                ? library.dishes.map((dish) => matches(dish.category) ? {...dish, category: name, ...(parentGroup ? {parentGroup} : {})} : dish)
                : library.dishes,
              [...library.categories.filter((category) => !isEditingCategory || !matches(category)), name],
              () => {
                setCategoryDraft(null);
                setSearch("");
                filterGroup("");
                setDraft((current) => current && (!categoryDraft.original || matches(current.category)) ? {...current, category: name, parentGroup} : current);
                setNotice(
                  !isEditingCategory
                    ? `Category "${name}" added. Assign a Parent Group in Manage parent groups anytime.`
                    : parentGroup
                      ? (count ? `${count} ${count === 1 ? "dish" : "dishes"} assigned to ${parentGroup}.` : `Category assigned to ${parentGroup}.`)
                      : `Category "${name}" updated.`,
                );
              },
              parentGroups,
              creatingGroup ? [...groupOptions, parentGroup] : undefined,
            );
          }}>
            <label className="block">Category name<Input autoFocus maxLength={120} value={categoryDraft.name} disabled={busy}
              onChange={(event) => setCategoryDraft({...categoryDraft, name: event.target.value})} /></label>
            {isEditingCategory ? (
              <>
                {categoryDraft.newGroup !== undefined ? (
                  <label className="block">New Parent Group name
                    <Input required maxLength={120} disabled={busy} value={categoryDraft.newGroup}
                      onChange={(event) => {setCategoryDraft({...categoryDraft, newGroup: event.target.value}); setError("");}} />
                  </label>
                ) : groupOptions.length > 0 ? (
                  <label className="block">Parent Group
                    <Select disabled={busy} value={categoryDraft.parentGroup}
                      onChange={(event) => setCategoryDraft({...categoryDraft, parentGroup: event.target.value})}>
                      <option value="" disabled>Select a parent group</option>
                      {groupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
                    </Select>
                  </label>
                ) : null}
                <Button type="button" variant="link" className="px-0" disabled={busy} onClick={() => {
                  setCategoryDraft({...categoryDraft, newGroup: categoryDraft.newGroup === undefined ? "" : undefined});
                  setError("");
                }}>{categoryDraft.newGroup === undefined ? "Add parent group" : "Use an existing group"}</Button>
              </>
            ) : null}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="secondary" disabled={busy}
                onClick={() => {setCategoryDraft(null); setError("");}}>Cancel category</Button>
              <Button type="submit" loading={busy} disabled={!canSubmitCategory}>Save category</Button>
            </DialogFooter>
          </form>;
        })()}
      </DialogContent>
    </Dialog>
    {notice && !groupsOpen && !draft && !categoryDraft && <p role="status" className="text-sm text-primary-strong">{notice}</p>}
    {error && !categoryDraft && !draft && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="grid items-center gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
        <div className="relative min-w-0">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label="Search dishes" placeholder="Search dishes..." className="h-10 rounded-lg pl-9 text-sm"
            value={search} onChange={(event) => {setSearch(event.target.value); setPage(1);}} />
        </div>
        <Select aria-label="Parent Group filter" className="h-10 min-w-0 rounded-lg text-sm" value={activeGroup}
          onChange={(event) => filterGroup(event.target.value)}>
          <option value="" hidden>All Parent Groups</option>
          {groups.map((group) => <option key={group} value={`group:${group}`}>{group}</option>)}
        </Select>
        <Select aria-label="Category filter" className="h-10 min-w-0 rounded-lg text-sm" value={activeCategory}
          onChange={(event) => {setCategoryFilter(event.target.value); setPage(1);}}>
          <option value="" hidden>All Categories</option>
          {groupRows.map((row) => <option key={row.name} value={row.name}>{row.name}</option>)}
        </Select>
          <Button type="button" variant="secondary" size="compact" className="h-10 whitespace-nowrap rounded-full border-primary-strong px-3 text-sm" disabled={busy || Boolean(categoryDraft)}
            onClick={() => setCategoryDraft({original: "", name: "", parentGroup: ""})}><Plus size={16} aria-hidden="true" /> Add category</Button>
          <Button type="button" variant="secondary" size="compact" className="h-10 whitespace-nowrap rounded-full border-primary-strong px-3 text-sm" disabled={busy} onClick={() => {
            setError(""); setGroupsOpen(true);
          }}>Manage parent groups</Button>
      </div>
      {(activeGroup || activeCategory) && (
        <Button type="button" variant="ghost" size="compact" onClick={() => filterGroup("")}>
          Clear group and category filters
        </Button>
      )}
      {!visible.length && <p className="py-6 text-center text-sm text-muted-foreground">
        {rows.length ? "No dishes or categories match your search." : "No saved dishes yet."}
      </p>}
      {[...new Set(pageRows.map((row) => row.group))].map((group) => <section key={group} className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group || "Assign parent group"}</h2>
        {pageRows.filter((row) => row.group === group).map(({name, dishes, count}) => <section key={name} className="overflow-hidden rounded-xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3 py-0.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">{name}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
            </h3>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" disabled={busy || Boolean(categoryDraft)}
                aria-label={`Edit category ${name}`} onClick={() => setCategoryDraft({original: name, name, parentGroup: group})}><Pencil size={16} aria-hidden="true" /></Button>
              <Button type="button" variant="ghost" size="icon" disabled={busy} className="text-destructive"
                aria-label={`Delete category ${name}`} onClick={() => void (async () => {
                  const confirmed = await confirm({
                    message: count
                      ? `Delete ${name} and its ${count} ${count === 1 ? "dish" : "dishes"} from your Dish List?`
                      : `Delete ${name} from your Dish List?`,
                    supportingText: "This removes the category from your Dish List. Packages that already saved these dishes keep their own copy.",
                    confirmLabel: "Delete category",
                    destructive: true,
                  });
                  if (!confirmed) return;
                  const matches = (category: string) => categoryKey(category) === categoryKey(name);
                  await save(library.dishes.filter((dish) => !matches(dish.category)), library.categories.filter((category) => !matches(category)), () => {
                    setDraft((current) => current && matches(current.category) ? null : current);
                    setCategoryDraft((current) => current && matches(current.original) ? null : current);
                  });
                })()}><Trash2 size={16} aria-hidden="true" /></Button>
            </div>
          </div>
          {!dishes.length && <p className="border-t px-3 py-3 text-sm text-muted-foreground">No dishes in this category yet.</p>}
          {dishes.map((dish) => <div key={dish.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1">
            <span className="min-w-0 break-words text-sm">{dish.name}</span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="compact" disabled={busy} aria-label={`Edit ${dish.name}`}
                onClick={() => setDraft({...dish, category: name, parentGroup: group})}><Pencil size={14} aria-hidden="true" /> Edit</Button>
              <Button type="button" variant="ghost" className="text-destructive" size="compact" disabled={busy} aria-label={`Delete ${dish.name}`} onClick={() => void (async () => {
                const confirmed = await confirm({
                  message: `Delete ${dish.name} from your Dish List?`,
                  supportingText: "This removes the dish from your Dish List. Existing packages keep their own saved dishes.",
                  confirmLabel: "Delete dish",
                  destructive: true,
                });
                if (!confirmed) return;
                await save(library.dishes.filter((row) => row.id !== dish.id), library.categories,
                  () => setDraft((current) => current?.id === dish.id ? null : current));
              })()}><Trash2 size={14} aria-hidden="true" /> Delete</Button>
            </div>
          </div>)}
        </section>)}
      </section>)}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm text-muted-foreground">
            {showPagination
              ? `Page ${currentPage} of ${pageCount} · Showing ${start + 1}–${end} of ${dishCount}${filterContext}`
              : `Showing ${totalDishes > 0 && !filterName && !query ? "all " : ""}${dishCount}${filterContext}`}
          </p>
          {showPagination && <Select aria-label="Dishes per page" className="w-auto" value={pageSize}
            onChange={(event) => {setPageSize(Number(event.target.value)); setPage(1);}}>
            {[MINIMUM_DISH_PAGE_SIZE, 20, 50].map((size) => <option key={size} value={size}>Show {size}</option>)}
          </Select>}
        </div>
        {showPagination && pageCount > 1 && <nav aria-label="Dish List pagination" className="flex flex-wrap items-center gap-1">
          <Button type="button" variant="ghost" size="compact" disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}>Previous</Button>
          {Array.from({length: Math.min(5, pageCount)}, (_, index) =>
            Math.min(Math.max(1, currentPage - 2), Math.max(1, pageCount - 4)) + index
          ).map((number) => <Button key={number} type="button" size="compact"
            variant={number === currentPage ? "primary" : "ghost"} aria-current={number === currentPage ? "page" : undefined}
            aria-label={`Page ${number}`} onClick={() => setPage(number)}>{number}</Button>)}
          <Button type="button" variant="ghost" size="compact" disabled={currentPage === pageCount}
            onClick={() => setPage(currentPage + 1)}>Next</Button>
        </nav>}
      </footer>
    </div>
  </section>;
}
