"use client";

import {useEffect, useState} from "react";
import {Edit3, Images, Plus, Trash2} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import {StatusBadge} from "@/components/shared/status-badge";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {CatalogImageUploader, uploadCatalogImages} from "@/components/provider/catalog-image-uploader";
import type {CatalogImageDraft} from "@/lib/provider/catalog-media";
import {
  PROVIDER_SETUP_DESCRIPTION_LIMIT,
  PROVIDER_SETUP_EVENT_TYPES,
  PROVIDER_SETUP_EVENT_TYPE_LABELS,
  PROVIDER_SETUP_IMAGE_LIMIT,
  PROVIDER_SETUP_LIMIT,
  PROVIDER_SETUP_THEME_TAG_LENGTH,
  PROVIDER_SETUP_THEME_TAG_LIMIT,
  PROVIDER_SETUP_TITLE_LIMIT,
  type ProviderSetup,
  type ProviderSetupEventType,
  type ProviderSetupGallery,
} from "@/lib/provider/provider-setup-gallery";
import {loadProviderSetupGalleryAction, saveProviderSetupGalleryAction} from "./setup-gallery-actions";

type SetupDraft = {
  id: string;
  title: string;
  description: string;
  eventType: ProviderSetupEventType | "";
  styles: string;
  images: CatalogImageDraft[];
  isPublished: boolean;
};

export function ProviderSetupGalleryManager() {
  const [gallery, setGallery] = useState<ProviderSetupGallery>({revision: 0, setups: []});
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<ProviderSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadProviderSetupGalleryAction().then((loaded) => { if (active) setGallery(loaded); })
      .catch(() => { if (active) setError("Your setup gallery could not be loaded. Try reopening the editor."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveDraft() {
    if (!draft || busy) return;
    const validation = validateDraft(draft);
    if (validation) { setError(validation); return; }
    setBusy(true); setError(null);
    try {
      const uploaded = await uploadCatalogImages(draft.images, (saved) => {
        setDraft((current) => current ? {...current, images: current.images.map((image) => image.id === saved.id ? saved : image)} : current);
      });
      const setup: ProviderSetup = {
        id: draft.id,
        title: draft.title.trim().replace(/\s+/gu, " "),
        description: draft.description.trim().replace(/\s+/gu, " "),
        eventType: draft.eventType as ProviderSetupEventType,
        themeTags: styleTags(draft.styles),
        imageUrls: uploaded.map((image) => image.url),
        isPublished: draft.isPublished,
      };
      const exists = gallery.setups.some((item) => item.id === setup.id);
      const result = await saveProviderSetupGalleryAction({
        revision: gallery.revision,
        setups: exists ? gallery.setups.map((item) => item.id === setup.id ? setup : item) : [...gallery.setups, setup],
      });
      if (!result.ok) throw new Error(result.error);
      setGallery(result.gallery); setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The setup could not be saved.");
    } finally { setBusy(false); }
  }

  async function removeSetup() {
    if (!pendingRemoval || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await saveProviderSetupGalleryAction({
        revision: gallery.revision,
        setups: gallery.setups.filter((item) => item.id !== pendingRemoval.id),
      });
      if (!result.ok) throw new Error(result.error);
      setGallery(result.gallery); setPendingRemoval(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The setup could not be removed.");
    } finally { setBusy(false); }
  }

  return <section aria-labelledby="provider-setup-gallery-heading" className="grid min-w-0 gap-4 border-t border-border pt-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 id="provider-setup-gallery-heading" className="text-xl font-bold">Setup gallery</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Add photos of events you have styled. Published setups are visual inspiration only and do not set a package, menu, or booking price.</p>
      </div>
      <Button type="button" disabled={loading || busy || gallery.setups.length >= PROVIDER_SETUP_LIMIT} onClick={() => { setError(null); setDraft(emptyDraft()); }}>
        <Plus aria-hidden="true" className="size-4" />Add setup
      </Button>
    </div>
    {error && !draft ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading setup gallery…</p> : null}
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] items-start gap-4">
      {gallery.setups.map((setup) => <article key={setup.id} aria-label={setup.title} className="min-w-0 self-start overflow-hidden rounded-card border border-border bg-card shadow-card">
        <div className="relative h-48 overflow-hidden bg-muted">
          {setup.imageUrls[0] ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.imageUrls[0]} alt={`${setup.title} photo`} className="absolute inset-0 size-full object-contain" loading="lazy" />
          </> : <div className="grid h-full place-items-center px-4 text-center text-sm text-muted-foreground">No photo yet</div>}
          <div className="absolute right-2 top-2"><StatusBadge status={setup.isPublished ? "published" : "draft"} /></div>
        </div>
        <div className="grid gap-1 p-3">
          <h3 className="line-clamp-2 break-words text-base font-bold">{setup.title}</h3>
          <p className="text-xs font-semibold uppercase text-primary-strong">{PROVIDER_SETUP_EVENT_TYPE_LABELS[setup.eventType]}</p>
          {setup.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{setup.description}</p> : null}
          {setup.themeTags.length ? <p className="text-xs text-muted-foreground">{setup.themeTags.join(", ")}</p> : null}
        </div>
        <div className="flex gap-2 border-t border-border p-2">
          <Button variant="secondary" size="compact" disabled={loading || busy} aria-label={`Edit ${setup.title}`} onClick={() => { setError(null); setDraft(draftFromSetup(setup)); }}>
            <Edit3 aria-hidden="true" className="size-4" />Edit
          </Button>
          <Button variant="ghost" size="compact" disabled={loading || busy} aria-label={`Remove ${setup.title}`} onClick={() => setPendingRemoval(setup)}>
            <Trash2 aria-hidden="true" className="size-4" />Remove
          </Button>
        </div>
      </article>)}
    </div>
    {!loading && !error && gallery.setups.length === 0 ? <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-border bg-card px-5 py-10 text-center">
      <Images aria-hidden="true" className="size-8 text-primary-strong" />
      <p className="text-sm text-muted-foreground">No setups yet. Add photos from a completed event when you want customers to see your work.</p>
    </div> : null}

    <Dialog open={draft !== null} onOpenChange={(next) => { if (!busy && !next) { setDraft(null); setError(null); } }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-w-0 max-w-[60rem] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-3rem)]" showCloseButton={!busy}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-16">
          <DialogTitle>{gallery.setups.some((setup) => setup.id === draft?.id) ? "Edit setup" : "Add setup"}</DialogTitle>
          <DialogDescription>Describe the look of a completed event. Publishing makes it visible as inspiration. It does not change any price.</DialogDescription>
        </DialogHeader>
        {draft ? <div className="mx-2 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-gutter:stable]">
          <div className="grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">Setup title
              <Input maxLength={PROVIDER_SETUP_TITLE_LIMIT} value={draft.title} disabled={busy} placeholder="e.g. Garden reception"
                onChange={(event) => setDraft({...draft, title: event.target.value})} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Event type
              <Select value={draft.eventType} disabled={busy} aria-label="Event type" onChange={(event) => setDraft({...draft, eventType: event.target.value as ProviderSetupEventType | ""})}>
                <option value="">Choose an event type</option>
                {PROVIDER_SETUP_EVENT_TYPES.map((eventType) => <option key={eventType} value={eventType}>{PROVIDER_SETUP_EVENT_TYPE_LABELS[eventType]}</option>)}
              </Select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">Description (optional)
              <Textarea maxLength={PROVIDER_SETUP_DESCRIPTION_LIMIT} rows={3} value={draft.description} disabled={busy}
                placeholder="What should customers notice about this setup?"
                onChange={(event) => setDraft({...draft, description: event.target.value})} />
            </label>
            <div className="grid gap-1">
              <label htmlFor="setup-styles" className="text-sm font-semibold">Styles (optional)</label>
              <Input id="setup-styles" maxLength={PROVIDER_SETUP_THEME_TAG_LIMIT * (PROVIDER_SETUP_THEME_TAG_LENGTH + 2)} value={draft.styles} disabled={busy}
                placeholder="e.g. Garden, Lanterns" aria-describedby="setup-style-help"
                onChange={(event) => setDraft({...draft, styles: event.target.value})} />
              <span id="setup-style-help" className="text-xs font-normal text-muted-foreground">Separate styles with commas. Up to {PROVIDER_SETUP_THEME_TAG_LIMIT} styles.</span>
            </div>
            <CatalogImageUploader images={draft.images} disabled={busy} maximumImages={PROVIDER_SETUP_IMAGE_LIMIT}
              heading="Setup photos" helperText="Upload photos of the finished setup. These are inspiration only."
              inputLabel="Setup photos" onChange={(images) => setDraft({...draft, images})} />
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="size-4 accent-primary" disabled={busy} checked={draft.isPublished}
                onChange={(event) => setDraft({...draft, isPublished: event.target.checked})} />
              Publish this setup
            </label>
          </div>
        </div> : null}
        <div className="grid shrink-0 gap-3 border-t border-border bg-card px-5 py-4">
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => { setDraft(null); setError(null); }}>Cancel</Button>
            <Button loading={busy} loadingLabel="Saving setup" disabled={busy} onClick={() => void saveDraft()}>Save setup</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <ConfirmationDialog open={pendingRemoval !== null} onOpenChange={(open) => { if (!open && !busy) setPendingRemoval(null); }}
      title="Remove this setup?" description={pendingRemoval ? `Remove "${pendingRemoval.title}" from your setup gallery? Customers will no longer see it as inspiration.` : "Remove this setup?"}
      confirmLabel="Remove setup" destructive loading={busy} loadingLabel="Removing setup" onConfirm={removeSetup} />
  </section>;
}

function emptyDraft(): SetupDraft {
  return {id: crypto.randomUUID(), title: "", description: "", eventType: "", styles: "", images: [], isPublished: false};
}

function draftFromSetup(setup: ProviderSetup): SetupDraft {
  return {
    id: setup.id,
    title: setup.title,
    description: setup.description,
    eventType: setup.eventType,
    styles: setup.themeTags.join(", "),
    images: setup.imageUrls.map((url, index) => ({id: `saved-${setup.id}-${index}`, title: "", url})),
    isPublished: setup.isPublished,
  };
}

function styleTags(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim().replace(/\s+/gu, " ")).filter(Boolean))];
}

function validateDraft(draft: SetupDraft): string | null {
  const title = draft.title.trim().replace(/\s+/gu, " ");
  if (!title || title.length > PROVIDER_SETUP_TITLE_LIMIT) return "Enter a setup title.";
  if (!draft.eventType) return "Choose an event type.";
  if (draft.description.trim().length > PROVIDER_SETUP_DESCRIPTION_LIMIT) return "Shorten the setup description.";
  const tags = styleTags(draft.styles);
  if (tags.length > PROVIDER_SETUP_THEME_TAG_LIMIT || tags.some((tag) => tag.length > PROVIDER_SETUP_THEME_TAG_LENGTH)) {
    return `Use at most ${PROVIDER_SETUP_THEME_TAG_LIMIT} styles, with each style under ${PROVIDER_SETUP_THEME_TAG_LENGTH} characters.`;
  }
  if (draft.images.length > PROVIDER_SETUP_IMAGE_LIMIT) return `Choose at most ${PROVIDER_SETUP_IMAGE_LIMIT} photos.`;
  if (draft.isPublished && draft.images.length === 0) return "Add at least one photo before publishing this setup.";
  return null;
}
