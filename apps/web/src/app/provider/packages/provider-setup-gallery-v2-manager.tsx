"use client";

import {useEffect, useState} from "react";
import {OccasionRequestDialog} from "@/components/provider/occasion-request-dialog";
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
  PROVIDER_SETUP_DESCRIPTION_LIMIT, PROVIDER_SETUP_EVENT_TYPES, PROVIDER_SETUP_EVENT_TYPE_LABELS,
  PROVIDER_SETUP_IMAGE_LIMIT, PROVIDER_SETUP_LIMIT, PROVIDER_SETUP_THEME_TAG_LENGTH,
  PROVIDER_SETUP_THEME_TAG_LIMIT, PROVIDER_SETUP_TITLE_LIMIT, type ProviderSetupEventType,
} from "@/lib/provider/provider-setup-gallery";
import {
  galleryErrorHelp, occasionAllowed, occasionLabel, replacementRequest, selectionError, setupProposal,
  type GalleryFailure, type PrivateSetup, type SetupProposal,
} from "@/lib/provider/provider-setup-gallery-editor";
import type {PrivateSetupGalleryV2} from "@/lib/provider/provider-setup-gallery-v2-writer";
import {loadPrivateProviderSetupGalleryV2Action, savePrivateProviderSetupGalleryV2Action} from "./setup-gallery-actions";

type SetupDraft = {
  id: string; title: string; description: string; styles: string;
  images: CatalogImageDraft[]; isPublished: boolean;
  version: 1 | 2; eventType: ProviderSetupEventType | "";
  occasionScope: "specific" | "all"; occasionIds: string[];
};

export function ProviderSetupGalleryV2Manager() {
  const [gallery, setGallery] = useState<PrivateSetupGalleryV2 | null>(null);
  const [draft, setDraft] = useState<SetupDraft | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PrivateSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<GalleryFailure | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [recovery, setRecovery] = useState<"reload" | "reconcile" | null>(null);

  useEffect(() => {
    let active = true;
    loadPrivateProviderSetupGalleryV2Action({galleryWriteSchemaVersion: 2}).then((result) => {
      if (!active) return;
      if (result.ok) {
        setGallery(result.gallery); setFailure(null);
      } else {
        setFailure(result); setRecovery("reload");
      }
    }).catch(() => {
      if (active) {
        setFailure({ok: false, code: "INTERNAL", error: "Your private gallery could not be loaded."});
        setRecovery("reload");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadAttempt]);

  const canSave = !!gallery?.availability.canSave && !loading && !busy && !recovery;
  const publicationBlocked = !!gallery && !gallery.availability.canPublishV2;
  const message = failure ? `${failure.error} ${galleryErrorHelp[failure.code]}` : error;

  function reload() {
    if (busy || loading) return;
    // Keep the draft and its photos. A successful reload still requires explicit reconciliation.
    setRecovery(draft ? "reconcile" : null);
    setPendingRemoval(null); setLoading(true); setError(null); setLoadAttempt((attempt) => attempt + 1);
  }

  function handleFailure(result: GalleryFailure) {
    setFailure(result); setError(null);
    if (["CONFLICT", "INVALID_SELECTION", "UNAVAILABLE", "FORBIDDEN", "INVALID_REQUEST"].includes(result.code)) {
      setRecovery("reload");
    }
  }

  async function save(setups: SetupProposal[]) {
    if (!gallery || !canSave) return;
    // Retained V2 publication must not sneak through a full replacement either.
    if (publicationBlocked && setups.some((setup) => setup.setupOccasionSchemaVersion === 2 && setup.isPublished)) {
      setError("V2 publication is unavailable. Unpublish the affected V2 setup before saving."); return;
    }
    const result = await savePrivateProviderSetupGalleryV2Action(replacementRequest(gallery, setups));
    if (!result.ok) { handleFailure(result); return; }
    setGallery(result.gallery); setDraft(null); setPendingRemoval(null); setFailure(null); setError(null);
  }

  async function saveDraft() {
    if (!draft || !gallery || !canSave) return;
    const validation = validateDraft(draft, gallery);
    if (validation) { setError(validation); setFailure(null); return; }
    if (publicationBlocked && gallery.setups.some((setup) =>
      setup.id !== draft.id && setup.setupOccasionSchemaVersion === 2 && setup.isPublished)) {
      setError("V2 publication is unavailable. Unpublish the affected V2 setup before saving."); return;
    }
    setBusy(true); setError(null); setFailure(null);
    try {
      const images = await uploadCatalogImages(draft.images, (saved) => {
        setDraft((current) => current ? {...current, images: current.images.map((image) => image.id === saved.id ? saved : image)} : current);
      });
      const base = {
        id: draft.id, title: draft.title.trim().replace(/\s+/gu, " "),
        description: draft.description.trim().replace(/\s+/gu, " "), themeTags: styleTags(draft.styles),
        imageUrls: images.map((image) => image.url), isPublished: draft.isPublished,
      };
      const proposal: SetupProposal = draft.version === 2
        ? {...base, setupOccasionSchemaVersion: 2, occasionScope: draft.occasionScope, occasionIds: draft.occasionScope === "all" ? [] : [...draft.occasionIds]}
        : {...base, eventType: draft.eventType as ProviderSetupEventType,
          ...(gallery.setups.find((setup) => setup.id === draft.id)?.setupOccasionSchemaVersion === 1 ? {setupOccasionSchemaVersion: 1 as const} : {})};
      const retained = gallery.setups.map((setup) => setup.id === draft.id ? proposal : setupProposal(setup));
      if (!gallery.setups.some((setup) => setup.id === draft.id)) retained.push(proposal);
      await save(retained);
    } catch {
      setError("The setup could not be saved. Check your photos and connection, then try again.");
    } finally { setBusy(false); }
  }

  async function removeSetup() {
    if (!pendingRemoval || !gallery || !canSave) return;
    setBusy(true); setError(null); setFailure(null);
    try {
      await save(gallery.setups.filter((setup) => setup.id !== pendingRemoval.id).map(setupProposal));
    } catch {
      setError("The setup could not be removed. Try again.");
    } finally { setBusy(false); }
  }

  const latestDraftRecord = gallery?.setups.find((setup) => setup.id === draft?.id);
  const schemaChanged = !!draft && !!latestDraftRecord &&
    (latestDraftRecord.setupOccasionSchemaVersion === 2 ? 2 : 1) !== draft.version;

  function discardDraft() {
    setDraft(null); setError(null);
    if (recovery === "reconcile" && !failure && !loading) setRecovery(null);
  }

  const choices = gallery ? [...gallery.authority.catalog].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)) : [];

  return <section aria-labelledby="provider-setup-gallery-v2-heading" className="grid min-w-0 gap-3 border-t border-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 id="provider-setup-gallery-v2-heading" className="text-xl font-bold">Setup gallery</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Plan event inspiration with approved occasions. Setups do not change a package, menu, or booking price.</p>
      </div>
      <Button disabled={!gallery || loading || busy || gallery.setups.length >= PROVIDER_SETUP_LIMIT} onClick={() => {
        setError(null); setDraft(emptyDraft());
      }}><Plus aria-hidden="true" className="size-4" />Add setup</Button>
    </div>
    {loading ? <p role="status" className="text-sm text-muted-foreground">Loading setup gallery…</p> : null}
    {gallery && !gallery.availability.canSave ? <p role="status" className="text-sm text-muted-foreground">
      {gallery.availability.reason ?? "Saving is currently unavailable."} You can prepare a local draft; it will not be saved when you leave this editor.
    </p> : null}
    {publicationBlocked ? <p className="text-sm text-muted-foreground">V2 publication is unavailable. Occasion setups remain private.</p> : null}
    {message && !draft ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
    <Button variant="secondary" disabled={loading || busy} onClick={reload}>Reload gallery and occasions</Button>
    {gallery ? <details className="text-sm text-muted-foreground">
      <summary>Approved occasion capabilities</summary>
      <p>Approved catering categories: {gallery.authority.approvedCateringCategoryCodes.join(", ") || "None"}</p>
      <p>Approved occasions: {gallery.authority.approvedOccasionIds.map(occasionLabel).join(", ") || "None"}</p>
      <p>Choose up to {gallery.authority.maxSpecificOccasions} specific occasions.</p>
    </details> : null}
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] items-start gap-4">
      {gallery?.setups.map((setup) => <article key={setup.id} aria-label={setup.title} className="min-w-0 self-start overflow-hidden rounded-card border border-border bg-card shadow-card">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {setup.imageUrls[0] ? <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.imageUrls[0]} alt={`${setup.title} photo`} className="absolute inset-0 size-full object-cover" loading="lazy" />
          </> : <div className="grid h-full place-items-center px-4 text-center text-sm text-muted-foreground">No photo yet</div>}
          <span className="absolute bottom-2 left-2 rounded-full bg-background/90 px-2 py-1 text-xs">{setup.imageUrls.length} photos</span>
          <div className="absolute right-2 top-2"><StatusBadge status={setup.isPublished ? "published" : "draft"} /></div>
        </div>
        <div className="grid gap-1 p-3">
          <h3 className="line-clamp-2 break-words text-base font-bold">{setup.title}</h3>
          <p className="text-xs font-semibold uppercase text-primary-strong">{setup.setupOccasionSchemaVersion === 2
            ? setup.occasionScope === "all" ? "Fits all approved applicable occasions" : setup.occasionIds.map(occasionLabel).join(", ")
            : PROVIDER_SETUP_EVENT_TYPE_LABELS[setup.eventType]}</p>
          {setup.setupOccasionSchemaVersion === 2 && setup.occasionEligibilityState === "review_required"
            ? <p className="text-sm text-destructive">Occasion approval needs review</p> : null}
          {setup.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{setup.description}</p> : null}
          {setup.themeTags.length ? <p className="text-xs text-muted-foreground">{setup.themeTags.join(", ")}</p> : null}
        </div>
        <div className="flex gap-2 border-t border-border p-2">
          <Button variant="secondary" size="compact" disabled={loading || busy} aria-label={`Edit ${setup.title}`} onClick={() => {
            setError(null); setDraft(draftFromSetup(setup));
          }}><Edit3 aria-hidden="true" className="size-4" />Edit</Button>
          <Button variant="ghost" size="compact" disabled={!canSave} aria-label={`Remove ${setup.title}`} onClick={() => setPendingRemoval(setup)}>
            <Trash2 aria-hidden="true" className="size-4" />Remove
          </Button>
        </div>
      </article>)}
    </div>
    {!loading && gallery?.setups.length === 0 ? <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-border bg-card px-5 py-6 text-center">
      <Images aria-hidden="true" className="size-8 text-primary-strong" />
      <p className="text-sm text-muted-foreground">No setups yet. Add a draft to plan your event inspiration.</p>
    </div> : null}
    <Dialog open={draft !== null} onOpenChange={(open) => { if (!open && !busy) discardDraft(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-w-0 max-w-[60rem] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-3rem)]" showCloseButton={!busy}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-16">
          <DialogTitle>{gallery?.setups.some((setup) => setup.id === draft?.id) ? "Edit setup" : "Add setup"}</DialogTitle>
          <DialogDescription>Prepare event inspiration. Unsaved changes remain in this editor only.</DialogDescription>
        </DialogHeader>
        {draft && gallery ? <div className="mx-2 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 [scrollbar-gutter:stable]">
          <div className="grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">Setup title
              <Input maxLength={PROVIDER_SETUP_TITLE_LIMIT} value={draft.title} disabled={busy} onChange={(event) => setDraft({...draft, title: event.target.value})} />
            </label>
            {draft.version === 1 ? <label className="grid gap-1 text-sm font-semibold">Event type
              <Select value={draft.eventType} disabled={busy} onChange={(event) => setDraft({...draft, eventType: event.target.value as ProviderSetupEventType})}>
                {PROVIDER_SETUP_EVENT_TYPES.map((type) => <option key={type} value={type}>{PROVIDER_SETUP_EVENT_TYPE_LABELS[type]}</option>)}
              </Select>
            </label> : <>
              <fieldset className="grid gap-3" disabled={busy}>
                <legend className="text-sm font-semibold">Occasions (up to {gallery.authority.maxSpecificOccasions})</legend>
                <p className="text-xs text-muted-foreground">Select suitable occasions. Identifiers are shown until catalog display names are available.</p>
                <button type="button" aria-pressed={draft.occasionScope === "all"}
                  disabled={draft.occasionScope !== "all" && !!selectionError("all", [], gallery.authority)}
                  className="min-h-11 rounded-full border border-primary px-4 py-2 text-sm font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setDraft({...draft, occasionScope: draft.occasionScope === "all" ? "specific" : "all", occasionIds: []})}>
                  Fits All Occasions
                </button>
                <p className="text-xs text-muted-foreground">Fits All requires approval for every active applicable occasion.</p>
                <div className="flex flex-wrap gap-2">
                  {choices.map((occasion) => {
                    const selected = draft.occasionIds.includes(occasion.id);
                    const allowed = occasionAllowed(occasion, gallery.authority);
                    return <button key={occasion.id} type="button" aria-pressed={selected}
                      disabled={!selected && (!allowed || (draft.occasionScope === "specific" && draft.occasionIds.length >= gallery.authority.maxSpecificOccasions))}
                      className="min-h-11 max-w-full break-words rounded-full border border-border px-4 py-2 text-sm aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setDraft({...draft, occasionScope: "specific", occasionIds: selected
                        ? draft.occasionIds.filter((id) => id !== occasion.id) : [...draft.occasionIds, occasion.id]})}>
                      {occasionLabel(occasion.id)}{allowed ? "" : " (not approved or applicable)"}
                    </button>;
                  })}
                  {draft.occasionIds.filter((id) => !choices.some((occasion) => occasion.id === id)).map((id) => <button key={id} type="button" aria-pressed="true"
                    className="min-h-11 rounded-full border border-destructive px-4 py-2 text-sm text-destructive"
                    onClick={() => setDraft({...draft, occasionIds: draft.occasionIds.filter((value) => value !== id)})}>
                    {occasionLabel(id)} (no longer available; remove selection)
                  </button>)}
                </div>
                <p role="status" className="text-xs text-muted-foreground">{draft.occasionScope === "all" ? "Fits All selected" : `${draft.occasionIds.length} of ${gallery.authority.maxSpecificOccasions} selected`}</p>
                <OccasionRequestDialog />
              </fieldset>
              {selectionError(draft.occasionScope, draft.occasionIds, gallery.authority) ? <p className="text-sm text-muted-foreground">
                {selectionError(draft.occasionScope, draft.occasionIds, gallery.authority)}
              </p> : null}
            </>}
            <label className="grid gap-1 text-sm font-semibold">Description (optional)
              <Textarea maxLength={PROVIDER_SETUP_DESCRIPTION_LIMIT} rows={3} value={draft.description} disabled={busy} onChange={(event) => setDraft({...draft, description: event.target.value})} />
            </label>
            <label className="grid gap-1 text-sm font-semibold">Styles (optional)
              <Input maxLength={PROVIDER_SETUP_THEME_TAG_LIMIT * (PROVIDER_SETUP_THEME_TAG_LENGTH + 2)} value={draft.styles} disabled={busy}
                placeholder="e.g. Garden, Lanterns" onChange={(event) => setDraft({...draft, styles: event.target.value})} />
              <span className="text-xs font-normal text-muted-foreground">Separate styles with commas.</span>
            </label>
            <CatalogImageUploader images={draft.images} disabled={busy} maximumImages={PROVIDER_SETUP_IMAGE_LIMIT}
              heading="Setup photos" helperText="Upload photos of the finished setup. These are inspiration only."
              inputLabel="Setup photos" onChange={(images) => setDraft({...draft, images})} />
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="size-4 accent-primary" disabled={busy || (draft.version === 2 && publicationBlocked)}
                checked={draft.isPublished} onChange={(event) => setDraft({...draft, isPublished: event.target.checked})} />
              Publish this setup
            </label>
            {draft.version === 2 && publicationBlocked ? <p className="text-sm text-muted-foreground">V2 publication is unavailable.</p> : null}
          </div>
        </div> : null}
        <div className="grid shrink-0 gap-3 border-t border-border bg-card px-5 py-4">
          {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
          {gallery && !gallery.availability.canSave ? <p className="text-sm text-muted-foreground">Saving is currently unavailable. Your draft has not been saved.</p> : null}
          {recovery ? <div className="grid gap-2">
            <Button variant="secondary" disabled={loading || busy} onClick={reload}>Reload gallery and occasions</Button>
            {recovery === "reconcile" && !failure && !loading ? <>
              <p className="text-sm text-muted-foreground">Latest gallery and choices loaded. Review this draft before keeping it. If its original record was removed, keeping it will add it again.</p>
              {latestDraftRecord ? <div className="grid gap-1 rounded-card border border-border p-3 text-sm">
                <p className="font-semibold">Latest saved version of this setup</p>
                <p>{latestDraftRecord.title}</p>
                <p>{latestDraftRecord.description || "No description"}</p>
                <p>{latestDraftRecord.setupOccasionSchemaVersion === 2
                  ? latestDraftRecord.occasionScope === "all" ? "Fits All" : latestDraftRecord.occasionIds.join(", ")
                  : PROVIDER_SETUP_EVENT_TYPE_LABELS[latestDraftRecord.eventType]}</p>
                <p>{latestDraftRecord.themeTags.join(", ") || "No styles"} · {latestDraftRecord.imageUrls.length} photos · {latestDraftRecord.isPublished ? "Published" : "Draft"}</p>
                <p>Keeping your draft replaces this saved version with the fields shown in the editor.</p>
              </div> : null}
              {schemaChanged ? <p role="alert" className="text-sm text-destructive">The saved setup now uses a different occasion format. Discard this draft and reopen the latest setup.</p> : null}
              <Button variant="secondary" disabled={schemaChanged} onClick={() => { setRecovery(null); setError(null); }}>Keep draft with reloaded gallery</Button>
            </> : null}
          </div> : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" disabled={busy} onClick={discardDraft}>Discard local draft</Button>
            <Button loading={busy} loadingLabel="Saving setup" disabled={!canSave} onClick={() => void saveDraft()}>Save setup</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmationDialog open={pendingRemoval !== null} onOpenChange={(open) => { if (!open && !busy) setPendingRemoval(null); }}
      title="Remove this setup?" description={pendingRemoval ? `Remove "${pendingRemoval.title}" from your setup gallery?` : "Remove this setup?"}
      confirmLabel="Remove setup" destructive loading={busy} confirmDisabled={!canSave} loadingLabel="Removing setup" onConfirm={removeSetup}>
      {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
    </ConfirmationDialog>
  </section>;
}

function emptyDraft(): SetupDraft {
  return {id: crypto.randomUUID(), title: "", description: "", styles: "", images: [], isPublished: false,
    version: 2, eventType: "", occasionScope: "specific", occasionIds: []};
}

function draftFromSetup(setup: PrivateSetup): SetupDraft {
  return {
    id: setup.id, title: setup.title, description: setup.description, styles: setup.themeTags.join(", "),
    images: setup.imageUrls.map((url, index) => ({id: `saved-${setup.id}-${index}`, title: "", url})),
    isPublished: setup.isPublished, version: setup.setupOccasionSchemaVersion === 2 ? 2 : 1,
    eventType: setup.eventType ?? "",
    occasionScope: setup.setupOccasionSchemaVersion === 2 ? setup.occasionScope : "specific",
    occasionIds: setup.setupOccasionSchemaVersion === 2 ? [...setup.occasionIds] : [],
  };
}

function styleTags(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim().replace(/\s+/gu, " ")).filter(Boolean))];
}

function validateDraft(draft: SetupDraft, gallery: PrivateSetupGalleryV2): string | null {
  if (!draft.title.trim()) return "Enter a setup title.";
  if (draft.version === 1 && !draft.eventType) return "Choose an event type.";
  if (draft.version === 2) {
    const error = selectionError(draft.occasionScope, draft.occasionIds, gallery.authority);
    if (error) return error;
    if (draft.isPublished && !gallery.availability.canPublishV2) return "V2 publication is unavailable.";
  }
  const tags = styleTags(draft.styles);
  if (tags.length > PROVIDER_SETUP_THEME_TAG_LIMIT || tags.some((tag) => tag.length > PROVIDER_SETUP_THEME_TAG_LENGTH)) {
    return `Use at most ${PROVIDER_SETUP_THEME_TAG_LIMIT} styles, with each style under ${PROVIDER_SETUP_THEME_TAG_LENGTH} characters.`;
  }
  if (draft.images.length > PROVIDER_SETUP_IMAGE_LIMIT) return `Choose at most ${PROVIDER_SETUP_IMAGE_LIMIT} photos.`;
  if (draft.isPublished && !draft.images.length) return "Add at least one photo before publishing this setup.";
  return null;
}
