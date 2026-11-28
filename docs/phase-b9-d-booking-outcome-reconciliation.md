# B9-D authoritative booking outcome reconciliation

Local implementation only. No emulator, Firebase data writes, rules edits, deploy,
production submission, commit, or push was performed. Existing working changes
and untracked files were retained. B9-C documentation describes the prior state;
this document supersedes its reconciliation limitation for future receipted requests.

## Protocol and transaction boundary

`reconcileBookingSubmission({clientRequestId})` requires authenticated customer
authorization, existing App Check callable options, and a separate rate limit.
UID comes exclusively from authentication. Extra fields (including customer ID,
errors, timestamps, selections, and policy information) are rejected. The server
derives the unchanged SHA-256(`${uid}:${clientRequestId}`) first-40-hex booking ID.
A single read-only transaction reads `mainEvents/{id}` and
`bookingSubmissionOutcomes/{id}`. It never replays submission or backfills evidence.

- `confirmed_created`: canonical booking has matching customer, request ID, event
  ID, and valid provider request IDs. Only canonical result IDs are returned.
- `confirmed_rejected`: no booking exists and a matching, versioned server receipt
  has a committed Firestore timestamp, fingerprint and recognized rejection reason.
- `unresolved`: missing, malformed, foreign or contradictory evidence. Missing
  bookings alone never establish rejection. Transport/read errors also retain the lock.

Inspected submission paths: authentication/role/rate limiting, pretransaction
selection parsing and verification lookup, existing-booking ownership/fingerprint
replay, maintenance/catalog/occasion gates, V2 authority/revision, customer and
provider verification, package/menu/offer/food validation, canonical terms/pricing,
refund resolution/acknowledgments, agreements, availability, final deadline check,
atomic booking/provider requests/timeline/notifications/audit writes, and outer
error mapping. Existing creation and fingerprint semantics remain in place.

For new bookings the transaction now reads the receipt before any validation or
write. A valid receipt permanently fences the identifier; a different fingerprint
conflicts, and malformed receipts fail closed. Existing bookings still replay first.

Receipts are deliberately limited to the two existing refund-policy and payment
agreement acknowledgment assertion gates. An allowlisted server `HttpsError`
from those assertions queues only a receipt and immediately returns from the
callback. The original error is thrown **after `runTransaction` commits**. No
booking, maintenance-admission, notification, financial or audit creation write
has been queued at either receipt gate. Earlier failures, invalid policy
configuration, availability failures, unexpected errors and timeouts do not
produce receipts. They remain unresolved unless a booking is found.

Concurrent success and rejection both read the absent booking and receipt.
Whichever commits first invalidates the other's reads: a retry sees either the
booking (owned replay/fingerprint conflict) or the permanent receipt (rejection).
Firestore callback retries carry no mutable rejection state outside the callback.
A precommit interruption leaves no evidence; loss of the callable response after
commit is recoverable by lookup. A response error code is never sufficient proof.
Receipt documents must have no TTL, cleanup, client write path, or rollback that
removes their submission fence. Current Firestore rules already default-deny this
new top-level collection; no rules change is needed.

## Mobile behavior

Check previous request uses the stored UID and original request ID through the
new callable. The serialized coordinator checks the account/session epoch after
transport, binds the response to the original request ID, persists the result,
and retains the selection snapshot. It opens canonical booking details on creation.
Unknown/malformed/conflicting results and lookup/storage failures retain the lock.
No submission callable, storage deletion or replacement ID is used by lookup.

Confirmed rejection persists `rejectedBeforeCreation` across restarts. It clears
in-memory acknowledgment acceptance in the active screen. Only subsequent explicit
preparation may supersede that rejected attempt with a new ID; dispatch still
requires fresh disclosure loading and explicit acknowledgments. The rejected ID
cannot be made ready directly. Account changes, logout epochs, selection changes,
restart recovery and duplicate-tap serialization retain existing protections.

## Historical November 10 request: controlled administrative procedure

This request predates receipts. Its failed-precondition response and any missing
document are insufficient evidence. This work did not access it, fabricate a
receipt, clear storage or authorize a new production attempt.

1. Authorized support obtains the retained original UID/request ID from the
   original account/device and preserves the secure record and selection snapshot.
2. Run the authenticated read-only recovery check. If the owned canonical booking
   exists, show it; investigate inconsistent provider-request records separately.
3. If unresolved, an authorized administrator correlates the deterministic ID
   with server logs, audit records, backups, provider requests and all booking
   writers. Log messages and absence alone must not be promoted into rejection.
4. If conclusive terminal evidence is unavailable, leave the mobile lock intact.
   A further recovery would require a separately designed, reviewed and approved
   administrative fencing operation: quiesce intake, drain every old/in-flight
   writer, atomically recheck canonical records and permanently fence the original
   identifier, with durable administrator/audit evidence. This patch does not
   implement or authorize that operation. Do not manually insert an acknowledgment
   receipt, replay the historical request to manufacture evidence, edit secure
   storage, reinstall to reset identity, or generate a replacement ID.

## Deployment prerequisite and remaining production blockers

Backend deployment is required for both the modified submission function and new
reconciliation callable. Deployment is **not authorized by this task**. Before
activation, separately approve an intake pause and staged rollout: quiesce intake,
deploy the fenced submission implementation, verify every writer/revision uses
the fence and old invocations have drained, then expose reconciliation and resume
intake. Do not enable rejection recovery during a mixed-revision window, and do
not roll back to an unfenced writer after receipts exist. Confirm deployed rules
retain default deny and no administrative/cleanup writer deletes receipts.

Another production test also requires resolving the historical attempt through
authoritative evidence or an independently approved administrative protocol,
correcting the underlying refund-policy condition, and fresh customer policy and
agreement review. This implementation does not make the historical attempt safe
to replace. Device/network validation of the deployed callable remains pending.

## Verification

Local Functions tests cover reconciliation, authenticated callable input/ownership,
durable rejection, unknown historical outcomes, interruption, idempotency and
fingerprint conflicts. Concurrency tests use an explicit optimistic transaction
model plus source wiring assertions; they are not a Firestore integration test.
Existing focused contract, offer, payment agreement, refund policy, V2 booking,
phone security and canonical financial tests are included. Emulator verification
was intentionally excluded by instruction.

Flutter coverage includes B9-C's 171 targeted tests plus nine reconciliation
tests: created result, historical unresolved lock, durable rejection/restart/fresh
readiness, malformed responses, network timeout, account epoch and duplicate taps.
Final verification: **79 Functions tests passed, 180 Flutter tests passed, zero
failures**. The 180 includes all 171 B9-C targeted regressions. TypeScript check
passed using `node node_modules/.pnpm/node_modules/typescript/bin/tsc -p
.tmp-recovery-functions-tsconfig.json --pretty false`. `flutter analyze --no-pub`
passed with no issues. Focused Functions ESLint passed with zero errors and 32
line-length warnings across the checked files. `git diff --check` passed.

The final callable tests also invoke the actual submission handler against mocked
local records for concurrent owned replay, fingerprint conflict and foreign
ownership rejection. New-booking concurrency/commit interruption are verified by
the transaction model, not by a live Firestore execution. No Firestore integration
or production behavior is claimed as tested. One intermediate navigation lint
finding was fixed with an explicit mounted check; final analysis is clean. SDK
launcher initialization initially hit local sandbox cache/settings restrictions;
the checks completed using the installed SDK with approved local access.

## Exact files changed by B9-D

- `functions/src/bookings/submit-booking-request.ts`
- `functions/src/bookings/submission-outcome.ts` (new)
- `functions/src/bookings/reconcile-booking-submission.ts` (new)
- `functions/src/index.ts`
- `functions/test/submission-outcome.test.cjs` (new)
- `functions/test/submission-outcome-callable.test.cjs` (new)
- `apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart`
- `apps/customer_mobile/lib/features/customer/booking_attempt_coordinator.dart`
- `apps/customer_mobile/lib/features/customer/booking_summary_screen.dart`
- `apps/customer_mobile/test/features/customer/booking_outcome_reconciliation_test.dart` (new)
- `docs/phase-b9-d-booking-outcome-reconciliation.md` (new)

Ignored local verification logs are under `.tmp/b9d-*`. Existing recovery
TypeScript configuration was reused without modification; compilation emits to
the ignored Functions `lib` directory. Other pre-existing edits are outside B9-D.
