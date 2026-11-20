# M1 Task 3: Android email-action return handling

Date: 2026-10-14 (Asia/Manila). Verdict: READY FOR REVIEW for the focused Flutter change. Android email-link delivery and deployed browser routing remain unvalidated.

## A. Current-state findings

Initial branch: `feat/mobile-customer-parity`, clean and synchronized with origin. HEAD `b26ef36`; preceding completed phone-security commit `cfbf7cb`. Both remain unchanged.

| Feature | Current Flutter behavior | Web/Firebase contract | Gap classification | Recommended action |
| --- | --- | --- | --- | --- |
| Verification email delivery | `AuthRepository` sends `User.sendEmailVerification()` without action settings (lines 109, 259, 298). | Web also sends without settings, `client-session.ts:211,223`. Firebase generates and emails the action link using project email-template settings. | Firebase Console configuration requirement; runtime validation only | Confirm the actual email-template action URL and deployment; source cannot prove which browser handler receives real emails. Preserve browser handling. |
| Recognition after browser completion | Explicit check reloads the user, refreshes the token, and synchronizes Auth state (`auth_repository.dart:136`). No lifecycle return refresh existed. | Web refresh reloads and exchanges a forced fresh ID token for a customer session (`client-session.ts:226`). | Flutter-only fix | Implemented automatic gate refresh on return to the visible, gate-managed verification screen. |
| Authorization after verification | Gate uses Firebase verification, customer role, account restrictions, and phone status (`customer_auth_controller.dart:345`, `auth_account_state.dart:130-185`). | Web customer session and account policy remain authoritative for Web. | Runtime validation only | Preserve existing gates; browser completion never authorizes navigation by itself. |
| Android link reception | Main manifest lines 38-41 contain only MAIN/LAUNCHER; Gradle uses `com.example.feasta`. No email-action link receiver or routing callback found. | Mobile return links require configured action settings and verified domain/package association. | Android configuration requirement; Firebase Console configuration requirement; shared backend/web coordination requirement | No speculative intent filter or host added. Agree on domain, paths, certificate association, template and web return contract before implementing native links. |
| Password reset | Request uses `sendPasswordResetEmail(email: normalizedEmail)` (`auth_repository.dart:532`), suppressing user-not-found. Forgot-password screen supports explicit return to login. No native reset-confirmation screen. | Web `/auth/action` redirects reset mode to `/reset-password`; `client-session.ts:287-296` uses `verifyPasswordResetCode` then `confirmPasswordReset`; form offers `/login` after success and new-link request after error. | Runtime validation only | Preserve browser password completion and manual app/login return. Do not infer successful reset from app resume or create a parallel reset form. |
| Dormant native action helpers | Parser and repository handler exist but have no app routing caller. Handler checks validity but does not compare `ActionCodeInfo.operation` with requested verification/recovery mode (`auth_repository.dart:557-558`). Reset branch only inspects code. | Web uses Firebase action APIs; Firebase validates validity/expiry/consumption. Web verification/recovery processor also does not independently compare action purpose. | Flutter-only fix before future activation; shared backend/web coordination requirement for Web hardening | Keep helper disconnected. Before activation validate purpose, target-account semantics, origin, malformed/duplicate inputs and stale sessions. This task applies no action codes. |

Source paths in this table are relative to `apps/customer_mobile/lib/features/authentication/` for Dart repositories/controllers/domain, and `apps/web/src/lib/auth/` for `client-session.ts`. Android manifest: `apps/customer_mobile/android/app/src/main/AndroidManifest.xml`; Gradle: `apps/customer_mobile/android/app/build.gradle.kts`. Web handlers: `apps/web/src/app/auth/action/page.tsx`, `action-processor.tsx`, `apps/web/src/app/reset-password/reset-password-form.tsx`.

The repository cannot confirm a deployed FEASTA custom email handler: `firebase.json` hosting rewrites contain only `/api/health`, not the Next.js action routes. Web Firebase auth domain comes from `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (`apps/web/src/lib/firebase/client.ts:26`). Flutter project configuration names `feasta-catering-system`; that identifies the project, not the configured email-template destination.

## B. Implemented behavior and preserved security

`EmailVerificationScreen` observes application lifecycle. On resume it refreshes only when mounted, gate-managed, on the current route, not resending/checking, and the gate still requires email verification. Concurrent resume callbacks are coalesced; observer is removed at disposal. It uses `CustomerAuthenticationController.refresh(forceTokenRefresh: true)` rather than processing a link or invoking verification success callbacks.

Existing `FirebaseCustomerAuthStateRepository.loadAccount` acquires `AuthOperationCoordinator.shared.run`, reloads the current user, checks UID before/after reload and token refresh, and reads the current account profile (`customer_auth_state_repository.dart:107-144`). The controller ignores loads invalidated by identity generation or disposal (`customer_auth_controller.dart:342,371`). A different account or signed-out state cannot gain access from an old verification result. Verifying another account in the browser cannot mark the current customer verified: only the current Firebase user's refreshed state is evaluated.

Customer role/status and phone gates, manual checks/resend/logout, authentication coordinator, phone protection, password-change security and durable recovery are preserved. No passwords, codes, tokens, URLs or sensitive link parameters are logged by this change. No action-code APIs are called by the return observer.

Closed app: browser handles the email action; manually launching the app uses the existing startup account reload. Already running: returning to the managed verification screen now reloads through the gate. Signed out: existing guest/login behavior remains; resume does not authenticate anyone. Native cold-start action routing is unsupported and untested. Legacy standalone verification screens retain explicit checks.

## C. Files modified

- `apps/customer_mobile/lib/features/presentation/screens/email_verification_screen.dart`: lifecycle observation and guarded gate refresh.
- `apps/customer_mobile/lib/features/authentication/application/email_verification_controller.dart`: disposal guards and preservation of operation state during cooldown ticks.
- `apps/customer_mobile/test/features/authentication/email_verification_return_test.dart`: eleven behavioral widget tests with fake authentication repository and gateway, including three overlap/disposal additions.
- `apps/customer_mobile/test/features/authentication/email_verification_controller_lifecycle_test.dart`: ten controlled-future/timer tests for late success/errors, disposal, active error messages and cooldown operation guards.
- `apps/customer_mobile/docs/email-action-return-report.md`: contracts, findings, validation and remaining coordination.

## D. Backend and Android compatibility

Resolved SDKs from `pubspec.lock` and `.dart_tool/package_config.json`: `firebase_auth 6.5.6`, `firebase_core 4.12.1`, Auth platform interface `9.0.5`. Cached FlutterFire core Android `gradle.properties:2` specifies Firebase BoM `34.15.0`; auth plugin uses BoM-managed `com.google.firebase:firebase-auth`. This is the source dependency declaration, not a device/build dependency-resolution claim.

Installed Auth API source supports `checkActionCode(String)` returning `ActionCodeInfo`, `applyActionCode(String)`, `verifyPasswordResetCode(String)` returning email, and `confirmPasswordReset({required String code, required String newPassword})`. The implemented change uses existing `User.reload()` and `User.getIdToken(true)` APIs only. Email send calls have no `ActionCodeSettings`: no continue URL, Android package, handling mode or link domain is supplied.

Firebase documents browser action handling and configured mobile continuation in [custom email handlers](https://firebase.google.com/docs/auth/custom-email-handler) and [passing state in Android email actions](https://firebase.google.com/docs/auth/android/passing-state-in-email-actions). Modern mobile action links use the supported Hosting solution; no Dynamic Links dependency or integration was introduced.

No Firebase Console, Android manifest, shared backend or Web edits are required for this resume refresh. A Backend Handoff Report is unnecessary for merging this Flutter-only improvement. A future coordinated native-link proposal needs a handoff documenting the actual template URL, deployed handler, authorized/owned domain, package and release certificate association, approved return paths, and Android verification evidence. The table records the dormant Web/native purpose-validation issue for that review.

## E. Validation

### Blocking lifecycle review fix

Final review found that automatic resume refresh did not disable manual check/resend. A manual operation could remain pending when the gate removed the screen; its late completion could notify a disposed controller or create a cooldown timer after disposal.

The screen now rebuilds when automatic refresh begins/ends, displays check loading, disables check/resend while it runs, and guards both callback entry points against stale callbacks and unmounted state. The mounted check in the automatic refresh `finally` prevents a post-disposal rebuild. If the account remains unverified, controls become usable again; network failure uses the existing gate error/retry flow. Automatic refresh continues to skip earlier pending manual operations.

The controller rejects new operations after disposal, returns false for late successful checks, ignores all late success/error state updates, and prevents late resend completions from creating timers. Disposal marks the controller disposed before canceling its existing timer. Cooldown ticks now preserve pending-operation flags and error/notice state rather than clearing a pending check and permitting duplicate requests. No coordinator, Firebase UID/account gate, or backend contract changed.

Added three widget scenarios: automatic refresh blocks taps and captured stale callbacks then restores usable controls after an unverified result; an earlier manual check or resend blocks resume and completes safely after screen removal. Added ten controller scenarios: six late success/typed-error/unexpected-error cases across check/resend, cancellation of an existing cooldown, two active network-error cases, and a cooldown tick preserving a pending check. Existing eight return tests remain intact.

Final revalidation commands (from `apps/customer_mobile`):

- `flutter test --no-pub test/features/authentication/email_verification_return_test.dart test/features/authentication/email_verification_controller_lifecycle_test.dart test/features/authentication/account_recovery_controller_test.dart test/features/authentication/account_recovery_screen_test.dart`: **29 passed**.
- `flutter test --no-pub test/features/authentication test/features/customer test/app/router`: **233 passed**, including phone, password-security/recovery and coordinator regressions.
- `flutter analyze --no-pub lib/features/authentication/application/email_verification_controller.dart lib/features/presentation/screens/email_verification_screen.dart test/features/authentication/email_verification_return_test.dart test/features/authentication/email_verification_controller_lifecycle_test.dart`: **no issues found**.
- All four changed Dart files formatted; `git diff --check` passed; tracked and untracked changed files reviewed.

No production Firebase operations or Android device testing performed. Remaining device/configuration validation below is unchanged.

### Initial implementation validation (historical)

Eight new tests cover: unverified versus confirmed verification, forced token refresh request, blocked account policy, duplicate resumes, sign-out during pending work, account switching, disposal/observer removal, network failure/retry, unmanaged screens and covered routes (several assertions share a test).

Commands executed from `apps/customer_mobile`:

- `dart format lib/features/presentation/screens/email_verification_screen.dart test/features/authentication/email_verification_return_test.dart` (SDK executable used directly after wrapper/cache access failure).
- `flutter test --no-pub test/features/authentication/email_verification_return_test.dart`: initial five-test version passed; final eight-test version is included in the regression run below.
- `flutter test --no-pub test/features/authentication test/features/customer test/core/security test/app/router`: 220 tests passed, command failed solely because `test/core/security` does not exist. No test assertion failed.
- Corrected `flutter test --no-pub test/features/authentication test/features/customer test/app/router`: **220 tests passed**, including all eight new tests, phone verification, password security/recovery and coordinator serialization coverage. Fake tests performed no production Firebase writes.
- `flutter analyze lib/features/presentation/screens/email_verification_screen.dart test/features/authentication/email_verification_return_test.dart`: **no issues found**.
- `git diff --check`: passed. Complete tracked diff and new test/report reviewed.

Flutter needed access beyond workspace to its installed SDK cache/telemetry. Authorized escalated runs succeeded. Analysis regenerated desktop plugin files with line-ending-only changes; their normalized content was verified against HEAD and original checkout line endings restored. No dependency versions changed.

Pending Android runtime validation: actual received verification/reset email destinations; browser completion and manual return with app alive/closed; fresh customer gate and intended route; invalid, expired, reused or malformed browser codes; signed-out/different-account behavior; external reset session expiry; offline retry. Device tests were not performed. Fake widget tests prove state/navigation behavior, not email delivery or Android App Link verification.

## F. Git status and next task

Branch remains `feat/mobile-customer-parity`, HEAD `b26ef36`, synchronized with origin. Two modified Dart files (screen and controller); three untracked files (return tests, controller lifecycle tests and this report). Existing uncommitted Task 3 work preserved. No protected Web/backend/shared files modified. No commit, push, merge, rebase, reset or deployment performed.

Verdict: **READY FOR REVIEW** for browser-return verification refresh. Native Android email-link handling is not ready and was not enabled. Next smallest M1 task: validate actual Console email-template destinations and browser completion/manual Android return on a test account/device, recording closed/running/signed-out results before deciding whether native links are needed.
