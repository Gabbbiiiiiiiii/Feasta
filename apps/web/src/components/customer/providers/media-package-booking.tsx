"use client";

import {FirebaseError} from "firebase/app";
import {httpsCallable} from "firebase/functions";
import {ArrowRight} from "lucide-react";
import Link from "next/link";
import {useId, useRef, useState, type FormEvent} from "react";

import {BookingPaymentAgreementReview} from "@/components/customer/bookings/booking-payment-agreement-review";
import {PreBookingCancellationCutoffNotice} from "@/components/customer/bookings/cancellation-cutoff-notice";
import {CustomerEventAddressMap, type EventMapCoordinates} from "@/components/customer/bookings/customer-event-address-map";
import {ProviderDatePicker} from "@/components/customer/bookings/provider-date-picker";
import {CustomerAuthLink} from "@/components/customer/layout/customer-auth-provider";
import {Button} from "@/components/ui/button";
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {Textarea} from "@/components/ui/textarea";
import {Input} from "@/components/ui/input";
import {parseBookingPaymentAgreements, type BookingAgreementDisclosure} from "@/lib/customer/bookings/customer-booking-agreement";
import type {CustomerRefundPolicyDisclosureResult} from "@/lib/customer/bookings/customer-refund-policy-client";
import type {ActiveOccasionOption} from "@/lib/customer/planning/active-occasion-options-service";

type Review = {
  agreements: BookingAgreementDisclosure[];
  refundPolicies: CustomerRefundPolicyDisclosureResult;
};

export function MediaPackageBooking({
  providerId, serviceId, serviceName, revision, occasions, defaultLocation, guestCapacity, providerName, authenticated, returnTo, requestClassName,
}: {
  providerId: string;
  serviceId: string;
  serviceName: string;
  revision: number;
  occasions: readonly ActiveOccasionOption[];
  defaultLocation: string;
  guestCapacity: string | null;
  providerName: string;
  authenticated: boolean;
  returnTo: string;
  requestClassName: string;
}) {
  const locationId = useId();
  const addressId = useId();
  const locationHintId = useId();
  const addressCountId = useId();
  const [eventLocation, setEventLocation] = useState(defaultLocation);
  const [dialogContainer, setDialogContainer] = useState<HTMLDivElement | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [eventAddress, setEventAddress] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [coordinates, setCoordinates] = useState<EventMapCoordinates | null>(null);
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [agreementKey, setAgreementKey] = useState<string | null>(null);
  const [refundAccepted, setRefundAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bookingId, setBookingId] = useState("");
  const attempt = useRef<{eventKey: string; id: string} | null>(null);
  const inFlight = useRef(false);

  const accepted = review !== null && agreementKey === review.agreements[0].agreementKey &&
    (!review.refundPolicies.acknowledgementsRequired || refundAccepted);

  function clearReview() {
    setReview(null);
    setAgreementKey(null);
    setRefundAccepted(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || (review && !accepted)) return;
    const fields = new FormData(event.currentTarget);
    const field = (name: string) => String(fields.get(name) ?? "").trim();
    const details = {
      eventType: field("eventType"), eventDate: field("eventDate"),
      eventTime: field("eventTime"), eventEndTime: field("eventEndTime"),
      guestCount: Number(field("guestCount")), eventLocation: field("eventLocation"),
      eventAddress: field("eventAddress"), specialRequest: field("specialRequest"),
    };

    if (!details.eventDate) {
      setError("Select an event date.");
      return;
    }
    if (!details.eventLocation || !details.eventAddress) {
      setError("Enter the event location and complete address.");
      return;
    }
    if (details.eventEndTime <= details.eventTime) {
      setError("Choose an end time after the start time.");
      return;
    }
    const eventKey = JSON.stringify(details);
    if (review && attempt.current?.eventKey !== eventKey) {
      clearReview();
      setError("The event details changed. Review the booking again.");
      return;
    }
    if (attempt.current?.eventKey !== eventKey) {
      attempt.current = {eventKey, id: crypto.randomUUID()};
    }
    const submission = {
      schemaVersion: 2, clientRequestId: attempt.current.id, event: details,
      selections: [{kind: "marketplace_service", providerId, serviceId,
        expectedRevision: revision, configuration: details}],
    };
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const {auth, functions, initializeBrowserAppCheck} = await import("@/lib/firebase/client");
      await auth.authStateReady();
      if (!auth.currentUser) throw new Error("Sign in to your customer account to book this package.");
      initializeBrowserAppCheck();
      if (!review) {
        const {data} = await httpsCallable<unknown, Omit<Review, "agreements"> & {agreements: unknown}>(functions, "getMultiProviderBookingDisclosures")({submission});
        const agreements = parseBookingPaymentAgreements(data.agreements);
        const {refundPolicies} = data;
        if (agreements.length !== 1 || agreements[0].providerId !== providerId ||
            typeof refundPolicies?.acknowledgementsRequired !== "boolean" ||
            !Array.isArray(refundPolicies.policies) ||
            refundPolicies.policies.length !== (refundPolicies.acknowledgementsRequired ? 1 : 0) ||
            refundPolicies.policies.some((policy) => policy.providerId !== providerId)) {
          throw new Error("The package terms could not be loaded.");
        }
        setMapOpen(false);
        setReview({agreements, refundPolicies});
      } else {
        const {data} = await httpsCallable<unknown, {bookingId: string}>(functions, "submitMultiProviderBookingRequest")({
          submission,
          agreementAcknowledgements: review.agreements.map(({providerId, agreementKey}) => ({providerId, agreementKey})),
          policyAcknowledgements: review.refundPolicies.acknowledgementsRequired
            ? review.refundPolicies.policies.map(({providerId, effectivePolicyKey}) => ({providerId, effectivePolicyKey}))
            : [],
        });
        setBookingId(data.bookingId);
      }
    } catch (failure) {
      if (failure instanceof FirebaseError && failure.code === "functions/failed-precondition") {
        const {details} = failure as FirebaseError & {details?: {reason?: string}};
        if (details?.reason?.startsWith("REFUND_POLICY_") ||
            details?.reason?.startsWith("BOOKING_PAYMENT_AGREEMENT_") ||
            details?.reason === "SUBMISSION_TERMINALLY_REJECTED") {
          attempt.current = null;
          clearReview();
        }
      }
      setError(failure instanceof Error ? failure.message : "The booking request could not be processed. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const requestLabel = <>
    Customize &amp; request
    <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
  </>;

  if (!authenticated) {
    return <CustomerAuthLink className={requestClassName}
      returnTo={returnTo} href={`/login?next=${encodeURIComponent(returnTo)}`}>
      {requestLabel}
    </CustomerAuthLink>;
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (inFlight.current) return;
      setOpen(nextOpen);
      if (!nextOpen && !bookingId) {
        clearReview();
        setError("");
        setMapOpen(false);
        setEventLocation(defaultLocation);
        setEventAddress("");
        setEventDate("");
        setCoordinates(null);
      }
    }}>
      <DialogTrigger asChild><button type="button" className={requestClassName}>{requestLabel}</button></DialogTrigger>
      <DialogContent ref={setDialogContainer} className="max-w-3xl gap-0 overflow-visible p-0"
        onEscapeKeyDown={(event) => {
          if (dialogContainer?.querySelector("[data-provider-calendar-popup]")) event.preventDefault();
        }}>
        <div className="grid max-h-[min(90vh,48rem)] gap-5 overflow-y-auto rounded-dialog p-6">
          <DialogHeader>
            <DialogTitle className="break-words">{serviceName}</DialogTitle>
            <DialogDescription>{bookingId ? "The provider will review your request."
              : "Enter your event details and review the terms before sending your request."}</DialogDescription>
          </DialogHeader>
          {bookingId ? (
            <Link className="font-bold text-primary underline" href={`/customer/bookings/${encodeURIComponent(bookingId)}`}>
              View booking request
            </Link>
          ) : occasions.length === 0 ? (
            <p>Booking occasions are currently unavailable. Try again later.</p>
          ) : (
            <form className="grid gap-4" onSubmit={submit}>
              <div className={review ? "hidden" : "grid min-w-0 gap-4"}>
                <div>
                  <h3 className="text-lg font-extrabold">Event details</h3>
                  <p className="mt-1 text-sm text-feasta-text-secondary">
                    Add the schedule, guest count, and venue information for your celebration.
                  </p>
                </div>

                <label className="flex flex-wrap items-center gap-3 text-sm">
                  Event type
                  <select name="eventType" required defaultValue={occasions.length === 1 ? occasions[0].id : ""}
                    className="min-h-10 max-w-full rounded-md bg-card px-2 font-bold focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="" disabled>Select an event type</option>
                    {occasions.map(({id, label}) => <option key={id} value={id}>{label}</option>)}
                  </select>
                </label>

                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <div className="grid min-w-0 content-start gap-2">
                    <span className="text-sm font-bold">Event date</span>
                    <ProviderDatePicker providerId={providerId} value={eventDate} onChange={setEventDate}
                      planningOnly={false} revision={0} portalContainer={dialogContainer} />
                    <input type="hidden" name="eventDate" value={eventDate} />
                  </div>
                  <label className="grid min-w-0 gap-2 text-sm font-bold">
                    <span className="flex flex-wrap justify-between gap-x-2">
                      Number of guests
                      {guestCapacity && <span aria-hidden="true" className="font-normal text-feasta-text-secondary">{guestCapacity}</span>}
                    </span>
                    <Input name="guestCount" type="number" inputMode="numeric" className="font-normal" min={1} max={10000}
                      placeholder="Enter guest count" required />
                  </label>
                  <label className="grid min-w-0 gap-2 text-sm font-bold">
                    Start time
                    <Input name="eventTime" type="time" className="font-normal" required />
                  </label>
                  <label className="grid min-w-0 gap-2 text-sm font-bold">
                    End time
                    <Input name="eventEndTime" type="time" className="font-normal" required />
                  </label>
                </div>

                <div className="rounded-xl border border-feasta-border-soft bg-feasta-canvas px-4 py-3 text-sm">
                  <p className="font-bold">Provider availability</p>
                  <p className="mt-1 text-feasta-text-secondary">
                    Availability for {providerName} is checked when you review your booking.
                  </p>
                </div>

                <div className="grid gap-2 text-sm font-bold">
                  <span className="flex flex-wrap justify-between gap-x-2">
                    <label htmlFor={locationId}>Event location</label>
                    <span id={locationHintId} className="font-normal text-feasta-text-secondary">City, municipality, or venue</span>
                  </span>
                  <Input id={locationId} name="eventLocation" className="font-normal" value={eventLocation} maxLength={180} placeholder="e.g. Ormoc City"
                    aria-describedby={locationHintId} onChange={(event) => setEventLocation(event.target.value)} required />
                </div>

                <div className="grid gap-2 text-sm font-bold">
                  <span className="flex flex-wrap justify-between gap-x-2">
                    <label htmlFor={addressId}>Complete event address</label>
                    <span id={addressCountId} className="font-normal text-feasta-text-secondary">{eventAddress.length}/500 characters</span>
                  </span>
                  <Textarea id={addressId} name="eventAddress" value={eventAddress} maxLength={500} rows={2} className="min-h-20 font-normal"
                    placeholder="Street, barangay, landmark, venue details..." aria-describedby={addressCountId}
                    onChange={(event) => setEventAddress(event.target.value)} required />
                </div>

                <Button type="button" variant="secondary" className="w-full" aria-expanded={mapOpen}
                  onClick={() => setMapOpen((current) => !current)}>
                  {mapOpen ? "Close map" : "Choose on map"}
                </Button>
                {mapOpen && (
                  <CustomerEventAddressMap coordinates={coordinates} onCancel={() => setMapOpen(false)}
                    onConfirm={(location) => {
                      setEventAddress(location.address.slice(0, 500));
                      setEventLocation(([location.city, location.province].filter(Boolean).join(", ") || location.address).slice(0, 180));
                      setCoordinates({latitude: location.latitude, longitude: location.longitude});
                      setMapOpen(false);
                    }} />
                )}

                <label className="grid gap-2 text-sm font-bold">
                  Special requests (optional)
                  <Textarea name="specialRequest" maxLength={1000} rows={2} className="min-h-20 font-normal" />
                </label>
              </div>
              {review && (
                <>
                  {review.refundPolicies.policies.map((policy) => {
                    const beforeBps =
                      policy.rules.find((rule) => rule.stage === "preparation_not_started")
                        ?.refundBasisPoints ?? 0;
                    return (
                      <section key={policy.providerId} className="grid gap-2 rounded-xl border border-border p-4 text-sm"
                        aria-label="Cancellation and refunds">
                        <h3 className="font-extrabold">Cancellation and refunds</h3>
                        {policy.cancellationCutoff ? (
                          <PreBookingCancellationCutoffNotice
                            cutoff={policy.cancellationCutoff}
                            eventDate={eventDate}
                          />
                        ) : null}
                        <p>Before cancellation cutoff · {beforeBps / 100}% refundable</p>
                        <p>After cancellation cutoff · 0% refundable (Cancellation closed)</p>
                        {policy.terms && <p className="whitespace-pre-wrap break-words">{policy.terms}</p>}
                        <label className="flex items-start gap-2">
                          <input type="checkbox" className="mt-1" checked={refundAccepted} disabled={busy}
                            onChange={(change) => setRefundAccepted(change.target.checked)} />
                          I agree to the cancellation and refund policy.
                        </label>
                      </section>
                    );
                  })}
                  <BookingPaymentAgreementReview
                    agreements={review.agreements}
                    acknowledged={agreementKey === null ? {} : {[providerId]: agreementKey}}
                    onChange={(id, key) => {
                      if (id === providerId && !inFlight.current) setAgreementKey(key);
                    }}
                    error={null}
                    onReload={clearReview}
                  />
                </>
              )}
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                {review && <Button type="button" variant="secondary" disabled={busy} onClick={() => {
                  clearReview();
                  setError("");
                }}>Edit details</Button>}
                <Button type="submit" disabled={busy || (review !== null && !accepted)}>
                  {busy ? "Please wait…" : review ? "Send booking request" : "Review booking"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
