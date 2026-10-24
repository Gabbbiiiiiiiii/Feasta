# Step 165: customer booking search prerequisites

**BLOCKED — FURTHER CONTRACT WORK REQUIRED**

Branch: `chore/monorepo-setup`.
HEAD: `bf41139c371686be4566f9edf73b5377d0ef2ea9`.
Starting worktree: only the untracked Step 164 audit; preserved unchanged.

This decision supersedes the Step 164 draft-projection assumption: adding fields
to editable drafts is not necessary to enumerate them correctly. It also narrows
the count concern: for valid v1 relationships, complete membership IS the active
required set. Different call-site argument names alone do not establish a bug.
The remaining demonstrated hazard is incomplete validation of the source state,
not a proven production-data incident. No production data was inspected.

## Safe local changes

Added `functions/src/bookings/customer-booking-search-prerequisites.ts`:

- `inspectAwaitingProviderEvidence`: pure, audit-only v1 evidence validator.
  Missing, invalid, stale, foreign, contradictory, or unsupported evidence returns
  `reconciliation_required`, without a fabricated zero count or false result.
- `customerBookingHistoryQueryContract`: pure bounded candidate-query contract
  for `all` and `draft`, scoped to a server-derived customer ID and ordered by
  document ID. It deliberately has no timestamp/deletion-field requirement.

Added local regression fixtures in
`functions/test/customer-booking-search-prerequisites.test.cjs`.
Neither helper is exported as a deployed function or called by existing writers.
No canonical submission, lifecycle, payment, financial, rule, index, mobile, or
existing test file changed. No partial callable was implemented.

## Decision A: drafts remain source documents without extra fields

Use `mainEvents` directly for ordinary history and the Draft filter. A single
customer-scoped query can include both drafts and submitted events; splitting
them is unnecessary if ordering is by document ID. Add `status == draft` for
the Draft filter. Exact ID mode remains a direct source-document read, followed
by strict customer ownership and deletion checks. Return indistinguishable
not-found behavior for foreign, nonexistent, and deleted IDs.

The history query orders `__name__ ASC`, not `createdAt`. This is deterministic
but deliberately not newest-first. It includes legal drafts missing `createdAt`,
including drafts that add that optional field later. It avoids a merged cursor
and fabricated creation dates. No draft fields or rules need changing.

Do not constrain history by `isDeleted == false` or `isDeleted != true`:
missing-field legacy records must remain visible. Read a bounded candidate batch
(the pure contract emits at most pageSize + 1, maximum 31). Check source
`isDeleted === true` before presentation. Never loop until a full nondeleted page
is found. Empty/short result pages may have a continuation. Continue after the
last CONSUMED candidate, including tombstones; if stopping at the result limit,
do not consume an unreturned qualifying lookahead document. The final endpoint
must define `hasMore` as candidate continuation availability, not a guarantee
of another nondeleted result. The fixtures demonstrate enumeration beyond 30,
sparse records, foreign-customer exclusion, and an empty tombstone batch followed
by a valid record. They are a query-contract model, not Firestore integration QA.

If product parity requires newest-first full pages, that is a different contract:
it needs trusted ordering/visibility metadata or a more involved merged protocol.
Do not silently claim that the ID-ordered design provides chronological parity.

No separate collection is selected. It would require synchronous writer coverage
and a freshness protocol; an asynchronous trigger plus a historical backfill
cannot guarantee immediate completeness after a newly written source document.

## Case-insensitive prefix search and historical codes

The canonical submission writer creates `BK-` plus uppercase hex and never uses
an editable draft as the authoritative submitted document. Legal clean drafts
cannot contain `bookingCode`; they have no booking-code prefix match. Their
document ID remains available through exact-ID mode. Web display falls back to
document ID, but web prefix matching reads the stored code, so these semantics
must be kept distinct in the future mobile contract.

For current canonical uppercase codes, uppercase the input and range-query the
existing `bookingCode`: no normalized duplicate is intrinsically necessary.
However, this says nothing about historical codes. A production inventory is
required before choosing that optimization. If mixed-case historical codes
exist, an uppercase-input range on raw codes is incomplete. Do not enumerate
case variants, download all history, or normalize canonical display codes in
place. The alternative is a trusted normalized field on CODE-BEARING records,
maintained synchronously by every legitimate code writer and backfilled before
activation. Do not stamp it onto editable code-less drafts. Historical code-bearing
`draft` documents are outside today's clean draft schema already; inventory them
separately and preserve their identity and existing edit behavior.

Normalization target is trim + uppercase, matching the web service. The inventory
must establish supported historical alphabets/lengths and a correct exclusive
prefix upper bound. Do not assume an ASCII bound covers arbitrary Unicode legacy
codes. Mixed-case or malformed legacy records cannot be silently omitted while
describing the search as complete. No production inventory or backfill was run,
so the raw-code versus normalized-field decision remains readiness-gated.

## Decision B: authoritative unanswered-provider evidence

An unanswered request is a trusted, identity-validated active required assignment
with canonical status `pending` and no recorded response/terminal timestamps.
Nonpending accepted, waiting-payment, payment-processing, confirmed, in-progress,
completed, rejected, cancelled, and expired requests do not count. Status is not
inferred from a deadline or a missing field. A pending record with response,
acceptance, rejection, cancellation, expiry, confirmation, or completion evidence
requires reconciliation rather than a guessed response state.

The new inspector requires the parent and EXHAUSTIVE linked request snapshots
from one consistent read. It reuses the existing relationship resolver to check
identities, complete membership, missing/extra documents, and statuses. The caller
must establish exhaustiveness and trust; passing only stored IDs cannot prove
that no unlisted linked document exists. This helper does not perform DB reads.

- Supported v1: absent version or explicit `1`. Every canonical member is an
  active required assignment; there is no superseded subset.
- V2: complete membership includes historical attempts, while active assignments
  are validated chain tips. This remains a separate compatibility rollout. The
  new inspector rejects v2, unknown versions, and v2 markers mixed into v1.
  Existing resolver v2 fixtures still run, without enabling production use.
- Counts: `providerRequestCount` must equal the validated active set size and
  `pendingProviderRequestCount` must equal the derived unanswered count. Both
  must be nonnegative safe integers. Missing/invalid/inconsistent values return
  reconciliation, including stale zero counts that could hide real matches.
- Parent: canonical status must be valid. A positive unanswered count requires
  `pending_provider_approval` or `needs_provider_replacement`; otherwise evidence
  is inconsistent. Awaiting Provider requires that parent status AND count > 0.
  Rejected-only bookings with an authoritative zero never qualify.

This is a SEARCH EVIDENCE contract, not a replacement parent-status calculator.
It intentionally leaves legacy lifecycle outcomes unchanged.

## Inventory of parent pending-count writers at the audited HEAD

Repository searches covered literal count writes and all summary-calculator
callers. The following are the runtime write paths (line numbers refer to HEAD):

| Path | Count source / write | Validation or dependency |
| --- | --- | --- |
| `bookings/submit-booking-request.ts:1505` | All newly created requests are pending; initializes count to request count | Trusted canonical creation; no changes made |
| `provider-requests/accept-provider-request.ts:561,713` via `provider-acceptance-plan.ts:46,78` | Complete linked set, responding and accepted-sibling overrides | Validates canonical lineup and statuses; acceptance also chooses payment/confirmed states |
| `provider-requests/reject-provider-request.ts:242,277` | All `mainEventId`-linked requests, rejection override | Target core validation does not validate every sibling through the relationship resolver |
| `provider-requests/update-provider-booking-lifecycle.ts:514,662` | Complete linked set, target lifecycle override | Membership/customer checks; summary calculator still supplies invalid-status fallback; same module has read-only summary gates at 439 and 485 |
| `bookings/booking-lifecycle-v3.ts:116,127` | Validated active requests, service-start override | Relationship resolver; all/active coincide for valid v1; 111 is a read-only gate |
| `payments/create-payment-session.ts:1390,1445` | Validated active requests, initial-payment processing override | 586 and 1373 are eligibility calculations only; remaining-balance branch skips parent summary write |
| `payments/process-webhook.ts:1133,1142` | All linked requests plus payment-outcome override | Set integrity at 95 checks membership IDs, not every sibling's identity/status/response evidence |
| `payments/remaining-balance-enforcement.ts:110,130` | Validated active requests with cancelled override | Payment-default lifecycle and refund reservation share the transaction |
| `refunds/refund-execution.ts:889,1384` via `mainEventUpdate:4755` | All linked requests with approved-cancellation override | Financial cancellation transaction; changing summary semantics needs separate review |

The audited server tree has no separate provider-response expiration writer.
Acceptance writes payment deadlines. Webhook payment expiry sets the request back
to `waiting_for_down_payment` with payment status `expired`; it does not make it
an unanswered response or automatically authorize replacement. Balance-deadline
enforcement cancels requests and updates the parent. Legacy mobile repository
code contains historical direct booking writes, but they are not an authorized
canonical writer under current rules; do not restore those permissions.

### Exact remaining dependency and stop condition

`calculateMainEventRequestSummary()` maps any unparseable sibling status to
`pending`. A fixture with one rejected request and one invalid-status request
produces a positive pending count in the existing calculator; the new inspector
requires reconciliation. This reproduces the hazard locally without modifying
the shared calculator or inventing production incidents.

Changing that fallback affects rejection, provider lifecycle, payment-webhook,
checkout, payment-default, and cancellation/refund decisions. In particular,
`process-webhook.ts` can reach the summary calculation with a membership-valid
set whose sibling statuses were not validated by its ID-only set checker.
Making the shared calculator throw or filtering siblings can change webhook
transaction success and parent lifecycle outcomes. This is the explicit
payment-related dependency where Step 165 must stop. A separate approved review
must define how to retain gateway/financial truth while flagging invalid booking
evidence, then verify all writer paths and historical reconciliation. No such
behavior change was made here.

Therefore existing `status` plus `pendingProviderRequestCount > 0` are NOT yet
proven safe as complete authoritative search predicates. Per-result validation
can reject false positives, but cannot recover a real match hidden by a stale
zero count. A new eligibility flag alone merely moves this problem. All future
writers need one validated invariant and historical data needs verification
before indexed Awaiting Provider can claim completeness.

## Query, cursor, index, and readiness decision

| Mode | Source and proposed ordering | Remaining condition |
| --- | --- | --- |
| `none`, all/draft | Owned `mainEvents`, `__name__ ASC`; bounded candidate continuation | Draft schema conflict resolved at design level; chronological/full-page semantics are different |
| `none`, other status filters | Owned source, canonical web status equality or `in`, ID order | Audit legacy status aliases; Awaiting Provider additionally blocked by invariant above |
| `code_prefix` | Owned code-bearing source, code range, code ASC then ID ASC | Prove uppercase raw-code coverage or normalized-field writer/backfill coverage |
| `booking_id` | Direct `mainEvents/{id}` read | Strict ownership, deletion, requested status check; no projection needed |

Future opaque cursors must bind authenticated UID, mode, normalized value, status,
page size, ordering version, and last consumed ordering values. Include code for
prefix queries and document ID for every list query. Reject malformed/mismatched
cursors; never silently restart. No cursor codec is implemented in this step.
Pagination is deterministic for a stable dataset, not a frozen snapshot across
requests: concurrent creation/status/code changes can affect subsequent pages.
Immediate source reads avoid asynchronous projection lag but do not repair stale
source counts. Do not promise snapshot-stable history without a separate design.

No new indexes were added. Expected index shapes AFTER the contract is resolved:

- History: customer equality + ID order; draft/status: customer + status + ID.
- Prefix: customer + selected code field + ID; status-filtered prefix adds status.
- Direct indexed awaiting-provider, IF approved: customer + status + pending count
  range + ID; prefix with that predicate also needs the selected code range field.
  Final inequality ordering and exact index definitions belong to implementation.

Reuse existing compatible definitions; do not add speculative duplicates. Multiple
range queries need suitable indexes, and field ordering affects scan cost.
See [Firebase range-query guidance](https://firebase.google.com/docs/firestore/query-data/multiple-range-fields)
and [field existence and ordering](https://firebase.google.com/docs/firestore/query-data/order-limit-data).
The pure query model does not prove deployed indexes or backend query execution.

No migration is needed to enumerate sparse drafts using ID order. Historical
code normalization, canonical status aliases, relationship membership, missing
counts, contradictory evidence, and unsupported versions require an authorized
dry-run inventory and explicit reconciliation plan. Future readiness requires
complete coverage AND ongoing synchronous maintenance, local regression success,
approved migration verification, and deployed/built indexes. None was run against
production. No deployment or activation readiness is claimed.

## Local validation

- `pnpm --dir functions build`: passed (shared runtime preparation + TypeScript).
  Generated manifest line endings were restored; no generated tracked diff remains.
- Changed TypeScript ESLint and CJS syntax check: passed.
- New prerequisite suite: 13 passing tests.
- New suite plus relationship, adapter, provider lifecycle/integrity and phone
  booking security suites: 97 passing tests.
- Including `function-security-contract.test.cjs`: initial combined run had
  194/195 passing before the 13th new test was added. The existing export inventory
  assertion at line 490 omits `acceptCurrentProviderAgreement`, already exported
  at HEAD `functions/src/index.ts:27`. No exports or existing tests were changed;
  this unrelated baseline mismatch remains reported, not fixed.
- `git diff --check` and added-file whitespace checks: passed.

No emulator, production read/write, backfill, migration, commit, push, deployment,
new branch, or worktree. Step 166 must wait for the payment/lifecycle invariant
review and historical code/status readiness decisions above. Stop for review.
