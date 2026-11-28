# Event List Phase 1 production authentication contract

Scope: customer-owned local planning lists; no Event List UI, submission, search,
M4.5, server/rules changes, or device installation. This implements the explicitly
approved limited contract. A generation is a FEASTA authorization lifetime, not a
Firebase session ID and not an atomic view of native Firebase state.

## Architecture and ownership

`app/app.dart` connects the existing `CustomerAuthenticationController` to
`CustomerSessionCoordinator.shared`. The controller attaches a live
`repository.currentIdentity?.uid` reader, supplies Auth/token restoration
observations, and supplies actual `loadAccount` results resolved through the
existing customer-role/account gate. SDK identity alone cannot open access.
Only `customerReady` and `customerPhoneVerificationRequired` may use this local
planning basket. Email verification, missing profiles, consent, other roles,
restrictions, and failures remain closed.

`core/security/customer_session_coordinator.dart` provides `readSnapshot`,
`invalidate`, transition leases, validation snapshots, `canPublishValidation`,
`completeValidation`, and `isCurrent`. Snapshots contain SDK-visible UID,
authorized customer UID, monotonic generation, and restoring/closed/validating/
ready phase. Every snapshot read checks the live Dart SDK-visible UID. Observed
mismatches close synchronously and remain closed if the UID later returns to A;
notification is deferred to avoid notifying widgets during a build.

The existing `AuthOperationCoordinator.transition` now calls `protectSession`
before acquiring its queue. `protectSession` takes a unique lease synchronously,
closes authorization, and releases the lease on success or failure. No lease
completion authorizes a user. While any transition is queued or running,
validation cannot publish. Releasing the last lease advances generation again
and schedules fresh controller validation; a result captured during the
transition cannot reopen access. Multiple leases, failed operations, and replayed
completions cannot bypass these checks.

The original operation epoch still advances **inside** the queued `transition`
callback, exactly as before. `protectSession` itself neither acquires the queue
nor changes that epoch. It can therefore wrap a helper already inside the queue
without deadlocking or invalidating password-cleanup evidence.

## Covered production boundaries

| Call path | Coverage |
| --- | --- |
| `AuthRepository.signInWithEmail`, Google/phased Google login | Existing `transition`; invalidation precedes account selection/native sign-in and all awaits. |
| Customer/provider registration and existing-identity registration recovery | Existing `transition` covers the entire operation, including rollback deletion, profile recovery, and verification-mail failure. |
| AuthRepository logout and rejected-login cleanup | Existing transition lease remains held through Google cleanup and Firebase logout. |
| `FirebaseCustomerAuthStateRepository.signOut` | Existing transition covers controller logout, account switching, restoration cancellation, session expiry, and restricted-account termination. |
| `AuthService.logoutUser` | Existing compatibility transition is covered. |
| `FeastaRepository` unavailable-customer rejection | Explicit `protectSession` wraps its existing in-queue epoch increment and logout; it never reacquires the queue. |
| Password change and explicit recovery cleanup | Explicit `protectSession` wraps the existing serialized password workflow before queue acquisition. It covers reauthentication, password dispatch, revocation, and all cleanup/logout attempts without changing the recovery epoch. |
| Email-update request, account deactivation, revoke-all-sessions | Existing account repository transitions remain covered. |
| Firebase action-code handling | Existing transition remains covered. Reset-link requests themselves do not change the signed-in customer. |
| Manual and automatic phone-credential completion | Existing phone-service transition covers linking/update, reload, token preparation, and backend synchronization. Reservation/attempt guards remain unchanged. |
| Verification reload, resend, ordinary reauthentication/token refresh | Do not infer a new native session. Any visible identity mismatch closes access; existing token surveillance continues. |

Customer controller sign-out also closes its attached session coordinator before
its first await. Existing production SDK mutation sites were inspected; there is
no known uncovered FEASTA-controlled identity-changing path in this scope.

## Validation, duplicate observations, and lifecycle

Startup is closed until an initial Firebase observation and a valid customer
authorization result have arrived. Validation results must match both live UID
and captured generation, restoration, lifecycle, and outstanding-transition
state. The auth controller discards stale results/errors before applying them.

An explicit refresh, account-document change, changed verification state,
identity mismatch, lifecycle uncertainty, or controlled transition requires
closed revalidation. Failures leave access closed; existing bounded recovery and
explicit retry remain available. Revalidation scheduling joins an already active
current validation instead of creating a refresh loop.

Identical Auth/token observations do not themselves invalidate Event List,
advance its generation, clear cached entries/errors, or read its storage. Existing
authentication token surveillance still runs serially and can discover a failure
or restricted account; such findings close access. Successful identical
surveillance preserves the authorization lifetime. A token refresh is never used
as a new-session identifier.

Historical event payloads never grant access to their UID. When a payload differs
from the live SDK-visible UID, the coordinator conservatively closes access and
requests validation of the live user. A stale event can therefore cause an extra
closed validation, but cannot switch authorization to a historical account.

The application observes lifecycle state, closes once on leaving resumed state,
and requests fresh authorization on resume. It also checks initial lifecycle
state. Suspension during validation prevents publication; outstanding controlled
transitions must finish before resume validation can open access.

## Event List and durable records

`EventListController` defaults to `CustomerSessionEventListAuthentication`, using
the production shared coordinator. Tests can still inject an explicit adapter.
The controller owns/disposes only adapters it creates. Its existing controller
epoch and guards remain intact. Every list/error read checks the live adapter;
every operation and storage authorization callback checks the captured UID and
generation. No startup or reauthorization automatically loads storage: the
authorized consumer explicitly calls `load`.

Known boundaries clear in-memory state through the adapter. Reconstructing a
controller or the auth owner starts from a new authorization lifetime and may
reload the same owner's persisted record after validation. Disposing either
prevents old work from publishing. Neither authorization changes nor disposal
delete durable lists.

Model, codec, owner checks, secure-storage namespace/options, per-UID keys,
process-wide storage queue, and verified writes are unchanged. Encryption remains
provided by the existing platform secure-storage configuration; this change does
not introduce or claim a new per-customer cryptographic key scheme. An already
dispatched platform write can finish for its original UID. Its stale completion
must not report success or publish controller state; it cannot write another
UID's key. Previously returned immutable snapshots cannot be revoked.

Draft persistence and M4.4 attempt persistence/IDs are untouched. Password
dispatch markers, uncertain outcomes, fresh recovery authentication, confirmation
of session revocation, and retry-only-cleanup behavior remain intact. Pending
Google consent continues to use the unchanged legacy epoch. Booking pagination,
agreement/refund acknowledgments, payments, chat, Maps, and submission eligibility
are not modified.

## Explicit limitations

Guaranteed within the implemented scope:

- UID-scoped storage ownership and decoded record-owner validation.
- Synchronous closure before every covered controlled transition is queued or awaited.
- Immediate masking after a mismatching SDK-visible identity is read in Dart.
- Stale-result rejection after known/observed invalidation.
- Existing customer authorization gates and fresh validation before reopening.
- Stable Event List state across harmless duplicate Auth/token observations.

Not universally guaranteed:

- Synchronous observation of native changes before platform-bridge delivery.
- Detection of A -> signed out -> A while Dart still sees A and no event.
- Immediate detection of remote token revocation, disablement, or role changes.
- Atomic knowledge of native session identity across the Flutter bridge.

Adversarial example: Event List captures A/generation 7; native Firebase signs out
and signs in A entirely before bridge delivery; Dart still reports A/generation 7.
The guard cannot identify that hidden boundary. The coordinator test explicitly
demonstrates indistinguishability, then shows closure when evidence arrives. It
does **not** claim the hidden boundary is detected. Server revocation freshness
remains governed by existing Firebase/backend validation and notification timing.

## Review and validation

New tests use production coordinator/queue/adapter/store code; integration tests
also use the real Firebase customer-state repository and auth controller with
controlled SDK notification timing. Existing stronger injectable-controller tests
remain useful unit tests, but are not evidence of native SDK guarantees.

Final local validation on 2026-10-20:

- One complete `flutter test --no-pub --reporter json` run: **975 passed, 0 failed,
  4 skipped**. Hidden suite-loading records are excluded. Earlier targeted reruns
  are not added to this total. The four existing real-provider-logo visual tests
  require `FEASTA_LOGO_REVIEW_DIR`, which was not configured.
- The full run includes Event List model/storage/controller tests, 21 coordinator
  tests, 20 production Event List integration tests, and the two added actual
  password change/recovery pre-queue invalidation tests. It also includes login,
  registration, Google consent, phone verification, password/recovery, startup,
  routing/gates, drafts, M4.4 attempts/storage, pagination, payment, and chat
  regressions.
- Flutter analysis of 14 affected/new Phase 1 production/test files: **no issues**.
- Git whitespace checks pass. No commit, push, deploy, backend operation, or
  device installation was performed.

Production files changed/created (paths relative to `apps/customer_mobile`):

```text
lib/app/app.dart
lib/core/security/auth_operation_coordinator.dart
lib/core/security/customer_session_coordinator.dart                      (new)
lib/features/authentication/application/customer_auth_controller.dart
lib/features/authentication/data/repositories/feasta_repository.dart
lib/features/customer/account/data/firebase_customer_account_repository.dart
lib/features/customer/event_list/event_list_controller.dart             (existing untracked, updated)
```

Tests/documentation changed/created:

```text
test/core/security/customer_session_coordinator_test.dart                (new)
test/features/customer/event_list_authentication_integration_test.dart   (new)
test/features/customer/customer_password_change_repository_test.dart
docs/event-list-production-authentication-contract.md                    (new)
```

The other four original untracked Phase 1 files (model, store, and both original
test files) are preserved. The unrelated booking-search and Android persistence
reports remain untracked and untouched. Mobile remains on
`feat/mobile-customer-parity` at `6112143ee69dd7a1d32629a71051610b3469e773`;
the index is unchanged. The web reference remains clean on
`chore/monorepo-setup` at `0c3f6f59c24ef75aac24d8f3c73fd6c62d1a745a`.

Verdict: **READY FOR INDEPENDENT REVIEW — SCOPED CONTRACT IMPLEMENTED**.
