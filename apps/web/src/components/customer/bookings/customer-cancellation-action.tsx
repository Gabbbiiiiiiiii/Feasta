"use client";
import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button";
import {getCustomerProviderRequestCancellationOptions, type CustomerCancellationOptions} from "@/lib/customer/bookings/customer-cancellation-client";

/** Timers invalidate server eligibility; the device clock never grants permission. */
export function CustomerCancellationAction({providerRequestId, providerName, triggerId, onOpen}: {
  providerRequestId: string; providerName: string; triggerId: string; onOpen: () => void;
}) {
  const [options, setOptions] = useState<CustomerCancellationOptions | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let generation = 0;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      const current = ++generation;
      clearTimeout(timer);
      setLoading(true);
      try {
        const next = await getCustomerProviderRequestCancellationOptions(providerRequestId);
        if (!active || current !== generation) return;
        setOptions(next);
        const delay = next.cancellationAllowed && next.eligibilityExpiresInMs != null
          ? Math.min(Math.max(next.eligibilityExpiresInMs, 1), 60_000) : 60_000;
        timer = setTimeout(() => void refresh(), delay);
      } catch {
        if (!active || current !== generation) return;
        setOptions(null);
        timer = setTimeout(() => void refresh(), 60_000);
      } finally {if (active && current === generation) setLoading(false);}
    };
    const update = () => void refresh();
    void refresh();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {active = false; clearTimeout(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update);};
  }, [providerRequestId]);
  const ended = options?.reasonCode === "EVENT_ENDED";
  return <div className="grid gap-2 border-t border-border pt-4">
    {ended ? <div role="status"><p className="text-sm font-bold">Cancellation closed — event ended</p>
      <p className="text-xs leading-5 text-muted-foreground">New cancellation requests are no longer accepted. Existing requests continue through review. You can still Report an Issue and view booking history.</p></div> : null}
    <Button id={triggerId} variant="secondary" fullWidth disabled={loading}
      aria-label={ended ? `Cancellation status for ${providerName}'s service` : `Cancellation options for ${providerName}'s service`}
      onClick={onOpen}>{ended ? "View cancellation and refund status" : "Cancellation options"}</Button>
    {!ended ? <p className="text-xs leading-5 text-muted-foreground">Cancellation options depend on this service and event date.</p> : null}
  </div>;
}
