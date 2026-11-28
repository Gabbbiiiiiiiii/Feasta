# M1 password-change security and recovery report

Branch: `feat/mobile-customer-parity`. Reviewed baseline: `cfbf7cb`.

Final verdict: **READY FOR A REVIEWED COMMIT WITH A DOCUMENTED NATIVE LIMITATION.** The latest source-level assessment found no demonstrated reachability of the residual account-targeting race through current normal FEASTA authentication flows. The Flutter fixes and automated tests support this reviewed conclusion; Android runtime validation remains pending. No native plugins, backend contracts, or Firebase deployments were changed.

## Review findings and implementation

1. All inspected normal FEASTA-controlled authentication transitions use the shared coordinator and its queue. Email/Google login, customer/provider registration and rollback, logout, authentication-state refresh, action-code handling, account reauthentication, phone linking, and the booking verification reload paths use it. Queued logout requests retain their initiating UID and skip a different account. Password operations retain UID checks before and after asynchronous boundaries. A transition epoch invalidates live cleanup confirmation after a later FEASTA authentication transition. Internal helpers do not reacquire the queue.
2. A UID/stage recovery record is written before native password-update dispatch. A returned error does not establish that the password stayed unchanged. A known `weak-password` validation rejection clears the marker; token, network, and SDK reload errors retain an uncertain outcome. Neither a repeated change request nor recovery calls dispatch another password update while a marker remains. The explicit recovery action uses the customer's currently working password when fresh authentication is required, never automatically reuses the old password. There is no existing backend API that confirms which password is now valid.
3. `SharedPreferencesAsync` persists only the UID and stage, separately for each UID. Stages distinguish dispatched updates, confirmed updates, and observed revocation results, including uncertain updates followed by revocation. No passwords, credentials, or tokens are stored. Repository recreation restores pending work; opening account management displays recovery guidance. The current authenticated UID must match before cleanup proceeds. Restored revocation stages do not authorize a call or skip backend confirmation. Markers survive logout when cleanup remains incomplete, and unrelated account operations preserve recovery UI state. Safe terminal cleanup requires backend confirmation and local sign-out; uncertain outcomes additionally require an explicit recovery action. Persistence failures before dispatch prevent password mutation; failure clearing an otherwise completed record produces an accurate recovery notice.

## Native limitation and reachability assessment

The installed Android Firebase Auth bridge selects the native current user when its platform message executes. `firebase_auth-6.5.6/android/src/main/java/io/flutter/plugins/firebase/auth/FlutterFirebaseAuthUser.java:43` returns `auth.getCurrentUser()`, and `:374` uses it for password update. `FlutterFirebaseAuthPlugin.java:448` implements app-level sign-out without an expected-UID parameter. The Functions bridge, `cloud_functions-6.3.5/android/src/main/kotlin/io/flutter/plugins/firebase/functions/FlutterFirebaseFunctionsPlugin.kt:58`, runs callable dispatch on a native worker; the callable authenticates the token it receives, not the Dart initiating UID.

The precise residual race is: Dart validates A, an uncoordinated native/other-isolate operation replaces the native current account with B, then the platform message executes against B. A check after completion cannot undo that operation. An external sign-out and same-UID re-login can also escape the FEASTA transition epoch. The queue prevents the identified FEASTA entry points from creating these overlaps, but it cannot lock arbitrary native SDK activity or another isolate. Delayed-dispatch tests prove the FEASTA-controlled ordering only; no device reproduction or claim of unconditional native safety is made.

The latest assessment found no uncoordinated authentication transition in the inspected normal FEASTA flows and no custom native authentication or background-isolate authentication path. The shared queue awaits the complete password operation, including failure cleanup, before another coordinated transition can run. The residual limitation is therefore conditional on an external or otherwise uncoordinated SDK transition, with potentially serious account-targeting consequences if introduced, but no demonstrated reachability through the current normal FEASTA authentication flows. It is not an established authentication bypass in those flows.

If unconditional native account-targeting protection becomes a requirement, it needs a separately approved design review of native account-target binding, conditional logout, and callable identity binding. Existing Firebase Flutter APIs do not expose an atomic expected-UID condition for these operations. A reviewed native adapter/isolated Auth context or an explicitly UID-bound callable transport may be options; feasibility and App Check behavior must be established before implementation. A backend expected-UID contract would be an alternative for callable protection only and would require a separate Backend Handoff. It would not solve native password-update or logout targeting. No such backend change is needed for the implemented FEASTA-controlled queue, and none was made.

The current implementation is ready for a separate reviewed commit with this limitation documented. The assessment does not require additional native changes before that commit and does not authorize any native integration. Future FEASTA authentication mutation paths must continue to use the shared coordinator.

## Exact changed files

All paths below are relative to the repository root. Existing uncommitted password work and tests were preserved.

| File | Purpose |
| --- | --- |
| `apps/customer_mobile/lib/core/security/auth_operation_coordinator.dart` | Shared operation queue and authentication transition epoch; new |
| `apps/customer_mobile/lib/core/helpers/verification_guard.dart` | Coordinate booking verification reloads |
| `apps/customer_mobile/lib/features/authentication/data/repositories/auth_repository.dart` | Coordinate email/Google login, registration, rollback, logout, refresh, and action-code paths |
| `apps/customer_mobile/lib/features/authentication/data/repositories/customer_auth_state_repository.dart` | Coordinate account reload and logout |
| `apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart` | Coordinate the existing active-customer verification guard |
| `apps/customer_mobile/lib/features/authentication/data/services/auth_service.dart` | Coordinate compatibility logout |
| `apps/customer_mobile/lib/features/authentication/data/services/firebase_phone_verification_service.dart` | Coordinate linking/synchronization; preserve immediate OTP completion deduplication and existing contracts |
| `apps/customer_mobile/lib/features/customer/account/application/customer_account_controller.dart` | Restore and preserve recovery state, explicit cleanup action, disposal safety |
| `apps/customer_mobile/lib/features/customer/account/data/firebase_customer_account_repository.dart` | Protected password operation, uncertain outcomes, durable recovery and safe cleanup |
| `apps/customer_mobile/lib/features/customer/account/data/password_recovery_store.dart` | UID/stage-only persistence; new |
| `apps/customer_mobile/lib/features/customer/account/domain/customer_account_management.dart` | Recovery capability and accurate outcomes/messages |
| `apps/customer_mobile/lib/features/customer/account/presentation/customer_account_management_screen.dart` | Restored recovery notice, current-password cleanup dialog, retry action, safe navigation and dialog lifecycle |
| `apps/customer_mobile/test/features/customer/customer_password_change_repository_test.dart` | 44 behavioral repository tests; existing untracked file preserved and expanded |
| `apps/customer_mobile/test/features/customer/password_recovery_store_test.dart` | Five persistence/schema/isolation tests; new |
| `apps/customer_mobile/test/features/customer/customer_account_controller_test.dart` | Partial outcomes, disposal, duplicate requests, restored recovery and no unsafe fallback |
| `apps/customer_mobile/test/features/customer/customer_account_management_screen_test.dart` | Logout navigation, notices, current-password recovery and disposal |
| `apps/customer_mobile/test/helpers/password_recovery_preferences.dart` | Simulated platform persistence across Dart instance recreation; new |
| `apps/customer_mobile/docs/password-change-security-recovery-report.md` | This implementation and native limitation report; new |

## Backend compatibility

The password flow continues to use `revokeAllAccountSessions` in `asia-southeast1`, with `{}` and explicit validation of `{success: true}`. The existing server requires an active authorized role, authentication within five minutes, App Check outside emulators, and its existing rate limit. Password updates use Firebase Authentication. A local logout is never used as proof that backend revocation succeeded. The previous source review remains the contract reference; no backend synchronization or deployment was repeated in this task.

## Validation

Run from `apps/customer_mobile`:

```powershell
flutter test --no-pub test/features/customer/customer_password_change_repository_test.dart test/features/customer/password_recovery_store_test.dart test/features/customer/customer_account_controller_test.dart test/features/customer/customer_account_management_screen_test.dart

flutter test --no-pub test/features/authentication test/features/customer/customer_account_controller_test.dart test/features/customer/customer_account_management_screen_test.dart test/features/customer/customer_password_change_repository_test.dart test/features/customer/password_recovery_store_test.dart

$changedDartPaths = @((git diff --name-only -- '*.dart'), (git ls-files --others --exclude-standard -- '*.dart')) | ForEach-Object { $_ -replace '^apps/customer_mobile/', '' }
flutter analyze --no-pub @changedDartPaths

git diff --check
```

Final results: **68 focused tests passed; 184 authentication/account regression tests passed, including all 35 existing phone-verification service tests; analysis of all 17 changed/new Dart files found no issues; `git diff --check` passed.** The focused dispatch/phone/store selection also passed 83 tests. Earlier compilation, lint, UI visibility, and OTP overlap failures were corrected before the final passing runs.

Fakes defer native target selection until after a controllable dispatch barrier. Tests cover queued account switching/login/logout, successful update followed by SDK reload failure, uncertain outcomes without blind retries, token/revocation/logout failures, repository recreation, simulated process death using a persisted pre-dispatch snapshot, separate UID recovery, unrelated account operations, duplicate cleanup, transition invalidation, persistence failures, navigation and disposal. These are simulations, not Android runtime tests.

The latest read-only native assessment reviewed source-level coordination, transition coverage, durable recovery, and installed native dispatch behavior using these existing automated results. This documentation alignment did not rerun the tests or analysis. The reviewed commit verdict is distinct from Android runtime or release validation.

Remaining validation: isolated Android tests for native dispatch behavior, debug/release App Check, actual DataStore persistence during process death, SDK reload failures, authentication-event ordering, local logout and revocation across devices. Deployment status and remote token revocation propagation remain unverified. No live SMS, real password changes, production writes, or payments were performed.

No commit, push, merge, rebase, reset, branch switch, or deployment was performed. No files under `apps/web`, `functions`, `firebase`, or `packages/shared-types` changed. The next step is a separate reviewed commit only when explicitly approved; Android runtime validation remains pending. This report does not begin another implementation task.

## Backend coordination notice for future M4/M5 work

The user relayed that the Web/Backend developer fixed a Firestore Rules vulnerability permitting customer modification of submitted booking information and reported 61 passing Rules tests. This is developer-reported information, not independently verified validation. The fix is under review, not merged into `chore/monorepo-setup`, and not deployed to Firebase. Its commit, exact diff, merge status, and deployed Rules version have not been inspected in this notice.

For M4 Booking Submission and M5 Cancellation/Recovery, use authorized backend workflows instead of legacy direct Firestore mutations; support the server-required Booking & Payment Agreement acknowledgments; and preserve server ownership of booking information, agreement evidence, financial policy snapshots, and lifecycle fields. Do not weaken or edit Rules, Functions, shared types, or web code independently. Missing or incompatible contracts require a Backend Handoff.

After the fix is announced as merged, apply the established branch/status, fetch, and relevant-contract comparison procedure before dependent Flutter work. Inspect repository changes separately from Firebase deployment; a merge is not proof of deployment. Do not automatically integrate changes into the feature branch. No fetch or integration was performed for this informational notice.

The current priority remains M1 Password Change Security and Recovery, including its documented native account-targeting limitation. All existing uncommitted implementation and tests are preserved; this notice starts no booking, cancellation, or Rules work and does not authorize native/backend changes, commits, pushes, or deployments.
