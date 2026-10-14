import "server-only";
import {FieldPath, type QueryDocumentSnapshot, type DocumentData} from "firebase-admin/firestore";
import {requireApprovedProvider} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import {dashboardEventStart, dashboardMatches, storedDate} from "./provider-dashboard-projection";
import type {ProviderDashboardData, ProviderDashboardItem, ProviderDashboardView} from "./provider-dashboard-types";

/** Walk all provider-scoped pages; counts never use a recent-record cap. */
export async function getProviderDashboardRecords(providerId: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(providerId)) throw new Error("The provider account is unavailable.");
  const documents: QueryDocumentSnapshot<DocumentData>[] = [];
  const base = adminDb.collection("providerRequests").where("providerId", "==", providerId).orderBy(FieldPath.documentId());
  let cursor: QueryDocumentSnapshot<DocumentData> | undefined;
  for (;;) {
    const page = await (cursor ? base.startAfter(cursor) : base).limit(500).get();
    documents.push(...page.docs);
    if (page.docs.length < 500) break;
    cursor = page.docs.at(-1);
  }
  const ids = [...new Set(documents.map(doc => doc.data().mainEventId ?? doc.data().bookingId)
    .filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,160}$/u.test(id)))];
  const events = new Map<string, DocumentData>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = await adminDb.getAll(...ids.slice(offset, offset + 100).map(id => adminDb.collection("mainEvents").doc(id)));
    for (const event of batch) if (event.exists) events.set(event.id, event.data()!);
  }
  const matches = (document: QueryDocumentSnapshot<DocumentData>, view: ProviderDashboardView) => {
    const data = document.data();
    const event = events.get(data.mainEventId ?? data.bookingId) ?? null;
    if (data.providerId !== providerId || (data.providerRequestId != null && data.providerRequestId !== document.id) ||
      (Array.isArray(event?.providerRequestIds) && !event.providerRequestIds.includes(document.id))) return false;
    return dashboardMatches(view, data, event, now);
  };
  return {documents, matches};
}

export async function getProviderDashboardData(): Promise<ProviderDashboardData> {
  const account = await requireApprovedProvider();
  const {documents, matches} = await getProviderDashboardRecords(account.providerId!);
  const select = (view: ProviderDashboardView) => documents.filter(doc => matches(doc, view));
  const upcoming = select("upcoming").sort((a, b) => dashboardEventStart(a.data())!.getTime() - dashboardEventStart(b.data())!.getTime() || a.id.localeCompare(b.id));
  const recent = [...documents].sort((a, b) => (storedDate(b.data().createdAt)?.getTime() ?? 0) - (storedDate(a.data().createdAt)?.getTime() ?? 0) || a.id.localeCompare(b.id));
  return {summary: {new: select("new").length, upcoming: upcoming.length, payment: select("payment").length, completed: select("completed").length},
    upcomingEvents: upcoming.slice(0, 5).map(item), recentRequests: recent.slice(0, 5).map(item)};
}
function item(document: QueryDocumentSnapshot<DocumentData>): ProviderDashboardItem {
  const data = document.data();
  const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
  return {id: document.id, customer: [text(data.customerFirstName), text(data.customerLastName)].filter(Boolean).join(" ") || text(data.customerName) || "FEASTA customer",
    event: text(data.eventType)?.replaceAll("_", " ") || "Event", packageName: text(data.packageName) ?? text(data.serviceName),
    eventAt: dashboardEventStart(data)?.toISOString() ?? null, status: text(data.status) ?? "unknown"};
}
