"use client";

import Link from "next/link";
import {useState, type ReactNode} from "react";
import type {useCustomerEventListCloudAsync} from "@/lib/customer/event-list/use-customer-event-list-cloud-async";

type Cloud = ReturnType<typeof useCustomerEventListCloudAsync>;

/** Cloud status boundary around the original drawer presentation. */
export function CustomerEventListCloudDrawer({cloud, enabled = true, children}: {
  cloud: Cloud; enabled?: boolean; children?: ReactNode;
}) {
  const {document, status, error} = cloud.state;
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  async function retry() {
    if (busy) return;
    setBusy(true);
    try { await cloud.retryUncertainAsync(); } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : "Could not confirm your Event List change.");
    } finally { setBusy(false); }
  }
  if (!enabled) return children;
  const waitingEmpty = document?.entries.length === 0 && status !== "ready";
  return <>
    {error || failure ? <p role="alert" className="px-5 py-3 text-sm">{error ?? failure}</p> : null}
    {cloud.recovery?.status === "uncertain" ? <button type="button" disabled={busy}
      className="mx-5 rounded-lg border px-3 py-2 text-sm"
      onClick={() => void retry()}>Retry previous cloud save</button> : null}
    {status === "pending" || busy ? <p role="status" className="px-5 py-3 text-sm">Saving Event List. Waiting for server confirmation.</p> : null}
    {!document ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-10 text-center">
      <p role="status">{status === "missing"
        ? "Your cloud Event List has not been initialized. Open Review List to get started."
        : status === "error" ? "Your cloud Event List could not be verified."
        : "Loading your Event List from the server?"}</p>
      <Link href="/customer/event-list/review" className="mt-5 inline-flex rounded-full bg-primary px-5 py-3 text-white">Review List</Link>
    </div> : waitingEmpty ? <p role="status" className="p-5">Waiting for server-confirmed selections.</p> : <>
      <p role="status" className="shrink-0 px-5 pt-3 text-xs text-feasta-text-secondary">{status === "ready" ? "Event List verified with server"
        : status === "cached" ? "Connection pending. Showing previously server-confirmed selections." : ""}</p>
      {children}
    </>}
  </>;
}
