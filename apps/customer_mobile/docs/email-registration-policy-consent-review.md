# Email registration published-policy consent review

Date: 2026-10-15 (Asia/Manila). Branch: `feat/mobile-customer-parity`; base HEAD: `214ed20`.

## Changed files

All requested edits are under `apps/customer_mobile`:

- `lib/features/authentication/domain/customer_registration.dart`: required independent versions, unchanged normalization, policy failure kinds and exact code/reason matching.
- `lib/features/authentication/application/customer_registration_controller.dart`: validates nonblank versions and both acceptances before gateway access, exposes policy recovery, rejects duplicate submissions and discards callbacks after disposal.
- `lib/features/authentication/data/repositories/auth_repository.dart`: sends versions for new registration and explicit same-identity recovery, validates before Authentication, adds dependency injection for SDK mocks, captures identity before entering the coordinator and checks it around profile creation and verification completion.
- `lib/features/presentation/screens/customer_register_screen.dart`: loads both current agreements, validates and snapshots their contents, displays independent versions, blocks controls until both are valid, resets consent on reload, provides retry, and opens captured documents. Removed obsolete arbitrary legal-link callbacks so links cannot display unrelated versions. Loader replacement invalidates pending callbacks.
- `lib/features/presentation/screens/legal_document_screen.dart`: exposes established strict mobile agreement validation for registration and legal display.
- `test/features/authentication/customer_registration_controller_test.dart`: exact 1.1, independent and future versions, normalization, missing versions, exact error combinations, policy recovery, disposal, existing duplicate/network and validation coverage.
- `test/features/authentication/customer_registration_screen_test.dart`: loading/unchecked controls, missing/malformed policies, cancellation during loading, captured legal links, all four fresh-consent recovery paths, exact displayed versions, and document replacement during pending submission.
- `test/features/authentication/email_registration_repository_test.dart`: mocked SDK callable payloads for new and recovered identities, independent/future versions, new-identity rollback, rollback failure followed by same-identity recovery, different signed-in identity rejection, and missing-version rejection before Auth.
- `test/features/authentication/customer_auth_navigation_test.dart`: injects published document fixtures for email/Google registration navigation regressions.
- `test/features/authentication/authentication_responsive_accessibility_test.dart`: injects policies for responsive registration regression.
- `docs/email-registration-policy-consent-review.md`: this report.

## Request and version flow

`getCurrentLegalAgreement` is called through the existing mobile loader for `platform_terms` and `privacy_notice`. Both documents require nonblank name/version and nonempty sections with nonblank titles and paragraphs, following established onboarding validation. No version is hardcoded in production code. The screen detaches document snapshots from loader-owned maps and opens those exact snapshots through its links. Effective dates remain optional under established mobile validation.

Both checkboxes start unchecked. Submission captures each displayed version independently. Input normalization preserves both strings byte-for-byte, including whitespace; the backend remains authoritative about identifier validity. The controller and repository reject empty/blank versions before Firebase identity creation.

The registration callable sends:

```json
{
  "firstName": "<normalized first name>",
  "lastName": "<normalized last name>",
  "acceptedTerms": true,
  "acceptedPrivacy": true,
  "termsPolicyVersion": "<exact accepted Terms version>",
  "privacyPolicyVersion": "<exact accepted Privacy version>"
}
```

The same payload applies to legitimate same-email signed-in recovery. Ordinary `_ensureCustomerProfile()` calls retain `{}` through null omission. Existing authentication-state repository regressions also assert empty synchronization payloads. No trusted profile/consent fields are written directly to Firestore. Historical consent preservation remains the backend's responsibility; the integration verification below is blocked.

## Strict errors and recovery

Only these pairs are policy failures:

- `failed-precondition` / `consent-required`
- `failed-precondition` / `policy-version-outdated`
- `failed-precondition` / `policy-unavailable`
- `invalid-argument` / `invalid-policy-version`

Each displays specific guidance and reloads both documents unchecked. Loading/malformed/unavailable documents block registration and allow Retry policies. Valid reloaded documents require fresh explicit acceptance. Recovery never automatically resubmits. Unknown reasons and incorrect code/reason pairs retain generic handling.

## Rollback and identity safety

Existing `createIdentityAndProfile` rollback remains in place: profile rejection attempts deletion of the newly created identity and preserves the original error even if deletion fails. A retained same-email identity is recovered on the next explicit registration attempt without creating another identity. A different signed-in identity is rejected. Coordinator serialization and captured-UID checks prevent queued registration from acting on a switched identity. Profile and verification completion check the intended identity. Rollback operates on the captured created user, not another current user. Backend account restrictions remain authoritative.

Screen policy generations discard late loading/submission callbacks after document replacement; disposal discards controller completion. Duplicate submit is ignored. Loading retries do not submit. Cancellation/navigation remains available while loading. Existing verification delivery failure behavior is preserved: a fully created account is not deleted merely because email delivery fails. Google, email verification, phone, password recovery, authentication gate, and router regressions run unchanged except injected legal fixtures.

## Verification

- Final broad run: **284 passed, 0 failures** using `flutter test --no-pub test/features/authentication test/app/router test/registration_rollback_test.dart`.
- Focused final registration/rollback run: **51 passed, 0 failures** (`customer_registration_controller_test.dart`, `customer_registration_screen_test.dart`, `email_registration_repository_test.dart`, and `registration_rollback_test.dart`).
- Changed-file analysis: **No issues found** across all ten changed Dart files.
- Formatting used installed Dart 3.12.0 on all changed Dart files.
- `git diff --check`: passed; existing generated-plugin line-ending notices only.
- All seven pre-existing modified desktop plugin files match their initial SHA-256 hashes byte-for-byte (also checked two adjacent CMakeLists files).
- Earlier verification caught a test finder casting a tooltip to IconButton, a missing mocked exception message, and a test-only braces lint; these were fixed before final verification.
- Flutter execution used the installed SDK directly because the restricted sandbox cannot write its SDK lock/cache and telemetry files. SDK verification was approved with escalated access.

## Strict local emulator integration: BLOCKED

Strict implementation **is available** on accessible ref `origin/fix/customer-consent-current-agreements`, commit `cfe91f51bfa40ee4a717ef9ce6b809b99c4f29a4`. Read-only inspection confirmed transaction-based published-version validation and all four strict errors. The checked-out backend still uses fixed `2026-07-29` constants; it was not used to claim strict success.

A git archive of the strict ref was extracted under ignored `apps/customer_mobile/build/strict-consent-integration`; no branch switch, cherry-pick, merge, or backend checkout mutation occurred. Existing dependency access was linked read-only. The isolated TypeScript build failed resolving `firebase-functions/v2/https` and shared-type agreement exports against the installed dependency layout. This is not proof of a defect in the strict branch; its dependency environment was not successfully prepared.

Commands attempted from repository root:

```powershell
node functions/node_modules/typescript/bin/tsc -p apps/customer_mobile/build/strict-consent-integration/functions/tsconfig.json
$env:XDG_CONFIG_HOME='<repo>/apps/customer_mobile/build/strict-consent-integration/config'
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK='true'
node functions/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config apps/customer_mobile/build/strict-consent-integration/firebase.consent.test.json --project demo-feasta-consent --only auth,firestore,functions "node --test apps/customer_mobile/build/strict-consent-integration/functions/test/emulator/customer-consent.integration.cjs"
```

The isolated config used loopback Auth 44999, Firestore 44080, Functions 44501 and demo project `demo-feasta-consent`. CLI recognized the demo project and began starting all three services. Startup stopped before fixtures/tests: Firestore JAR `cloud-firestore-emulator-v1.21.0.jar` was absent and cache creation failed with `EPERM` at `C:/Users/Pia/.cache/firebase/emulators`. CLI remote-config fetch also failed under restricted networking. Emulators shut down. No integration assertions ran and no integration success is claimed. The copied upstream suite itself exercises handlers with Auth/Firestore; an end-to-end mobile-to-Functions-emulator test is still required once the isolated backend builds and emulator runtime is available.

Remaining integration work: prepare the strict ref's dependencies and emulator JAR in an approved isolated environment, build it, load published fixtures, and verify matching versions, authoritative records, outdated/fresh-consent recovery, missing/invalid rejection, no orphan/unauthorized profile, and historical consent preservation through ordinary synchronization. No production Firebase project was used, and no release/deployment action was taken.

## Final Git status

```text
 M apps/customer_mobile/lib/features/authentication/application/customer_registration_controller.dart
 M apps/customer_mobile/lib/features/authentication/data/repositories/auth_repository.dart
 M apps/customer_mobile/lib/features/authentication/domain/customer_registration.dart
 M apps/customer_mobile/lib/features/presentation/screens/customer_register_screen.dart
 M apps/customer_mobile/lib/features/presentation/screens/legal_document_screen.dart
 M apps/customer_mobile/linux/flutter/generated_plugin_registrant.cc
 M apps/customer_mobile/linux/flutter/generated_plugin_registrant.h
 M apps/customer_mobile/linux/flutter/generated_plugins.cmake
 M apps/customer_mobile/macos/Flutter/GeneratedPluginRegistrant.swift
 M apps/customer_mobile/test/features/authentication/authentication_responsive_accessibility_test.dart
 M apps/customer_mobile/test/features/authentication/customer_auth_navigation_test.dart
 M apps/customer_mobile/test/features/authentication/customer_registration_controller_test.dart
 M apps/customer_mobile/test/features/authentication/customer_registration_screen_test.dart
 M apps/customer_mobile/windows/flutter/generated_plugin_registrant.cc
 M apps/customer_mobile/windows/flutter/generated_plugin_registrant.h
 M apps/customer_mobile/windows/flutter/generated_plugins.cmake
?? apps/customer_mobile/docs/email-registration-policy-consent-review.md
?? apps/customer_mobile/test/features/authentication/email_registration_repository_test.dart
```

Every change remains unstaged and uncommitted. Stopped for review.
