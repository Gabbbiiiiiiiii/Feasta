"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {onAuthStateChanged} from "firebase/auth";
import {httpsCallable} from "firebase/functions";
import {useCallback, useEffect, useRef, useState} from "react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Textarea} from "@/components/ui/textarea";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";
import type {BookingRefundPolicyAcknowledgement, CustomerRefundPolicyDisclosure} from "@/lib/customer/bookings/customer-refund-policy-client";
import {customerBookingServiceVat, specialOfferBreakdown} from "@/lib/customer/bookings/customer-booking-service-vat";

type PriceOffer = {
  version: number;
  expiresAtMs?: number;
  subtotalInCentavos: number;
  deliveryIncluded?: boolean;
  totalInCentavos: number;
  notes: string;
  pricing?: unknown;
};

type SpecialRequest = {
  packageName: string;
  providerName: string;
  quantity: number;
  eventDate: string;
  eventTime: string;
  eventEndTime?: string;
  address?: string;
  serviceTier?: string;
  dropOffEligible?: boolean;
  status: string;
  priceOffer?: PriceOffer;
  refundPolicies?: readonly CustomerRefundPolicyDisclosure[];
  refundPolicyError?: string;
  paymentWindowClosed?: boolean;
  declinedPriceOfferVersion?: number;
  bookingId?: string;
  initialPaymentDeadlineAtMs?: number;
  requiredPaymentInCentavos?: number;
};

type ResponseAction = "accept" | "declineOffer" | "requestRevision";
const pesos = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
const dateFormat = new Intl.DateTimeFormat("en-PH", {dateStyle: "long", timeZone: "UTC"});
const refundStageLabels = {
  preparation_not_started: "Before preparation starts",
  preparation_started: "After preparation starts",
  service_started: "After service starts",
};

export function SpecialRequestDetails({requestId, inDialog = false, onStatusChange}: {
  requestId: string;
  inDialog?: boolean;
  onStatusChange?: (status: string) => void;
}) {
  const router = useRouter();
  const responding = useRef(false);
  const [row, setRow] = useState<SpecialRequest>();
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState("");
  const [action, setAction] = useState<ResponseAction>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refundAccepted, setRefundAccepted] = useState(false);
  const [clock, setClock] = useState<number | null>(null);
  const expiresAtMs = row?.priceOffer?.expiresAtMs;

  useEffect(() => {
    if (expiresAtMs == null || row?.status !== "quotation_sent") return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAtMs, row?.status]);

  const load = useCallback(async () => {
    setLoading(true);
    setRefundAccepted(false);
    setError("");
    try {
      await auth.authStateReady();
      if (!auth.currentUser) {
        setSignedOut(true);
        setRow(undefined);
        return;
      }
      setSignedOut(false);
      initializeBrowserAppCheck();
      const result = await httpsCallable<{view: "customer"; id: string}, {requests: SpecialRequest[]}>(
        functions, "listSpecialRequests",
      )({view: "customer", id: requestId});
      setRow(result.data.requests[0]);
      setClock(Date.now());
    } catch (failure) {
      setRow(undefined);
      const code =
        typeof failure === "object" &&
        failure !== null &&
        "code" in failure &&
        typeof (failure as {code?: unknown}).code === "string"
          ? (failure as {code: string}).code.replace(/^functions\//u, "")
          : null;
      const message =
        failure instanceof Error ? failure.message : "Unable to open this request.";
      setError(code && code !== message ? `${message} (${code})` : message);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => onAuthStateChanged(auth, user => {
    setSignedOut(!user);
    if (user) void load();
    else {
      setRow(undefined);
      setLoading(false);
    }
  }), [load]);

  async function respond() {
    if (responding.current || !row?.priceOffer || !action || (action === "requestRevision" && !message.trim())) return;
    if (action === "accept" && (row.refundPolicyError || (row.refundPolicies?.length && !refundAccepted))) return;
    responding.current = true;
    setBusy(true);
    setError("");
    try {
      const {data} = await httpsCallable<
        {id: string; action: ResponseAction; offerVersion: number; message: string; policyAcknowledgements?: BookingRefundPolicyAcknowledgement[]},
        {bookingId?: string; status?: string}
      >(functions, "updateSpecialRequest")({
        id: requestId, action, offerVersion: row.priceOffer.version, message,
        ...(action === "accept" && refundAccepted ? {
          policyAcknowledgements: row.refundPolicies?.map(({providerId, effectivePolicyKey}) => ({providerId, effectivePolicyKey})),
        } : {}),
      });
      if (data.status) onStatusChange?.(data.status);
      if (action === "accept" && data.bookingId) {
        router.push(`/customer/bookings/${encodeURIComponent(data.bookingId)}`);
        return;
      }
      setAction(undefined);
      setMessage("");
      await load();
    } catch (failure) {
      const reason = (failure as {details?: {reason?: string}} | null)?.details?.reason;
      if (action === "accept" && (reason === "REFUND_POLICY_CHANGED" || reason === "REFUND_POLICY_ACKNOWLEDGEMENT_REQUIRED")) {
        setAction(undefined);
        await load();
        setError("Review the current cancellation and refund terms before accepting the offer.");
        return;
      }
      setError(failure instanceof Error ? failure.message : "Unable to save your response.");
    } finally {
      responding.current = false;
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6" role="status">Loading special request…</div>;
  if (signedOut) return <div className="p-6"><Link className="underline" href="/login">Sign in to view this request</Link></div>;
  if (!row) {
    return (
      <div className="space-y-3 p-6" role="alert">
        <p>{error || "Special request was not found."}</p>
        <Button variant="secondary" size="compact" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  }

  const remainingSeconds = expiresAtMs == null || clock == null ? null :
    Math.max(0, Math.ceil((expiresAtMs - clock) / 1000));
  const expired = row.status === "expired" || remainingSeconds === 0 && row.status === "quotation_sent";
  const active = !expired && row.status === "quotation_sent" && Boolean(row.priceOffer);
  const eventDate = new Date(row.eventDate + "T00:00:00Z");
  const heading = row.bookingId ? "Offer Accepted" : row.status === "quotation_accepted" ? "Offer Accepted" :
    row.declinedPriceOfferVersion ? "Offer Declined" :
    expired ? "Offer Expired" : active ? "Price Offer Received" : row.status.replaceAll("_", " ");
  const amount = (centavos: number) => pesos.format(centavos / 100);
  const quote = row.priceOffer;
  const vat = quote && customerBookingServiceVat({
    amount: quote.totalInCentavos / 100,
    financialSnapshot: quote.pricing,
  });
  const pricing = quote && specialOfferBreakdown(quote, quote.totalInCentavos, quote.pricing);

  return (
    <div className={inDialog ? undefined : "mx-auto max-w-3xl space-y-4 p-4 sm:p-6"}>
      {!inDialog && <Link href="/customer/special-requests" className="text-sm font-semibold text-primary">Back to My Special Requests</Link>}
      <article className={inDialog ? "space-y-5" : "space-y-5 rounded-dialog border border-border bg-card p-5 text-card-foreground sm:p-6"}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {!inDialog && <h1 className="text-2xl font-bold">Special Request Details</h1>}
            <p className="mt-1 break-all text-sm text-muted-foreground">Reference {requestId}</p>
          </div>
          <Badge tone={active ? "info" : "neutral"} className="capitalize">{heading}</Badge>
        </header>
        <dl className="space-y-3 rounded-xl bg-muted/50 p-4">
          {[
            ["Provider", row.providerName], ["Package", row.packageName], ["Quantity", row.quantity],
            ["Event date", Number.isNaN(eventDate.getTime()) ? row.eventDate : dateFormat.format(eventDate)],
            [row.serviceTier === "drop_off" ? "Drop-Off Time" : "Event time", [row.eventTime, row.eventEndTime].filter(Boolean).join(" – ")],
            ["Delivery address", row.address],
          ].filter(([, value]) => value).map(([name, value]) => (
            <div key={name} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{name}</dt><dd className="break-words text-right font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {row.priceOffer && <section className="space-y-3">
          <h2 className="text-lg font-bold">Price Offer</h2>
          <div className="flex justify-between gap-3"><span>Package subtotal</span><span>{amount(row.priceOffer.subtotalInCentavos)}</span></div>
          {vat?.status === "available" && (
            <div className="flex justify-between gap-3">
              <span>{vat.taxType === "vat_registered" ? "Included provider VAT" : "Provider VAT not applicable"}</span>
              <span>{amount(vat.includedInPriceInCentavos)}</span>
            </div>
          )}
          {pricing && pricing.providerFeeInCentavos !== null &&
            <p className="text-sm text-muted-foreground">
              Service charge {amount(pricing.providerFeeInCentavos)} is deducted from provider proceeds. It is not an additional customer charge.
            </p>}
          <div className="flex justify-between gap-3 border-t border-border pt-3 font-bold"><span>Total offered</span><span>{amount(row.priceOffer.totalInCentavos)}</span></div>
          {row.priceOffer.deliveryIncluded ? <aside className="rounded-lg bg-muted p-3 text-sm">
            <p className="font-semibold">Delivery included</p>
            <p>The provider will deliver your order to the specified event address. Delivery is already included in the quoted price.</p>
          </aside> : <p className="text-sm text-muted-foreground">This earlier offer keeps its original quoted total.</p>}
          {row.priceOffer.notes && <p className="whitespace-pre-wrap break-words text-muted-foreground">{row.priceOffer.notes}</p>}
        </section>}
        {error && !action && <p role="alert" className="text-destructive">{error}</p>}
        {row.paymentWindowClosed && (
          <p className="text-sm text-muted-foreground">FEASTA closes payment 24 hours before the event. Submit a new request for a later schedule.</p>
        )}
        {active && <div className="space-y-3">
          {row.refundPolicyError && <p role="alert" className="text-destructive">{row.refundPolicyError}</p>}
          {row.dropOffEligible === false && <p className="text-sm text-muted-foreground">
            Submit a new Drop-Off request to book this service.
          </p>}
          {remainingSeconds !== null && expiresAtMs != null &&
            <p className="text-sm font-semibold text-muted-foreground">
              Offer expires at {new Intl.DateTimeFormat("en-PH", {
                hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila",
              }).format(expiresAtMs)} PHT · {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")} remaining
            </p>}
          <div className="flex flex-wrap gap-2">
            {expiresAtMs != null && row.dropOffEligible !== false && !row.refundPolicyError &&
              <Button onClick={() => {setError(""); setRefundAccepted(false); setAction("accept");}}>Accept Offer</Button>}
            <Button variant="secondary" onClick={() => {setError(""); setAction("requestRevision");}}>Request Changes</Button>
            <Button variant="secondary" className="text-destructive" onClick={() => {setError(""); setAction("declineOffer");}}>Decline Offer</Button>
          </div>

        </div>}
        {row.bookingId && <section className="space-y-3 rounded-xl bg-muted p-4">
          <h2 className="font-semibold">Booking and Payment</h2>
          <p className="break-all text-sm">Booking reference {row.bookingId}</p>
          {row.requiredPaymentInCentavos != null && <p>Initial payment required {amount(row.requiredPaymentInCentavos)}</p>}
          {row.initialPaymentDeadlineAtMs != null && <p>Original payment deadline {new Intl.DateTimeFormat("en-PH", {
            dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
          }).format(row.initialPaymentDeadlineAtMs)} PHT</p>}
          <Button asChild><Link href={`/customer/bookings/${encodeURIComponent(row.bookingId)}`}>View Booking &amp; Payment</Link></Button>
        </section>}
        {row.status === "quotation_accepted" && <p className="text-sm text-muted-foreground">
          Your acceptance was sent to the provider. Booking and payment are still pending. The original hold deadline still applies.
        </p>}
      </article>
      <Dialog open={active && Boolean(action)} onOpenChange={open => {
        if (!open && !busy) {setAction(undefined); setMessage("");}
      }}>
        <DialogContent showCloseButton={!busy} className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{action === "accept" ? "Accept Price Offer?" : action === "declineOffer" ? "Decline Price Offer?" : "Request Changes"}</DialogTitle>
            <DialogDescription>
              {action === "accept" && row.priceOffer
                ? <>
                  By accepting this {amount(row.priceOffer.totalInCentavos)} offer, you agree to the provider&apos;s quotation.
                  Your booking will be created with an Awaiting Payment status.
                  <br /><br />
                  Your booking will only be confirmed after FEASTA verifies the required payment.
                </>
                : action === "declineOffer" ? "FEASTA will close the special request and notify the provider." : "Tell the provider what you'd like them to change."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={event => {event.preventDefault(); void respond();}}>
            {action === "accept" && row.refundPolicies?.map(policy => (
              <section key={policy.effectivePolicyKey} className="space-y-2 rounded-lg border border-border p-3 text-sm">
                <h3 className="font-semibold">Cancellation and refunds</h3>
                {policy.rules.map(rule => (
                  <p key={rule.stage}>
                    {refundStageLabels[rule.stage]} · {rule.refundBasisPoints / 100}% refundable
                  </p>
                ))}
                {policy.terms && <p className="whitespace-pre-wrap break-words">{policy.terms}</p>}
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={refundAccepted} disabled={busy}
                    onChange={event => setRefundAccepted(event.target.checked)} />
                  I agree to the cancellation and refund policy.
                </label>
              </section>
            ))}
            {action === "requestRevision" && <Textarea aria-label="Requested changes" maxLength={2000}
              value={message} disabled={busy} required onChange={event => setMessage(event.target.value)} />}
            {error && <p role="alert" className="text-destructive">{error}</p>}
            <DialogFooter>
              <Button variant="secondary" disabled={busy} onClick={() => {setAction(undefined); setMessage("");}}>Cancel</Button>
              <Button type="submit" variant={action === "declineOffer" ? "destructive" : "primary"}
                disabled={(action === "requestRevision" && !message.trim()) ||
                  (action === "accept" && Boolean(row.refundPolicies?.length) && !refundAccepted)} loading={busy}>
                {action === "accept" ? "Accept & Proceed to Payment" : action === "declineOffer" ? "Confirm Decline" : "Send Requested Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
