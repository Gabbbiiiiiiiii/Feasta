# FEASTA page-type challenge questions

## Customer discovery and marketplace
- Are service type, date/location, price and occasion filters clearly labeled and applied, resettable and count-correct?
- Are real provider/package options distinguished from unavailable/unpublished offers? Does the card show decision-worthy price model and service coverage without dumping contract text?
- Do package cards help users choose, while comparison uses table/structured summary if 3+ offers need side-by-side comparison?
- Is 'Add to Event List' clearly distinct from 'Book'? Does it avoid implying a reserved slot?
- Is unavailable inventory explained early and not hidden until final submit?

## Customer booking/customization/checkout
- Can the user predict the entire flow? Is there one primary CTA per step and a meaningful `Back`? Can they edit event details separately from package details?
- Are mandatory options and agreement steps obvious, reflected in stepper/summary, and saved when navigating?
- Are fees, estimated total, initial payment and cutoff clearly distinguished and tied to authoritative calculations?
- Can a customer recover a pending/unknown submission without multiple charges or duplicated requests?
- Does the booking show its confirmed status *only* from trusted server evidence?

## Provider availability, calendar and walk-in
- Can provider see current schedule, max events/day, occupied vs remaining day capacity, blocked dates and reason for rejection?
- Are simultaneous online + walk-in reservations treated as shared capacity, not separate arbitrary counts?
- Is changing a schedule clear about potential impact on accepted reservations? Are conflicting updates surfaced without lost input?
- Can booking records be filtered and sorted; would a table outperform repeated cards for operations?
- Does walk-in form validate date/time, customer/service details, financial information and available capacity before save?

## Provider package editing
- Can users distinguish draft, published, inactive and removed? Are four pricing/configuration models represented consistently?
- Are specific validation errors adjacent to fields and shown before publication? Does navigation preserve unsaved drafts?
- Can provider understand options/guest limits/pricing, without relying on hidden technical backend fields?

## Admin users/violations/requests
- Are records in a searchable, sortable **table** when admins compare many similar rows? Can an inspector/drawer handle details without turning each row into a noisy card?
- Is action authority, risk and audit history visible? Does a destructive action require a reason/confirmation where policy requires it?
- Are three-strike pending/restricted/reversed states labeled correctly with Manila-local dates and immutable history?
- Is permission denied actionable without revealing sensitive information?

## Admin reports
- Can the admin answer a specific question: **which period, metric, segment, total, trend, exceptions and record set?**
- Are charts secondary to a defined question and the underlying exact data? Does export preview explain **format, filters, date range, rows and fields** before file creation?
- Does print render a deliberate report layout rather than the application chrome/sidebar? Are amounts and VAT/commission categories accurate per current approved backend policy?
- Are report, dashboard overview and operational queue clearly distinguished?

## Announcements and notifications
- Is recipient scope explicit and validated before publishing? Do previews show exact audience, message and timing?
- Is unread/new notification signaled accessibly, without noisy repeated toasts/sounds and without losing navigability?
- Does a failed publish provide safe retry and clear outcome rather than duplicate messages?

## Cross-cutting Web and Flutter
- Use aligned business terminology, progress states and error semantics; layout can be adapted to platform ergonomics.
- Touch/keyboard/accessibility, truncation, long strings, Philippine ₱, Manila timezone, network offline/retry, large text, empty states and suspended users must not be afterthoughts.
- A customer-only mobile module does not mean there is a mobile provider/admin UI. Inspect the actual current app before assuming screens exist.
