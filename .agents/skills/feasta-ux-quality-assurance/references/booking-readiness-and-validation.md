# FEASTA booking readiness and validation — no avoidable dead ends

## Core principle
**Prevent known invalid choices before the user invests time; never promise certainty where conditions can change.** Client validation explains and previews; authoritative Functions/transactions ultimately decide availability, eligibility, price, time windows and settlement. Do not bypass backend checks or silently alter the initial-payment expiration engine.

## Trace every stage

| Stage | What should be checked/shown early | What stays server authoritative |
|---|---|---|
| Marketplace search | Active/approved listing, category, provider/package availability signals, service region, relevant event date if supplied | Discovery eligibility and active publication |
| Provider/package detail | Whether package can be booked, lead time, support for occasion/category, minimum/maximum guests, pricing basis, required options | Effective offer / service-category/occasion eligibility and immutable offer identity |
| Date/time/guest selection | Schedule, unavailability, occupied capacity including online + walk-ins, time conflicts where policy applies; *why* choices are unavailable | Trusted capacity reservations, event-time constraints, concurrent requests |
| Customization | Required selections, totals with clear estimate/payment timing, options compatibility | Trusted offer pricing, policy version, canonical selection validation |
| Review and agreement | Complete checklist, selected providers, final estimate or payable amount, deadlines, restrictions, verification, terms | Auth/role/phone eligibility, payment agreement and transaction-ready snapshot |
| Submission | One pending action, user sees `Checking availability and submitting…`, prevent accidental rapid retries, preserve draft/recovery key | Atomic revalidation, idempotency, booking creation, policy guards, replay safety |
| Initial payment | Actual server-established amount and expiry; no fabricated `paid` state based on redirect only | PayMongo webhooks, settlement and expiration/reconciliation engine |
| After failure | Specific reason, correction path, preserved selections, safe retry and status reconciliation before duplicate request | Server-issued error codes and actual booking/payment status |

## Mandatory failure-to-earlier-stage investigation

For **each** server error returned during final booking, record:
`Error code → known at which earliest point? → what evidence was available? → first appropriate warning/blocker → corrective CTA → is recheck still needed at submission? → regression test`.

Do not assume all late errors are preventable. Concurrent booking by someone else, role revocation, policy changes, payment network failures and stale sessions may arise after selection. Then communicate honestly: `This date is no longer available. Choose another date; your other details are saved.` If the system can't prove availability, label it `Checking…` / `Availability not confirmed` rather than green-ready.

## Representative blocker matrix (verify real copy and codes in current repo)

| Blocker | Earliest useful location | Helpful next action |
|---|---|---|
| Provider closed / suspended / inactive | Discovery or provider detail | Browse available providers |
| Package unpublished / inactive | Results/detail before `Customize` | Choose another available package |
| Unsupported service or occasion | Event/category selection | Change occasion or provider |
| Date outside operating days | Event date picker | Choose another eligible date |
| Date blocked or daily capacity full | Availability date selection | Show next available date / other provider if truly known |
| Guest count outside allowed range | Guest count field | Show allowed range; preserve entry |
| Lead time / request cutoff not met | Date chooser and summary | Choose later date; explain local cutoff |
| Required option missing | Customization step | Focus specific section and name missing choice |
| Account or phone verification needed | Before booking review/submit | Verify account/phone and return to preserved draft |
| Booking restriction active | Before entering costly booking flow | Show server-supplied restriction reason/end and safe next step |
| Changed rate, terms or package | Step review before consent/submit | Present changed terms; ask user to reconfirm |
| Transient network or unknown submission | Inline submission recovery | Check existing booking status via reconciliation; no blind retry/duplicate creation |
| Payment expired / failed / processing | Payment status/checkout | Explain whether retry eligible, pending verification, or full payment required as computed by server |

## Implementation shape (conceptual, not a new API contract)

- Keep one **client-readable readiness projection** with independent dimensions (`listing`, `schedule`, `capacity`, `options`, `account`, `agreement`, `price`, `policy`); derive clear copy and appropriate step-level UI.
- Projection must use **existing secured backend read or callable APIs**, consistent with authorization and anti-enumeration protections; do not fabricate an unprotected endpoint. When no safe real-time read exists, plan a narrowly scoped server change separately and review its disclosure risk.
- Frontend should not duplicate backend algorithms for payment, expiry, time conflicts or eligibility as independent authority; share contract/pure validation where possible or show trusted server-derived status.
- Validate on relevant field change/blur (not aggressively every keystroke), before navigation to next step, at review, and transactionally on final submission.
- Show the first blocker nearest the field and a concise full summary for many errors. Preserve the selected step, data, focus or route back to the broken stage.
- If disabled, show the reason plus the exact action to enable it; do not create a silent dead-end CTA.
- Guard double-clicks in UI while relying on server idempotency; network timeouts are **unknown**, not evidence of failure or success.
- Do not automatically hold provider capacity while merely adding to Event List or editing local drafts. Show when capacity actually becomes reserved.

## Critical automated scenarios

1. Fully eligible single-provider booking works and reaches a verifiable submitted state.
2. Fully eligible multi-provider booking: one provider becomes unavailable before submit; user receives a precise provider-level blocker with retained choices and no partial/duplicate booking.
3. Provider daily capacity: two online bookings + walk-ins share the same capacity rules; online/walk-in competition is resolved transactionally.
4. Date becomes occupied between calendar read and submit; accurate conflict, no false success, safe retry.
5. Provider inactive/package unpublished between search and review; user sees an early warning on refresh and precise final fallback.
6. Guest min/max, service category, option selection and cutoff violations are caught at the earliest relevant step.
7. Restriction/version/account requirement changes are handled without silently discarding local drafts.
8. Disabled, expired or processing initial payment cannot be shown as settled based solely on navigation/redirect.
9. Double submit, timeout, replay and reconcile create at most one logical submission; test preserved recovery key.
10. Existing expiration engine, cancellation/refund policies and server payment agreements remain untouched.

**Release blocker:** a deterministic and knowable condition is discovered only after a long customization flow, causing a terminal generic `failed` message with no correction path.
