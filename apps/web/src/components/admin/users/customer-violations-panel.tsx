"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {loadCustomerViolations, reverseCustomerViolation,
  type CustomerViolationHistory} from "@/lib/admin/users/customer-violation-client";

const format = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
}).format(new Date(value)) : "Not available";
const button = "min-h-10 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50";

export function CustomerViolationsPanel({customerId}: {customerId: string}) {
  const [history, setHistory] = useState<CustomerViolationHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const page = pages[pages.length - 1];
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setBusy(true); setError(null);
    try {
      const data = await loadCustomerViolations(customerId, page);
      if (generation.current === current) setHistory(data);
    }
    catch { if (generation.current === current) setError("Could not load violations. Refresh to retry."); }
    finally { if (generation.current === current) setBusy(false); }
  }, [customerId, page]);
  useEffect(() => {
    const counter = generation;
    const current = ++counter.current;
    loadCustomerViolations(customerId, page)
      .then(data => {if (counter.current === current) {setHistory(data); setError(null);}})
      .catch(() => {if (counter.current === current) setError("Could not load violations. Refresh to retry.");})
      .finally(() => {if (counter.current === current) setBusy(false);});
    return () => {counter.current++;};
  }, [customerId, page]);

  async function reverse(strikeId: string) {
    if (!history) return;
    setBusy(true); setError(null);
    try {
      await reverseCustomerViolation({customerId, strikeId, reason: reasons[strikeId] ?? "", expectedRevision: history.revision});
      await refresh();
      setReasons(previous => ({...previous, [strikeId]: ""}));
    } catch (e) { setError(e instanceof Error ? e.message : "Reversal failed."); }
    finally { setBusy(false); }
  }

  return <section aria-label="Customer booking violations" className="grid gap-3 rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-bold">Booking violations</h4>
      <button className={button} disabled={busy} onClick={refresh}>Refresh violations</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!history && !error && <p role="status">Loading violation history…</p>}
    {history && <>
      <p className="text-sm font-semibold">{history.activeCount} / 3 active strikes · {history.status.replaceAll("_", " ")}</p>
      <p className="text-sm text-muted-foreground">Rolling 30-day observation: {format(history.observationStart)} – {format(history.observationEnd)} (Manila)</p>
      <p className="text-sm">{history.restrictionExpiresAt ? `New bookings restricted until ${format(history.restrictionExpiresAt)} (Manila).` : "No active booking restriction."}</p>
      <p className="text-xs text-muted-foreground">Consumed strikes remain in the audit history and cannot trigger another restriction. Existing bookings, permitted payments, messages and support remain available.</p>
      <p className="text-xs text-muted-foreground">History is ordered by issuance time, newest first. Occurred is the original payment deadline; issued is when the violation was recorded.</p>
      <ul className="grid gap-3">
        {history.records.map(record => <li key={record.id} className="grid gap-2 rounded-lg border border-border p-3 text-sm">
          <p className="break-all font-semibold">Booking {record.mainEventId}</p>
          <p className="break-all text-xs">Provider requests: {record.providerRequestIds.join(", ")}</p>
          <p>{record.reason === "no_attempt_original_deadline_elapsed" ? "Verified unpaid expiration without a payment attempt" : record.reason}</p>
          <p>Occurred: {format(record.occurredAt)} · Issued: {format(record.issuedAt)} (Manila)</p>
          {record.consumedCycleId && <p className="break-all text-xs">Consumed in restriction cycle: {record.consumedCycleId}</p>}
          {record.restrictionStartedAt && <p>Restriction cycle: {format(record.restrictionStartedAt)} – {format(record.restrictionExpiresAt ?? null)} (Manila)</p>}
          {record.reversedAt ? <p>Reversed {format(record.reversedAt)} by {record.reversedBy}. Private audit reason: {record.reversalReason}</p> :
            <form className="grid gap-2" onSubmit={e => {e.preventDefault(); void reverse(record.id);}}>
              <label htmlFor={`reversal-${record.id}`}>Private reversal reason</label>
              <textarea id={`reversal-${record.id}`} className="rounded-lg border border-border p-2" required minLength={5} maxLength={1000}
                value={reasons[record.id] ?? ""} onChange={e => setReasons({...reasons, [record.id]: e.target.value})} />
              <button className={button} disabled={busy || (reasons[record.id] ?? "").trim().length < 5}>Reverse incorrect strike</button>
            </form>}
        </li>)}
      </ul>
      {history.records.length === 0 && <p className="text-sm">No violation records.</p>}
      <div className="flex gap-2">
        {page && <>
          <button className={button} disabled={busy} onClick={() => {setBusy(true); setHistory(null); setPages([null]);}}>First history page</button>
          <button className={button} disabled={busy} onClick={() => {setBusy(true); setHistory(null); setPages(previous => previous.slice(0, -1));}}>Previous history page</button>
        </>}
        {history.nextCursor && <button className={button} disabled={busy} onClick={() => {setBusy(true); setHistory(null); setPages(previous => [...previous, history.nextCursor]);}}>More history</button>}
      </div>
    </>}
  </section>;
}
