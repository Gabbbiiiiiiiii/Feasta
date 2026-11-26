"use client";

import {useActionState, useId, useState} from "react";
import {Check, Copy, Printer} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {saveWalkIn, type WalkInActionState} from "./actions";
import {printBookingSheet, type PrintableBookingSheet} from "@/lib/provider/print-booking-sheet";

export function PrintWalkInButton({sheet}: {sheet: PrintableBookingSheet}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="compact"
      data-print-hidden=""
      className="print:hidden"
      onClick={() => printBookingSheet(sheet)}
    >
      <Printer aria-hidden="true" className="size-4" />
      Print
    </Button>
  );
}

export function CopyWalkInReference({reference}: {reference: string}) {
  const [message, setMessage] = useState("");
  return <span data-print-hidden="" className="inline-flex items-center gap-1 print:hidden">
    <button type="button" aria-label="Copy booking reference" title="Copy booking reference"
      className="inline-flex size-7 items-center justify-center rounded hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(reference);
          setMessage("Reference copied.");
        } catch {
          setMessage("Could not copy. You can select the reference and copy it.");
        }
      }}>
      <Copy aria-hidden="true" className="size-4" />
    </button>
    <span role="status" className="text-xs">{message}</span>
  </span>;
}

export function WalkInStatusForm({id}: {id: string}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const reasonId = useId();
  const [completed, complete, completing] = useActionState(saveWalkIn, {});
  const [cancelled, cancel, cancelling] = useActionState(async (previous: WalkInActionState, form: FormData) => {
    const result = await saveWalkIn(previous, form);
    if (result.message) setOpen(false);
    return result;
  }, {});
  return (
    <div data-print-hidden="" className="border-t border-border pt-5 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Dialog open={open} onOpenChange={(next) => {
          if (cancelling) return;
          setOpen(next);
          if (!next) {
            setReason("");
            setReasonError(false);
          }
        }}>
          <DialogTrigger asChild>
            <Button variant="secondary" size="compact"
              className="border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
              disabled={completing}>Cancel Booking</Button>
          </DialogTrigger>
          <DialogContent showCloseButton={!cancelling} onEscapeKeyDown={(event) => {if (cancelling) event.preventDefault();}}
            onInteractOutside={(event) => {if (cancelling) event.preventDefault();}}>
            <DialogHeader>
              <DialogTitle>Cancel booking?</DialogTitle>
              <DialogDescription>This will cancel the walk-in booking and release its slot on the event date.</DialogDescription>
            </DialogHeader>
            <form action={cancel} className="grid gap-5" noValidate onSubmit={(event) => {
              if (reason.trim()) return;
              event.preventDefault();
              setReasonError(true);
              event.currentTarget.querySelector("textarea")?.focus();
            }}>
              <input type="hidden" name="reference" value={id} />
              <input type="hidden" name="action" value="cancelled" />
              <div className="grid gap-1.5">
                <label htmlFor={reasonId} className="text-sm font-semibold">Cancellation reason</label>
                <textarea id={reasonId} name="cancellation reason" rows={3} maxLength={500} required
                  aria-invalid={reasonError || undefined} aria-describedby={reasonError ? `${reasonId}-error` : undefined}
                  value={reason} disabled={cancelling} onChange={(event) => {
                    setReason(event.target.value);
                    if (event.target.value.trim()) setReasonError(false);
                  }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2" />
                {reasonError && <p id={`${reasonId}-error`} className="text-sm text-destructive">Enter a cancellation reason.</p>}
                {cancelled.error && <p role="alert" className="text-sm text-destructive">{cancelled.error}</p>}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="secondary" size="compact" disabled={cancelling}>Keep booking</Button></DialogClose>
                <Button type="submit" variant="destructive" size="compact" loading={cancelling} loadingLabel="Cancelling…">
                  Confirm cancellation
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <form action={complete} onSubmit={(event) => {
          if (!window.confirm("Mark this walk-in booking as completed?")) event.preventDefault();
        }}>
          <input type="hidden" name="reference" value={id} />
          <input type="hidden" name="action" value="completed" />
          <Button type="submit" size="compact" loading={completing} loadingLabel="Completing…" disabled={cancelling}>
            <Check aria-hidden="true" className="size-4" /> Mark as Completed
          </Button>
        </form>
      </div>
      {(completed.error || completed.message || cancelled.message) && <p role="status" className="mt-2 text-sm">
        {completed.error ?? completed.message ?? cancelled.message}
      </p>}
    </div>
  );
}
