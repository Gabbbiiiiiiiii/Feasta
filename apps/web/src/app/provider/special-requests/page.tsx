"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import Link from "next/link";
import {onAuthStateChanged} from "firebase/auth";
import {httpsCallable} from "firebase/functions";
import {CircleX, Eye, FileText, MessageCircle, RefreshCw} from "lucide-react";
import {DataTable, DetailDrawer, type DataTableColumn} from "@/components/data";
import {SearchInput} from "@/components/forms/search-input";
import {PageHeading} from "@/components/layout/page-heading";
import {Badge, type BadgeProps} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";
import {customerBookingServiceVat, specialOfferBreakdown} from "@/lib/customer/bookings/customer-booking-service-vat";

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

    const items = [
      ["Customer", row.customerName],
      ["Package", row.packageName],
      ["Quantity", `${row.quantity} ${row.quantity === 1 ? "package" : "packages"}`],
      ["Event date", formatDate(row.eventDate)],
      [row.serviceTier === "drop_off" ? "Drop-Off Time" : "Event time",
        [row.eventTime, row.eventEndTime].filter(Boolean).join(" – ")],
      ["Delivery address", row.address],
    ];
    const notes = [
      ["Customer instructions", row.instructions],
      ["Delivery instructions", row.deliveryInstructions],
      ["Customer response", row.clarifyMessage],
      ["Requested changes", row.requestRevisionMessage],
    ].filter(([, value]) => value?.trim());

    return <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {requestStatus(row)}
        <span className="break-all text-xs text-muted-foreground">Reference {row.id}</span>
      </div>
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      <dl className="my-5 space-y-3 rounded-xl bg-muted/50 p-4">
        {items.filter(([, value]) => value).map(([name, value]) => (
          <div key={name} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="break-words text-right font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {notes.length > 0 && <div className="space-y-4 border-t border-border py-4">
        {notes.map(([name, value]) => <div key={name}>
          <h3 className="text-sm font-semibold text-muted-foreground">{name}</h3>
          <p className="mt-1 whitespace-pre-wrap break-words">{value}</p>
        </div>)}
      </div>}
      <div className="flex items-baseline justify-between gap-3 border-t border-border py-4">
        <span className="font-medium">Estimated subtotal</span>
        <strong className="text-xl text-primary">{money.format(row.subtotalInCentavos / 100)}</strong>
      </div>
      {row.priceOffer && <div className="mb-4 space-y-2 rounded-xl bg-muted/50 p-4">
        <h3 className="font-semibold">Sent Price Offer</h3>
        <p className="text-sm text-muted-foreground">{row.priceOffer.deliveryIncluded ? "Delivery included" : "Original quoted total"}</p>
        <p className="font-bold">Total offered {money.format(row.priceOffer.totalInCentavos / 100)}</p>
        {vat?.status === "available" && (
          <p>{vat.taxType === "vat_registered"
            ? `Included provider VAT ${money.format(vat.includedInPriceInCentavos / 100)}`
            : "Non-VAT service"}</p>
        )}
        {pricing && pricing.providerFeeInCentavos !== null && (
          <p>FEASTA provider commission {money.format(pricing.providerFeeInCentavos / 100)}</p>
        )}
        {row.priceOffer.notes && <p className="whitespace-pre-wrap break-words">{row.priceOffer.notes}</p>}
      </div>}
      {row.providerRequestId && <div className="mb-4 rounded-xl bg-muted p-4">
        <p className="mb-2 text-sm">Open the booking to see its current payment status.</p>
        <Button asChild variant="secondary" size="compact"><Link href={`/provider/bookings?request=${encodeURIComponent(row.providerRequestId)}`}>View Booking</Link></Button>
      </div>}
      {canDecline && <div className="space-y-3">
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
              When provider VAT applies, it is included in the quoted price. FEASTA deducts its commission from provider proceeds.
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
    </div>;
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
      <DetailDrawer title="Special Request Details" description={active?.packageName ?? ""}
        open={Boolean(active)} onOpenChange={closeRequest}>
        {active && reviewDetails(active)}
      </DetailDrawer>
    </div>
  );
}
