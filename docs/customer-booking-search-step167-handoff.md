# Step 167: local customer booking search and Pia handoff

Implemented locally on `chore/monorepo-setup`, starting at
`bf41139c371686be4566f9edf73b5377d0ef2ea9`. Callable export:
`searchCustomerBookings`, Firebase Functions v2, `asia-southeast1`.

**Local implementation is available for review. Production deployment and mobile
activation are NOT READY.** No production inventory, index build, setting, secret,
backfill, migration, deployment, emulator, commit, push, or mobile activation was
performed. All 10 prerequisite files remain unchanged. Booking submission,
payments, refunds, financial lifecycle, and editable draft schemas are untouched.

## Files changed

New implementation:

- `functions/src/bookings/search-customer-bookings.ts`: authenticated callable,
  server-owned readiness/key configuration, rate limit, time/byte/read guards,
  and safe errors. Dependency injection is internal, never a request field.
- `functions/src/bookings/customer-booking-search-contract.ts`: strict parser,
  status groups, signed cursor extensions, source validation, public DTO.
- `functions/src/bookings/customer-booking-search-reader.ts`: bounded read-only
  history/prefix/companion/exact adapters and existing Awaiting Provider reuse.
- `functions/test/search-customer-bookings.test.cjs`: 25 mock endpoint tests.
- This handoff.

Existing files changed:

- `functions/src/index.ts`: registers the callable export.
- `firebase/firestore.indexes.json`: three local composite definitions below.
- `firebase/firestore.rules`: prevents client creation/update of the activation
  document, including browser admins. This tightens the existing rule.
- `functions/test/function-security-contract.test.cjs`: adds this callable's
  controls and export to the reviewed inventory; unrelated baseline stays intact.

## Flutter contract (handoff example only; do not activate)

```dart
final callable = FirebaseFunctions.instanceFor(region: 'asia-southeast1')
    .httpsCallable('searchCustomerBookings');
final result = await callable.call(<String, dynamic>{
  'search': {'mode': 'none', 'value': ''},
  'status': 'all',
  'pageSize': 10,
  'cursor': null,
  'section': 'history',
});
// Treat result.data['nextCursor'] as opaque. A page can be empty with hasMore=true.
```

Use authenticated Firebase Auth and a valid Firebase App Check token. The callable
enforces App Check even if emulator environment variables are set. It reuses
`requireAuth`, `requireRole(uid, ["customer"])`, Admin Firestore, and
`enforceCallableRateLimit`. Active-account authorization checks the current user
profile AND Firebase Auth disabled state; blocked, inactive, missing/invalid and
noncustomer accounts reject. UID comes exclusively from authenticated context.

Existing history reads (`mainEvents` rules and web `requireCustomer`) require an
active owned customer; they do not require email/phone verification. This endpoint
preserves that policy. Submission's verified-email/phone requirements are not
applied to reading existing bookings, and no verification policy is changed.

Top-level fields are exactly `search`, `status`, `pageSize`, `cursor`, `section`.
`search` is required and has exactly `mode` and `value`; both are required strings.
Other fields default to `all`, `10`, `null`, `history` respectively. Explicit nulls
are rejected except for cursor. Unknown fields (including customer IDs) reject.
Page size must be an integer 1..30; there is no coercion or silent clamping.

| Mode | Value normalization and constraints | Query/result behavior |
| --- | --- | --- |
| `none` | Exactly empty string; whitespace is not empty | Dated history, or companion draft section |
| `booking_id` | Trim; preserve case; ASCII `[A-Za-z0-9_-]`, 1..160 characters | One direct owned document lookup; nonnull cursor rejects |
| `code_prefix` | Trim and uppercase; ASCII `B`, `BK`, `BK-`, or `BK-` plus 1..32 hex characters | Indexed raw-code range, code ASC then ID ASC; readiness required |

Raw search values longer than 160 characters reject before normalization. Blank
ID/prefix input rejects. No substring/full-text or document-ID fallback search.
`bookingCode` in the DTO is the actual stored code or null; the UI may display
`id` separately, but must not describe an ID fallback as a stored matching code.

| Public status | Canonical parent statuses |
| --- | --- |
| `all` | All canonical statuses |
| `draft` | `draft` |
| `awaiting_provider` | `pending_provider_approval`, `needs_provider_replacement`, AND validated v1 pending-response evidence |
| `awaiting_payment` | `waiting_for_down_payment` |
| `confirmed` | `confirmed` |
| `in_progress` | `in_progress` |
| `completed` | `completed` |
| `cancelled_or_expired` | `cancelled`, `expired` |

Exact missing, foreign-owned and deleted IDs all return the same generic
`not-found` error with no details. An owned valid document excluded by the status
filter returns a successful empty page. Exact lookup can return a legal undated
draft without inventing a date. Missing dates on nondrafts and malformed present
creation timestamps require reconciliation. Missing `isDeleted` is permitted;
boolean true is excluded. No database failure becomes a successful empty result.

## Public response allowlist

Response has exactly `{bookings: CustomerBookingSearchRow[], nextCursor:
string|null, hasMore: boolean}`. Each row has exactly these 14 fields:

| Fields | Type / source |
| --- | --- |
| `id`, `bookingId` | string, authoritative Firestore document ID |
| `bookingCode` | string|null, stored `bookingCode`, max 40 characters |
| `status` | canonical parent status string |
| `eventType` | string|null, max 100 |
| `eventDate` | string|null; ISO UTC timestamp, or validated `YYYY-MM-DD` date-only source string |
| `eventTime`, `eventEndTime` | string|null, max 40 each |
| `guestCount` | integer|null, 0..1,000,000 |
| `eventLocation` | string|null, max 500 |
| `providerName` | string|null, stored `providerBusinessName`, max 200 |
| `packageName` | string|null, stored `packageName`, max 200 |
| `createdAt`, `updatedAt` | string|null; ISO UTC for Timestamp values |

Absent optional fields become null. Creation timestamps are required to be valid
Timestamp evidence when present; invalid presentation values abort the whole
response. Dates in the DTO have millisecond precision; history cursor positions
retain seconds AND nanoseconds. No financial figures, payment IDs, checkout
actions, settlement state, provider-private data, raw source objects, relationship
documents, auth information, or internal errors appear in the DTO. These are
list rows aligned with existing event/provider/package presentation; Flutter must
use its existing booking details flow for details and authoritative actions.

## Pagination and sections

History is `createdAt DESC, document ID DESC`. Firestore creation-time ordering
excludes missing fields; deployment requires historical date/status inventory.
Do not present history alone as complete draft coverage.

`undated_drafts` is a separate companion section, applicable only to `none` with
`all`/`draft`. It queries owned draft candidates by ID DESC, returns only drafts
whose `createdAt` field is absent, and uses its own ID-only cursor. Dated drafts
are consumed nonmatches. A present null/string/malformed timestamp fails closed.
Do not add fields to legal sparse editable drafts or fabricate timestamps. Pia
must agree to the companion presentation before mobile activation. Its server
approval flag is required for no-search `all`/`draft` in BOTH sections. The client
must request and paginate both `history` and `undated_drafts` for complete draft
coverage; approval alone does not merge the two sections. Exact-ID, prefix, and
other status searches remain independent of this companion approval.

One query fetches at most 31 candidates. Consume at most 30, stopping earlier at
pageSize displayed matches. Deleted rows and valid nonmatches consume positions.
Never loop to fill a short page. `hasMore` means more unconsumed candidates, not
a guaranteed future match. Return the signed LAST CONSUMED position if more
candidates remain, including on empty pages; never advance to the fetched tail.
Flutter must follow `nextCursor` while `hasMore` is true. Exact lookup has no
continuation. Removing a consumed document does not invalidate its cursor.

History reuses the Step 166-A HMAC cursor foundation. Prefix and companion modes
extend its canonical base64url HMAC-SHA256 envelope with distinct positions and
ordering versions (`raw_code_asc_v1`, `draft_id_desc_v1` versus
`created_at_desc_v1`). Bind UID, normalized mode/value, status, size, section,
order and schema version. Invalid signature, encoding, position, version, scope,
or changed filter rejects; never silently restart. Maximum token length: 4096.
Key rotation invalidates outstanding tokens. Cursors authenticate, not encrypt.
No per-token wall-clock expiry is promised; unsupported versions are rejected.
Pages are consistent individually, not a frozen snapshot across multiple calls.

## Awaiting Provider consistency and budgets

Chronological no-search Awaiting Provider calls the unchanged Step 166-B async
adapter. Prefix/exact use the unchanged exhaustive-related-query and candidate
evidence helpers inside their own single read-only transaction. Parent statuses
are a candidate superset; no stored pending-count predicate is used. Pending
responses require canonical status with no response/terminal evidence. V1
membership and identities must validate exhaustively; v2, stale counts,
unlisted/missing/foreign related documents, or conflicting evidence abort the
whole response. No partial rows or advanced cursor escapes reconciliation.
Parent/related read times must match. Read-only callback replay is refused.

| Booking read path | Maximum application queries / documents |
| --- | --- |
| Ordinary history, prefix without Awaiting Provider, companion | 1 / 31 |
| Exact without Awaiting Provider | 1 direct read / 1 |
| Exact Awaiting Provider | 2 reads / 32 (31-related sentinel fails) |
| Paginated Awaiting Provider | 31 / conservative cap 961 |

Successful maximum measured by endpoint mocks: 31 parent documents plus 30 * 30
related documents = **931**, 31 queries. Related membership >30 fails before its
query; related limit 31 detects overflow and aborts rather than truncating. The
unchanged adapter suite also measures the late-overflow bound 932. No provider,
payment, profile, or other relationship hydration per output row.

Profile authorization (one Firestore profile read plus Auth lookup), one readiness
document read, and the existing rate-limit transaction read/write are additional.
Rate limit: 30 attempts per UID per fixed 60-second window, dedicated scope
`bookings.customerSearch`. Rate-limit SDK transaction retries, index entries,
transport retries and billing minima are separate from source-document counts.
The only intentional write is to existing dedicated `rateLimits` storage.

25-second application deadline; 30-second Functions timeout, 256 MiB memory.
Check deadlines before/after source RPCs and before returning. Already in-flight
RPCs cannot be cancelled by this Admin SDK wrapper; after timeout their completion
cannot schedule another relationship read or return a response. No application
retry or fallback scan. At most 31 sequential query round trips may produce
substantial latency; production p95/p99 latency still needs validation.

Accept at most 4 MiB of cumulative serialized source snapshots and a 256 KiB
serialized response. Source-size checking occurs after an RPC returns, so it is
an acceptance bound, not a network byte cap; a bounded 31-document query can
transfer more before rejection. Firestore per-document limits still apply.
Do not infer bytes/cost from document counts. DTO fields also have explicit size
limits; unsupported source values fail safely instead of exposing arbitrary maps.

## Errors

| Code | Meaning |
| --- | --- |
| `unauthenticated` | Missing Auth/App Check; invalid App Check is rejected by the callable framework |
| `permission-denied` | Inactive, blocked, disabled, missing/invalid profile, or wrong role |
| `invalid-argument` | Invalid request or cursor; do not silently reset |
| `not-found` | Exact ID unavailable, including foreign/deleted |
| `failed-precondition` | Readiness, key, index, source/relationship reconciliation required |
| `resource-exhausted` | Rate or source/query/response budget exceeded |
| `deadline-exceeded` | Application or backend deadline |
| `unavailable` | Other read/backend/snapshot-consistency failure |

The old adapter reports snapshot mismatch as a generic error, safely mapped to
`unavailable`; new readers report `failed-precondition`. Both abort the entire
response. Errors/logs do not include booking data, query values, tokens or backend
exception messages. Existing security helper logs retain account access reasons.

## Index and production activation prerequisites

Existing local definitions cover customer + createdAt DESC (implicit ID DESC)
and customer + status + createdAt DESC + explicit ID DESC. Added definitions:

1. `mainEvents`: customerId ASC, status ASC, __name__ DESC (companion).
2. `mainEvents`: customerId ASC, bookingCode ASC, __name__ ASC (prefix all).
3. `mainEvents`: customerId ASC, status ASC, bookingCode ASC, __name__ ASC
   (filtered prefix, including Awaiting Provider).

`providerRequests.mainEventId == id` uses its single-field index. Exact ID needs
no composite. No index deployment/build state has been verified. A missing index
fails the request; there is no fallback. Definitions alone are not readiness.

Activation requires a separately reviewed server-managed
`appSettings/customerBookingSearch` document. No document was created. Missing,
disabled, expired or incomplete settings reject all search before booking reads.
Required global fields: `version: 1`, `enabled: true`, `indexesReady: true`,
`historicalInventoryReady: true`, `relationshipsReady: true`,
`canonicalStatusesAndDatesReady: true`, and integer `reviewExpiresAtMs` later than
server time. No-search `all`/`draft` in either section additionally requires
`companionContractApproved: true`.
Prefix additionally requires `codeStrategy: "canonical_uppercase_v1"`,
`historicalCodeCoverageReady: true`, `canonicalCodeWritersReady: true`.
These are trusted attestations requiring evidence, never facts proved by fixtures.

The updated local rules deny client writes to this setting, including browser
admins; deploy that restriction as a readiness prerequisite before relying on the
guard. Do not put its signing key in Firestore. Separately provision a random
32..64-byte key as 64..128 hex characters in Secret Manager parameter
`CUSTOMER_BOOKING_SEARCH_CURSOR_KEY`. No key or fallback was provisioned here.

Before any deployment/activation, authorized operators must:

- Inventory historical ownership, canonical statuses, date/absence patterns,
  deletion flags, safe presentation fields, and all relationship versions/counts.
  Reconcile invalid candidates through a separately authorized process; invalid
  candidates may block later navigation. Audit supported ID/code lengths too.
- Prove every searchable stored code is compatible uppercase `BK-` plus hex,
  and every future code writer preserves this corpus. Input matching is case
  insensitive ONLY against this verified corpus. If mixed-case history exists,
  keep prefix readiness false: this raw index cannot retrieve it completely.
  A separately approved normalized index/backfill and synchronous writer coverage
  is required; asynchronous projection alone does not prove completeness. This
  step does not modify writers or implement/execute that backfill. Code-less
  drafts are legal and are not prefix matches.
- Verify/build all required indexes and single-field index availability in the
  actual target; review the read-only SDK snapshot/retry guarantees after upgrades.
- Review tightening of setting permissions, key provisioning/rotation, rate,
  source-byte limits and serial-read latency with operational testing.
- Obtain Pia's companion-section agreement and verify Flutter handles null
  fields, empty continuations and distinct cursor scopes. Keep mobile disabled
  until historical and deployment readiness is established.
- Set expiring activation attestations only after evidence review in a separate
  authorized rollout; do not enable flags merely because local tests pass.

## Step 167 local validation

Functions build passes. New endpoint suite: **25/25**. Combined endpoint,
Step 165/166 helpers/adapters, booking contract, provider relationship/integrity/
lifecycle, phone-booking, account and App Check security plus function-security
suite: **275/276**. The sole failure is the existing export-inventory omission of
`acceptCurrentProviderAgreement`; `searchCustomerBookings` is included in the
updated inventory. Running the HEAD version of the security suite against HEAD
index text reproduces that same omission (98/99). No unrelated test was changed
to hide it.

Changed-file ESLint has no errors; four pre-existing max-length warnings remain
in `functions/src/index.ts`. New TypeScript files have no lint warnings. CJS and
emitted implementation JavaScript syntax checks and `git diff --check` pass.
All database tests use mocks, with no emulator or production Firebase access.
Mock coverage does not certify live indexes, historical completeness, production
latency, or a ready mixed-case normalized-code corpus.

## Step 168-A source-review corrections

Only the readiness guard, search reader, endpoint tests and this handoff changed
in this correction step. No settings were written or enabled. The companion
guard now rejects no-search `all`/`draft` history as well as the companion section
until the presentation contract is approved. Exact IDs (including undated drafts),
prefix search and other status filters keep their existing readiness requirements.

The general paginated reader now separates whole-batch query-boundary checks
from consumed-live-source validation and displayed-row DTO validation:

| Record or defect | Final decision |
| --- | --- |
| All fetched records, including deleted/unconsumed records | Check UID, requested status-query scope, document ID, ordering values/range and strict ordering after the incoming cursor |
| Deleted records with valid scope/order | Consume their positions; ignore irrelevant status (when no status predicate), nonordering dates, relationship and presentation fields; do not hydrate or display |
| Unconsumed lookahead or records beyond a full page | Defer nonordering source and presentation validation; continuation stays at the last consumed record |
| Consumed live records | Validate canonical status, deletion flag and creation evidence before deciding section/evidence eligibility; malformed values explicitly require reconciliation |
| Consumed dated draft in companion section | Validate creation evidence, then consume as a nonmatch without validating presentation fields |
| Displayed records | Enforce the existing public DTO allowlist and field validation |

Malformed ordering values still reject the WHOLE response even on a tombstone,
the 31st lookahead, or a row beyond a full page. History needs Timestamp evidence,
prefix needs a canonical in-range booking code, and the companion needs a valid
ID. Silently skipping a row whose position cannot be trusted would undermine
deterministic ordering and safe continuation. Foreign ownership, wrong filtered
status or prefix range, duplicate/out-of-order positions similarly remain explicit
failures; they are query-boundary breaches, not ordinary nonmatches. Source-byte
and deadline limits still cover all fetched records, regardless of consumption.

The unchanged Awaiting Provider adapter retains whole-batch scope/order checks
and lazy relationship evidence; exact lookup retains indistinguishable
foreign/missing/deleted not-found behavior. No partial success on reconciliation.
Deferred malformed live records are retried from the consumed cursor and fail
when reached, rather than being silently skipped. A malformed present creation
timestamp in a consumed companion draft still fails: treating it as dated or
undated would hide invalid evidence and potentially omit an eligible draft.

Seven targeted endpoint tests were added: companion approval matrix; independent
modes without approval; deleted malformed-field continuation; deferred source,
deletion and presentation defects after a full page/31st lookahead; companion
nonmatch presentation versus creation validation; invalid ordering; and foreign/
incorrectly scoped records at deleted, early-fill and lookahead positions.

Step 168-A validation: Functions build passed; endpoint suite **32/32**, combined
endpoint/candidate-pagination/async-adapter suites **66/66**. Relevant booking and
security regression run **282/283**, with only the existing export-inventory
failure. Changed-source lint passed without warnings. Syntax and whitespace
checks passed. All reads were local mocks; no emulator or production access.

Release blockers remain historical inventory/reconciliation (including code-case
coverage), live index verification, server key provisioning, readiness review and
Pia's companion presentation agreement. The pre-existing
`acceptCurrentProviderAgreement` export-inventory failure remains separately
documented above; no exports or unrelated tests were changed in Step 168-A.
