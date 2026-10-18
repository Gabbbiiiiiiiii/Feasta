"use client";

import {X} from "lucide-react";

import {Button} from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type {ProviderAgreementSnapshot} from "@/lib/provider/provider-agreement-record";

export type BusinessAgreementView = {
  accepted: boolean;
  acceptedVersion: string;
  acceptedAtLabel: string | null;
  document: ProviderAgreementSnapshot | null;
  unavailable: boolean;
};

export function ProviderBusinessAgreementCard({view}: {view: BusinessAgreementView}) {
  const canDownload = !view.unavailable && view.accepted && view.document !== null &&
    (!view.acceptedVersion || view.document.version === view.acceptedVersion);
  const historicalUnavailable = view.accepted && !view.document;
  const explanation = view.unavailable
    ? "Your agreement record could not be loaded. Please reload the page to try again."
    : historicalUnavailable
      ? "The historical content for your accepted agreement is unavailable. The current agreement is not being presented as your accepted copy."
      : !view.document
        ? "The current provider agreement is unavailable."
        : view.accepted
          ? "This is your stored accepted agreement."
          : "This is the current published agreement. No acceptance is recorded for your account.";
  const downloadExplanation = canDownload ? null : view.unavailable || historicalUnavailable
    ? explanation : "An accepted agreement copy is not available to download because no acceptance is recorded.";

  function downloadAction() {
    return canDownload ? (
      <Button asChild variant="secondary">
        <a href="/api/provider/agreement/pdf?copy=accepted" download>Download Agreement (PDF)</a>
      </Button>
    ) : <Button type="button" variant="secondary" disabled>Download Agreement (PDF)</Button>;
  }

  return (
    <section aria-labelledby="provider-agreement-heading" className="min-w-0 rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
      <h2 id="provider-agreement-heading" className="text-xl font-bold">Provider Agreement</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">View the FEASTA Provider Agreement and your acceptance record.</p>
      <dl className="my-5 grid gap-4 text-sm sm:grid-cols-3">
        <div><dt className="text-muted-foreground">Acceptance status</dt><dd className="mt-1 font-semibold">{view.unavailable ? "Unavailable" : view.accepted ? "Accepted" : "No acceptance recorded"}</dd></div>
        <div><dt className="text-muted-foreground">Accepted version</dt><dd className="mt-1 break-words font-semibold">{view.acceptedVersion || "Not available"}</dd></div>
        <div><dt className="text-muted-foreground">Acceptance date</dt><dd className="mt-1 font-semibold">{view.acceptedAtLabel ? `${view.acceptedAtLabel} (Asia/Manila)` : "Not available"}</dd></div>
      </dl>
      <Dialog>
        <div className="flex flex-wrap gap-3">
          <DialogTrigger asChild><Button type="button" variant="secondary">View Agreement</Button></DialogTrigger>
          {downloadAction()}
        </div>
        {downloadExplanation ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{downloadExplanation}</p> : null}
        <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 break-words">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
            <DialogHeader className="min-w-0 flex-1 pr-0">
              <DialogTitle>FEASTA Provider Agreement</DialogTitle>
              <DialogDescription className="sr-only">Read-only agreement viewer. Only the agreement body scrolls. Viewing or downloading does not change your acceptance record.</DialogDescription>
            </DialogHeader>
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="size-12 shrink-0 p-0" aria-label="Close agreement">
                <X aria-hidden="true" className="size-5" />
              </Button>
            </DialogClose>
          </header>
          <div role="region" aria-label="Agreement content" tabIndex={0} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6">
          <p className="mb-5 text-sm leading-6 text-muted-foreground">{explanation}</p>
          {view.document ? (
            <article className="min-w-0">
              <p className="mb-6 text-sm text-muted-foreground">{view.accepted ? "Accepted agreement" : "Current agreement"} · Version {view.document.version} · Effective {view.document.effectiveDate}</p>
              <div className="grid gap-6">
                {view.document.sections.map((section, index) => (
                  <section key={index}>
                    <h3 className="text-lg font-semibold">{section.title}</h3>
                    {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex} className="mt-3 whitespace-pre-wrap text-sm leading-7 sm:text-base">{paragraph}</p>)}
                  </section>
                ))}
              </div>
            </article>
          ) : <p role="status" className="text-sm leading-7">{explanation}</p>}
          </div>
          <DialogFooter className="shrink-0 flex-row flex-wrap items-center justify-end border-t border-border px-4 py-3 sm:px-6">
            {downloadAction()}
            <DialogClose asChild><Button type="button">Close</Button></DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
