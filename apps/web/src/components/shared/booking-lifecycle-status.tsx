"use client";
import {useEffect, useState} from "react";
import {StatusBadge} from "./status-badge";
import {ENDED_REVIEW_MESSAGE, lifecycleLabel, type LifecycleEvidence} from "@/lib/presentation/booking-lifecycle";

export function useLifecycleNow(end?: number | null) {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timeout = end == null ? undefined : globalThis.setTimeout(update, Math.min(Math.max(end - Date.now(), 0), 2_147_483_647));
    const interval = globalThis.setInterval(update, 60_000);
    globalThis.addEventListener("focus", update);
    return () => {globalThis.clearTimeout(timeout); globalThis.clearInterval(interval); globalThis.removeEventListener("focus", update);};
  }, [end]);
  return now;
}
export function BookingLifecycleStatus({status, evidence, label}: {status: string; evidence?: LifecycleEvidence; label?: string}) {
  const now = useLifecycleNow(evidence?.end);
  return <StatusBadge status={status} label={lifecycleLabel(status, evidence, now) ?? label} />;
}
export function BookingLifecycleText({status, evidence, children, description = false}: {status: string; evidence?: LifecycleEvidence; children: React.ReactNode; description?: boolean}) {
  const now = useLifecycleNow(evidence?.end);
  const label = lifecycleLabel(status, evidence, now);
  if (description && label === "Booking review required") return <>{evidence?.end != null && now != null && now >= evidence.end ? ENDED_REVIEW_MESSAGE : "FEASTA needs to resolve a booking review before progression."}</>;
  if (description && label === "Awaiting completion") return <>The event has ended and is awaiting completion confirmation.</>;
  return <>{label ?? children}</>;
}
export function BookingLifecycleNotice({status, evidence}: {status: string; evidence?: LifecycleEvidence}) {
  const now = useLifecycleNow(evidence?.end);
  if (lifecycleLabel(status, evidence, now) !== "Booking review required" || evidence?.end == null || now == null || now < evidence.end) return null;
  return <div role="status"><p className="font-semibold">Booking review required</p><p>{ENDED_REVIEW_MESSAGE}</p></div>;
}
