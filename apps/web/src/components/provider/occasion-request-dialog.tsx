"use client";
import {useEffect, useId, useRef, useState} from "react";
import type {OccasionSuggestionListItem} from "@feasta/shared-types/provider-package-v2";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription} from "@/components/ui/dialog";
import {StatusBadge} from "@/components/shared/status-badge";
import {occasionRequestsAvailable, listOccasionRequests, submitOccasionRequest, validateOccasionRequest, occasionRequestError} from "@/lib/provider/provider-occasion-suggestions";
export function OccasionRequestDialog() {
  const [open, setOpen] = useState(false);
  const [identities] = useState(() => new Map<string, string>());
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" variant="secondary">+ Add Occasion</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Request an occasion</DialogTitle><DialogDescription>Administrator review is required. Approval alone does not make an occasion selectable: catalog activation and provider capability approval are also required.</DialogDescription></DialogHeader>
      {open ? (occasionRequestsAvailable() ? <RequestContent close={() => setOpen(false)} identities={identities} /> : <div className="grid gap-4"><p role="status">Occasion request submission and history are unavailable until backend integration is verified.</p><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>) : null}</DialogContent></Dialog>;
}
function RequestContent({close, identities}: {close: () => void; identities: Map<string, string>}) {
  const id = useId();
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [items, setItems] = useState<OccasionSuggestionListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const alive = useRef(true);
  const submitting = useRef(false);
  const listing = useRef(false);
  const validation = validateOccasionRequest(name, reason);
  async function load(next?: string) {
    if (listing.current) return;
    listing.current = true; setLoading(true); setHistoryError("");
    try {
      const page = await listOccasionRequests({pageSize: 10, ...(next ? {cursor: next} : {})});
      if (alive.current) {setItems((old) => next ? [...old, ...page.items.filter((item) => !old.some((entry) => entry.suggestionId === item.suggestionId))] : page.items); setCursor(page.nextCursor);}
    } catch (e) {if (alive.current) setHistoryError(occasionRequestError(e));}
    finally {listing.current = false; if (alive.current) setLoading(false);}
  }
  useEffect(() => {
    alive.current = true; queueMicrotask(() => {if (alive.current) void load();});
    return () => {alive.current = false;};
    // Loading is scoped to this dialog session; subsequent loads are explicit.
  }, []);
  async function submit() {
    if (submitting.current) return;
    setAttempted(true); setMessage(""); setError("");
    if (validation.name || validation.reason) return;
    submitting.current = true; setBusy(true);
    try {
      const payload = JSON.stringify(validation.value);
      let key = identities.get(payload);
      if (!key) {key = crypto.randomUUID(); identities.set(payload, key);}
      const response = await submitOccasionRequest({...validation.value, idempotencyKey: key});
      const result = response.outcome === "idempotent_replay" ? response.result : response;
      let feedback: string;
      if (result.outcome === "created") feedback = "Request submitted. Awaiting administrator review.";
      else if (result.outcome === "own_duplicate") feedback = `You already requested ${result.suggestion.name}. Status: ${result.suggestion.status}.`;
      else if (result.outcome === "canonical_match") feedback = `${result.match.label} already exists in the catalog. Selection still requires catalog activation and provider eligibility.`;
      else throw new Error("Unexpected response");
      if (alive.current) {setMessage(feedback); void load();}
    } catch (e) {if (alive.current) setError(occasionRequestError(e));}
    finally {submitting.current = false; if (alive.current) setBusy(false);}
  }
  return <div className="grid gap-4">
    <div className="grid gap-2"><label htmlFor={`${id}-name`}>Occasion Name *</label><Input id={`${id}-name`} required value={name} disabled={busy} onChange={(e) => {setName(e.target.value); setMessage("");}} aria-invalid={attempted && !!validation.name} aria-describedby={attempted && validation.name ? `${id}-name-error` : undefined} />
      {attempted && validation.name ? <p id={`${id}-name-error`} className="text-sm text-destructive">{validation.name}</p> : null}</div>
    <div className="grid gap-2"><label htmlFor={`${id}-reason`}>Reason for Request (optional)</label><Textarea id={`${id}-reason`} value={reason} disabled={busy} onChange={(e) => {setReason(e.target.value); setMessage("");}} aria-invalid={attempted && !!validation.reason} aria-describedby={`${id}-reason-help`} />
      <p id={`${id}-reason-help`} className="text-sm text-muted-foreground">{attempted && validation.reason ? validation.reason : "Up to 500 characters. Use a single paragraph."}</p></div>
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={close}>Cancel</Button><Button type="button" disabled={busy} onClick={() => void submit()}>{busy ? "Submitting…" : "Submit Request"}</Button></div>
    <section aria-label="My Occasion Requests" className="grid gap-3 border-t border-border pt-4"><h3 className="font-semibold">My Occasion Requests</h3>
      <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>Refresh requests</Button>
      {loading ? <p role="status">Loading requests…</p> : null}{historyError ? <p role="alert">{historyError}</p> : !loading && !items.length ? <p>No occasion requests yet.</p> : null}
      <ul className="grid gap-3">{items.map((item) => <li key={item.suggestionId} className="rounded-lg border border-border p-3"><p className="font-medium">{item.name}</p><StatusBadge status={item.status} />
        {item.createdAt ? <p className="text-sm">Submitted <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}</time></p> : null}{item.reviewReason ? <p className="text-sm">Review: {item.reviewReason}</p> : null}
        {item.status === "approved" || item.status === "mapped" ? <p className="text-sm text-muted-foreground">Selection requires an active catalog occasion and approved provider capability.</p> : null}</li>)}</ul>
      {cursor ? <Button type="button" variant="secondary" disabled={loading} onClick={() => void load(cursor)}>Load more requests</Button> : null}
    </section></div>;
}
