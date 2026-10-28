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
  listOccasionSuggestions, reviewOccasionSuggestion, inspectAdminOccasionAtomicReadiness, checkAdminOccasionActivationReadiness,
  changeAdminOccasionState,
  type AdminOccasion, type AdminOccasionCatalog, type OccasionImpact,
  type OccasionMutation, type OccasionReadiness} from "@/lib/admin/file-maintenance/admin-occasion-client";
import type {AdminServiceCategory} from "@/lib/admin/file-maintenance/admin-service-category-types";

const empty = (): NewInactiveOccasionInput => ({id: "", label: "", aliases: [],
  sortOrder: 0, applicableServiceCategoryCodes: []});
// Matches the backend occasion-v2-validation canonical ID contract.
const validId = (id: string) => /^[a-z][a-z0-9_]{1,63}$/.test(id);
export const generateOccasionId = (name: string) => name.normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s_-]/g, "")
  .trim().replace(/[\s_-]+/g, "_").replace(/^_+|_+$/g, "");
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
  const [idOverride, setIdOverride] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const baseline = useRef("");
  const [reason, setReason] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [impact, setImpact] = useState<OccasionImpact>();
  const [readinessItem, setReadinessItem] = useState<AdminOccasion>();
  const [readiness, setReadiness] = useState<OccasionReadiness>();
  const [readinessError, setReadinessError] = useState("");
  const [checkingReadiness, setCheckingReadiness] = useState(false);
  const readinessRequest = useRef(0);
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleConfirm, setLifecycleConfirm] = useState(false);
  const [lifecycleError, setLifecycleError] = useState("");
  const lifecyclePending = useRef<{signature: string; key: string} | undefined>(undefined);
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
    readinessRequest.current++; setReadinessItem(undefined); setReadiness(undefined);
    setLifecycleReason(""); setLifecycleError(""); lifecyclePending.current = undefined;
    setCheckingReadiness(false);
    setLoading(true); setError(""); setCatalog(undefined);
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
    onDirtyChange(dirty || !!reviewReason || !!lifecycleReason);
    const prevent = (event: BeforeUnloadEvent) => {event.preventDefault();};
    const guardLink = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor && !window.confirm("Discard unsaved occasion changes?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    if (dirty || reviewReason || lifecycleReason) window.addEventListener("beforeunload", prevent);
    if (dirty || reviewReason || lifecycleReason) document.addEventListener("click", guardLink, true);
    return () => {
      window.removeEventListener("beforeunload", prevent);
      document.removeEventListener("click", guardLink, true); onDirtyChange(false);
    };
  }, [dirty, reviewReason, lifecycleReason, onDirtyChange]);

  function open(item: "create" | AdminOccasion) {
    setIdOverride(false); setConfirm(false); setDiscard(false);
    const highest = Math.max(0, ...(catalog?.items ?? []).map((o) => o.sortOrder));
    const next = item === "create" ? {...empty(), sortOrder: Math.min(Number.MAX_SAFE_INTEGER, highest + 1)} : {id: item.id, label: item.label,
      aliases: [...item.aliases], sortOrder: item.sortOrder,
      applicableServiceCategoryCodes: [...item.applicableServiceCategoryCodes]};
    baseline.current = JSON.stringify(next); setEditor(item); setDraft(next);
    setReason(""); setDirty(false); setFormError(""); pending.current = undefined;
  }
  function close() {
    if (busy || confirm || discard) return;
    if (JSON.stringify(draft) !== baseline.current || reason) setDiscard(true); else resetEditor();
  }
  function resetEditor() {
    setEditor(null); setDraft(empty()); setReason(""); setDirty(false); setDiscard(false);
    setConfirm(false); setIdOverride(false); pending.current = undefined;
  }
  const idError = editor === "create" ? !validId(draft.id) ?
    "Enter a valid permanent ID in Advanced options: 2-64 lowercase letters, numbers or underscores, starting with a letter." :
    catalog?.items.some((o) => o.id === draft.id) ?
    "This permanent ID already exists. Choose another name or a unique ID in Advanced options." : "" : "";
  function validate() {
    if (idError) return idError;
    if (!Number.isSafeInteger(draft.sortOrder)) return "Sort order must be a safe integer.";
    if (!draft.applicableServiceCategoryCodes.length || draft.applicableServiceCategoryCodes.some((code) =>
      !categories.some((c) => c.code === code && c.status === "active"))) return "Choose at least one active service category.";
    if (draft.label.trim().length < 2 || draft.label.trim().length > 80) return "Event Type Name must contain 2-80 characters.";
    if (reason.trim().length < 10 || reason.trim().length > 500) return "Provide a reason containing 10-500 characters.";
    return "";
  }
  async function save() {
    if (!catalog || !editor || busy) return;
    const validation = validate();
    if (validation) {setFormError(validation); setConfirm(false); return;}
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
      resetEditor(); await load();
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
  async function checkReadiness(item: AdminOccasion) {
    if (!catalog) return;
    const requestId = ++readinessRequest.current;
    setReadinessItem(item); setReadiness(undefined); setReadinessError("");
    setLifecycleReason(""); setLifecycleError(""); lifecyclePending.current = undefined;
    setCheckingReadiness(true);
    try {
      let result: OccasionReadiness;
      try {
        result = await inspectAdminOccasionAtomicReadiness({
          action: item.active ? "deactivate" : "activate",
          occasionId: item.id,
          expectedOccasionRevision: item.revision,
          expectedCatalogRevision: catalog.revision,
        });
      } catch (atomicError) {
        // Never hide authorization, validation or server failures.
        // Legacy readiness is advisory, never permission to activate.
        const errorCode = atomicError &&
          typeof atomicError === "object" &&
          "code" in atomicError ?
          (atomicError as {code?: unknown}).code : null;

        const endpointMissing =
          errorCode === "functions/not-found" ||
          errorCode === "functions/unimplemented";

        if (item.active || !endpointMissing) {
          throw atomicError;
        }

        const legacy = await checkAdminOccasionActivationReadiness({
          occasionId: item.id,
          expectedOccasionRevision: item.revision,
          expectedCatalogRevision: catalog.revision,
        });
        result = {...legacy, status: "BLOCKED", lifecycleAvailable: false};
      }
      if (requestId === readinessRequest.current) setReadiness(result);
    } catch (error) {
      if (requestId === readinessRequest.current) setReadinessError(message(error));
    } finally {
      if (requestId === readinessRequest.current) setCheckingReadiness(false);
    }
  }
  async function executeLifecycle() {
    if (!catalog || !readinessItem || !readiness?.lifecycleAvailable ||
        readiness.status !== "ELIGIBLE_FOR_TRANSACTION" || lifecycleBusy) return;
    const text = lifecycleReason.trim();
    if (text.length < 10 || text.length > 500) {
      setLifecycleError("Provide a reason containing 10–500 characters.");
      return;
    }
    const action = readinessItem.active ? "deactivate" : "activate";
    const input = {occasionId: readinessItem.id,
      expectedOccasionRevision: readinessItem.revision,
      expectedCatalogRevision: catalog.revision, reason: text};
    const signature = JSON.stringify({action, ...input});
    if (lifecyclePending.current?.signature !== signature) {
      lifecyclePending.current = {signature, key: crypto.randomUUID()};
    }
    setLifecycleBusy(true); setLifecycleError("");
    try {
      await changeAdminOccasionState(action, {
        ...input, idempotencyKey: lifecyclePending.current.key,
      });
      setLifecycleConfirm(false); setReadinessItem(undefined);
      setReadiness(undefined); setLifecycleReason("");
      lifecyclePending.current = undefined;
      await load();
    } catch (error) {
      setLifecycleError(message(error)); setLifecycleConfirm(false);
    } finally {setLifecycleBusy(false);}
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
    <p className="rounded-lg border border-warning p-4 text-sm">Inactive occasions cannot be published or selected for new V2 packages. Approval does not grant provider eligibility. Activation and deactivation use a bounded atomic transition: affected public packages and Setup Gallery entries are withdrawn, never automatically republished. Larger or invalid inventories are blocked. Applicability editing and V2 public publishing remain restricted.</p>
    {error && <div role="alert">{error} <Button variant="secondary" onClick={() => void load()}>Retry catalog</Button></div>}
    {loading ? <p role="status">Loading occasions…</p> : catalog && <>
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
          <Button variant="secondary" disabled={busy || checkingReadiness}
            aria-label={`Check ${o.active ? "Deactivation" : "Activation"} Readiness for ${o.label}`}
            onClick={() => void checkReadiness(o)}>Check {o.active ? "Deactivation" : "Activation"} Readiness</Button>
          <Button variant="secondary" disabled={busy || checkingReadiness || lifecycleBusy}
            onClick={() => void checkReadiness(o)}>{o.active ? "Deactivate" : "Activate"}</Button></div>
      </article>)}</div>
    </>}
    <Dialog open={!!readinessItem} onOpenChange={(open) => {if (!open && !lifecycleBusy && !lifecycleConfirm) {
      readinessRequest.current++; setReadinessItem(undefined); setReadiness(undefined);
      setCheckingReadiness(false);
    }}}><DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{readinessItem?.active ? "Deactivation" : "Activation"} readiness: {readinessItem?.label}</DialogTitle>
        <DialogDescription>This read-only check does not change the occasion or grant provider approval.</DialogDescription>
      </DialogHeader>
      <p>The read-only inventory check does not change occasion status. Execution repeats the authority and inventory checks atomically and may still reject concurrent changes.</p>
      {checkingReadiness && <p role="status">Checking lifecycle safeguards…</p>}
      {readinessError && <div role="alert">{readinessError}<p>Readiness could not be verified. No change was made.</p></div>}
      {readiness && <>
        <p className="text-sm">Checked catalog revision {readiness.catalogRevision ?? "unavailable"}, occasion revision {readiness.occasionRevision ?? "unavailable"}. Results describe this check only.</p>
        <p>Packages scanned: {readiness.packageCount ?? "not checked"} · Gallery documents scanned: {readiness.galleryCount ?? "not checked"}. Potential withdrawals: {readiness.affectedPackages ?? "unknown"} packages, {readiness.affectedGallerySetups ?? "unknown"} setup entries.</p>
        <h3 className="font-semibold">Verified for this check</h3>
        <ul className="list-disc pl-5">{readiness.checks.filter((check) => check.status === "SATISFIED")
          .map((check) => <li key={check.code}>{check.message}</li>)}</ul>
        <h3 className="font-semibold">Safeguards still required</h3>
        <ul className="list-disc pl-5">{readiness.checks.filter((check) => check.status === "BLOCKED")
          .map((check) => <li key={check.code}>{check.message}</li>)}</ul>
      </>}
      <Button variant="secondary" disabled={checkingReadiness || !readinessItem}
        onClick={() => {if (readinessItem) void checkReadiness(readinessItem);}}>Check again</Button>
      {readiness?.lifecycleAvailable && <label className="grid gap-1 text-sm">Reason for lifecycle change
        <Input aria-label="Lifecycle reason" disabled={lifecycleBusy} value={lifecycleReason}
          minLength={10} maxLength={500} onChange={(e) => {setLifecycleReason(e.target.value); setLifecycleError("");}} />
      </label>}
      {lifecycleError && <p role="alert">{lifecycleError}</p>}
      <Button disabled={lifecycleBusy || !readiness?.lifecycleAvailable ||
        readiness.status !== "ELIGIBLE_FOR_TRANSACTION" || lifecycleReason.trim().length < 10}
        onClick={() => setLifecycleConfirm(true)}>{readinessItem?.active ? "Deactivate" : "Activate"}</Button>
      <ConfirmationDialog open={lifecycleConfirm} stopEscapePropagation
        onOpenChange={setLifecycleConfirm} title={`Confirm ${readinessItem?.active ? "deactivation" : "activation"}?`}
        description={`Affected public packages and gallery setups will become private. They will not automatically be restored. Existing bookings and payments remain unchanged. Reason: ${lifecycleReason}`}
        confirmLabel={readinessItem?.active ? "Deactivate occasion" : "Activate occasion"}
        loading={lifecycleBusy} onConfirm={() => void executeLifecycle()} />
    </DialogContent></Dialog>
    {suggestions && <section className="grid gap-3" aria-label="Pending provider suggestions">
      <h3 className="font-semibold">Pending provider suggestions</h3>
      <p className="text-sm">Review uses the existing moderation workflow. To approve a new identity, add an inactive occasion first, then approve the matching suggestion against it.</p>
      {!suggestions.length && <p>No pending suggestions.</p>}
      {suggestions.map((s) => <div key={s.suggestionId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><span>{s.name}</span><Button variant="secondary" disabled={!catalog || busy} onClick={() => {setReview(s); setReviewReason(""); setTarget(""); setDecision("reject"); setFormError("");}}>Review {s.name}</Button></div>)}
      <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => void queue()}>Refresh suggestions</Button>{cursor && <Button disabled={busy} onClick={() => void queue(cursor)}>Next suggestions</Button>}</div>
    </section>}
    <Dialog open={!!editor} onOpenChange={(open) => {if (!open) close();}}><DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 [&>button]:z-10"
      onEscapeKeyDown={(e) => {if (busy || confirm || discard) e.preventDefault();}}
      onInteractOutside={(e) => {if (busy || confirm || discard) e.preventDefault();}}>
      <DialogHeader className="shrink-0 border-b p-5 pr-16"><DialogTitle>{editor === "create" ? "Add Occasion" : "Edit Occasion"}</DialogTitle><DialogDescription>Permanent IDs cannot be changed. New occasions are approved and inactive.</DialogDescription></DialogHeader>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => {e.preventDefault(); const validation = validate(); setFormError(validation); if (!validation) setConfirm(true);}}>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <fieldset disabled={busy} className="grid gap-4">
          <label className="grid gap-1">Event Type Name<Input ref={nameInput} required minLength={2} maxLength={80} placeholder="e.g., Birthday, Wedding, Graduation" value={draft.label} onChange={(e) => {setDraft({...draft, label: e.target.value, ...(editor === "create" && !idOverride ? {id: generateOccasionId(e.target.value)} : {})}); setDirty(true);}} /></label>
          {editor === "create" ? <p className="break-all text-xs text-muted-foreground" aria-live="polite">Permanent ID: <code>{draft.id || "Enter an event type name"}</code></p> : <label>Canonical ID<Input disabled value={draft.id} /></label>}
          {idError && draft.label && <p role="alert" className="text-sm text-destructive">{idError}</p>}
          <fieldset disabled={editor !== "create" || busy} className="grid gap-2"><legend>Applicable Services</legend><p className="text-sm text-muted-foreground">Choose which services this event type applies to.</p>
            {categories.filter((c) => c.status === "active" || (editor !== "create" && draft.applicableServiceCategoryCodes.includes(c.code))).map((c) => <label key={c.code} className="flex items-center gap-2"><input type="checkbox" checked={draft.applicableServiceCategoryCodes.includes(c.code)} disabled={c.status !== "active" || editor !== "create" || busy} onChange={(e) => {setDraft({...draft, applicableServiceCategoryCodes: e.target.checked ? [...draft.applicableServiceCategoryCodes, c.code] : draft.applicableServiceCategoryCodes.filter((v) => v !== c.code)}); setDirty(true);}} />{c.name}{c.status !== "active" ? " (inactive)" : ""}</label>)}
          </fieldset>
          {editor !== "create" && <p className="text-sm">Applicability is read-only. Use Impact preview to inspect a proposed change.</p>}
          <label className="grid gap-1">{editor === "create" ? "Reason for adding" : "Reason for change"}<Input placeholder={editor === "create" ? "Explain why this occasion should be added to FEASTA." : "Explain the change."} required minLength={10} maxLength={500} value={reason} onChange={(e) => {setReason(e.target.value); setDirty(true);}} /></label>
          <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Advanced options</summary><div className="mt-4 grid gap-4">
          {editor === "create" && <label className="grid gap-1">Canonical ID override<Input aria-label="Canonical ID override" placeholder="Use generated ID" value={idOverride ? draft.id : ""} onChange={(e) => {setIdOverride(!!e.target.value); setDraft({...draft, id: e.target.value || generateOccasionId(draft.label)}); setDirty(true);}} /><span className="text-xs text-muted-foreground">Permanent IDs cannot be changed after creation.</span></label>}
          <label className="grid gap-1">Aliases (comma separated)<Input value={draft.aliases.join(",")} onChange={(e) => {setDraft({...draft, aliases: e.target.value ? e.target.value.split(",") : []}); setDirty(true);}} /></label>
          <label className="grid gap-1">Sort order<Input required type="number" step="1" min={Number.MIN_SAFE_INTEGER} max={Number.MAX_SAFE_INTEGER} value={Number.isNaN(draft.sortOrder) ? "" : draft.sortOrder} onChange={(e) => {setDraft({...draft, sortOrder: e.target.valueAsNumber}); setDirty(true);}} /></label>

          </div></details>
        </fieldset>
        {formError && <p role="alert">{formError}</p>}
        </div><div className="flex shrink-0 justify-end gap-2 border-t bg-card p-4"><Button type="button" variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{editor === "create" ? "Review Occasion" : "Review changes"}</Button></div>
      </form>
    <ConfirmationDialog open={confirm} stopEscapePropagation onCloseAutoFocus={(e) => {e.preventDefault(); nameInput.current?.focus();}} onOpenChange={setConfirm} title="Save occasion metadata?" description={`Save ${draft.label} (${draft.id}) at catalog revision ${catalog?.revision}. ${editor === "create" ? "It will remain inactive." : "Publication status and eligibility stay unchanged."}`} confirmLabel="Save occasion" loading={busy} onConfirm={save} />
    <ConfirmationDialog open={discard} stopEscapePropagation onCloseAutoFocus={(e) => {e.preventDefault(); nameInput.current?.focus();}} cancelLabel="Keep Editing" onOpenChange={setDiscard} title="Discard unsaved changes?" description="Your occasion edits have not been saved." confirmLabel="Discard Changes" onConfirm={resetEditor} />
    </DialogContent></Dialog>
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
