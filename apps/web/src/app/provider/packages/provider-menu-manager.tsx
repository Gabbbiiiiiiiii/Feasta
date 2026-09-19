"use client";

import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {StatusBadge} from "@/components/shared/status-badge";
import {Plus, Edit3, Images} from "lucide-react";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {CatalogImageUploader, uploadCatalogImages} from "@/components/provider/catalog-image-uploader";
import type {CatalogImageDraft} from "@/lib/provider/catalog-media";
import type {ProviderMenu} from "@/lib/provider/provider-menu";
import {loadProviderMenuAction, saveProviderMenuAction} from "./menu-actions";

export function ProviderMenuManager() {
  const [menu, setMenu] = useState<ProviderMenu>({revision: 0, images: []});
  const [images, setImages] = useState<CatalogImageDraft[]>([]);
  const [published, setPublished] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  // The current model stores a combined optional Title / category, not a separate category.
  const titles = [...new Set(menu.images.map((image) => image.title).filter(Boolean))].sort();
  const filteredImages = menu.images.filter((image) =>
    (!titleFilter || image.title === titleFilter) && image.title.toLowerCase().includes(search.trim().toLowerCase()));
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
      setMenu(loaded); setImages(loaded.images); setPublished(new Set(loaded.images.filter((image) => image.isPublished).map((image) => image.id)));
      setOpen(true);
    } catch { setError("Your menu could not be loaded. Please try again."); }
    finally { setLoading(false); }
  }

  return <section aria-labelledby="provider-menu-heading" className="grid min-w-0 gap-4 border-t border-border pt-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="provider-menu-heading" className="text-xl font-bold">Menu & Catalog</h2>
        <p className="mt-1 text-sm text-muted-foreground">Upload and manage menu posters, food photos, and browsing-only catalog content.</p></div>
      <Dialog open={open} onOpenChange={(next) => { if (!busy && !next) setOpen(false); }}>
        <DialogTrigger asChild><Button type="button" disabled={loading} onClick={() => void startEditing()}>
          <Plus aria-hidden="true" className="size-4" />Add menu images
        </Button></DialogTrigger>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-w-0 max-w-[60rem] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-3rem)]" showCloseButton={!busy}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()}>
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-16"><DialogTitle>Menu & catalog images</DialogTitle>
            <DialogDescription>Add images, optional titles, and choose which images to publish. Changes take effect when you save.</DialogDescription></DialogHeader>
          <div role="region" aria-label="Menu image details" tabIndex={0} className="mx-2 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            <CatalogImageUploader images={images} onChange={setImages} disabled={busy} titles
              publication={{published, onChange: (id, checked) => setPublished((current) => {
                const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next;
              })}} />
          </div>
          <div className="grid shrink-0 gap-3 border-t border-border bg-card px-5 py-4">
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={busy} loadingLabel="Saving menu" disabled={busy} onClick={async () => {
              setBusy(true); setError(null);
              try {
                const uploaded = await uploadCatalogImages(images, (saved) => setImages((current) => current.map((image) => image.id === saved.id ? saved : image)));
                const result = await saveProviderMenuAction({revision: menu.revision, images: uploaded.map((image) => ({id: image.id, title: image.title, url: image.url, isPublished: published.has(image.id)}))});
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
        <Input type="search" placeholder="Search menu images..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>
      {titles.length ? <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm font-semibold">Title / category
        <Select value={titleFilter} onChange={(event) => setTitleFilter(event.target.value)}>
          <option value="">All</option>{titles.map((title) => <option key={title} value={title}>{title}</option>)}
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
        <div className="p-3"><h3 className="line-clamp-2 break-words text-base font-bold">{image.title || `Menu image ${menu.images.indexOf(image) + 1}`}</h3></div>
        <div className="border-t border-border p-2"><Button variant="secondary" size="compact" disabled={loading} aria-label={`Edit ${image.title || `menu image ${menu.images.indexOf(image) + 1}`}`} onClick={() => void startEditing()}><Edit3 aria-hidden="true" className="size-4" />Edit</Button></div>
      </article>)}
    </div>
    {!loading && !error && menu.images.length === 0 ? <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-border bg-card px-5 py-10 text-center"><Images aria-hidden="true" className="size-8 text-primary-strong" /><p className="text-sm text-muted-foreground">No menu images yet. Add posters or photos without transcribing every menu item.</p></div> : null}
    {!loading && !error && menu.images.length > 0 && filteredImages.length === 0 ? <p role="status" className="py-6 text-sm text-muted-foreground">No menu images match your filters.</p> : null}
  </section>;
}
