import Link from "next/link";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {adminDb} from "@/lib/firebase/admin";
import {walkInProvider} from "@/lib/provider/bookings/walk-in-booking-service";
import {WalkInForm, WalkInStatusForm} from "./walk-in-form";

const pageSize = 20;
const peso = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
const manilaDate = new Intl.DateTimeFormat("en-PH", {dateStyle: "medium", timeZone: "Asia/Manila"});

export default async function WalkInBookingsPage({
  searchParams,
}: {searchParams: Promise<{after?: string}>}) {
  const {provider} = await walkInProvider();
  const {after} = await searchParams;
  const records = provider.collection("walkInBookings");
  let query = records.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc");
  if (typeof after === "string" && /^[A-Za-z0-9]{20}$/.test(after)) {
    const cursor = await records.doc(after).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const [bookings, packages] = await Promise.all([
    query.limit(pageSize + 1).get(),
    adminDb.collection("packages").where("providerId", "==", provider.id).get(),
  ]);
  const options = packages.docs.flatMap((doc) => {
    const value = doc.data();
    return value.status !== "archived" && typeof value.name === "string" && value.name.trim()
      ? [{id: doc.id, name: value.name as string}] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
  const visible = bookings.docs.slice(0, pageSize);
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Link className="underline" href="/provider/bookings">Back to My Bookings</Link>
      <h1 className="text-2xl font-semibold">Walk-in bookings</h1>
      <WalkInForm packages={options} />
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Recorded walk-ins</h2>
        {visible.length === 0 && <p>No walk-in bookings yet.</p>}
        {visible.map((doc) => {
          const booking = doc.data();
          return (
            <article key={doc.id} className="grid gap-2 rounded-lg border p-4">
              <h3 className="font-semibold">{booking.eventType} · {booking.customerName}</h3>
              <p className="capitalize">{booking.status} walk-in</p>
              <p>{booking.eventDateKey} · {booking.eventTime}–{booking.eventEndTime} · {booking.eventLocation}</p>
              <p>{booking.serviceName} · {booking.guestCount} guests</p>
              <details>
                <summary className="cursor-pointer">Booking details</summary>
                <dl className="mt-2 grid gap-1 break-words">
                  <div><dt className="inline font-medium">Booking reference </dt><dd className="inline">{doc.id}</dd></div>
                  <div><dt className="inline font-medium">Recorded on </dt><dd className="inline">{booking.createdAt instanceof Timestamp ? manilaDate.format(booking.createdAt.toDate()) : ""}</dd></div>
                  <div><dt className="inline font-medium">Contact </dt><dd className="inline">{booking.phone}{booking.email && ` · ${booking.email}`}</dd></div>
                  <div><dt className="inline font-medium">Customer acknowledgment recorded for </dt><dd className="inline">{booking.agreementDate}</dd></div>
                  {booking.serviceDetails && <div><dt className="inline font-medium">Service details </dt><dd className="inline">{booking.serviceDetails}</dd></div>}
                  {booking.specialRequests && <div><dt className="inline font-medium">Special requests </dt><dd className="inline">{booking.specialRequests}</dd></div>}
                  {typeof booking.agreedPriceCentavos === "number" && <div><dt className="inline font-medium">Agreed price (reference) </dt><dd className="inline">{peso.format(booking.agreedPriceCentavos / 100)}</dd></div>}
                </dl>
              </details>
              {booking.status === "confirmed" && <WalkInStatusForm id={doc.id} />}
            </article>
          );
        })}
        <div className="flex gap-4">
          {after && <Link className="underline" href="/provider/bookings/walk-in">First page</Link>}
          {bookings.size > pageSize && <Link className="underline" href={`?after=${visible.at(-1)?.id}`}>Older bookings</Link>}
        </div>
      </section>
    </div>
  );
}
