"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import Link from "next/link";
import {onAuthStateChanged} from "firebase/auth";
import {httpsCallable} from "firebase/functions";
import {ArrowUpRight, CalendarDays, CircleX, Clock3, Eye, FileText, MapPin, MessageCircle, PackageOpen, RefreshCw} from "lucide-react";
import {DataTable, DetailDrawer, type DataTableColumn} from "@/components/data";
import {SearchInput} from "@/components/forms/search-input";
import {PageHeading} from "@/components/layout/page-heading";
import {CopyTextButton} from "@/components/shared/copy-text-button";
import {Badge, type BadgeProps} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";
import {customerBookingServiceVat, specialOfferBreakdown} from "@/lib/customer/bookings/customer-booking-service-vat";
import {printBookingSheet, type PrintableBookingSheet} from "@/lib/provider/print-booking-sheet";

type RequestRow = {
  id: string;
  customerName: string;
  packageName: string;
  quantity: number;
  eventDate: string;
  eventTime: string;
  eventEndTime: string | null;
  serviceTier?: string | null;
  dropOffEligible?: boolean;
  address: string;
  instructions: string;
  deliveryInstructions: string;
  clarifyMessage?: string;
  requestRevisionMessage?: string;
  subtotalInCentavos: number;
  status: string;
  bookingId?: string;
  providerRequestId?: string;
  priceOffer?: {deliveryIncluded?: boolean; subtotalInCentavos: number; totalInCentavos: number; notes: string; pricing?: unknown};
};

const filters = [
  ["All Requests", []],
  ["Pending Review", ["pending_review", "revision_requested"]],
  ["Awaiting Customer", ["needs_clarification", "quotation_sent"]],
  ["Accepted", ["quotation_accepted", "converted_to_booking"]],
  ["Declined/Cancelled", ["declined", "cancelled", "expired"]],
] as const;
const money = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
const label = (key: string) => key.replaceAll("_", " ");

type ReviewAction = "requestClarification" | "decline" | "sendQuotation";

const dateFormat = new Intl.DateTimeFormat("en-PH", {dateStyle: "long", timeZone: "UTC"});

function formatDate(date: string) {
  const value = new Date(date + "T00:00:00Z");
  return Number.isNaN(value.getTime()) ? date : dateFormat.format(value);
}

function statusTone(status: string): BadgeProps["tone"] {
  if (status === "pending_review" || status === "revision_requested") return "warning";
  if (status === "needs_clarification" || status === "quotation_sent") return "info";
  if (status === "converted_to_booking" || status === "quotation_accepted") return "success";
  if (status === "declined") return "destructive";
  return "neutral";
}

function requestStatus(row: RequestRow) {
  const status = row.status === "quotation_sent" ? "Price Offer Sent" :
    ["quotation_accepted", "converted_to_booking"].includes(row.status) ? "Offer Accepted" : label(row.status);
  return <Badge tone={statusTone(row.status)} className="capitalize">{status}</Badge>;
}

export default function SpecialRequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [filter, setFilter] = useState(0);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>();
  const [reviewAction, setReviewAction] = useState<ReviewAction>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      initializeBrowserAppCheck();
      const result = await httpsCallable<{view: string}, {requests: RequestRow[]}>(
        functions, "listSpecialRequests",
      )({view: "provider"});
      setRows(result.data.requests);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to load requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => onAuthStateChanged(auth, user => {
    setRows([]);
    if (user) void load();
    else setLoading(false);
  }), [load]);

  const active = rows.find(request => request.id === selected);
  const statuses: readonly string[] = filters[filter][1];
  const visible = rows.filter(row => (statuses.length === 0 || statuses.includes(row.status)) &&
    [row.id, row.customerName, row.packageName].some(value => value.toLowerCase().includes(search.trim().toLowerCase())));

  async function update(action: ReviewAction) {
    if (!active || saving || (action !== "sendQuotation" && !message.trim())) return;
    setSaving(true);
    setActionError("");
    try {
      await httpsCallable(functions, "updateSpecialRequest")({id: active.id, action, message});
      setMessage("");
      setReviewAction(undefined);
      await load();
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "Unable to update request.");
    } finally {
      setSaving(false);
    }
  }

  function openRequest(id: string, trigger: HTMLButtonElement) {
    reviewTrigger.current = trigger;
    setSelected(id);
    setMessage("");
    setReviewAction(undefined);
    setActionError("");
  }

  function closeRequest(open: boolean) {
    if (open || saving) return;
    setSelected(undefined);
    requestAnimationFrame(() => reviewTrigger.current?.focus());
  }

  const columns: DataTableColumn<RequestRow>[] = [
    {id: "package", header: "Package", cell: row => <div className="grid gap-1">
      <strong>{row.packageName}</strong>
      <span className="text-xs text-muted-foreground">{row.quantity} {row.quantity === 1 ? "package" : "packages"}</span>
    </div>},
    {id: "customer", header: "Customer", cell: row => row.customerName},
    {id: "date", header: "Event Date", cell: row => formatDate(row.eventDate)},
    {id: "amount", header: "Subtotal", cell: row => money.format(row.subtotalInCentavos / 100)},
    {id: "status", header: "Status", cell: requestStatus},
  ];

  function reviewButton(row: RequestRow) {
    return <Button variant="ghost" size="compact" aria-label={`Review request for ${row.packageName}`}
      onClick={event => openRequest(row.id, event.currentTarget)}>
      <Eye className="size-4" aria-hidden="true" /> Review Request
    </Button>;
  }

  function reviewDetails(row: RequestRow) {
    const offer = row.priceOffer;
    const pricing = offer && specialOfferBreakdown(offer, offer.totalInCentavos, offer.pricing);
    const vat = offer && customerBookingServiceVat({
      amount: offer.totalInCentavos / 100,
      financialSnapshot: offer.pricing,
    });
    const canClarify = ["pending_review", "revision_requested"].includes(row.status);
    const canQuote = canClarify && row.dropOffEligible !== false;
    const canDecline = canClarify || row.status === "needs_clarification";

    const timeRange = [row.eventTime, row.eventEndTime].filter(Boolean).join(" – ") || "Not provided";
    const notes = [
      ["Customer instructions", row.instructions],
      ["Delivery instructions", row.deliveryInstructions],
      ["Customer response", row.clarifyMessage],
      ["Requested changes", row.requestRevisionMessage],
    ].filter(([, value]) => value?.trim());
    const initials = (() => {
      const parts = row.customerName.trim().split(/\s+/u).filter(Boolean);
      if (!parts.length) return "?";
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    })();

    return <div className="grid gap-5">
      {actionError && <p role="alert" data-print-hidden="" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive print:hidden">{actionError}</p>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="grid gap-5">
          <section className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Event overview</h3>
            <div className="grid gap-4 border-b border-border/70 pb-5 sm:grid-cols-3 print:grid-cols-3">
              <div data-print-card="" className="grid content-start gap-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
                  {row.serviceTier === "drop_off" ? "Drop-Off date & time" : "Date & time"}
                </p>
                <p className="text-base font-bold text-foreground">{formatDate(row.eventDate)}</p>
                <span className="inline-flex w-fit items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <Clock3 aria-hidden="true" className="size-3 shrink-0" />
                  {timeRange}
                </span>
              </div>
              <div data-print-card="" className="grid content-start gap-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <PackageOpen aria-hidden="true" className="size-3.5 shrink-0" />
                  Quantity
                </p>
                <p className="text-base font-bold text-foreground">
                  {row.quantity} {row.quantity === 1 ? "package" : "packages"}
                </p>
                <p className="text-xs text-muted-foreground">Special request</p>
              </div>
              <div data-print-card="" className="grid content-start gap-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <FileText aria-hidden="true" className="size-3.5 shrink-0" />
                  Service mode
                </p>
                <p className="text-base font-bold capitalize text-foreground">
                  {row.serviceTier ? label(row.serviceTier) : "Drop-Off"}
                </p>
                <p className="text-xs text-muted-foreground">Bundle order</p>
              </div>
            </div>
            <div data-print-card="" className="grid gap-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                Delivery address
              </p>
              <p className="break-words text-sm font-semibold text-foreground">{row.address || "Not provided"}</p>
              {row.address ? (
                <div data-print-hidden="" className="mt-1 flex flex-wrap items-center gap-2 text-xs print:hidden">
                  <CopyTextButton value={row.address} ariaLabel="Copy delivery address" label="Copy address" className="px-0 py-0 text-xs font-medium text-muted-foreground hover:text-foreground" />
                  <span aria-hidden="true" className="text-muted-foreground/60">·</span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-primary-strong transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Open in Maps
                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                  </a>
                </div>
              ) : null}
            </div>
          </section>

          <section data-print-card="" className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</h3>
            <div className="flex items-center gap-3.5">
              <div aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-accent text-sm font-bold text-primary-strong">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-base font-bold text-foreground">{row.customerName}</p>
                <p className="text-xs text-muted-foreground">Request reference {row.id}</p>
              </div>
            </div>
          </section>

          {notes.length > 0 && <section className="grid gap-4 rounded-2xl border border-border bg-card p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes &amp; instructions</h3>
            {notes.map(([name, value]) => <div key={name} data-print-card="" className="grid gap-1">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{name}</h4>
              <p className="whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-muted/25 p-3.5 text-sm leading-6">{value}</p>
            </div>)}
          </section>}
        </div>

        <aside className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-card">
          <div data-print-card="" className="grid gap-2 rounded-xl border border-border/80 bg-secondary/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Estimated subtotal</p>
              <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {row.quantity} {row.quantity === 1 ? "package" : "packages"}
              </span>
            </div>
            <strong className="text-2xl font-bold tracking-tight text-primary-strong sm:text-3xl">
              {money.format(row.subtotalInCentavos / 100)}
            </strong>
          </div>

          <div className="grid gap-1">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-base font-bold text-foreground">{row.packageName}</p>
              {row.serviceTier ? (
                <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs font-semibold capitalize text-foreground">
                  {label(row.serviceTier)}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {row.quantity} {row.quantity === 1 ? "package" : "packages"} · {formatDate(row.eventDate)}
            </p>
          </div>

          {row.priceOffer && <section data-print-card="" className="grid gap-2 border-t border-border pt-4 text-sm">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sent price offer</h3>
            <p className="text-xs text-muted-foreground">{row.priceOffer.deliveryIncluded ? "Delivery included" : "Original quoted total"}</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Total offered</span>
              <span className="font-bold text-foreground">{money.format(row.priceOffer.totalInCentavos / 100)}</span>
            </div>
            {vat?.status === "available" && (
              <p className="text-xs text-muted-foreground">{vat.taxType === "vat_registered"
                ? `Included provider VAT ${money.format(vat.includedInPriceInCentavos / 100)}`
                : "Non-VAT service"}</p>
            )}
            {pricing && pricing.providerFeeInCentavos !== null && (
              <p className="text-xs text-muted-foreground">
                {pricing.isCustomerPaid
                  ? `FEASTA service fee (paid by customer): ${money.format(pricing.providerFeeInCentavos / 100)} · You receive 100% of ${money.format(pricing.subtotalInCentavos / 100)}`
                  : `FEASTA provider commission ${money.format(pricing.providerFeeInCentavos / 100)}`}
              </p>
            )}
            {row.priceOffer.notes && <p className="whitespace-pre-wrap break-words rounded-xl border border-border/70 bg-muted/25 p-3 text-xs leading-5">{row.priceOffer.notes}</p>}
          </section>}

          {row.providerRequestId && <div data-print-hidden="" className="border-t border-border pt-4 print:hidden">
            <p className="mb-2 text-xs text-muted-foreground">Open the booking to see its current payment status.</p>
            <Button asChild variant="secondary" size="compact" fullWidth className="rounded-xl"><Link href={`/provider/bookings?request=${encodeURIComponent(row.providerRequestId)}`}>View Booking</Link></Button>
          </div>}

          {canDecline && <div data-print-hidden="" className="space-y-3 border-t border-border pt-4 print:hidden">
        <div className="grid gap-2 sm:grid-cols-2">
          {canClarify && <Button variant="secondary" size="compact" disabled={saving}
            aria-expanded={reviewAction === "requestClarification"} onClick={() => {
              setMessage("");
              setReviewAction("requestClarification");
            }}>
            <MessageCircle className="size-4" aria-hidden="true" /> Clarify Request
          </Button>}
          <Button variant="secondary" size="compact" className="text-destructive" disabled={saving}
            aria-expanded={reviewAction === "decline"} onClick={() => {
              setMessage("");
              setReviewAction("decline");
            }}>
            <CircleX className="size-4" aria-hidden="true" /> Decline Request
          </Button>
        </div>
        {reviewAction && reviewAction !== "sendQuotation" && <form className="space-y-3 rounded-xl border border-border p-4" onSubmit={event => {
          event.preventDefault();
          if (!saving) void update(reviewAction);
        }}>
          <label className="block text-sm font-semibold">
            {reviewAction === "decline" ? "Reason for declining" : "What would you like to clarify?"}
            <Textarea className="mt-2" maxLength={2000} value={message} disabled={saving}
              onChange={event => setMessage(event.target.value)} />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="compact" disabled={saving} onClick={() => setReviewAction(undefined)}>Cancel</Button>
            <Button type="submit" size="compact" disabled={!message.trim()} loading={saving}
              variant={reviewAction === "decline" ? "destructive" : "primary"}>
              {reviewAction === "decline" ? "Confirm Decline" : "Send Clarification"}
            </Button>
          </div>
        </form>}
        {canQuote && reviewAction !== "sendQuotation" &&
          <Button fullWidth disabled={saving} onClick={() => {
            setMessage("");
            setReviewAction("sendQuotation");
          }}>
            <FileText className="size-4" aria-hidden="true" /> Approve Request
          </Button>}
        {canQuote && reviewAction === "sendQuotation" && <form className="space-y-4 rounded-xl border border-border p-4" onSubmit={event => {
            event.preventDefault();
            void update("sendQuotation");
          }}>
            <h3 className="font-bold">Approve Request</h3>
            <p className="text-sm text-muted-foreground">
              Send a price offer only if you can fulfill this quantity on the requested date and time.
            </p>
            <p className="text-sm text-muted-foreground">
              Your quoted package price must already include delivery to the customer&apos;s specified address. No separate delivery fee will be charged.
              When provider VAT applies, it is included in your quoted price. FEASTA adds its service fee separately to the customer&apos;s total so you receive 100% of your quoted price.
            </p>
            <label className="block text-sm font-semibold">
              Notes for the customer (optional)
              <Textarea className="mt-2" maxLength={2000} value={message} disabled={saving}
                onChange={event => setMessage(event.target.value)} />
            </label>
            <div className="flex justify-between gap-3 border-t border-border pt-3 font-bold">
              <span>Total offered</span><span>{money.format(row.subtotalInCentavos / 100)}</span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="compact" disabled={saving} onClick={() => setReviewAction(undefined)}>Cancel</Button>
              <Button type="submit" size="compact" loading={saving}>Approve &amp; Send Offer</Button>
            </div>
          </form>}
          </div>}
        </aside>
      </div>
    </div>;
  }

  function handlePrintSpecialRequest(row: RequestRow) {
    const offer = row.priceOffer;
    const pricing = offer && specialOfferBreakdown(offer, offer.totalInCentavos, offer.pricing);
    const vat = offer && customerBookingServiceVat({
      amount: offer.totalInCentavos / 100,
      financialSnapshot: offer.pricing,
    });
    const statusText =
      row.status === "quotation_sent"
        ? "Price Offer Sent"
        : ["quotation_accepted", "converted_to_booking"].includes(row.status)
          ? "Offer Accepted"
          : label(row.status).replace(/\b\w/gu, (ch) => ch.toUpperCase());
    const timeRange = [row.eventTime, row.eventEndTime].filter(Boolean).join(" – ") || "Not provided";
    const paymentDetails: string[] = [];
    if (offer) {
      paymentDetails.push(offer.deliveryIncluded ? "Price offer includes delivery to the specified address." : "Original quoted total.");
      if (vat?.status === "available") {
        paymentDetails.push(
          vat.taxType === "vat_registered"
            ? `Included provider VAT: ${money.format(vat.includedInPriceInCentavos / 100)}`
            : "Non-VAT service",
        );
      }
      if (offer.notes?.trim()) {
        paymentDetails.push(`Offer notes: ${offer.notes.trim()}`);
      }
    }

    const sheet: PrintableBookingSheet = {
      documentTitle: "Special Request Sheet",
      fileTitle: `FEASTA - Special Request ${row.id}`,
      reference: row.id,
      status: statusText,
      eventDetails: [
        {label: "Date & Time", value: `${formatDate(row.eventDate)} · ${timeRange}`},
        {label: "Service Mode", value: row.serviceTier ? label(row.serviceTier).replace(/\b\w/gu, (ch) => ch.toUpperCase()) : "Drop-Off"},
        {label: "Quantity", value: `${row.quantity} ${row.quantity === 1 ? "package" : "packages"}`},
        {label: "Delivery Address", value: row.address || "Not provided"},
      ],
      customerDetails: [
        {label: "Name", value: row.customerName},
        {label: "Reference", value: row.id},
      ],
      packageSummary: {
        name: row.packageName,
        tier: row.serviceTier ? label(row.serviceTier).replace(/\b\w/gu, (ch) => ch.toUpperCase()) : "Drop-Off",
        meta: `${row.quantity} ${row.quantity === 1 ? "package" : "packages"} · ${money.format(row.subtotalInCentavos / 100)}`,
      },
      notes: [
        ...(row.instructions?.trim() ? [{title: "Customer Instructions", body: row.instructions}] : []),
        ...(row.deliveryInstructions?.trim() ? [{title: "Delivery Instructions", body: row.deliveryInstructions}] : []),
        ...(row.clarifyMessage?.trim() ? [{title: "Customer Response", body: row.clarifyMessage}] : []),
        ...(row.requestRevisionMessage?.trim() ? [{title: "Requested Changes", body: row.requestRevisionMessage}] : []),
      ],
      paymentSummary: {
        heading: "Pricing & Offer Summary",
        lines: [
          {label: "Estimated subtotal", amount: money.format(row.subtotalInCentavos / 100), highlight: !offer},
          ...(offer
            ? [
                {
                  label: "Total offered",
                  amount: money.format(offer.totalInCentavos / 100),
                  highlight: true,
                  dividerAbove: true,
                },
              ]
            : []),
          ...(pricing && pricing.providerFeeInCentavos !== null
            ? [{
                label: pricing.isCustomerPaid
                  ? "FEASTA service fee (paid by customer)"
                  : "FEASTA provider commission",
                amount: money.format(pricing.providerFeeInCentavos / 100),
              }]
            : []),
        ],
        details: paymentDetails,
      },
      footerText: `FEASTA Provider Copy · Special Request ${row.id}`,
    };

    printBookingSheet(sheet);
  }

  return (
    <div className="grid gap-5 p-4 sm:p-6">
      <PageHeading title="Special Requests" description="Review Drop-Off requests and manage price offers."
        actions={<Button variant="secondary" size="compact" disabled={saving} loading={loading} onClick={() => void load()}>
          <RefreshCw className="size-4" aria-hidden="true" /> Refresh
        </Button>} />
      <section className="grid gap-3 rounded-card border border-border bg-card p-4 shadow-card" aria-label="Filter special requests">
        <SearchInput aria-label="Search requests" placeholder="Customer, package, or reference"
          value={search} onChange={event => setSearch(event.target.value)}
          onClear={search ? () => setSearch("") : undefined} />
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Request status filters">
          {filters.map(([name], index) => <Button key={name} variant={index === filter ? "primary" : "secondary"}
            size="compact" className="shrink-0" aria-pressed={index === filter} onClick={() => setFilter(index)}>
            {name}
          </Button>)}
        </div>
      </section>
      <DataTable columns={columns} rows={visible} getRowId={row => row.id} caption="Special request results"
        loading={loading && rows.length === 0} updating={loading && rows.length > 0}
        error={error || undefined} onRetry={() => void load()}
        emptyTitle="No special requests found" emptyDescription="Requests matching your search and status filter will appear here."
        rowActions={reviewButton}
        renderMobileRow={row => <article className="grid gap-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h2 className="font-bold">{row.packageName}</h2>
            {requestStatus(row)}
          </div>
          <p className="text-sm text-muted-foreground">{row.customerName} · {formatDate(row.eventDate)}</p>
          <p className="text-sm">{row.quantity} {row.quantity === 1 ? "package" : "packages"} · {money.format(row.subtotalInCentavos / 100)}</p>
          <div>{reviewButton(row)}</div>
        </article>} />
      <DetailDrawer title="Special Request Details" description={active?.packageName ?? "Review the customer's special request before responding."}
        fullScreen backLabel="Back to Special Requests" printable={Boolean(active)}
        onPrint={active ? () => handlePrintSpecialRequest(active) : undefined}
        headerMeta={active ? <>
          {requestStatus(active)}
          <span className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
            <span>{active.id}</span>
            <CopyTextButton value={active.id} ariaLabel="Copy request reference" className="p-0.5" />
          </span>
        </> : undefined}
        open={Boolean(active)} onOpenChange={closeRequest}>
        {active && reviewDetails(active)}
      </DetailDrawer>
    </div>
  );
}
