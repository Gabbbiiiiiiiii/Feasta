"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {loadCustomerViolations, reverseCustomerViolation,
  type CustomerViolationHistory} from "@/lib/admin/users/customer-violation-client";

const format = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
}).format(new Date(value)) : "Not available";
const button = "min-h-10 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

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

  const restricted = history?.status === "restricted";
  const standing = history ? ({clear: "Good booking standing", warning: "Booking warning", final_warning: "Final booking warning", restricted: "Booking restriction active"}[history.status] ?? "Booking standing unavailable") : null;
  return <section aria-label="Customer booking violations" className="grid min-w-0 gap-5 rounded-xl border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="grid gap-2"><h4 className="font-bold">Booking Violations</h4>
        {standing && <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${restricted ? "bg-red-100 text-red-700" : history && history.activeCount > 0 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"}`}>{standing}</span>}</div>
      <button className={button} disabled={busy} onClick={refresh}>Refresh violations</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {busy && <p role="status" className="text-sm text-muted-foreground">{history ? "Updating violations..." : "Loading violation history..."}</p>}
    {history && <>
      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-label="Active strikes" className="min-w-0 rounded-xl border border-border bg-muted/20 p-4">
          <h5 className="text-sm font-semibold text-muted-foreground">Active strikes</h5>
          <p className="mt-2 text-2xl font-bold tabular-nums">{history.activeCount} <span className="text-base text-muted-foreground">/ 3</span></p>
          <div role="meter" aria-label="Active strikes" aria-valuemin={0} aria-valuemax={3} aria-valuenow={history.activeCount} className="my-3 flex gap-1.5">
            {[1, 2, 3].map(segment => <span key={segment} className={`h-2 flex-1 rounded-full ${segment <= history.activeCount ? "bg-primary" : "bg-muted"}`} />)}
          </div>
          <p className="text-xs text-muted-foreground">Rolling 30-day window</p>
          <p className="mt-1 text-xs text-muted-foreground">{format(history.observationStart)} to {format(history.observationEnd)} (Manila)</p>
        </section>
        <section aria-label="New booking access" className="min-w-0 rounded-xl border border-border bg-muted/20 p-4">
          <h5 className="text-sm font-semibold text-muted-foreground">New booking access</h5>
          <p className={`mt-2 w-fit rounded-full px-2.5 py-1 text-sm font-semibold ${restricted ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{restricted ? "Restricted" : "Allowed"}</p>
          <p className="mt-3 text-sm">{restricted ? `Restricted until ${format(history.restrictionExpiresAt)} (Manila).` : "No active booking restriction."}</p>
          <p className="mt-2 text-xs text-muted-foreground">Three strikes in 30 days trigger an automatic seven-day restriction on new bookings.</p>
        </section>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">This booking-only policy is separate from Restrict account access. Existing bookings, permitted payments, messages and support remain available.</p>
      <div className="grid gap-1">
        <h5 className="font-bold">Violation History</h5>
        <p className="text-xs text-muted-foreground">Newest recorded first. All dates are in Manila time. The payment deadline is when the violation occurred; recorded is when it was issued.</p>
        <p className="text-xs text-muted-foreground">Strikes used in a restriction stay in history and cannot trigger another restriction.</p>
      </div>
      <ul className="grid gap-3">
        {history.records.map(record => <li key={record.id} className="grid min-w-0 gap-2 break-words rounded-lg border border-border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 break-all font-semibold">Booking {record.mainEventId}</p>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{record.reversedAt ? "Reversed" : record.consumedCycleId ? "Used in restriction" : "Recorded"}</span>
          </div>
          <p className="break-all text-xs">Provider requests: {record.providerRequestIds.join(", ")}</p>
          <p>{record.reason === "no_attempt_original_deadline_elapsed" ? "Payment deadline passed without a payment attempt" : record.reason}</p>
          <p>Payment deadline: {format(record.occurredAt)} · Recorded: {format(record.issuedAt)} (Manila)</p>
          {record.consumedCycleId && <p className="break-all text-xs">Restriction cycle ID: {record.consumedCycleId}</p>}
          {record.restrictionStartedAt && <p>Restriction cycle: {format(record.restrictionStartedAt)} – {format(record.restrictionExpiresAt ?? null)} (Manila)</p>}
          {record.reversedAt ? <p>Reversed {format(record.reversedAt)} by {record.reversedBy}. Private audit reason: {record.reversalReason}</p> :
            <form className="grid gap-2" onSubmit={e => {e.preventDefault(); void reverse(record.id);}}>
              <label htmlFor={`reversal-${record.id}`}>Private reversal reason</label>
              <p className="text-xs text-muted-foreground">Required: 5 to 1,000 characters. Explain why this strike is incorrect.</p>
              <textarea id={`reversal-${record.id}`} className="min-h-20 w-full rounded-lg border border-border bg-background p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" required minLength={5} maxLength={1000}
                value={reasons[record.id] ?? ""} onChange={e => setReasons({...reasons, [record.id]: e.target.value})} />
              <button className={button} disabled={busy || (reasons[record.id] ?? "").trim().length < 5}>Reverse incorrect strike</button>
            </form>}
        </li>)}
      </ul>
      {history.records.length === 0 && <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center"><p className="font-semibold">No booking violations recorded</p><p className="mt-1 text-sm text-muted-foreground">Any future booking violations will appear here for review.</p></div>}
      <div className="flex flex-wrap gap-2">
        {page && <>
          <button className={button} disabled={busy} onClick={() => {setBusy(true); setHistory(null); setPages([null]);}}>First history page</button>
          <button className={button} disabled={busy} onClick={() => {setBusy(true); setHistory(null); setPages(previous => previous.slice(0, -1));}}>Previous history page</button>
        </>}
        {history.nextCursor && <button className={button} disabled={busy} onClick={() => {setBusy(true); setHistory(null); setPages(previous => [...previous, history.nextCursor]);}}>More history</button>}
      </div>
    </>}
  </section>;
}
