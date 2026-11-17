"use server";

import {Timestamp, type Query} from "firebase-admin/firestore";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";
import {normalizeLedgerRow} from "@/lib/admin/reports/admin-financial-report-service";
import {getServiceCategoryOptions} from "@/lib/service-categories/service-category-service";
import {REPORT_TITLES, type DedicatedReport, type ReportFilters} from "@/lib/admin/reports/dedicated-report-types";
import {accountState, inPeriod, iso, money, person, sumLedger, text, validateReportFilters, type ReportRecord} from "@/lib/admin/reports/dedicated-report-domain";

async function records(query: Query): Promise<ReportRecord[]> {
  const snapshot = await query.limit(5001).get();
  if (snapshot.size > 5000) throw new Error("The source dataset exceeds the 5,000-record interactive report limit. Contact support; no partial report was generated.");
  return snapshot.docs.map((doc) => ({id: doc.id, data: doc.data()}));
}
async function ledger(query: Query) {
  const snapshot = await query.limit(5001).get();
  if (snapshot.size > 5000) throw new Error("More than 5,000 financial records match. Choose a shorter period.");
  return snapshot.docs.map((doc) => {
    const row = normalizeLedgerRow(doc);
    if (!row) throw new Error("A financial record needs reconciliation. The report was stopped to avoid incomplete totals.");
    return row;
  });
}
export async function loadDedicatedReport(filters: ReportFilters): Promise<DedicatedReport> {
  const admin = await requireAdmin();
  validateReportFilters(filters);
  const [profile, categories] = await Promise.all([
    adminDb.collection("users").doc(admin.uid).get(), getServiceCategoryOptions(),
  ]);
  if (filters.category !== "all" && !categories.some((category) => category.code === filters.category)) throw new Error("Choose a valid service category.");
  const categoryNames = new Map<string, string>(categories.map((category) => [category.code, category.name]));
  const now = new Date().toISOString();
  const report: DedicatedReport = {
    title: REPORT_TITLES[filters.type], generatedAt: now,
    generatedBy: person(profile.data() || {}), period: "", headers: [], rows: [], note: "", summary: [],
  };
  const financial = filters.type === "sales" || filters.type === "demand";
  const directory = filters.type === "directory";
  report.period = [financial ? `${filters.startDate} to ${filters.endDate} (Philippine Standard Time, UTC+08:00)` : "Current records",
    filters.type !== "demand" && !(directory && filters.directory === "customers") ? `Category: ${categoryNames.get(filters.category) || "All categories"}` : "",
    filters.type !== "quality" ? `Municipality: ${filters.municipality === "all" ? "All recorded municipalities" : filters.municipality}` : "",
    filters.type === "quality" ? `Rating: ${filters.rating === "all" ? "All ratings" : "Below 3.0 stars"}; complaint status: ${filters.complaintStatus.replaceAll("_", " ")}` : "",
    directory ? `Account status: ${filters.status}; directory: ${filters.directory === "providers" ? "Registered Vendors" : "Registered Customers"}` : "",
  ].filter(Boolean).join(" | ");
  const users = new Map<string, Record<string, unknown>>(filters.type === "demand" ? [] : (await records(adminDb.collection("users").select("firstName", "lastName", "displayName", "role", "isActive", "isBlocked", "accountStatus", "email", "phoneNumber", "createdAt"))).map((row) => [row.id, row.data]));
  const locationMatches = (city: unknown) => filters.municipality === "all" || text(city, "").toLowerCase() === filters.municipality.toLowerCase();
  const date = (value: unknown) => iso(value) ? new Date(iso(value)).toLocaleDateString("en-PH", {timeZone: "Asia/Manila"}) : "Unavailable";
  if (directory && filters.directory === "customers") {
    const [events, customerProfiles] = await Promise.all([
      records(adminDb.collection("mainEvents").select("customerId", "status")),
      records(adminDb.collection("customers").select("city")),
    ]);
    const customerCities = new Map(customerProfiles.map(({id, data}) => [id, text(data.city, "")]));
    const counts = new Map<string, number>();
    for (const {data} of events) if (data.status !== "draft") counts.set(text(data.customerId), (counts.get(text(data.customerId)) || 0) + 1);
    report.title = "Registered Customers Directory";
    report.headers = ["Full Name", "Email / Phone Number", "Municipality", "Total Bookings Made", "Date Joined", "Status"];
    report.rows = [...users].filter(([id,user]) => user.role === "customer" && locationMatches(customerCities.get(id)) && (filters.status === "all" || accountState(user) === filters.status))
      .map(([id,user]) => {
        return [person(user), `${text(user.email)} / ${text(user.phoneNumber)}`, customerCities.get(id) || "Unavailable", counts.get(id) || 0, date(user.createdAt), accountState(user)];
      }).sort((a,b) => String(a[0]).localeCompare(String(b[0])));
    report.note = "Current customer accounts. Bookings count submitted events, including later cancellations; draft events are excluded.";
    return report;
  }
  const providers = filters.type === "demand" ? [] : await records(adminDb.collection("providers").select("businessName", "ownerId", "ownerFirstName", "ownerLastName", "serviceCategories", "providerCategory", "city", "createdAt", "isActive", "isSuspended", "isDeleted", "verificationStatus", "ratingAverage", "reviewCount"));
  const codes = (data: Record<string, unknown>) => Array.isArray(data.serviceCategories) && data.serviceCategories.length ? data.serviceCategories.filter((value): value is string => typeof value === "string") : [text(data.providerCategory, "")].filter(Boolean);
  const names = (data: Record<string, unknown>, activeOnly = false) => codes(data).filter((code) => !activeOnly || categories.some((category) => category.code === code && category.status === "active")).map((code) => categoryNames.get(code) || "Unavailable category").join(", ") || "Unassigned";
  const matches = (data: Record<string, unknown>) => (filters.category === "all" || codes(data).includes(filters.category)) && locationMatches(data.city);
  const owner = (data: Record<string, unknown>) => users.get(text(data.ownerId, "")) || {};
  if (directory) {
    report.title = "Registered Vendors Directory";
    report.headers = ["Business Name", "Owner Name", "Active Service Categories", "Municipality", "Date Joined", "Status"];
    report.rows = providers.filter(({data}) => matches(data) && (filters.status === "all" || accountState(owner(data), data) === filters.status))
      .map(({data}) => [text(data.businessName, "Unnamed vendor"), person(owner(data)) === "Unnamed account" ? [text(data.ownerFirstName, ""), text(data.ownerLastName, "")].filter(Boolean).join(" ") || "Unavailable" : person(owner(data)), names(data, true), text(data.city), date(data.createdAt), accountState(owner(data), data)])
      .sort((a,b) => String(a[0]).localeCompare(String(b[0])));
    report.note = "Current vendor directory. Categories show active catalog entries. Account and verification states are preserved; inactive accounts are not deleted.";
    return report;
  }
  if (filters.type === "quality") {
    let query: Query = adminDb.collection("complaints");
    if (filters.complaintStatus !== "all") query = query.where("status", "==", filters.complaintStatus);
    const complaints = await records(query.select("providerId"));
    const counts = new Map<string, number>();
    for (const {data} of complaints) counts.set(text(data.providerId), (counts.get(text(data.providerId)) || 0) + 1);
    report.headers = ["Business Name", "Service Category", "Average Star Rating", "Total Reviews", "Total Complaints / Disputes", "Account Status"];
    report.rows = providers.filter(({data}) => matches(data) && (filters.rating === "all" || (typeof data.reviewCount === "number" && data.reviewCount > 0 && typeof data.ratingAverage === "number" && data.ratingAverage < 3)))
      .filter(({id}) => filters.complaintStatus === "all" || (counts.get(id) || 0) > 0)
      .sort((a,b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || text(a.data.businessName).localeCompare(text(b.data.businessName)))
      .map(({id,data}) => [text(data.businessName, "Unnamed vendor"), names(data), typeof data.reviewCount === "number" && data.reviewCount > 0 && typeof data.ratingAverage === "number" ? data.ratingAverage.toFixed(2) : "Not yet rated", typeof data.reviewCount === "number" ? data.reviewCount : 0, counts.get(id) || 0, accountState(owner(data),data)]);
    report.note = "Current published-rating aggregates and complaint records. A selected complaint status limits counts and vendors to matching complaints. Reports do not establish vendor fault; unrated vendors are excluded from the below-3.0 filter.";
    return report;
  }
  if (filters.type === "sales") {
    const start = Timestamp.fromDate(new Date(`${filters.startDate}T00:00:00+08:00`));
    const end = Timestamp.fromMillis(Date.parse(`${filters.endDate}T00:00:00+08:00`) + 86400000);
    const [entries, requests] = await Promise.all([
      ledger(adminDb.collection("financialLedgerEntries").where("createdAt", ">=", start).where("createdAt", "<", end)),
      records(adminDb.collection("providerRequests").where("status", "==", "completed").select("providerId", "completedAt")),
    ]);
    const known = new Set(providers.map((provider) => provider.id));
    for (const row of entries) if (!known.has(row.providerId)) {providers.push({id: row.providerId, data: {businessName: "Unavailable vendor"}}); known.add(row.providerId);}
    const totals = providers.filter(({data}) => matches(data)).map(({id,data}) => ({data, ...sumLedger(entries.filter((row) => row.providerId === id)), completed: requests.filter((row) => row.data.providerId === id && inPeriod(row.data.completedAt, filters)).length}))
      .filter((row) => row.gross !== 0 || row.commission !== 0 || row.completed !== 0).sort((a,b) => b.gross - a.gross || text(a.data.businessName).localeCompare(text(b.data.businessName)));
    report.headers = ["Rank", "Business Name", "Service Category", "Completed Bookings", "Gross Sales (PHP)", "Deducted Platform Commission (PHP)"];
    report.rows = totals.map((row,index) => [index+1, text(row.data.businessName), names(row.data), row.completed, money(row.gross), money(row.commission)]);
    report.summary = [`Total Gross Sales: PHP ${money(totals.reduce((sum,row) => sum + row.gross, 0))}`, `Total Platform Commission Earned: PHP ${money(totals.reduce((sum,row) => sum + row.commission, 0))}`];
    report.note = "Gross sales are settled customer collections recorded in the period (including recorded VAT), before refunds. Commission is accrued less reversals in the period; VAT, withholding and cancellation fees are separate and are not added to commission. Completed bookings count completed provider requests by completion date. Categories and locations use current vendor profiles. Historical payments without ledger evidence are excluded.";
    return report;
  }
  const events = (await records(adminDb.collection("mainEvents").where("eventDate", ">=", filters.startDate).where("eventDate", "<=", filters.endDate).select("eventType", "city", "status"))).filter(({data}) => locationMatches(data.city) && !["draft", "cancelled", "expired"].includes(text(data.status, "")));
  const occasions = await records(adminDb.collection("occasions").select("label", "name"));
  const labels = new Map(occasions.map(({id,data}) => [id,text(data.label, text(data.name, "Unavailable occasion"))]));
  const builtIn: Record<string, string> = {wedding:"Wedding", birthday:"Birthday", debut:"Debut", baptism:"Baptism", anniversary:"Anniversary", reunion:"Reunion", corporate:"Corporate", graduation:"Graduation", other:"Other"};
  const entries = [];
  for (let index=0; index<events.length; index+=30) entries.push(...await ledger(adminDb.collection("financialLedgerEntries").where("mainEventId", "in", events.slice(index,index+30).map((event) => event.id))));
  const groups = new Map<string, {label: string; city: string; count: number; revenue: number}>();
  for (const {id,data} of events) {
    const label = labels.get(text(data.eventType)) || builtIn[text(data.eventType)] || "Unavailable occasion";
    const city = text(data.city);
    const key = JSON.stringify([label,city]);
    const group = groups.get(key) || {label,city,count:0,revenue:0};
    group.count++; group.revenue += sumLedger(entries.filter((row) => row.mainEventId === id)).net;
    groups.set(key,group);
  }
  report.headers = ["Event Type / Occasion", "Municipality", "Total Bookings", "Share (%)", "Total Revenue (PHP)"];
  report.rows = [...groups.values()].sort((a,b) => b.count-a.count || a.label.localeCompare(b.label)).map((row) => [row.label,row.city,row.count,(row.count/events.length*100).toFixed(2),money(row.revenue)]);
  report.summary = [`Total Bookings: ${events.length}`, `Total Revenue: PHP ${money(sumLedger(entries).net)}`];
  report.note = "Bookings are distinct non-draft, non-cancelled, non-expired events scheduled in the selected dates. Share uses the filtered booking total. Revenue is lifetime settled collections less completed refunds for those events, as of generation; it includes recorded VAT and is not platform earnings. Unpaid estimates are excluded.";
  return report;
}
