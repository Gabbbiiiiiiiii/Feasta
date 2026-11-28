# Phase 2B-1: trusted Event List backend

Local-only implementation on `chore/monorepo-setup`. The Phase 2A schema,
validators, adapters, fixtures and migration marker are reused unchanged.
No Web/Mobile UI integration, deployment, emulator, commit, push, or production
write is part of this phase.

## Callable API

New v2 callable export: **`mutateCustomerEventList`**, in FEASTA's existing
`FUNCTION_REGION`, using existing App Check/CORS options and a dedicated
120-request-per-minute authenticated-user rate-limit scope.

Every request has exactly these common fields:

```ts
{
  version: 1,
  requestId: string,          // 16–128 ASCII letters/digits/_/-
  expectedRevision: number | null,
  action: "import" | "add" | "update" | "remove" | "clear" | "schedule" | "cleanup",
  // exactly the action-specific fields below
}
```

Client-supplied customer/owner UID fields, versions, actions and extra keys are
rejected. UID comes exclusively from Firebase callable authentication.

| Action | Additional required fields | Behavior |
| --- | --- | --- |
| `import` | `local`: complete Phase 2A document at revision 0 | `expectedRevision` must be null. Initialize only when absent; existing cloud always wins. Nonempty local data against existing cloud returns review required without merging or dropping local selections. |
| `add` | `entry`: complete canonical entry | Entry identity must not exist; reject distinct entry 25. |
| `update` | `entry`: complete canonical entry | Identity must already exist. Cannot recreate a removed entry or change its typed identity. |
| `remove` | `identity`: canonical typed string | Remove exactly that existing identity. |
| `clear` | none | Empty entries and schedule while retaining owner/version/migration marker. |
| `schedule` | `schedule`: Phase 2A schedule or null | Preserve entries and replace only schedule context. |
| `cleanup` | `submission`: existing multi-provider v1/v2 envelope; `snapshots`: canonical submitted entry array | Require server-created booking proof and remove only full unchanged matching snapshots. See compatibility gate below. |

All non-import actions require the nonnegative safe integer revision actually
read by the caller. Server computes the next revision; callers cannot set it.
Initialize first with an empty canonical local document when there is no saved
account data. Guest records must never be supplied or automatically imported.

Response (metadata only; use the authorized own-document read/listener for data):

```ts
{
  version: 1,
  revision: number,
  changed: boolean,
  migrationReviewRequired: boolean,
  removedIdentities: string[],
  preservedIdentities: string[],
  replayed: boolean
}
```

`changed` includes a revision advance, even when a validated command removes
nothing. Import against existing cloud does not advance the revision. Replayed
responses report the original successful operation's revision, which may be older
than the current list. They are not a snapshot to overwrite current UI state.

Errors: `unauthenticated`, `permission-denied`, `invalid-argument`, `aborted`
(details.reason `STALE_REVISION`, `IDENTITY_EXISTS`, `ENTRY_REMOVED`, plus current
revision), `resource-exhausted` (capacity), `already-exists` (request-ID reuse),
or `failed-precondition` (initialization, proof/reconciliation or revision limit).
Cleanup proof failures include reason `EVENT_LIST_SUBMISSION_PROOF_REQUIRED`.
Unsupported/invalid submission envelopes return `invalid-argument`.

## Atomicity, authorization and idempotency

The callable rejects disabled Firebase Auth users and sessions predating token
revocation using `auth_time` and the trusted Auth user's tokensValidAfterTime.
It then invokes the Admin Firestore `runTransaction` boundary. The transaction
re-reads `/users/{uid}` on every callback attempt, requires customer role,
accountStatus active, isActive true and isBlocked false, and reads the current
planning document and request receipt before any writes. Token role claims and
client UIDs are never authority. Account changes during a transaction force a
retry and a fresh profile authorization check.

Auth's disabled/revocation lookup occurs at callable admission; Firebase Auth
and Firestore are not a single atomic datastore. Transactional account-profile
checks protect concurrent FEASTA profile suspension, but there is no claim of
atomic cross-service Auth revocation.

Actual Firestore reads/writes use `customerEventLists/{authenticatedUid}`.
The existing Phase 2A `applyPlanningCommand` is adapted to the real transaction;
it enforces the shared validator and exact +1 compare-and-swap revision. Reads
finish before any creates/sets. Stale logical mutations reject even when
Firestore retries its callback; the expected revision is never silently rebased.

Each successful operation atomically records
`customerEventLists/{uid}/operations/{requestId}` with version, owner, SHA-256 of
the stable complete request, and compact result metadata. An identical request
replays without writes, including after later list mutations. A different body
using that successful request ID rejects. Commit failures leave neither list nor
receipt. Receipts have no TTL; deleting them would weaken duplicate protection.
No client has access to these receipt subcollections under the existing Rules.

Cleanup also records server-only
`customerEventLists/{uid}/submissionCleanups/{bookingId}`. The identities already
examined for that confirmed booking cannot be consumed again, even under a new
request ID after the customer re-adds an identical entry. This record commits
atomically with list changes and the operation receipt.

Schema enforcement uses the unchanged Phase 2A contract: 24 unique typed
identities, 24,000 compact UTF-8 JSON bytes per entry and 100,000 per document.
The complete mutation envelope additionally has a 300,000-byte bound. No native
serialization occurs on the backend, so foreign themes/services/configuration
fields survive unrelated operations. Updates require a complete canonical entry;
Phase 2B-2 must retain the canonical envelope and explicitly preserve fields its
native editor cannot represent.

## Trusted submission cleanup and compatibility gate

Cleanup reuses the existing v1/v2 multi-provider envelope parsers and deterministic
booking ID. Its fingerprint algorithm matches `submit-multi-provider-booking.ts`.
Inside the same transaction it reads `mainEvents/{bookingId}` and
`bookingSubmissionOutcomes/{bookingId}`. It requires matching customer/request/
booking identities and exact accepted-envelope fingerprint, no contradictory
outcome, recoveryStatus none, no reconciliation-required flag, and all linked
provider-request records with matching owner/event/provider/package-or-service.
An unknown response without committed proof, rejection, malformed/foreign data,
or reconciliation-required evidence cannot clean up. Existing booking status
`pending_provider_approval` is a confirmed backend creation, not an unconfirmed
submission attempt. Payment/provider approval state is not changed.

Each snapshot must match a selection in that proven envelope. Exact canonical
configuration matching is accepted. Mobile's existing event normalization,
legacy revision projection and minimal marketplace transport are supported
explicitly. Marketplace snapshots containing customization omitted by that
transport fail closed. The current canonical entry must match the **entire**
submitted snapshot; newer configuration and metadata edits remain saved.
Unrelated entries and existing bookings/provider requests are never written.

**Blocked compatibility area:** single-booking and custom-menu cleanup are not
enabled. `submit-booking-request.ts` has a different fingerprint projection
(lines around createSubmissionFingerprint) which does not preserve/bind the full
theme/customization configuration; it cannot be treated as multi-provider proof.
Web flattened/other foreign projections that cannot be matched losslessly also
fail closed. The smallest safe extension is a separately reviewed server-side
snapshot-binding/proof adapter covering those booking paths. No booking contract,
submission recovery or reconciliation algorithm was changed here. Phase 2B-2
must not interpret unsupported cleanup as permission to resubmit a booking.

## Tests and limitations

Server tests use real Admin SDK references and an in-memory optimistic transaction
harness that rejects reads after writes, retries read-version conflicts and
simulates atomic commit failure. These test application transaction behavior,
not the Firestore service itself or Rules enforcement.

Actual validation:

| Scope | Result |
| --- | --- |
| New backend suite + unchanged schema consistency test | 75 passed (74 backend tests + 1 schema test) |
| Existing multi-provider and mixed-provider submission integration suites + submission outcome/kernel/callable suites | 59 passed across 4 files |
| Existing Phase 2A Web contract suite | 48 passed |
| Functions `tsc` and final `tsc --noEmit` | passed |
| Targeted Functions ESLint (`src/customer-event-lists/*.ts`) | passed, zero warnings |
| `git diff --check` | passed |
| Existing dedicated customer Event List Rules suite | 1 skipped; zero Rules assertions executed |

An initial test incorrectly expected App Check configuration in the SDK's
deployment metadata; it was corrected to check the actual callable configuration.
The callable reuses existing SDK middleware, whose App Check token verification
was not exercised end-to-end. No remaining failures in the executed suites.

The dedicated Rules suite is executed through the existing infrastructure but skips without an explicitly
configured emulator; this phase never starts one. Actual Rules assertions and
real-service transaction integration remain pending authorized emulator access.

The existing Phase 2A rules are byte-for-byte preserved: active owners may get
their authorized planning document; direct client writes/deletes and subcollection
receipt access remain denied. No schema migration, index or IAM changes here.

## Exact changed files and backup

Modified existing file:

- `functions/src/index.ts` — one callable export added; preexisting booking exports retained.

New files:

- `functions/src/customer-event-lists/customer-event-list-callable.ts`
- `functions/src/customer-event-lists/mutate-event-list.ts`
- `functions/src/customer-event-lists/submission-proof.ts`
- `functions/test/customer-event-list-backend.test.cjs`
- `docs/customer-event-list-phase2b1-backend.md`

All 110 preexisting modified/untracked files were copied and SHA-256 verified
before edits in
`C:\Users\gabbyyy\AppData\Local\Temp\feasta-phase2b1-20261116-002941`.
Phase 1/2A files, rules, shared-types vendor files and unrelated work are preserved.

## Phase 2B-2 readiness

The local endpoint is ready for development against the documented API, with
cleanup limited to verifiable multi-provider flows. Complete the unsupported
proof adapters or explicitly retain those entries with a cleanup-retry/review
state before claiming full Step 23B-21D support. Execute Rules/service integration
tests before coordinated release. Keep UI sync disabled until authorized backend
and Rules deployment and client integration validation are complete.
