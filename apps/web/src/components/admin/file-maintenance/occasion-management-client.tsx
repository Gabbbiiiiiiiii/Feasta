"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import type {NewInactiveOccasionInput, OccasionSuggestionListItem} from "@feasta/shared-types/provider-package-v2";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Badge} from "@/components/ui/badge";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {listAdminOccasions, saveAdminOccasion, previewAdminOccasionImpact,
  listOccasionSuggestions, reviewOccasionSuggestion,
  type AdminOccasion, type AdminOccasionCatalog, type OccasionImpact,
  type OccasionMutation} from "@/lib/admin/file-maintenance/admin-occasion-client";
import type {AdminServiceCategory} from "@/lib/admin/file-maintenance/admin-service-category-types";

const empty = (): NewInactiveOccasionInput => ({id: "", label: "", aliases: [],
  sortOrder: 0, applicableServiceCategoryCodes: []});
const message = (error: unknown) => error instanceof Error ? error.message : "The request failed. Try again.";

export function OccasionManagementClient({categories, onDirtyChange}: {
  categories: AdminServiceCategory[]; onDirtyChange: (dirty: boolean) => void;
}) {
  const [catalog, setCatalog] = useState<AdminOccasionCatalog>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("order");
  const [status, setStatus] = useState("all");
  const [editor, setEditor] = useState<"create" | AdminOccasion | null>(null);
  const [draft, setDraft] = useState(empty);
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [impact, setImpact] = useState<OccasionImpact>();
  const [previewItem, setPreviewItem] = useState<AdminOccasion>();
  const [previewOperation, setPreviewOperation] = useState<"activate" | "deactivate" | "applicability">("activate");
  const [proposedCategories, setProposedCategories] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<OccasionSuggestionListItem[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [review, setReview] = useState<OccasionSuggestionListItem>();
  const [target, setTarget] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [decision, setDecision] = useState("reject");
  const pending = useRef<{signature: string; input: OccasionMutation} | undefined>(undefined);
  const reviewKey = useRef<{signature: string; key: string} | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {setCatalog(await listAdminOccasions());} catch (e) {setError(message(e));}
    finally {setLoading(false);}
  }, []);
  useEffect(() => {
    let ignore = false;
    listAdminOccasions().then((value) => {if (!ignore) setCatalog(value);},
      (e) => {if (!ignore) setError(message(e));})
      .finally(() => {if (!ignore) setLoading(false);});
    return () => {ignore = true;};
  }, []);
  useEffect(() => {
    onDirtyChange(dirty || !!reviewReason);
    const prevent = (event: BeforeUnloadEvent) => {event.preventDefault();};
    const guardLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor && !window.confirm("Discard unsaved occasion changes?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    if (dirty || reviewReason) window.addEventListener("beforeunload", prevent);
    if (dirty || reviewReason) document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", prevent);
      document.removeEventListener("click", guardLink, true); onDirtyChange(false);
    };
  }, [dirty, reviewReason, onDirtyChange]);

  function open(item: "create" | AdminOccasion) {
    setEditor(item); setDraft(item === "create" ? empty() : {id: item.id, label: item.label,
      aliases: [...item.aliases], sortOrder: item.sortOrder,
      applicableServiceCategoryCodes: [...item.applicableServiceCategoryCodes]});
    setReason(""); setDirty(false); setFormError(""); pending.current = undefined;
  }
  function close() {
    if (busy) return;
    if (dirty) setDiscard(true); else setEditor(null);
  }
  async function save() {
    if (!catalog || !editor) return;
    setBusy(true); setFormError("");
    const input: OccasionMutation = {occasion: draft, reason,
      expectedCatalogRevision: catalog.revision,
      ...(editor === "create" ? {} : {expectedOccasionRevision: editor.revision}),
      idempotencyKey: ""};
    const signature = JSON.stringify(input);
    if (pending.current?.signature !== signature) pending.current = {signature,
      input: {...input, idempotencyKey: crypto.randomUUID()}};
    try {
      await saveAdminOccasion(pending.current.input, editor === "create");
      setDirty(false); setEditor(null); setConfirm(false); await load();
    } catch (e) {setFormError(message(e)); setConfirm(false);}
    finally {setBusy(false);}
  }
  async function preview() {
    if (!previewItem || !catalog) return;
    setBusy(true); setFormError(""); setImpact(undefined);
    try {setImpact(await previewAdminOccasionImpact({occasionId: previewItem.id,
      expectedOccasionRevision: previewItem.revision, expectedCatalogRevision: catalog.revision,
      operation: previewOperation, ...(previewOperation === "applicability" ?
        {applicableServiceCategoryCodes: proposedCategories} : {})}));}
    catch (e) {setFormError(message(e));} finally {setBusy(false);}
  }
  async function queue(next?: string) {
    setBusy(true); setError("");
    try {const page = await listOccasionSuggestions(next); setSuggestions(page.items); setCursor(page.nextCursor);}
    catch (e) {setError(message(e));} finally {setBusy(false);}
  }
  async function moderate() {
    if (!review || !catalog) return;
    const selected = catalog.items.find((o) => o.id === target);
    if (decision !== "reject" && !selected) return;
    setBusy(true); setFormError("");
    const signature = JSON.stringify([review.suggestionId, reviewReason, decision, target, catalog.revision]);
    if (reviewKey.current?.signature !== signature) reviewKey.current = {signature, key: crypto.randomUUID()};
    const base = {suggestionId: review.suggestionId, expectedRevision: review.revision,
      expectedCatalogRevision: catalog.revision, reason: reviewReason, idempotencyKey: reviewKey.current.key};
    try {
      await reviewOccasionSuggestion(decision === "reject" ? {...base, decision: "reject"} :
        {...base, decision: decision === "map" ? "map" : "approve_existing_inactive",
          targetOccasionId: selected!.id, targetExpectedRevision: selected!.revision});
      setReview(undefined); setReviewReason(""); await load(); await queue();
    } catch (e) {setFormError(message(e));} finally {setBusy(false);}
  }

  const items = (catalog?.items ?? []).filter((o) =>
    `${o.id} ${o.label} ${o.aliases.join(" ")}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
    (status === "all" || o.active === (status === "active")))
    .sort((a, b) => sort === "name" ? a.label.localeCompare(b.label) :
      sort === "id" ? a.id.localeCompare(b.id) : a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return <section className="grid gap-5" aria-label="Event Types / Occasions">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Event Types / Occasions</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={loading || busy} onClick={() => void load()}>Refresh catalog</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void queue()}>Review provider suggestions</Button>
        <Button disabled={!catalog || loading || busy} onClick={() => open("create")}>Add Occasion</Button>
      </div>
    </div>
    <p className="rounded-lg border border-warning p-4 text-sm">Inactive occasions cannot be published or selected for new V2 packages. Approval does not grant provider eligibility. Activation, deactivation, and applicability changes remain unavailable until withdrawal, eligibility, catalog generation, and customer compatibility safeguards are verified.</p>
    {error && <div role="alert">{error} <Button variant="secondary" onClick={() => void load()}>Retry catalog</Button></div>}
    {loading ? <p role="status">Loading occasions…</p> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input aria-label="Search occasions" placeholder="Search name or canonical ID" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select aria-label="Occasion status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></Select>
        <Select aria-label="Sort occasions" value={sort} onChange={(e) => setSort(e.target.value)}><option value="order">Catalog order</option><option value="name">Name</option><option value="id">Canonical ID</option></Select>
      </div>
      {catalog && <p className="text-sm text-muted-foreground">Catalog revision {catalog.revision}</p>}
      {catalog && !items.length && <p>No occasions match this view.</p>}
      <div className="grid gap-3">{items.map((o) => <article key={o.id} className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="min-w-0 break-words"><h3 className="font-semibold">{o.label} <Badge>{o.active ? "Active" : "Inactive"}</Badge></h3>
          <p className="text-sm text-muted-foreground">{o.id} · Order {o.sortOrder} · Revision {o.revision}</p>
          <p className="text-sm">{o.applicableServiceCategoryCodes.join(", ")}</p>
          {o.aliases.length > 0 && <p className="text-sm">Aliases: {o.aliases.join(", ")}</p>}</div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => open(o)}>Edit {o.label}</Button>
          <Button variant="secondary" onClick={() => {setPreviewItem(o); setPreviewOperation(o.active ? "deactivate" : "activate"); setProposedCategories(o.applicableServiceCategoryCodes); setImpact(undefined); setFormError("");}}>Impact preview for {o.label}</Button>
          <Button disabled title="Release safeguards are incomplete">{o.active ? "Deactivate" : "Activate"}</Button></div>
      </article>)}</div>
    </>}
    {suggestions && <section className="grid gap-3" aria-label="Pending provider suggestions">
      <h3 className="font-semibold">Pending provider suggestions</h3>
      <p className="text-sm">Review uses the existing moderation workflow. To approve a new identity, add an inactive occasion first, then approve the matching suggestion against it.</p>
      {!suggestions.length && <p>No pending suggestions.</p>}
      {suggestions.map((s) => <div key={s.suggestionId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><span>{s.name}</span><Button variant="secondary" disabled={!catalog || busy} onClick={() => {setReview(s); setReviewReason(""); setTarget(""); setDecision("reject"); setFormError("");}}>Review {s.name}</Button></div>)}
      <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => void queue()}>Refresh suggestions</Button>{cursor && <Button disabled={busy} onClick={() => void queue(cursor)}>Next suggestions</Button>}</div>
    </section>}
    <Dialog open={!!editor} onOpenChange={(open) => {if (!open) close();}}><DialogContent>
      <DialogHeader><DialogTitle>{editor === "create" ? "Add Occasion" : "Edit Occasion"}</DialogTitle><DialogDescription>Permanent IDs cannot be changed. New occasions are approved and inactive.</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={(e) => {e.preventDefault(); setConfirm(true);}}>
        <fieldset disabled={busy} className="grid gap-4">
          <label className="grid gap-1">Canonical ID<Input required pattern="[a-z][a-z0-9_]{1,63}" disabled={editor !== "create" || busy} value={draft.id} onChange={(e) => {setDraft({...draft, id: e.target.value}); setDirty(true);}} /></label>
          <label className="grid gap-1">Label<Input required minLength={2} maxLength={80} value={draft.label} onChange={(e) => {setDraft({...draft, label: e.target.value}); setDirty(true);}} /></label>
          <label className="grid gap-1">Aliases (comma separated)<Input value={draft.aliases.join(",")} onChange={(e) => {setDraft({...draft, aliases: e.target.value ? e.target.value.split(",") : []}); setDirty(true);}} /></label>
          <label className="grid gap-1">Sort order<Input required type="number" step="1" value={draft.sortOrder} onChange={(e) => {setDraft({...draft, sortOrder: e.target.valueAsNumber}); setDirty(true);}} /></label>
          <fieldset disabled={editor !== "create" || busy} className="grid gap-2"><legend>Applicable service categories</legend>
            {categories.filter((c) => c.status === "active" || draft.applicableServiceCategoryCodes.includes(c.code)).map((c) => <label key={c.code} className="flex items-center gap-2"><input type="checkbox" checked={draft.applicableServiceCategoryCodes.includes(c.code)} disabled={c.status !== "active" || editor !== "create" || busy} onChange={(e) => {setDraft({...draft, applicableServiceCategoryCodes: e.target.checked ? [...draft.applicableServiceCategoryCodes, c.code] : draft.applicableServiceCategoryCodes.filter((v) => v !== c.code)}); setDirty(true);}} />{c.name}{c.status !== "active" ? " (inactive)" : ""}</label>)}
          </fieldset>
          {editor !== "create" && <p className="text-sm">Applicability is read-only. Use Impact preview to inspect a proposed change.</p>}
          <label className="grid gap-1">Reason for change<Input required minLength={10} maxLength={500} value={reason} onChange={(e) => {setReason(e.target.value); setDirty(true);}} /></label>
        </fieldset>
        {formError && <p role="alert">{formError}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" disabled={busy || !draft.applicableServiceCategoryCodes.length}>Review changes</Button></div>
      </form>
    </DialogContent></Dialog>
    <ConfirmationDialog open={confirm} onOpenChange={setConfirm} title="Save occasion metadata?" description={`Save ${draft.label} (${draft.id}) at catalog revision ${catalog?.revision}. ${editor === "create" ? "It will remain inactive." : "Publication status and eligibility stay unchanged."}`} confirmLabel="Save occasion" loading={busy} onConfirm={save} />
    <ConfirmationDialog open={discard} onOpenChange={setDiscard} title="Discard unsaved changes?" description="Your occasion edits have not been saved." confirmLabel="Discard changes" onConfirm={() => {setDirty(false); setEditor(null); setDiscard(false);}} />
    <Dialog open={!!previewItem} onOpenChange={(open) => {if (!open && !busy) setPreviewItem(undefined);}}><DialogContent>
      <DialogHeader><DialogTitle>Impact preview: {previewItem?.label}</DialogTitle><DialogDescription>Read-only analysis. Lifecycle operations are unavailable.</DialogDescription></DialogHeader>
      <Select aria-label="Proposed operation" disabled={busy} value={previewOperation} onChange={(e) => {setPreviewOperation(e.target.value as typeof previewOperation); setImpact(undefined);}}><option value="activate">Activate</option><option value="deactivate">Deactivate</option><option value="applicability">Change applicability</option></Select>
      {previewOperation === "applicability" && <fieldset disabled={busy} className="grid gap-2"><legend>Proposed service categories</legend>{categories.filter((c) => c.status === "active").map((c) => <label key={c.code}><input type="checkbox" checked={proposedCategories.includes(c.code)} onChange={(e) => {setProposedCategories(e.target.checked ? [...proposedCategories, c.code] : proposedCategories.filter((v) => v !== c.code)); setImpact(undefined);}} /> {c.name}</label>)}</fieldset>}
      <Button disabled={busy} onClick={() => void preview()}>{busy ? "Inspecting…" : "Inspect impact"}</Button>
      {formError && <p role="alert">{formError}</p>}
      {impact && <div className="grid gap-3" role="status"><p>Catalog revision {impact.catalogRevision} · Occasion revision {impact.occasionRevision}</p>{impact.usage.map((u) => <p key={u.collection}>{u.collection}: {u.potentialReferences} potential references in {u.scanned} scanned records{u.truncated ? " (scan truncated)" : ""}</p>)}{impact.mappings.map((m) => <p key={m.code}>{m.code}: {m.valid ? "Active category" : "Invalid or inactive category"}</p>)}{impact.blockers.map((b) => <p key={b}>{b}</p>)}<p className="text-sm">{impact.disclaimer}</p></div>}
      <Button disabled>Apply lifecycle change — unavailable</Button>
    </DialogContent></Dialog>
    <Dialog open={!!review} onOpenChange={(open) => {if (!open && !busy && (!reviewReason || window.confirm("Discard the unsaved review?"))) {setReview(undefined); setReviewReason("");}}}><DialogContent>
      <DialogHeader><DialogTitle>Review {review?.name}</DialogTitle><DialogDescription>Moderation never activates an occasion or grants provider capability.</DialogDescription></DialogHeader>
      {review?.reason && <p>{review.reason}</p>}
      <Select aria-label="Review decision" disabled={busy} value={decision} onChange={(e) => setDecision(e.target.value)}><option value="reject">Reject</option><option value="map">Map to active occasion</option><option value="approve_existing_inactive">Approve matching inactive occasion</option></Select>
      {decision !== "reject" && <Select aria-label="Review target" disabled={busy} value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Choose occasion</option>{catalog?.items.filter((o) => o.active === (decision === "map")).map((o) => <option key={o.id} value={o.id}>{o.label} ({o.id})</option>)}</Select>}
      <label className="grid gap-1">Review reason<Input disabled={busy} value={reviewReason} maxLength={500} onChange={(e) => setReviewReason(e.target.value)} /></label>
      {formError && <p role="alert">{formError}</p>}
      <Button disabled={busy || !reviewReason.trim() || (decision !== "reject" && !target)} onClick={() => {if (window.confirm("Submit this final suggestion review?")) void moderate();}}>Submit review</Button>
    </DialogContent></Dialog>
  </section>;
}
