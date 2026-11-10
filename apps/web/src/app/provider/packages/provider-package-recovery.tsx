"use client";

import {useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  DialogTrigger} from "@/components/ui/dialog";
import {confirmFixedRecovery, fixedRecoveryError, hasPendingFixedRecovery,
  previewFixedRecovery, recoveryInventory, retryFixedRecovery,
  type FixedRecoveryPreview} from "@/lib/provider/fixed-package-recovery-client";

export function ProviderPackageRecovery({packageId, onRecovered}: {
  packageId: string; onRecovered?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<FixedRecoveryPreview | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const inFlight = useRef(false);
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setReviewed(false); setPreview(null); setError(null);
    try {
      setPending(hasPendingFixedRecovery(packageId));
      setPreview(await previewFixedRecovery(packageId));
    } catch (caught) {setError(fixedRecoveryError(caught));}
    finally {setBusy(false); inFlight.current = false;}
  }
  async function recover(retry = false) {
    if (inFlight.current || recovered || (!retry && (!preview?.eligible || !reviewed))) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      if (retry) await retryFixedRecovery(packageId);
      else await confirmFixedRecovery(preview!);
      setRecovered(true); setPending(false); setReviewed(false);
      await onRecovered?.();
    } catch (caught) {
      setPending(hasPendingFixedRecovery(packageId));
      setReviewed(false); setPreview(null); setError(fixedRecoveryError(caught));
    } finally {inFlight.current = false; setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={(next) => {
    if (busy) return;
    setOpen(next);
    if (next && !recovered) void refresh();
  }}>
    <DialogTrigger asChild><Button variant="secondary" size="compact">Review recovery</Button></DialogTrigger>
    <DialogContent className="max-h-[88dvh] max-w-5xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Review Fixed package recovery</DialogTitle>
        <DialogDescription>Compare all saved details with the proposed contract. Recovery keeps the same package ID and leaves it as a private Draft. Publishing is a separate action.</DialogDescription>
      </DialogHeader>
      <p className="break-all text-sm">Package ID: {packageId}</p>
      <p className="text-sm text-muted-foreground">Image ownership and current business eligibility will be checked again when you confirm. The saved creation details stay unchanged; the last-updated time will reflect recovery.</p>
      {busy ? <p role="status">Checking recovery…</p> : null}
      {recovered ? <p role="status">Recovery confirmed. The original package remains a private Draft. Close this review and reopen the package to check its saved details.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {preview && !recovered ? <>
        {preview.blockers.length ? <div role="alert"><p>Recovery is blocked. No package changes were made.</p>
          <ul>{preview.blockers.map((blocker, i) => <li key={i}>{blocker}</li>)}</ul></div> : null}
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <section aria-label="Original saved draft"><h3 className="font-semibold">Original saved draft</h3>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(recoveryInventory(preview.original), null, 2)}</pre></section>
          <section aria-label="Proposed V2 draft"><h3 className="font-semibold">Proposed V2 draft</h3>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs">{preview.proposed ? JSON.stringify(recoveryInventory(preview.proposed), null, 2) : "No lossless proposal is available."}</pre></section>
        </div>
        {preview.eligible ? <label className="flex gap-2 text-sm">
          <input type="checkbox" checked={reviewed} disabled={busy || pending}
            onChange={(event) => setReviewed(event.target.checked)}/>
          I reviewed the original and proposed details and confirm recovery of this private draft.
        </label> : null}
      </> : null}
      {!recovered ? <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>Refresh preview</Button>
        {pending ? <Button disabled={busy} onClick={() => void recover(true)}>Retry unconfirmed recovery</Button> :
          <Button disabled={busy || !preview?.eligible || !reviewed} onClick={() => void recover()}>Confirm recovery</Button>}
      </div> : null}
    </DialogContent>
  </Dialog>;
}
