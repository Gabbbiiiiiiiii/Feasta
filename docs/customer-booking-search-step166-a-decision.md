# Step 166-A: bounded candidate search without lifecycle changes

Branch: `chore/monorepo-setup`.
HEAD: `bf41139c371686be4566f9edf73b5377d0ef2ea9`.
The four existing untracked Step 164/165 prerequisite files are preserved.

**Decision: the indexed candidate design can be implemented locally without
payment-webhook, booking-submission, or financial lifecycle changes. Full
historical-data completeness, production deployment, and mobile activation are
NOT READY.** The history/draft section contract and code-case readiness decisions
below must be accepted before claiming a complete mobile parity API.

This supersedes Step 165's claim that changing the shared status calculator is a
necessary dependency for read-only search. That change is necessary to repair the
writer invariant, but search can instead use a broader indexed candidate set and
fail explicitly on evidence requiring reconciliation. No writer repair is made
or required by the candidate design. There is no callable in this step.

## Implemented locally: pure helpers only

Added:

- `functions/src/bookings/customer-booking-candidate-pagination.ts`: parent and
  related-query plans, strict bounded v1 evaluation, a lazy batch consumer,
  nanosecond-precision chronological positions, and HMAC-authenticated cursors.
- `functions/test/customer-booking-candidate-pagination.test.cjs`: actual
  result-limit/lookahead/continuation tests, distinct from the older Step 165
  candidate-enumeration model. The previous four files remain unchanged.
- This decision document.

The consumer's evaluator is an internal pure callback. The future adapter MUST
use `awaitingProviderRelatedQuery` and `awaitingProviderCandidateMatches`, not
replace them with a status/count shortcut. These helpers do not read Firebase,
authenticate users, implement a presentation DTO, provision keys, or register
functions. They are not an operational or partially deployed endpoint.

## Candidate superset and evidence

For no-text-search Awaiting Provider, query `mainEvents` using:

```
customerId == authenticated UID
status in [pending_provider_approval, needs_provider_replacement]
orderBy createdAt DESC, document ID DESC
limit 31
startAfter(lastConsumed.seconds/nanoseconds, lastConsumed.documentId)
```

Never query `pendingProviderRequestCount > 0`. For canonical, dated, valid v1
source records this query is a superset of every web-compatible eligible booking,
including a candidate whose stored pending count is incorrectly zero. Such a
candidate is reached and fails reconciliation instead of disappearing at the
index predicate. Every valid eligible record is navigable on a stable dataset by
following continuations. No call loops to fill a page or downloads full history.

For each consumed nondeleted candidate, validate exhaustive linked relationships
using the unchanged Step 165 evidence helper. Valid v1 has complete membership
equal to active assignments. Only canonical `pending` requests without recorded
response/terminal evidence count. Accepted/rejected/cancelled/expired siblings do
not count. A rejected-only candidate with authoritative zero is a valid nonmatch.

Missing or stale counts, invalid status, missing/unlisted/foreign linked records,
contradictory evidence, mixed-version data, or v2/unknown relationship versions
abort the WHOLE response with `failed-precondition` and a reconciliation reason.
Return no partial rows or advanced cursor on that error. Retry the original
cursor after separate reconciliation; do not offer a skip-invalid-record switch.
V2 is rejected before related reads; it is never passed as a successful runtime
case to the relationship resolver by this design.

Completeness is scoped to canonical statuses and valid source records. Aliased
parent statuses outside the query or missing timestamps on non-draft records
cannot be discovered by this query; their historical inventory is a rollout
gate. This design does not certify all production records as valid or repair
records written with inconsistent evidence. Invalid eligible candidates can
block subsequent navigation until reconciliation; that is explicit failure,
not successful complete search.

## Read limits, consistency, and safe failure

- One parent query returns at most 31 source documents: 30 consumable candidates
  and one lookahead. At most 30 live candidates are evaluated per call.
- Preflight stored membership: absent/empty IDs fail; more than 30 IDs fails
  `related-record-budget-exceeded` without attempting an exhaustive read.
- For each consumed live candidate, query `providerRequests` by exact
  `mainEventId`, with `limit(31)`. Never fetch only the stored IDs: that cannot
  detect an unlisted linked document.
- Fewer than 31 returned records proves the limited query exhausted its matching
  set at that read snapshot. Exactly 31 is overflow and fails, including a valid
  booking larger than the supported related-record budget. Never truncate and
  call the remaining 30 authoritative.
- Conservative source-document cap in one application attempt: **961**
  (`31 + 30 * 31`), in at most **31 queries**. Early full pages, tombstones and
  preflight failures reduce this. This is a cap, not an estimate of typical cost.
  Empty-query minimum billing, index entries, auth/profile checks, rate-limit
  storage, SDK transport retries, and byte sizes are separate from that document
  count. Successful exhaustive related queries return at most 30 each, so a
  successful all-candidate page returns at most 931 source documents. The 961
  budget also covers overflow sentinels. There are no per-match payment/provider/
  profile hydration queries here.
- Use one read-only consistent snapshot for parents and all related reads. Do
  not validate a parent from one point in time against later related snapshots.
  A future adapter must verify SDK retry behavior, enforce request timeout, and
  avoid application retry loops that multiply the stated budget. Prefer field
  masks for identity, membership, response evidence and safe presentation fields;
  exclude financial secrets. A document-count bound alone is not a byte bound;
  enforce response-size and runtime limits and fail on exhaustion rather than
  retrying scans. Operational latency/cost require later integration validation.

Read-only snapshot semantics are distinct from a frozen multi-page session.
Across calls, creation/status changes may affect membership; there is no promise
of snapshot-stable results across concurrent mutations. The no-skip/no-duplicate
tests prove stable-dataset traversal. No snapshot session store is introduced.

## Consumed candidates, displayed matches, and lookahead

The batch consumer stops at the first of: pageSize matches, 30 consumed
candidates, or end of the returned source batch. Page size defaults to 10 in the
future parser and must be an integer 1..30. Only matches become display rows.
Tombstones and validated nonmatches still consume their source position.

The extra record is NOT consumed or evaluated at the scan budget. When a page
fills early, ALL remaining source candidates remain unconsumed, not just the
31st. `hasMore = consumed < sourceBatch.length`. The continuation uses the last
CONSUMED candidate, never the fetched tail, never an undisplayed matching
lookahead, and never merely the last displayed row. On a final page no
continuation is emitted. Empty pages can have a continuation. `hasMore` promises
more candidates, not necessarily another matching nondeleted booking.

Tests cover page sizes 10 and 30, a matching 31st record, early fill, 97 source
records, consecutive empty pages, tombstones without linked reads, final batches,
timestamp ties, nanosecond differences, duplicate prevention, and strict failures.
The older Step 165 model consumed its whole candidate batch; it is not the
endpoint algorithm and is superseded by these result-limited tests.

## Cursor contract

Locally implemented cursor scope: chronological no-text-search history. A
versioned, base64url payload is authenticated with HMAC-SHA256 and a separately
supplied server key of at least 32 bytes. No production key was created.
Authenticate before accepting a cursor; derive the expected customer binding
from server auth, never from the token/client. Bind UID, status, page size,
section, search mode/value, and ordering version. Preserve Firestore seconds AND
nanoseconds plus document ID. Validate schema, timestamp ranges, IDs, token
length, canonical encoding, signature, and exact binding. Invalid tokens reject
with `invalid-argument`, never restart. Key rotation invalidates old tokens.

Clients must treat tokens as opaque. Authentication is not encryption: do not
put credentials or unrelated private values in the payload. Prefix/undated
sections need different versioned position schemas before implementation; this
helper explicitly rejects those bindings. No cursor-document lookup is needed,
so deletion of the consumed source document does not destroy its position.

## Preserve history UX and accommodate sparse drafts

| Contract | Actual or proposed behavior |
| --- | --- |
| Current mobile | `feasta_repository.dart:1521` queries owned records by `createdAt DESC`, ID DESC, limit 20, as a live stream. `customer_bookings_screen.dart:36` consumes it. It is a capped live feed, not an existing load-more cursor implementation. |
| Current web | `customer-booking-service.ts:148-163` uses status-scoped chronological ordering with ID tie-breaker; default/max 10/30. Awaiting-provider loops through batches without a whole-call bound. Text search downloads all owned history. Neither scanning behavior is copied. |
| Proposed server history/filter | Keep dated history `createdAt DESC`, ID DESC and bounded candidate pagination. Do not switch the default history feed to ID order. Search prefix results have an explicitly distinct code ordering, not an implicit change to ordinary history. |

Legal clean drafts may lack `createdAt`/`isDeleted`; adding server search fields
would break their clean schema. Do not touch them. A creation-time ordering
cannot assign true chronology to a document without creation-time evidence.
Firestore ordering excludes documents missing the ordered field; see
[Firebase ordering documentation](https://firebase.google.com/docs/firestore/query-data/order-limit-data).

Propose two explicit sections, with separate bound cursors:

1. `history`: the existing dated chronological feed, including dated drafts.
2. `undated_drafts`: an additional clearly labeled draft section. Query owned
   `status == draft`, order ID DESC, limit 31, then consume at most 30 candidates
   and return only nondeleted drafts lacking `createdAt`. Dated drafts are valid
   nonmatches in this companion query, not duplicates displayed in both lanes.
   No query for field absence or missing deletion flags is required. Non-timestamp
   present values require reconciliation. The section is applicable only to
   no-search `all`/`draft`; pagination uses the same consumed/lookahead principle.

This is a proposed contract extension for review, NOT a mobile change. The
ordinary history UI must discover and offer the companion section; it cannot
claim full draft coverage if it only calls the dated section. Cursor position,
query adaptation, and consumer tests for this companion section still belong to
the next implementation step; only chronological Awaiting Provider is prototyped.
Concurrent addition of a draft's optional timestamp can move it between lanes.

If a SINGLE fully merged chronological list including undated records is
mandatory, additional trusted persisted ordering metadata plus a freshness
protocol is required, or an explicitly approved missing-date ordering policy
and merged cursors. Firestore document creation metadata is not an existing
queryable `createdAt` field. An async projection trigger alone cannot prove
immediate completeness. Do not fabricate dates or silently alter user sorting.

## Booking codes: indexed capability versus historical readiness

Canonical submission generates ASCII `BK-` + uppercase hex
(`submit-booking-request.ts:380`). For that corpus, customer equality plus an
uppercase raw `bookingCode` range supports prefix search without a duplicate
field. Example ASCII prefix bounds: `>= BK-1D8` and `< BK-1D9`; production must
compute the proper exclusive bound for its validated alphabet. Order by selected
code field ASC, ID ASC; use bounded candidates, ownership/deletion checks and
the same lookahead principle. With Awaiting Provider, also restrict parent
statuses and apply bounded v1 evidence validation, not pending-count indexing.

Do NOT infer that historical codes are uppercase. Before enabling raw-code
prefix mode, an authorized inventory must prove complete compatible code coverage
and the supported alphabet/lengths. Missing codes are not code-prefix matches;
owned exact IDs still work. Code-less legal drafts stay unchanged. The public
contract must distinguish stored booking codes from document-ID display fallbacks.

Mixed-case history cannot be made complete with the uppercase-input raw-code
query. It needs a verified server-owned normalized field/index or equivalent
complete alias index, preserving canonical display codes and IDs. Such a design
needs explicit coverage and synchronization guarantees for ALL future code
writes. No normalized field is added to editable drafts. An async trigger alone
cannot establish immediate completeness for newly written records. Under a strict
no-writer-change scope, full mixed-case prefix support remains blocked until an
alternative with proven synchronization is approved; a corpus proven compatible
with existing canonical raw codes needs no submission writer change.

No inventory, migration, backfill, projection, or index deployment was performed.
Prefix completeness is a data/readiness gate, not proved by the local candidate
tests. Canonical status aliases and missing non-draft dates need separate audit.

## Proposed callable surface and rollout gates

Future callable: `searchCustomerBookings`, region `asia-southeast1`.
Proposed request, including the section extension for review:

```json
{"search":{"mode":"none","value":""},"status":"awaiting_provider","pageSize":10,"cursor":null,"section":"history"}
```

Modes remain `none`, `code_prefix`, `booking_id`. `none` must have an empty value;
blank prefix/ID input rejects rather than changing modes. Validate unknown fields,
types, sizes, search alphabet, all eight web status filters, section applicability
and cursors. Exact IDs use a direct owned source read, apply requested filters,
and reject nonnull cursors. Future prefix/companion cursors are distinct schemas.

Response stays `{bookings: [...], nextCursor: string|null, hasMore: boolean}`.
Display rows require an explicit safe presentation allowlist, not the raw source
objects returned internally by the pure consumer. UI integration must understand
empty continuations and companion sections. No response DTO is implemented here.

Reuse authenticated, verified active-customer checks, App Check and rate limiting;
derive UID server-side. Search never writes bookings/payments. Rate-limit writes
remain limited to existing dedicated rate-limit storage. Error categories:
`unauthenticated`, `permission-denied`, `invalid-argument`, generic `not-found`
for exact-ID misses/foreign/deleted, `resource-exhausted` for rate limits,
`failed-precondition` with reconciliation/readiness reasons, and `unavailable` or
`deadline-exceeded` for read/snapshot/runtime failures. No partial success on
reconciliation or exhausted related evidence; no error fallback to a broad scan.

Index requirements (definitions/build state must be verified during implementation):

- Owned dated history: customer ASC, createdAt DESC, ID DESC (existing compatible
  definition has implicit descending ID).
- Status/awaiting dated history: customer ASC, status ASC, createdAt DESC, ID DESC
  (explicit existing definition).
- Undated companion candidates: customer ASC, status ASC, ID DESC; this is a
  different query, so do not assume the createdAt index supplies missing dates.
- Prefix: customer ASC, selected code field ASC, ID ASC; status-scoped prefix
  additionally includes status ASC before the code range. Related-query
  `mainEventId == id` uses its field index. No pending-count composite is required.

No speculative index definitions were added. Exact ID needs no composite. Future
index building is a deployment gate, not something these pure tests certify.

Readiness is explicitly separated:

- **Local design:** dated candidate/filter and exact-ID design can proceed without
  writer changes; 18 new tests demonstrate the bounded chronological core.
  Remaining modes/section adapters, public validation, auth, DTO, and rollout
  gates still require implementation; no complete callable exists locally.
- **Historical completeness:** unverified. Reconcile invalid evidence and audit
  statuses/dates/codes/relationship versions. Larger linked sets fail safely.
- **Production deployment:** not ready; no deployment, production key, readiness
  inventory, or index build confirmation. Prefix corpus compatibility must be
  proved or its normalized-index synchronization dependency resolved.
- **Mobile activation:** not ready; no UI change. Review the companion-draft
  contract, preserve the newest-first default and implement empty-page continuation
  handling only after complete API validation and deployment readiness.

## Validation and safeguards

Functions build (`pnpm --dir functions build`) passed; final TypeScript compile,
changed-file ESLint, CJS syntax and whitespace checks passed. New suite: 18/18.
Combined new suite plus Step 165, relationship/adapter, provider lifecycle,
provider integrity and phone-booking security suites: 115/115. No emulator used.
The unrelated existing export-inventory failure recorded in Step 165 was not
changed; no deployed exports were added. Tests use local source fixtures only,
not a Firestore index emulator or production query integration.

No booking/payment writers, rules, index definitions, or mobile code changed.
No production access, migration, backfill, commit, push, deployment, branch or
worktree creation. Stop for review.
