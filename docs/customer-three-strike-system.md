# Customer three-strike system — local implementation for review

Base: `chore/monorepo-setup`, `462489b7eeecac61a253dae3ca4b896522488c81`.

## Integration and eligibility

The independent `adjudicateExpiredCustomerBooking` Firestore update trigger observes
provider requests transitioning to `expired` with the existing authoritative reason
`no_attempt_original_deadline_elapsed`. It does not modify the expiration engine,
its worker, scheduling, booking status, deadlines, reservations, provider availability,
payment settlement, refunds or reconciliation. The existing expiration notifications
remain intact.

Only newly created events marked `customerViolationPolicyVersion: 1` participate.
No historical enrollment, scanning, backfill or migration is performed. Both trusted
creation paths set this marker. Legacy Firestore booking creation is already denied;
the reconciliation callable only reads submission outcomes. The multi-provider
callable remains deliberately unexported, as on the inspected base revision.

Adjudication transactionally reads the parent, exhaustive linked membership (bounded
at 20 requests, with a 21st document detecting overflow), relationship integrity,
and each request's original financial/acceptance/deadline evidence. Every linked
request must have the qualifying expiration reason, unpaid status, valid protocol
and trusted timestamps. The existing read-only `initialExpirationDecision` validator
checks frozen financial evidence by reconstructing the pre-expiration status; it
does not execute or change expiration behavior. Requests from replacement chains,
mixed outcomes, provider rejections, cancellations, partial or pending payments,
reviews, reconciliation and malformed evidence fail closed.

All four deterministic payment identities, their checkoutAttempts/gatewayPayments/
refunds/events subcollections, noncanonical linked payments, cancellation records,
and event-level payment/cancellation queries are checked in the same transaction.
Any evidence excludes the event. Overflow and exclusions are logged; there is no
automatic adjudication of uncertain cases. A transient transaction failure is retried
by the Firestore trigger. A deterministic event receipt prevents duplicate punishment
and duplicate notifications on concurrent/retried delivery.

## Time, state and cycles

The rolling window is `(serverNow - 30 days, serverNow]`. Event occurrence is the
latest original initial-payment expiry among all linked requests. Trigger delay does
not refresh that date; events outside the window are ignored. A restriction begins
at server adjudication and lasts exactly seven days. Calculations use UTC instants;
Web presentation explicitly uses Asia/Manila.

`customerViolationStates/{customerId}` contains schema version, revision, at most
two pending strike references, an optional restriction with its three-strike basis,
start/end UTC milliseconds, and a `nextReviewAt` Firestore Timestamp.

`customerViolationStates/{customerId}/violations/{mainEventId}` is the permanent,
deterministically identified history: booking/request references, original reason,
occurrence/issuance timestamps, cycle membership, adjudication outcome and historical
restriction times. Reversal adds its timestamp, administrator and private audit reason;
it never deletes the original violation. `adminLogs` records issuance, correction and
restriction expiry using the existing audit helper.

At the third strike, all three are permanently consumed by a cycle. Further eligible
expirations from outstanding bookings during that restriction are recorded and
consumed in the same cycle, without extending its end or accumulating another penalty.
After expiry the next distinct event starts a fresh pending cycle. A reversal removes
a pending strike or lifts a restriction that depended on that strike. Other strikes
already adjudicated in that cycle remain consumed even after correction; they are
never revived into a second punishment. Consumed and out-of-window records remain
visible as history rather than active pending strikes. A running restriction lasts
its original seven days even if a basis strike ages out of the observation window.

## Enforcement, administration and notifications

Both single-provider and multi-provider submission paths transactionally read the
same restriction document written by adjudication and reversal. Firestore conflicts
serialize concurrent creation/restriction changes. Successful idempotent replay stays
ahead of this gate. Payment agreement disclosures remain accessible. Malformed
restriction state denies new booking creation pending support review.

Structured errors use `customer_booking_restricted` with an ISO `expiresAt`, or
`customer_booking_restriction_review_required` for malformed state. The customer Web
client displays the reason and Manila-localized expiry while retaining the existing
submission recovery journal. Existing role, email and phone checks remain in place.
No shared account authorization, global block flag or Firebase Auth status changes.

The customer panel in `/admin/users` calls authenticated, App Check-protected admin
Functions. History pages contain at most 25 records, ordered by immutable `issuedAt`
descending, then deterministic document ID descending, with next/previous/first-page
navigation. The server resolves each cursor against its customer-scoped history
document; timestamp ties cannot skip records. Reversal never changes these ordering
fields. The panel labels original occurrence separately from issuance. Reversal requires an active admin,
5–1000-character reason and the displayed state revision; the transaction rereads
admin authority. Concurrent review changes require refresh. Retrying an already
completed reversal is a no-op. Private reasons are returned only to authorized admins
and are absent from customer notifications. All direct client reads/writes of the
state and history collection are explicitly denied by Firestore rules.

First/final warnings, restriction start and administrative correction use the existing
notification writer, with deterministic identities committed alongside state. A new,
independent `notifyEndedCustomerBookingRestrictions` schedule runs every 15 minutes,
reads at most 25 due state documents and sends idempotent end notifications. A new
strike also closes a previously expired cycle if that sweep was delayed. Booking
access expires exactly on time regardless of notification delivery delay.

## Indexes and release requirements

No composite indexes are introduced. Queries use the existing automatic collection
single-field indexes (`mainEventId`, `providerRequestId`, `nextReviewAt`) and document
name ordering. History uses the automatic descending `issuedAt` index with its
same-direction document-name tie-breaker; no composite index is needed.
`fieldOverrides` was inspected and has no exemptions.

After review, release requires deployment of the five newly exported Functions,
updated single-provider intake Function, Web changes and Firestore rules. The new
schedule requires the same scheduler infrastructure used by existing scheduled
Functions. Deploy the adjudication trigger and expiry notifier before enabling intake
enrollment to avoid missing a transition during a staggered release. No existing data
migration, historical backfill or new configuration document is required.

Limits: events exceeding 20 linked requests are deliberately not penalized and need
manual review; expiry notifications can lag by 15 minutes or more with a backlog
(25 per sweep). Malformed state can require operational correction. Offline tests
exercise real production transaction code with optimistic in-memory conflict retries;
they do not prove deployed IAM, Eventarc delivery, query behavior or scheduler setup.
No emulator tests were run, per request.

## Verification and exact changed files

The initial implementation reported 183 Functions and 60 Web tests. The final
hardening pass reran focused suites; see the final hardening review below for its
actual commands and results. Both TypeScript checks passed. Changed-source ESLint passed with no errors
(Functions uses the repository's existing max-length warning policy).
`git diff --check` passed. A separate diff check confirms no changes in protected
payment, provider-availability, cancellation, refund or provider-request directories.
Tests cover financial/cancellation exclusions, rolling boundaries,
duplicates, concurrent third strikes and intake, admin corrections, restriction expiry,
cycle consumption, actual single/multi-provider replay behavior, Web review controls
and customer expiry messaging.

Changed/added files:

- `functions/src/bookings/customer-violation-policy.ts`
- `functions/src/bookings/customer-booking-restriction.ts`
- `functions/src/bookings/customer-violation-service.ts`
- `functions/src/bookings/customer-violation-handlers.ts`
- `functions/src/bookings/submit-booking-request.ts`
- `functions/src/bookings/submit-multi-provider-booking.ts`
- `functions/src/index.ts`
- `functions/test/customer-violations.test.cjs`
- `functions/test/multi-provider-submission.integration.test.cjs`
- `firebase/firestore.rules`
- `apps/web/src/lib/admin/users/customer-violation-client.ts`
- `apps/web/src/components/admin/users/customer-violations-panel.tsx`
- `apps/web/src/components/admin/users/user-details-content.tsx`
- `apps/web/src/lib/customer/bookings/customer-booking-submission-client.ts`
- `apps/web/test/components/customer-violations.test.tsx`
- `apps/web/test/components/customer-booking-reconciliation.test.ts`
- `docs/customer-three-strike-system.md`

No commit, push, Firebase deployment, live Firestore write, migration or production
deployment is part of this work. Release awaits review.

## Final hardening review (2026-11-14)

Confirmed defects corrected:

- Document-ID ordering hid recent violations; previous-page navigation was absent.
  History now uses immutable issuance time and ID, preserving deterministic IDs.
  Loading/navigation controls and request generations prevent stale responses.
- Malformed violation state previously threw on every retry. Missing pending ledger
  documents could also make a third-strike transaction fail permanently; consumed or
  reversed pending ledger entries must not form a new restriction. These cases now
  fail closed with a deterministic review receipt and an audit entry, without strikes,
  customer notifications or changes to booking/payment evidence.
- Adjudication errors now log event, request and main-event references and error code
  before rethrowing transient failures to the existing retry-enabled trigger.

Reversal policy required no redesign: pending corrections retain unrelated strikes;
consumed cycles never repopulate pending state; historical corrections do not lift a
newer independent restriction. Transaction revisions serialize concurrent changes,
and completed reversals remain no-ops. Permanent history and private audit reasons
remain intact. Customer notifications contain no private administrative reason.

### Diagnosis and exact-event recovery

`customerViolationAdjudicationReviews/{mainEventId}` is server-only under the existing
default-deny rules. Receipts contain customer/event references, an actionable reason,
`status: open` and update time. Reasons include `invalid_violation_state`,
`invalid_pending_strike_history`, `invalid_customer_role`, and
`event_request_limit_exceeded`. Repeated delivery of the same unresolved reason
does not append another audit entry. Successful issuance marks an existing receipt
resolved in the issuance transaction; its original review audit remains permanent.
No scheduler or collection scan is added.

Use structured trigger logs to identify transient failures. They remain retryable;
failed transactions commit no partial state, audit or notification. For an unresolved
permanent review, diagnose the referenced state/ledger before any authorized manual
correction. Never fabricate financial evidence or rewrite expiration records to
force eligibility. This hardening pass performs no operational correction or backfill.

After diagnosis, an active authenticated administrator may explicitly call
`retryAdminCustomerViolationAdjudication` with `{mainEventId, reason}` (private reason
5–1000 characters). App Check and active-role authorization apply; the administrator
document is reread transactionally before recording `customer_violation.recovery_requested`.
The callable then reuses the full adjudication transaction, including enrollment,
original reason, financial/cancellation exclusions and the original rolling window.
It returns `{result}` and logs the outcome. Lost-response retries cannot duplicate
strikes; each explicit recovery request has its own audit entry. No booking/payment
documents are written. No API for editing financial evidence or bypassing the window
is provided. A historical open review can remain for manual disposition if the event
has aged out or remains ineligible; recovery cannot turn it into a fresh strike.

Hardening modifies these existing implementation files only:

- `functions/src/bookings/customer-violation-policy.ts`: typed state-integrity error;
  30-day, seven-day and consumed-cycle calculations are unchanged.
- `functions/src/bookings/customer-violation-service.ts`: bounded pending-ledger
  validation and transactional review receipts/audits.
- `functions/src/bookings/customer-violation-handlers.ts`: chronological cursors,
  retry diagnostics and authorized one-event recovery callable.
- `functions/src/index.ts`: export recovery callable.
- `apps/web/src/components/admin/users/customer-violations-panel.tsx`: navigation,
  timestamp labels and loading/request lifecycle safeguards.
- `functions/test/customer-violations.test.cjs`: timestamp-aware offline query fake
  and regression coverage for pagination, reversal cases and recovery/retries.
- `apps/web/test/components/customer-violations.test.tsx`: previous/first navigation,
  timestamp labels and stale-response coverage.
- This document: findings, index implications and recovery runbook.

Remaining limits: no deployed Firestore/IAM/Eventarc verification was attempted.
Queries rely on automatic indexes and issuance timestamps present on all records
created by this implementation. New records inserted ahead of a pagination cursor
appear when the first page is refreshed. Infrastructure retry retention is finite;
use the exact-event recovery callable after diagnosing an exhausted delivery.
The recovery callable has no dedicated Web control. Existing expiry-notifier backlog
and 20-request adjudication limits remain. No historical backfill is performed.

### Final local verification

- Functions: **197 passed, 0 failed** across `customer-violations`,
  `multi-provider-submission.integration`, `multi-provider-transaction-coordinator`,
  `multi-provider-atomic-write`, `initial-payment-expiration`,
  `initial-payment-expiration-worker`, `initial-payment-deadline-v4`,
  `initial-payment-runtime`, `initial-payment-checkout`,
  `initial-payment-eligibility-checkout`, and `initial-payment-eligibility`
  (`node --test test/<name>.test.cjs`, all listed files in one invocation).
  This is the explicitly selected current suite, not a claim to have identified the
  exact file selection behind the previous 183-test report.
- Web: **63 passed, 0 failed** via `pnpm.cmd exec vitest run` with
  `test/components/customer-violations.test.tsx`,
  `test/components/customer-booking-reconciliation.test.ts`, and
  `test/components/user-management.test.tsx` (the prior 60 tests plus three new ones).
- Functions compilation (`pnpm.cmd exec tsc`) and final Functions/Web TypeScript
  checks (`pnpm.cmd exec tsc --noEmit`) passed.
- ESLint passed for all changed Functions source and changed Web source/tests:
  zero errors; Functions reported 150 max-length warnings under its existing policy.
- `git diff --check` passed; untracked implementation files also passed separate
  `git diff --no-index --check` whitespace inspection. The original set of 17
  changed/new files remains; no unrelated work was removed.
- Protected payment, provider-request, refund, cancellation and availability
  directories have no Git diff. Intake guards/enrollment from the supplied working
  tree remain unchanged by this pass. Dynamic Payment Expiration Engine,
  payment/booking safeguards, rolling 30-day window and seven-day restriction are
  preserved. No emulator, live Firebase operation, commit, push or deployment ran.

Recommendation: **READY FOR FINAL RELEASE REVIEW**. Deployed infrastructure and
the documented staged release still require review; nothing has been deployed.
