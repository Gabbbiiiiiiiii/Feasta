"use client";

import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter} from "@/components/ui/dialog";
import type {ProviderAgreementReview} from "@/lib/provider/provider-agreement-reacceptance-client";

export function ProviderAgreementReacceptance() {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<ProviderAgreementReview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function load() {
    setOpen(true); setReview(null); setConfirmed(false); setError(""); setBusy(true);
    try {
      const client = await import("@/lib/provider/provider-agreement-reacceptance-client");
      setReview(await client.reviewCurrentProviderAgreement());
    } catch {
      setError("The current agreement could not be loaded. An active approved provider account is required. Please try again.");
    } finally { setBusy(false); }
  }
  async function accept() {
    if (!review || !confirmed || busy) return;
    setBusy(true); setError("");
    try {
      const client = await import("@/lib/provider/provider-agreement-reacceptance-client");
      await client.acceptCurrentProviderAgreement(review);
      setSuccess(true);
      window.location.reload();
    } catch {
      setConfirmed(false); setReview(null);
      setError("Acceptance could not be confirmed. Close and review the current agreement again before retrying. Your previous acceptance is preserved.");
    } finally { setBusy(false); }
  }
  return <div className="mt-4">
    <Button type="button" variant="secondary" onClick={load} disabled={busy}>Review current agreement</Button>
    <p className="mt-2 text-sm text-muted-foreground">Review and acceptance are voluntary. Your previous acceptance history is preserved.</p>
    <Dialog open={open} onOpenChange={(value) => {setOpen(value); if (!value) setConfirmed(false);}}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Review current Provider Agreement</DialogTitle>
          <DialogDescription>Reviewing or closing this dialog does not record acceptance.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto" role="region" aria-label="Current published agreement" tabIndex={0}>
          {busy && !review ? <p role="status">Loading agreement…</p> : null}
          {review ? <article>
            <h3 className="font-bold">{review.agreement.name}</h3>
            <p>Current published agreement · Version {review.agreement.version} · Effective {review.agreement.effectiveDate}</p>
            {review.agreement.sections.map((section, index) => <section key={index} className="mt-6">
              <h4 className="font-semibold">{section.title}</h4>
              {section.paragraphs.map((paragraph, i) => <p key={i} className="mt-3 whitespace-pre-wrap text-sm leading-7">{paragraph}</p>)}
            </section>)}
          </article> : null}
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {success ? <p role="status">Agreement accepted. Reloading your accepted copy…</p> : null}
        {review ? <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={confirmed} disabled={busy || success} onChange={(event) => setConfirmed(event.target.checked)} />
          I have reviewed and agree to Provider Agreement version {review.agreement.version} on behalf of this provider.
        </label> : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy && !!review}>Cancel</Button>
          <Button onClick={accept} disabled={!review || !confirmed || busy || success}>Accept current agreement</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
