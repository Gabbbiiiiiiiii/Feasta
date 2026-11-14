# Customer Mobile final integration — 24 October 2026

Local integration only. The merge is intentionally uncommitted. Final validation totals are recorded below once the last runs finish.

## Verified Git context

- Worktree: `C:\flutterProject\feasta-mobile-parity-integration`
- Branch: `integration/mobile-customer-parity-20261024`
- Baseline HEAD: `3414174ac6647091c4ea926f383de0c2756069e6`
- MERGE_HEAD / Pia source: `92ca08159b5a7d02a20d85b2f365514269f8e98a`
- Initial inventory: 21 unmerged files and 291 automatically staged merge paths. Existing staged changes were retained.
- All 21 conflicts resolved; no merge continuation, commit, push, branch change, worktree creation, reset, clean, stash, rebase, deployment, or emulator operation was performed.

## Conflict inventory and decisions

Paths in this table are relative to `apps/customer_mobile/`. For add/add conflicts, the index had no common-ancestor blob. Existing merge hunks and the stage-2/stage-3 differences were reviewed individually; the existing merged files were edited in place.

| Resolved file | Reconciliation |
| --- | --- |
| `lib/app/app.dart` | Retain the persistent authentication gate; add Event List scope, startup presentation, lifecycle suspension/resumption, and session coordinator attachment. |
| `lib/app/router/customer_auth_navigation.dart` | Preserve the gate-owning root and protected return-path sanitization; retain Pia's draft-save barriers, Retry ownership, route cancellation, and guarded root return. Bind deferred destination callbacks to their originating UID/auth generation. |
| `lib/core/security/auth_operation_coordinator.dart` | Preserve serialized auth operations and epoch semantics; synchronously close customer-session authorization before waiting for the queue. |
| `lib/features/authentication/application/customer_auth_controller.dart` | Preserve verification, consent generations/revisions, terminal account gates, and stale-load checks. Retain session validation, initial auth/token replay coalescing, bounded recovery, startup restoration, and modal coordination. |
| `lib/features/authentication/data/repositories/auth_repository.dart` | Preserve registration rollback, exact policy versions, UID checks, and auth serialization; retain phased Google selection, one-shot consent, and safe recovery error classification. |
| `lib/features/authentication/data/repositories/customer_auth_state_repository.dart` | Preserve session generation checks around authorization reads/callables, profile repair, consent rejection mapping, and listener ownership. Retain Google consent provisioning only for a missing profile and timing diagnostics. |
| `lib/features/authentication/data/repositories/feasta_repository.dart` | Keep default-branch complaint APIs/import and all relationship validation alongside Pia's package/add-on eligibility, preparation, disclosure, discovery, booking-result parsing, and booking-list source APIs. No wholesale repository replacement. |
| `lib/features/authentication/presentation/authentication_gate.dart` | Preserve consent callbacks bound to UID/generation/revision, account access gates, verification routing, and protected destinations; retain Pia's restoration/modal presentation and loading states. |
| `lib/features/authentication/presentation/customer_consent_screen.dart` | Retain Pia's policy cards, snapshot document links, detached policy data, styling, and Agree-and-continue label. Preserve two unchecked explicit acceptances, reset them when policies reload, and block acceptance for invalid policies. Retry and policy links remain usable before acceptance. |
| `lib/features/customer/account/data/firebase_customer_account_repository.dart` | Preserve password-change/recovery cleanup and recovery epoch behavior; close authorization synchronously before a queued password operation. |
| `lib/features/customer/account/presentation/customer_account_management_screen.dart` | Preserve password/account controls; use coordinated root return so authorized drafts are saved and invalid sessions cannot resume their old route requests. |
| `lib/features/presentation/screens/customer_register_screen.dart` | Preserve explicit registration agreements and generation checks; retain Pia's shared policy loading, retry state, Google consent button, and submission presentation. Remove the now-unused JSON import. |
| `lib/features/presentation/widgets/customer_login_modal.dart` | Retain Pia's coordinated, route-owned sheet and restoration/retry behavior. Preserve the default UID equality check before credential callbacks can request authorization refresh. |
| `lib/shared/models/initial_payment_deadline.dart` | Retain Pia's stricter rejection of populated V4 deadline evidence without policy version 4. Preserve frozen stored timestamps, consistency validation, and historical `expiresAt` compatibility. |
| `test/features/authentication/customer_auth_controller_test.dart` | Retain security/replay/recovery assertions. Wait for actual bounded load completion instead of assuming a 50/450 ms wall-clock schedule under concurrent test load. |
| `test/features/authentication/customer_auth_navigation_test.dart` | Preserve default explicit-consent and stale-callback assertions, adapting only reviewed UI labels and coordinated navigation behavior. |
| `test/features/authentication/customer_auth_state_repository_test.dart` | Retain default callable/session/consent safeguards plus Pia's missing-profile-only Google consent tests. |
| `test/features/authentication/customer_consent_screen_test.dart` | Retain explicit two-checkbox acceptance, malformed policy, exact version, replacement, Retry, and cancellation checks. Scroll controls into view for Pia's policy-card layout; do not settle an intentionally pending loading spinner. |
| `test/features/authentication/email_verification_return_test.dart` | Preserve verification return and stale-session checks; use persistent network failure fixtures so bounded retries do not accidentally turn an intended outage into success. |
| `test/features/customer/customer_password_change_repository_test.dart` | Retain password/recovery safety checks and Pia's before-queue invalidation tests without altering recovery epochs. |
| `test/features/customer/initial_payment_deadline_v4_test.dart` | Retain both branches' payment and legacy-authority assertions, including missing/null policy versions, malformed/populated V4 fields, historical refresh/restart preservation, and remaining-balance checks. Normalize Windows newlines in source-inspection assertions. |

## Functional/security review

- **Complaints:** `bookingComplaintServices` still validates booking ownership, unique well-formed provider-request IDs, customer ownership, `mainEventId`, `bookingId`, and `providerRequestId`. `submitBookingComplaint` still sends only the canonical target/category/trimmed description to `createComplaint`, validates its confirmation shape, and preserves safe retry/error messages. The booking details complaint entry point remains present.
- **Payment V4:** version 4 consumes stored `initialPaymentDeadlineAt`; validation checks `expiresAt`, `acceptedAt`, `eventStartAt`, and supplied hard-deadline evidence. Unsupported, malformed, conflicting, or populated unversioned V4 evidence suppresses checkout. Historical records with absent/null V4 fields continue to use stored `expiresAt`. PHT display is explicitly UTC+08:00. No local 6-hour/2-hour policy, deadline renewal, payment amount change, or direct payment-status write was introduced.
- **Checkout authority:** canonical `createPaymentSession` calls, payment identities/idempotency inputs, and remaining-balance behavior remain intact. The server still decides actual expiration and authorization on every checkout; local display evidence cannot guarantee server acceptance.
- **Legacy restrictions:** `selectRecoveryOffer` and `acceptBooking` still fail through `requireTrustedLegacyBookingPaymentAuthority` before any write/callable. Offer/history reads and explanatory disabled-selection UI remain. M4.5 preparation remains blocked; no `preparationOnly: false` call site was introduced.
- **Event List/customization:** Pia's scoped Event List, catalog eligibility, package/tier/service/add-on/date/time/guest/venue/Maps selections, Review Event, agreements/refund disclosure, and latest Mobile presentation remain. New repository APIs use the existing callable names and regional configuration found in backend source; no backend source was modified.
- **Drafts:** secure per-customer namespaces, verified writes, latest-snapshot persistence, restoration, save failure/Retry, dirty-exit barriers, and auth-generation checks remain. An already dispatched native secure-storage write cannot be canceled; it stays scoped to its original owner and cannot publish success/state to a new session.
- **Auth/navigation:** SDK UID checks, serialized transitions, epoch/session-generation validation, required email/phone verification and customer consent, terminal gates, logout, account switching, password cleanup, and callback cancellation remain. Customization descendant boundaries conceal/unmount stale private state; old save/navigation requests cannot reopen a later same-UID session. Offline tests cannot observe native identity changes before the SDK delivers them to Dart.
- **Automatic merge review:** reviewed connected authentication, consent, account, booking list/details, lifecycle, payments/recovery, Event List, preparation/disclosure, persistent draft, customization descendant, and navigation interfaces. Static analysis and regression tests exercise their combined signatures. The original stage-0 index was compared with the final index to verify preservation outside the explicitly listed corrections.

## Changes outside the 21 conflicts

All paths remain inside Customer Mobile:

1. `lib/features/customer/booking_lifecycle_presentation.dart`: add an inherited injectable read source for offline view tests; the default Firestore query and relationship/ownership filters remain active. Keep completion/review hold labels and existing server evidence semantics. Format this touched file and add braces without changing conditions.
2. `lib/features/customer/customer_bookings_screen.dart`: reuse Pia's existing stacked card layout for long lifecycle labels so loading/review-hold badges do not squeeze provider details into an overflowing row.
3. `test/core/theme/app_theme_test.dart`: distinguish three approved Mobile text-color roles from independently changed protected Web text tokens. Retain exact Mobile color assertions, shared-token comparison, accessibility contrast checks, and legacy-color rejection.
4. `test/features/customer/customer_booking_presentation_test.dart`: supply offline relationship snapshots while retaining the real lifecycle builder and all status/action/accessibility assertions.
5. `test/features/customer/customer_bookings_pagination_test.dart`: supply the same offline lifecycle reads while retaining pagination, loading/error, refresh, semantics, and invalidation assertions.
6. `test/features/customer/representative_screen_migration_test.dart`: supply lifecycle evidence for the shared booking-card fixtures; retain ordinary/large-text overflow checks.
7. `test/helpers/booking_lifecycle_source.dart`: reusable test-only Firestore snapshot doubles containing canonical relationship/ownership fields. No live service access.
8. `docs/mobile-final-integration-review-20261024.md`: this review report.

Dependency setup used the installed SDK and existing cache first. With explicit user approval, `flutter pub get --enforce-lockfile` fetched missing locked SVG/vector packages. `pubspec.yaml` and `pubspec.lock` were not edited. Tool-generated line-ending-only churn in seven desktop plugin registrant files was restored only after proving their clean-filtered hashes matched the index; no generated-file content change is included.

The two preapproved root documents are preserved unchanged from the original merge. Web, Functions, Firebase rules/indexes/configuration, shared packages, PayMongo credentials/integration, and unrelated root files are unchanged.

## Validation results

Final automated validation (October 24, 2026):

- Full Flutter suite: 1,118 passed, 4 optional skips, 0 failures; exit 0.
- Dart formatting: 293 files checked, 0 required changes; exit 0.
- Flutter analysis: 0 errors, 2 warnings, 12 informational notices; exit 1 due to diagnostics.
- Git working/staged diff checks: passed.
- All 21 merge conflicts resolved.
- Approved Mobile integration scope preserved.
- Original FEASTA repository remained clean.
- Native-device and live Firebase verification remain pending.

Earlier runs exposed missing locked dependencies, consent Retry/scroll-label integration, wall-clock-sensitive auth test waits, lifecycle test fixtures, long lifecycle card labels, and CRLF-sensitive source assertions. These were investigated and corrected; no test was deleted, disabled, or newly skipped to hide a failure.

## Remaining device/live verification

- Android/iOS release/debug startup and lifecycle suspension/resumption, native Google account selection/cancellation, email-verification app return, phone verification, password change/recovery, secure-storage restart/locked-device behavior, and Maps/address round trips.
- Live Firebase Auth restoration/account switching/logout; deployed App Check and Firestore permissions; disclosure callable responses; complaint ownership/idempotent retry; stale/expired/review-held checkout refusal; historical and remaining-balance checkout behavior against existing PayMongo Test Mode.
- Confirm actual deployed callable/data compatibility with approved live test accounts. Source review and offline fixtures do not prove deployment state, native behavior, server time, authorization rules, or live payment processing.

No native device, emulator, live Firebase mutation, real payment, deployment, or final Git merge was performed. Commit/push/deployment/final merge still require explicit approval.
