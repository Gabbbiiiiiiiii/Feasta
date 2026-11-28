# Step 164: customer booking search preimplementation audit

Status: BLOCKED BEFORE IMPLEMENTATION. NOT READY FOR MOBILE ACTIVATION.

Audited branch: `chore/monorepo-setup`.
Audited HEAD: `bf41139c371686be4566f9edf73b5377d0ef2ea9`.
The starting working tree was clean. No callable, export, index, rule, lifecycle,
payment, or mobile change has been made. This document records the requested
stop condition; it is not an implemented API contract.

## Blockers

### An inline trusted projection conflicts with editable client drafts

`firebase/firestore.rules:927-1022` permits verified customers to create clean
drafts. `draftFields()` excludes booking codes, normalized codes, and search
eligibility fields. `cleanDraft()` requires `keys().hasOnly(draftFields())`,
and updates require a clean schema on BOTH the old and new document.

Consequently, backfilling `bookingCodeNormalized` or an eligibility field onto
an existing editable draft makes subsequent legitimate draft edits fail.
Allowing clients to create these authoritative fields would be unsafe.
Omitting drafts from ordinary history would violate the requested draft filter.
An inline projection therefore requires a coordinated rules/schema design that
preserves existing draft editing and server ownership of derived fields.

Drafts also need only `customerId` and `status`: `createdAt` and `isDeleted`
are optional. Ordering all history by `createdAt` cannot include every legal
draft, and `isDeleted == false` cannot include every legitimate legacy record.
The canonical submission writer does not set `isDeleted` in its creation
payload either. These are ongoing writer-contract issues, not just a one-time
historical backfill.

### A consistent authoritative count invariant has not been established

Web `countPendingProviderResponses()` requires a positive safe integer
`pendingProviderRequestCount` AND parent status `pending_provider_approval` or
`needs_provider_replacement`. Status alone is insufficient.

The audited writers do not all supply the same validated request set:

- `reject-provider-request.ts` queries all requests by `mainEventId` and passes
  `allRequestsSnapshot.docs` directly to `calculateMainEventRequestSummary()`.
- `booking-lifecycle-v3.ts`, `create-payment-session.ts`, and
  `remaining-balance-enforcement.ts` use validated `activeRequests` from the
  relationship-integrity resolver.
- The summary calculator itself counts every supplied document and treats an
  unparseable request status as `pending`.
- The relationship resolver instead rejects invalid statuses, verifies complete
  membership and customer/event identities, and distinguishes historical from
  active required assignments. Its v2 contract explicitly requires a separate
  compatibility rollout before production consumption.

This is evidence of an unresolved invariant, not evidence that production has
corrupt records. No production data was accessed. Copying stored counts into
another indexed field would not validate their authority. Recomputing a page's
counts at read time cannot recover eligible bookings omitted by a stale indexed
predicate without scanning further history.

Resolving the invariant requires lifecycle/relationship compatibility work,
including review of payment-related summary writers. That work must preserve
the prohibited booking/payment behavior and cannot be silently folded into a
read-only search change. No partial search endpoint was added.

## Historical compatibility and proposed resolution

Before implementation, settle the supported legacy relationship versions and
the authoritative request set for ALL parent-summary writers. Keep v2 rollout
restrictions in place. Missing or invalid relationship evidence must be
reconciled separately; do not invent pending counts from status or treat missing
counts as proven zero.

Choose either a protected inline schema compatible with draft updates or a
separate server-only search collection. A separate collection avoids modifying
draft schemas, but an asynchronous trigger alone leaves omission windows after
creation/status changes. Define and test freshness/readiness semantics before
claiming complete search. It is not a drop-in solution to this requirement.

A future dry-run inventory must identify every nondeleted owned record missing
or disagreeing with normalized code, visibility, ordering timestamp, schema
version, and authoritative eligibility. Preserve canonical booking identity
and code. Derive normalized code from trimmed existing code using a documented
case normalization; separately decide how code-less drafts are searchable
(web displays the document ID as a fallback but prefix search uses stored code).
Missing timestamps require an explicit policy; do not fabricate creation times
or silently omit records. Legitimately deleted records stay excluded.

Verify a proposed backfill against source documents and validated linked
requests, check full eligible-set coverage, compare status-filter membership,
and recheck after concurrent lifecycle writes. Audit malformed/legacy records
separately. Do not enable mobile until writer coverage, historical coverage,
index build readiness, and regression checks have all been confirmed.
No inventory, backfill, or migration was run against Firebase.

## Pia handoff: intended API, not available yet

Intended callable: `searchCustomerBookings`; existing region:
`asia-southeast1`. No callable has been implemented locally or deployed by this
step. No Firestore indexes were added or their deployed state checked.

The requested request shape remains the target:

```json
{"search":{"mode":"code_prefix","value":"BK-1D8"},"status":"all","pageSize":10,"cursor":null}
```

Target modes: `none`, `code_prefix`, `booking_id`. Target filters: `all`,
`draft`, `awaiting_provider`, `awaiting_payment`, `confirmed`, `in_progress`,
`completed`, `cancelled_or_expired`. Web maps awaiting payment to
`waiting_for_down_payment`, and cancelled-or-expired to those two statuses.
Blank-search semantics, safe presentation DTO, error details, cursor encoding,
and exact composite indexes remain unimplemented and must not be depended on.

Target response: `{bookings: [], nextCursor: null, hasMore: false}`. Future
cursors must bind customer, normalized search, status, and deterministic order
with a document-ID tie-breaker; malformed or mismatched cursors must reject
instead of restarting. Default/max page sizes remain 10/30.

Reuse `requireAuth`, `requireRole(uid, ["customer"])`, existing App Check
options, and the callable rate limiter. Role checking verifies active profile
and Auth account state; it does not by itself prove email/phone verification.
Reuse the verification requirements in booking authorization as appropriate.
Exact IDs must use direct reads and return identical not-found behavior for
missing, deleted, and foreign records. Search must never mutate bookings or
payments; existing rate limiting writes only its dedicated rate-limit records.

Expected future error categories include `unauthenticated`,
`permission-denied`, `invalid-argument`, `not-found`, `resource-exhausted`, and
`failed-precondition` for unmet readiness. These are design targets only.

Illustrative Flutter request for AFTER implementation, validation, readiness,
and deployment; do not wire this into mobile now:

```dart
final result = await FirebaseFunctions.instanceFor(region: 'asia-southeast1')
    .httpsCallable('searchCustomerBookings')
    .call(<String, dynamic>{
  'search': {'mode': 'code_prefix', 'value': 'BK-1D8'},
  'status': 'all',
  'pageSize': 10,
  'cursor': null,
});
```

## Validation and safeguards

Read-only source audit completed for the requested web contracts, canonical
submission, summary calculation, security helpers, rules and indexes, and
relevant lifecycle/payment relationship callers. No emulator, deployment,
production read/write, migration, commit, push, branch, or worktree was used.

Implementation regression tests, Functions build, and changed-source lint are
not applicable to this documentation-only stop. The requested 17 regression
areas still require implementation and successful local validation. Passing
existing tests would not establish the missing projection invariant.
