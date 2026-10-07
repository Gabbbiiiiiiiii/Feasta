"use client";

import {useEffect, useState, type ComponentProps, type Dispatch, type SetStateAction} from "react";
import {Button} from "@/components/ui/button";
import {useLiveSearch} from "@/lib/search/use-live-search";
import {SearchInput} from "@/components/forms/search-input";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import {StatusBadge} from "@/components/shared/status-badge";
import {Plus, Edit3, Images, Trash2} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {CatalogImageUploader, uploadCatalogImages} from "@/components/provider/catalog-image-uploader";
import type {CatalogImageDraft} from "@/lib/provider/catalog-media";
import {MENU_SERVING_OPTION_LIMIT, type ProviderMenu, type ProviderMenuImage, type ProviderMenuServingOption} from "@/lib/provider/provider-menu";
import {loadProviderMenuAction, saveProviderMenuAction} from "./menu-actions";

type ServingOptionDraft = Omit<ProviderMenuServingOption, "minimumGuests" | "maximumGuests" | "price"> & {
  minimumGuests: string;
  maximumGuests: string;
  price: string;
};
type MenuDetailsDraft = {description: string; category: string; servingOptions: ServingOptionDraft[]};

export function ProviderMenuManager() {
  const [menu, setMenu] = useState<ProviderMenu>({revision: 0, images: []});
  const [images, setImages] = useState<CatalogImageDraft[]>([]);
  const [details, setDetails] = useState<Record<string, MenuDetailsDraft>>({});
  const [published, setPublished] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState(search);
  const live = useLiveSearch(search, setAppliedSearch);
  const [titleFilter, setTitleFilter] = useState("");
  const categories = [...new Set(menu.images.map((image) => image.category?.trim()).filter(Boolean) as string[])].sort();
  const filteredImages = menu.images.filter((image) =>
    (!titleFilter || image.category === titleFilter) &&
    [image.title, image.description, image.category, ...(image.servingOptions ?? []).flatMap((option) => [option.name, option.description])]
      .filter(Boolean).join(" ").toLowerCase().includes(appliedSearch.trim().toLowerCase()));
  useEffect(() => {
    let active = true;
    loadProviderMenuAction().then((loaded) => { if (active) setMenu(loaded); })
      .catch(() => { if (active) setError("Your menu could not be loaded. Try reopening the editor."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function startEditing() {
    setLoading(true); setError(null);
    try {
      const loaded = await loadProviderMenuAction();
      setMenu(loaded);
      setImages(loaded.images);
      setDetails(Object.fromEntries(loaded.images.map((image) => [image.id, menuDetailsFromImage(image)])));
      setPublished(new Set(loaded.images.filter((image) => image.isPublished).map((image) => image.id)));
      setOpen(true);
    } catch { setError("Your menu could not be loaded. Please try again."); }
    finally { setLoading(false); }
  }

  return <section aria-labelledby="provider-menu-heading" className="grid min-w-0 gap-4 border-t border-border pt-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="provider-menu-heading" className="text-xl font-bold">Menu & Catalog</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage menu items, descriptions, categories, serving sizes, and display prices.</p></div>
      <Dialog open={open} onOpenChange={(next) => { if (!busy && !next) setOpen(false); }}>
        <DialogTrigger asChild><Button type="button" disabled={loading} onClick={() => void startEditing()}>
          <Plus aria-hidden="true" className="size-4" />Add menu items
        </Button></DialogTrigger>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-w-0 max-w-[60rem] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-3rem)]" showCloseButton={!busy}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()}>
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-16"><DialogTitle>Menu & catalog items</DialogTitle>
            <DialogDescription>Add images and optional structured details. Prices shown here are display information; booking validates selections separately.</DialogDescription></DialogHeader>
          <div role="region" aria-label="Menu item details" tabIndex={0} className="mx-2 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <CatalogImageUploader images={images} onChange={setImages} disabled={busy} titles
              publication={{published, onChange: (id, checked) => setPublished((current) => {
                const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next;
              })}} />
            <div className="mt-5 grid gap-4">
              {images.map((image, imageIndex) => {
                const current = details[image.id] ?? emptyMenuDetails();
                return <section key={image.id} aria-label={`Structured details for ${image.title || `menu item ${imageIndex + 1}`}`}
                  className="grid gap-4 rounded-xl border border-border bg-card p-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm font-semibold">Category
                      <Input maxLength={80} value={current.category} disabled={busy} placeholder="e.g. Beef, Chicken, Pasta"
                        onChange={(event) => updateDetails(setDetails, image.id, {...current, category: event.target.value})} />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Description
                      <Textarea maxLength={600} rows={3} value={current.description} disabled={busy}
                        placeholder="Describe the dish or menu item."
                        onChange={(event) => updateDetails(setDetails, image.id, {...current, description: event.target.value})} />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <div><h4 className="text-sm font-bold">Serving sizes</h4>
                      <p className="text-xs text-muted-foreground">Optional display information for future trusted booking integration.</p></div>
                    <Button type="button" variant="secondary" size="compact"
                      disabled={busy || current.servingOptions.length >= MENU_SERVING_OPTION_LIMIT}
                      onClick={() => updateDetails(setDetails, image.id, {...current, servingOptions: [...current.servingOptions, emptyServingOption()]})}>
                      <Plus aria-hidden="true" className="size-4" />Add serving size
                    </Button>
                  </div>
                  {current.servingOptions.map((option, optionIndex) =>
                    <div key={option.id} role="group" aria-label={`Serving size ${optionIndex + 1} for ${image.title || `menu item ${imageIndex + 1}`}`}
                      className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold">Serving size {optionIndex + 1}</p>
                        <Button type="button" variant="ghost" size="icon" disabled={busy} title="Remove serving size"
                          aria-label={`Remove serving size ${optionIndex + 1}`}
                          onClick={() => updateDetails(setDetails, image.id, {...current, servingOptions: current.servingOptions.filter((entry) => entry.id !== option.id)})}>
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ServingInput label="Serving size name" value={option.name} maxLength={80} disabled={busy}
                          onChange={(value) => changeServingOption(setDetails, image.id, current, option.id, {name: value})} />
                        <ServingInput label="Price (₱)" value={option.price} type="number" min="0.01" max="100000000" step="0.01" disabled={busy}
                          onChange={(value) => changeServingOption(setDetails, image.id, current, option.id, {price: value})} />
                        <ServingInput label="Minimum guests" value={option.minimumGuests} type="number" min="1" max="1000000" step="1" disabled={busy}
                          onChange={(value) => changeServingOption(setDetails, image.id, current, option.id, {minimumGuests: value})} />
                        <ServingInput label="Maximum guests" value={option.maximumGuests} type="number" min="1" max="1000000" step="1" disabled={busy}
                          onChange={(value) => changeServingOption(setDetails, image.id, current, option.id, {maximumGuests: value})} />
                        <ServingInput label="Serving notes (optional)" value={option.description} maxLength={160} disabled={busy}
                          onChange={(value) => changeServingOption(setDetails, image.id, current, option.id, {description: value})} />
                      </div>
                    </div>)}
                </section>;
              })}
            </div>
          </div>
          <div className="grid shrink-0 gap-3 border-t border-border bg-card px-5 py-4">
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={busy} loadingLabel="Saving menu" disabled={busy} onClick={async () => {
              setBusy(true); setError(null);
              try {
                const uploaded = await uploadCatalogImages(images, (saved) => setImages((current) => current.map((image) => image.id === saved.id ? saved : image)));
                const result = await saveProviderMenuAction({revision: menu.revision,
                  images: uploaded.map((image) => menuImageForSave(image, published.has(image.id), details[image.id]))});
                if (!result.ok) throw new Error(result.error);
                setMenu(result.menu); setSearch(""); setTitleFilter(""); setOpen(false);
              } catch (caught) { setError(caught instanceof Error ? (caught.message === "Menu image verification is not configured. Contact FEASTA support." ? "Menu uploads need server configuration. Contact FEASTA support, then retry saving." : caught.message) : "The menu could not be saved."); }
              finally { setBusy(false); }
            }}>Save menu</Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    {!open && error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {menu.images.length ? <div role="search" aria-label="Filter menu images" className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 flex-1 basis-64 gap-1 text-sm font-semibold">Search menu images
        <SearchInput
          aria-label="Search menu images"
          placeholder="Search menu images..."
          value={search}
          onChange={(event) => {
            live.change(event.target.value);
            setSearch(event.target.value);
          }}
          onClear={search ? () => {
            live.change("");
            setSearch("");
          } : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              live.submit();
            }
          }}
        />
      </label>
      {categories.length ? <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm font-semibold">Category
        <Select value={titleFilter} onChange={(event) => setTitleFilter(event.target.value)}>
          <option value="">All</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </Select>
      </label> : null}
      {search || titleFilter ? <Button variant="ghost" size="compact" onClick={() => { setSearch(""); setTitleFilter(""); }}>Clear menu filters</Button> : null}
    </div> : null}
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading menu…</p> : null}
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] items-start gap-4">
      {filteredImages.map((image) => <article key={image.id} aria-label={image.title || `Menu image ${menu.images.indexOf(image) + 1}`} className="min-w-0 self-start overflow-hidden rounded-card border border-border bg-card shadow-card">
        <div className="relative h-48 overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={image.title || `Menu image ${menu.images.indexOf(image) + 1}`} className="absolute inset-0 size-full object-contain" loading="lazy" />
        <div className="absolute right-2 top-2"><StatusBadge status={image.isPublished ? "published" : "draft"} /></div>
        </div>
        <div className="grid gap-1 p-3"><h3 className="line-clamp-2 break-words text-base font-bold">{image.title || `Menu image ${menu.images.indexOf(image) + 1}`}</h3>
          {image.category ? <p className="text-xs font-semibold uppercase text-primary-strong">{image.category}</p> : null}
          {image.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{image.description}</p> : null}
          {image.servingOptions?.length ? <p className="text-xs text-muted-foreground">{image.servingOptions.length} serving {image.servingOptions.length === 1 ? "size" : "sizes"}</p> : null}
        </div>
        <div className="border-t border-border p-2"><Button variant="secondary" size="compact" disabled={loading} aria-label={`Edit ${image.title || `menu image ${menu.images.indexOf(image) + 1}`}`} onClick={() => void startEditing()}><Edit3 aria-hidden="true" className="size-4" />Edit</Button></div>
      </article>)}
    </div>
    {!loading && !error && menu.images.length === 0 ? <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-border bg-card px-5 py-10 text-center"><Images aria-hidden="true" className="size-8 text-primary-strong" /><p className="text-sm text-muted-foreground">No menu items yet. Add photos or menu posters with optional serving details.</p></div> : null}
    {!loading && !error && menu.images.length > 0 && filteredImages.length === 0 ? <p role="status" className="py-6 text-sm text-muted-foreground">No menu images match your filters.</p> : null}
  </section>;
}

function updateDetails(setDetails: Dispatch<SetStateAction<Record<string, MenuDetailsDraft>>>, imageId: string, value: MenuDetailsDraft) {
  setDetails((current) => ({...current, [imageId]: value}));
}

function changeServingOption(setDetails: Dispatch<SetStateAction<Record<string, MenuDetailsDraft>>>, imageId: string,
  current: MenuDetailsDraft, optionId: string, change: Partial<ServingOptionDraft>) {
  updateDetails(setDetails, imageId, {...current,
    servingOptions: current.servingOptions.map((option) => option.id === optionId ? {...option, ...change} : option)});
}

function ServingInput({label, value, onChange, ...props}: {
  label: string; value: string; onChange: (value: string) => void;
} & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
  return <label className="grid gap-1 text-sm font-semibold">{label}
    <Input {...props} value={value} onChange={(event) => onChange(event.target.value)} />
  </label>;
}

function menuDetailsFromImage(image: ProviderMenuImage): MenuDetailsDraft {
  return {description: image.description ?? "", category: image.category ?? "",
    servingOptions: (image.servingOptions ?? []).map((option) => ({...option,
      minimumGuests: String(option.minimumGuests), maximumGuests: String(option.maximumGuests), price: String(option.price)}))};
}

function emptyMenuDetails(): MenuDetailsDraft {
  return {description: "", category: "", servingOptions: []};
}

function emptyServingOption(): ServingOptionDraft {
  return {id: crypto.randomUUID(), name: "", description: "", minimumGuests: "", maximumGuests: "", price: ""};
}

function menuImageForSave(image: CatalogImageDraft, isPublished: boolean, details?: MenuDetailsDraft): ProviderMenuImage {
  const base: ProviderMenuImage = {id: image.id, title: image.title.trim(), url: image.url, isPublished};
  const current = details ?? emptyMenuDetails();
  const description = current.description.trim();
  const category = current.category.trim();
  const servingOptions = current.servingOptions.map((option, index) => servingOptionForSave(option, base.title, index));
  if (!description && !category && !servingOptions.length) return base;
  if (servingOptions.length && !base.title) throw new Error("Enter an item name before adding serving sizes.");
  return {...base, description, category, servingOptions};
}

function servingOptionForSave(option: ServingOptionDraft, itemName: string, index: number): ProviderMenuServingOption {
  const name = option.name.trim();
  const minimumGuests = Number(option.minimumGuests);
  const maximumGuests = Number(option.maximumGuests);
  const price = Number(option.price);
  const normalizedPrice = Math.round((price + Number.EPSILON) * 100) / 100;
  const label = itemName || "this menu item";
  if (!name) throw new Error(`Enter the serving size name for ${label}, option ${index + 1}.`);
  if (!Number.isSafeInteger(minimumGuests) || minimumGuests < 1 || minimumGuests > 1_000_000) {
    throw new Error(`Enter a valid minimum guest count for serving size "${name}".`);
  }
  if (!Number.isSafeInteger(maximumGuests) || maximumGuests < minimumGuests || maximumGuests > 1_000_000) {
    throw new Error(`Enter a valid maximum guest count for serving size "${name}".`);
  }
  if (!Number.isFinite(price) || price <= 0 || price > 100_000_000 || normalizedPrice !== price) {
    throw new Error(`Enter a valid price with at most two decimal places for serving size "${name}".`);
  }
  return {id: option.id, name, description: option.description.trim(), minimumGuests, maximumGuests,
    price: normalizedPrice};
}
