"use client";

import {httpsCallable} from "firebase/functions";
import {CalendarDays, Eye, FileText, PackageOpen, RefreshCw} from "lucide-react";
import Link from "next/link";
import {useEffect, useState} from "react";
import {PageHeading} from "@/components/layout/page-heading";
import {Badge, type BadgeProps} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {SpecialRequestDetails} from "./special-request-details";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";

type RequestSummary = {
  id: string;
  packageName: string;
  providerName: string;
  quantity: number;
  eventDate: string;
  status: string;
  priceOffer?: {totalInCentavos: number; expiresAtMs?: number};
};

type ViewState =
  | {kind: "loading"}
  | {kind: "signedOut"}
  | {kind: "error"}
  | {kind: "ready"; requests: RequestSummary[]};

const statuses: Record<string, {label: string; tone: BadgeProps["tone"]}> = {
  pending_review: {label: "Under review", tone: "neutral"},
  needs_clarification: {label: "Provider needs more details", tone: "warning"},
  quotation_sent: {label: "Price offer received", tone: "info"},
  revision_requested: {label: "Changes requested", tone: "neutral"},
  quotation_accepted: {label: "Offer accepted", tone: "success"},
  converted_to_booking: {label: "Booking created", tone: "success"},
  declined: {label: "Declined", tone: "destructive"},
  cancelled: {label: "Cancelled", tone: "neutral"},
  expired: {label: "Offer expired", tone: "neutral"},
};
const pesos = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
const dates = new Intl.DateTimeFormat("en-PH", {dateStyle: "long", timeZone: "UTC"});

export default function MySpecialRequestsPage() {
  const [view, setView] = useState<ViewState>({kind: "loading"});
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let generation = 0;
    const unsubscribe = auth.onAuthStateChanged(async user => {
      const current = ++generation;
      if (!user) {
        setView({kind: "signedOut"});
        return;
      }
      setView({kind: "loading"});
      try {
        initializeBrowserAppCheck();
        const {data} = await httpsCallable<{view: "customer"}, {requests: RequestSummary[]}>(
          functions, "listSpecialRequests",
        )({view: "customer"});
        if (current === generation) setView({kind: "ready", requests: data.requests});
      } catch {
        if (current === generation) setView({kind: "error"});
      }
    });
    return () => {
      generation++;
      unsubscribe();
    };
  }, [attempt]);

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-4 p-4 sm:p-6">
      <PageHeading title="My Special Requests" description="Track your Drop-Off requests and review price offers."
        actions={view.kind === "ready" && <Button variant="secondary" size="compact"
          onClick={() => setAttempt(value => value + 1)}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Refresh
        </Button>} />
      {view.kind === "loading" && <p role="status">Loading special requests…</p>}
      {view.kind === "signedOut" && <p><Link className="underline" href="/login">Sign in</Link> to view your requests.</p>}
      {view.kind === "error" && <div className="space-y-3" role="alert">
        <p>Unable to load your requests.</p>
        <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Try Again</Button>
      </div>}
      {view.kind === "ready" && view.requests.length === 0 && (
        <section className="grid justify-items-center gap-3 rounded-card border border-border bg-card px-5 py-8 text-center sm:py-10">
          <span className="grid size-12 place-items-center rounded-full bg-primary-tint text-primary">
            <FileText aria-hidden="true" className="size-6" />
          </span>
          <h2 className="text-xl font-black tracking-tight">No special requests yet</h2>
          <p className="text-sm text-muted-foreground">Your submitted requests and price offers will appear here.</p>
        </section>
      )}
      {view.kind === "ready" && view.requests.map(request => {
        const status = statuses[request.status] ?? {label: "Status unavailable", tone: "neutral" as const};
        const date = new Date(request.eventDate + "T00:00:00Z");
        return (
          <article key={request.id} className="grid min-w-0 gap-3 rounded-card border border-border bg-card p-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-black tracking-tight">{request.packageName}</h2>
                <p className="text-sm text-muted-foreground">{request.providerName}</p>
              </div>
              <Badge tone={status.tone}>{status.label}</Badge>
            </div>
            <dl className="grid gap-2.5 rounded-xl bg-muted/35 p-3 text-sm sm:grid-cols-3">
              <div className="flex min-w-0 items-start gap-2">
                <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <dt className="sr-only">Event date</dt>
                <dd>{Number.isNaN(date.getTime()) ? request.eventDate : dates.format(date)}</dd>
              </div>
              <div className="flex min-w-0 items-start gap-2">
                <PackageOpen aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <dt className="sr-only">Quantity</dt>
                <dd>{request.quantity} {request.quantity === 1 ? "package" : "packages"}</dd>
              </div>
              {request.priceOffer && (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="text-xs font-semibold text-muted-foreground">Total offered</dt>
                  <dd className="font-black">{pesos.format(request.priceOffer.totalInCentavos / 100)}</dd>
                </div>
              )}
            </dl>
            <Dialog open={selectedId === request.id} onOpenChange={open => setSelectedId(open ? request.id : null)}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="compact" className="w-full sm:w-auto sm:justify-self-end">
                  <Eye aria-hidden="true" className="size-4" />
                  {request.status === "quotation_sent" ? "Review Offer" : "View Request"}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Special Request Details</DialogTitle>
                  <DialogDescription>{request.packageName}</DialogDescription>
                </DialogHeader>
                <SpecialRequestDetails requestId={request.id} inDialog
                  onStatusChange={status => setView(current => current.kind === "ready" ? {
                    ...current,
                    requests: current.requests.map(item => item.id === request.id ? {...item, status} : item),
                  } : current)} />
              </DialogContent>
            </Dialog>
          </article>
        );
      })}
    </div>
  );
}
