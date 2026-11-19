import type {ReactNode} from "react";
import Link from "next/link";
import {CalendarDays, CircleCheck, ClipboardList, Eye, Inbox, Search} from "lucide-react";
import {DetailFieldItem, DetailFieldList, SummaryCard} from "@/components/data";
import {Button} from "@/components/ui/button";
import {Timestamp, type DocumentData} from "firebase-admin/firestore";
import {usesDropOffTimeDisplay} from "@/lib/catering/catering-schedule";
import {walkInReferencePattern, readWalkInProvider} from "@/lib/provider/bookings/walk-in-booking-service";
import {CopyWalkInReference, WalkInStatusForm} from "./walk-in-status-form";

const pageSize = 20;
const peso = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
const manilaDate = new Intl.DateTimeFormat("en-PH", {dateStyle: "medium", timeZone: "Asia/Manila"});

export type WalkInSearch = {after?: string; reference?: string; query?: string; state?: string; dates?: string; saved?: string};

const path = "/provider/bookings/walk-in";

export async function WalkInBookingRecords({filters}: {filters: WalkInSearch}) {
  const provider = await readWalkInProvider();
  const {after, reference, query: searchInput, state, dates, saved} = filters;
  const search = typeof searchInput === "string" ? searchInput.trim().slice(0, 160) : "";
  const statusFilter = ["confirmed", "completed", "cancelled"].includes(state ?? "") ? state : "";
  const dateFilter = dates === "upcoming" || dates === "past" ? dates : "";
  const params = new URLSearchParams();
  if (search) params.set("query", search);
  if (statusFilter) params.set("state", statusFilter);
  if (dateFilter) params.set("dates", dateFilter);
  const href = (cursor?: string) => {
    const next = new URLSearchParams(params);
    if (cursor) next.set("after", cursor);
    const queryString = next.toString();
    return `${path}${queryString ? `?${queryString}` : ""}#walk-in-records`;
  };
  const records = provider.collection("walkInBookings");
  if (reference !== undefined) {
    const record = typeof reference === "string" && walkInReferencePattern.test(reference)
      ? await records.doc(reference).get() : null;
    const booking = record?.data();
    return booking && record ? <WalkInDetails id={record.id} booking={booking} />
      : <p className="rounded-card border border-border bg-card p-5">Walk-in booking not found.</p>;
  }
  // Single-field createdAt ordering uses Firestore's automatic index. Avoid a
  // second orderBy(__name__) here so the list loads even before composite indexes deploy.
  let query = records.orderBy("createdAt", "desc");
  if (typeof after === "string" && walkInReferencePattern.test(after)) {
    const cursor = await records.doc(after).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const batchSize = search || statusFilter || dateFilter ? 100 : pageSize;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  // Summary counts must not block the records list. The upcoming card needs the
  // walkInBookings (status + eventDateKey) composite index; if that index is still
  // building or undeployed, keep the page usable and leave that metric blank.
  const countOf = async (run: () => Promise<{data: () => {count: number}}>) => {
    try {
      return (await run()).data().count;
    } catch (error) {
      console.error("Walk-in summary count failed", error instanceof Error ? error.name : "UnknownError");
      return null;
    }
  };
  const [batch, summary, savedRecord] = await Promise.all([
    query.limit(batchSize + 1).get().then((page) => page.docs),
    Promise.all([
      countOf(() => records.count().get()),
      countOf(() => records.where("status", "==", "confirmed").where("eventDateKey", ">=", today).count().get()),
      countOf(() => records.where("status", "==", "completed").count().get()),
    ]),
    typeof saved === "string" && walkInReferencePattern.test(saved) ? records.doc(saved).get() : null,
  ]);
  let scanned = 0;
  const visible = [];
  for (const doc of batch.slice(0, batchSize)) {
    scanned++;
    const data = doc.data();
    if (!data) continue;
    if (dateFilter &&
        (typeof data.eventDateKey !== "string" || (dateFilter === "upcoming" ? data.eventDateKey < today : data.eventDateKey >= today))) continue;
    if (statusFilter && data.status !== statusFilter) continue;
    if (search && ![doc.id, data.customerName, data.eventType, data.serviceName, data.eventDateKey]
      .some((value) => typeof value === "string" && value.toLowerCase().includes(search.toLowerCase()))) continue;
    visible.push({id: doc.id, data});
    if (visible.length === pageSize) break;
  }
  const nextCursor = batch.length > scanned ? batch[scanned - 1]?.id : undefined;
  const [totalCount, upcomingCount, completedCount] = summary;
  return (
    <div id="walk-in-records" className="grid scroll-mt-24 gap-4">
      {savedRecord?.exists && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4">
        <p>Walk-in booking recorded successfully. <span className="break-all">Reference {savedRecord.id}</span></p>
        <div className="flex flex-wrap gap-3">
          <Link className="font-semibold text-primary underline" href={`${path}?reference=${savedRecord.id}`}>View details</Link>
          <Link className="font-semibold text-primary underline"
            href={`/provider/calendar?${new URLSearchParams({date: savedRecord.get("eventDateKey"), booking: savedRecord.id})}`}>
            View in Calendar
          </Link>
        </div>
      </div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total walk-ins" value={totalCount ?? undefined} icon={<ClipboardList className="size-5" />} />
        <SummaryCard label="Upcoming events" value={upcomingCount ?? undefined} icon={<CalendarDays className="size-5" />} />
        <SummaryCard label="Completed" value={completedCount ?? undefined} icon={<CircleCheck className="size-5" />} />
      </div>
      <section aria-labelledby="walk-in-records-heading" className="grid min-w-0 gap-4 rounded-card border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="walk-in-records-heading" className="text-lg font-semibold">Walk-in records</h2>
          <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-semibold text-muted-foreground">
            {`${visible.length} ${visible.length === 1 ? "record" : "records"}`}
          </span>
        </div>
        <form key={params.toString()} action={path + "#walk-in-records"} className="grid items-center gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(8rem,0.35fr)_minmax(8rem,0.35fr)_auto]">
          <div className="flex min-w-0 items-center gap-2">
            <Button type="submit" variant="ghost" size="icon" className="shrink-0 rounded-full"
              aria-label="Apply walk-in filters" title="Apply filters">
              <Search className="size-5" aria-hidden="true" />
            </Button>
            <input aria-label="Search walk-in bookings"
              className="h-12 w-full min-w-0 rounded-full border border-input bg-background px-4"
              name="query" defaultValue={search} maxLength={160} placeholder="Search name, event, or service…" />
          </div>
          <select aria-label="Walk-in status" className="h-12 w-full rounded-full border border-input bg-background px-4"
            name="state" defaultValue={statusFilter}>
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select aria-label="Walk-in date" className="h-12 w-full rounded-full border border-input bg-background px-4"
            name="dates" defaultValue={dateFilter}>
            <option value="">All dates</option>
            <option value="upcoming">Today and later</option>
            <option value="past">Past dates</option>
          </select>
          <Button asChild variant="secondary" size="compact" className="w-fit rounded-full">
            <Link href={path + "#walk-in-records"}>Clear filters</Link>
          </Button>
        </form>
        {visible.length === 0 && <div className="grid justify-items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center text-muted-foreground">
          <Inbox className="size-7" aria-hidden="true" />
          <p>{nextCursor ? "No matches on this page." : "No walk-in bookings found."}</p>
        </div>}
        {visible.length > 0 && <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>{["Customer", "Event & Service", "Date & Time", "Agreed Price", "Status", "Action"].map((heading) =>
                <th key={heading} scope="col" className="px-4 py-3 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map(({id, data: booking}) => <tr key={id}>
                <td className="px-4 py-3"><p className="font-semibold">{booking.customerName}</p><p className="text-muted-foreground">{booking.phone}</p></td>
                <td className="px-4 py-3"><p>{booking.eventType}</p><p className="text-muted-foreground">{booking.serviceName}</p></td>
                <td className="px-4 py-3"><p>{booking.eventDate instanceof Timestamp ? manilaDate.format(booking.eventDate.toDate()) : booking.eventDateKey}</p><p className="text-muted-foreground">{walkInScheduleLabel(booking)}</p></td>
                <td className="px-4 py-3">{typeof booking.agreedPriceCentavos === "number" ? peso.format(booking.agreedPriceCentavos / 100) : "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${booking.status === "confirmed" ? "bg-accent text-primary" : booking.status === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"}`}>{booking.status}</span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`${path}?reference=${encodeURIComponent(id)}`} className="inline-flex items-center gap-1.5 whitespace-nowrap text-primary hover:underline">
                    <Eye className="size-4" aria-hidden="true" /> View details
                  </Link>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>}
        <div className="flex gap-4">
          {after && <Link className="underline" href={href()}>First page</Link>}
          {nextCursor && <Link className="underline" href={href(nextCursor)}>Older bookings</Link>}
        </div>
      </section>
    </div>
  );
}


const clock = new Intl.DateTimeFormat("en-PH", {hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC"});

function dateLabel(value: unknown, key?: unknown): string {
  if (value instanceof Timestamp) return manilaDate.format(value.toDate());
  const date = typeof key === "string" ? new Date(`${key}T00:00:00+08:00`) : null;
  return date && Number.isFinite(date.getTime()) ? manilaDate.format(date) : "";
}

function timeLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = new Date(`2000-01-01T${value}:00Z`);
  return Number.isFinite(date.getTime()) ? clock.format(date) : value;
}

function walkInScheduleLabel(booking: DocumentData): string {
  const start = timeLabel(booking.eventTime);
  if (!start) return "";
  if (usesDropOffTimeDisplay({
    serviceTier: typeof booking.serviceTier === "string" ? booking.serviceTier : null,
    eventTime: typeof booking.eventTime === "string" ? booking.eventTime : null,
    eventEndTime: typeof booking.eventEndTime === "string" ? booking.eventEndTime : null,
  })) {
    return start;
  }
  const end = timeLabel(booking.eventEndTime);
  return end ? `${start}–${end}` : start;
}

function Detail({label, children}: {label: string; children: ReactNode}) {
  return <DetailFieldItem label={label}>{children}</DetailFieldItem>;
}

const detailNote = "text-sm text-muted-foreground";

function WalkInDetails({id, booking}: {id: string; booking: DocumentData}) {
  const recorded = dateLabel(booking.createdAt);
  const eventDate = dateLabel(booking.eventDate, booking.eventDateKey);
  const eventTimes = walkInScheduleLabel(booking);
  const agreement = [dateLabel(booking.agreementAt, booking.agreementDate), timeLabel(booking.agreementTime)]
    .filter(Boolean).join(" · ");
  const venue = [booking.venueName ?? booking.eventLocation, booking.venueAddress].filter(Boolean).join(", ");
  const published = booking.catalogOffer;
  const notes = [booking.serviceDetails, booking.specialRequests].filter(Boolean);
  const statusStyle = booking.status === "confirmed" ? "bg-accent text-primary"
    : booking.status === "cancelled" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground";
  return (
    <div className="grid min-w-0 gap-5">
      <div className="-mt-3 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <span>Booking reference <span className="break-all font-medium">#{id}</span></span>
        <CopyWalkInReference reference={id} />
        {recorded && <span>· Recorded on {recorded}</span>}
      </div>
      <article id={`booking-${id}`} className="grid gap-5 rounded-card border border-border bg-card p-4 shadow-card sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <h2 className="text-lg font-semibold">{booking.eventType} · {booking.customerName}</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 capitalize ${statusStyle}`}>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{booking.status}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">Walk-in</span>
          </div>
        </header>
        <DetailFieldList>
          <Detail label="Customer name">{booking.customerName}</Detail>
          <Detail label="Package / Service">
            <span className="font-semibold">{booking.serviceName || "—"}</span>
            {published?.description && <p className={detailNote}>{published.description}</p>}
            {booking.pricingOption && <p className={detailNote}>Pricing option: {booking.pricingOption.label}</p>}
          </Detail>
          <Detail label="Contact number">
            <span className="font-semibold">{booking.phone || "—"}</span>
            {booking.email && <p className={detailNote}>{booking.email}</p>}
            {booking.additionalContact && <p className={detailNote}>{booking.additionalContact}</p>}
          </Detail>
          <Detail label="Agreed price">
            <span className="font-semibold">{typeof booking.agreedPriceCentavos === "number"
              ? peso.format(booking.agreedPriceCentavos / 100) : "—"}</span>
            {typeof published?.publishedPriceCentavos === "number" && <p className={detailNote}>
              Published price: {peso.format((booking.pricingOption?.priceCentavos ?? published.publishedPriceCentavos) / 100)}
              {published.pricingModel && ` · ${published.pricingModel.replaceAll("_", " ")}`}
            </p>}
            {booking.pricingNotes && <p className={detailNote}>{booking.pricingNotes}</p>}
          </Detail>
          <Detail label="Event date & time">
            <span className="font-semibold">{[eventDate, eventTimes].filter(Boolean).join(" · ") || "—"}</span>
            {booking.guestCount && <p className={detailNote}>{booking.guestCount} guests</p>}
          </Detail>
          <Detail label="Booking agreement">
            <span className="font-semibold">{agreement ? `Acknowledged on ${agreement}` : "—"}</span>
            {booking.agreementNotes && <p className={detailNote}>{booking.agreementNotes}</p>}
          </Detail>
          <Detail label="Venue & location"><span className="font-semibold">{venue || "—"}</span></Detail>
          <Detail label="Internal notes">
            {notes.length ? notes.map((note, index) => <p key={index} className="whitespace-pre-wrap font-normal">{note}</p>) : "—"}
          </Detail>
          {booking.cancellationReason && <Detail label="Cancellation reason">{booking.cancellationReason}</Detail>}
        </DetailFieldList>
        {booking.status === "confirmed" && <WalkInStatusForm id={id} />}
      </article>
    </div>
  );
}
