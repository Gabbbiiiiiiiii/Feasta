"use client";

import {useEffect, useState} from "react";
import {ShieldAlert} from "lucide-react";
import {Button} from "@/components/ui/button";
import {
  loadCustomerBookingStanding,
  type CustomerBookingStanding as Standing,
} from "@/lib/customer/bookings/customer-booking-standing-client";

const manilaDate = (value: string) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "long", timeStyle: "long", timeZone: "Asia/Manila",
}).format(new Date(value));

export function CustomerBookingStanding() {
  const [standing, setStanding] = useState<Standing | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      const requestedAt = performance.now();
      try {
        const data = await loadCustomerBookingStanding();
        if (disposed) return;
        clearTimeout(expiryTimer);
        const remaining = data.restrictionExpiresAt === null ? null :
          Date.parse(data.restrictionExpiresAt) - Date.parse(data.serverTime) -
            (performance.now() - requestedAt);
        // Never keep displaying an elapsed restriction or infer clear standing from it.
        if (data.status === "restricted" && remaining !== null && remaining <= 0) {
          setStanding(null);
          setUnavailable(true);
        } else {
          setStanding(data);
          setUnavailable(false);
          if (data.status === "restricted" && remaining !== null) {
            expiryTimer = setTimeout(() => {
              setStanding(null);
              setLoading(true);
              void refresh();
            }, Math.min(remaining, 2_147_483_647));
          }
        }
      } catch {
        if (!disposed) {setStanding(null); setUnavailable(true);}
      } finally {
        inFlight = false;
        if (!disposed) setLoading(false);
      }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      clearInterval(interval);
      clearTimeout(expiryTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [attempt]);

  if (loading) return <p role="status" className="text-sm text-muted-foreground">Checking booking standing...</p>;
  if (unavailable || !standing) return (
    <div role="status" className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <p>Booking standing is unavailable. It will be checked when you submit a new booking.</p>
      <Button variant="secondary" size="compact" onClick={() => {setLoading(true); setAttempt(value => value + 1);}}>Retry standing check</Button>
    </div>
  );
  if (standing.status === "clear") return null;
  const restricted = standing.status === "restricted";
  const finalWarning = standing.status === "final_warning";
  return (
    <section aria-label="Your booking standing" aria-live="polite" className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="grid min-w-0 gap-2 text-sm leading-relaxed">
          <h2 className="font-semibold text-foreground">{restricted ? "New bookings temporarily restricted" : finalWarning ? "Final booking warning" : "First booking warning"}</h2>
          {restricted ? <>
            <p>Three qualifying unpaid booking strikes triggered a seven-day restriction on new bookings.</p>
            <p>{standing.restrictionExpiresAt ? <>Restriction ends <time dateTime={standing.restrictionExpiresAt}>{manilaDate(standing.restrictionExpiresAt)}</time> (Manila time).</> : "The restriction end time is unavailable. Contact support for help."}</p>
          </> : <>
            <p>You have {standing.activeCount} of 3 active strikes in the rolling 30-day period. {finalWarning ? "One more qualifying strike triggers a seven-day restriction on new bookings." : "Three qualifying strikes trigger a seven-day restriction on new bookings."}</p>
            <p>Pay within the payment window shown on your booking, or use a permitted cancellation to avoid an unpaid booking strike.</p>
          </>}
          <p className="text-muted-foreground">Existing bookings, permitted payments, messages, and support remain available.</p>
        </div>
      </div>
    </section>
  );
}
