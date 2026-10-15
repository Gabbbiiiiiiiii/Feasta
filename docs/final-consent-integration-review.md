# Final consent integration review — 2026-10-15

All changes are uncommitted. No push, merge, deployment, production Firebase access, Vercel change, or modification to another feature worktree was performed.

## Revisions and isolation

Remote heads were verified with `git ls-remote origin refs/heads/feat/mobile-customer-parity refs/pull/8/head refs/pull/9/head`:

- Mobile: `214ed20f81a48cacad64893d89eccfdb74cc4125`.
- Backend PR #8: `cfe91f51bfa40ee4a717ef9ce6b809b99c4f29a4`.
- Web PR #9: `2d2c1ee603c26a02be09dc8cd9053ca3a60b0b3e`.

Detached, initially clean worktrees:

- `C:/flutterProject/feasta/.consent-fixes/mobile`
- `C:/flutterProject/feasta/.consent-fixes/web`

Backend source was archived unchanged from PR #8 into the web worktree's ignored `.validation/backend` and compiled there. Existing dependencies were reused through local junctions. Flutter dependencies were resolved from the offline cache. No backend validation or rules were changed.

## Mobile change

The original email-registration input and callable serializer carried acceptance booleans but no versions. Registration now opens the existing published-policy review after form validation. That review loads both current legal projections through `getCurrentLegalAgreement`, renders their content and exact independent versions, and requires two new explicit checks before submitting. The values travel through the registration controller and normalized input to `ensureUserProfile`; versions are never looked up or substituted during submission.

Missing, unavailable, malformed, padded, or oversized version identifiers fail closed. Unconfirmed submissions keep the review open, show the registration error, clear both checks, and reload both agreements. There is no automatic registration retry. The customer must explicitly accept again. Tests cover Terms changing from T-7 to T-8 while Privacy remains P-3.

Existing email login still serializes exactly `{}`. Same-identity registration recovery first synchronizes with `{}`; only an Auth-only identity receiving `consent-required` uses the explicit review already completed by the customer. Existing account consent history is preserved. Different-account guards, coordinated auth operations, identity rollback, and verification-email handling remain in place. Google keeps its existing bootstrap and explicit-consent flow; shared review validation now rejects identifiers that the strict backend rejects. Navigation fixtures using padded identifiers were corrected without removing assertions, and dedicated padded/oversized cases were added.

## Exact changed files

Relative to the mobile worktree:

- `apps/customer_mobile/lib/features/authentication/application/customer_registration_controller.dart`
- `apps/customer_mobile/lib/features/authentication/data/repositories/auth_repository.dart`
- `apps/customer_mobile/lib/features/authentication/domain/customer_registration.dart`
- `apps/customer_mobile/lib/features/authentication/presentation/customer_consent_screen.dart`
- `apps/customer_mobile/lib/features/presentation/screens/customer_register_screen.dart`
- `apps/customer_mobile/test/features/authentication/customer_auth_navigation_test.dart`
- `apps/customer_mobile/test/features/authentication/customer_consent_screen_test.dart`
- `apps/customer_mobile/test/features/authentication/customer_registration_controller_test.dart`
- `apps/customer_mobile/test/features/authentication/customer_registration_screen_test.dart`
- `scripts/test-mobile-consent.mjs` (new emulator regression runner)
- `docs/final-consent-integration-review.md` (this report)

Relative to the web worktree:

- `apps/web/test/emulator/customer-consent.integration.cjs`

The web change replaces four direct CommonJS imports with dynamic Node imports inside an async entry point, and renames the local transpilation wrapper from `module` to `loadedModule`. All assertions and all six existing scenario groups remain. No ESLint configuration, rule suppression, or production web source changed.

## Original ESLint errors

Reproduced on untouched `2d2c1ee6`, in `apps/web/test/emulator/customer-consent.integration.cjs`:

| Line:column | Rule |
| --- | --- |
| 1:10 | `@typescript-eslint/no-require-imports` |
| 3:14 | `@typescript-eslint/no-require-imports` |
| 5:12 | `@typescript-eslint/no-require-imports` |
| 5:44 | `@typescript-eslint/no-require-imports` |
| 22:320 | `@next/next/no-assign-module-variable` |

## Commands and results

From the mobile app directory, `apps/customer_mobile`:

```powershell
flutter pub get --offline
flutter test --no-pub test/features/authentication test/registration_rollback_test.dart
flutter analyze --no-pub
```

- Authentication and rollback suite: **253 passed, 0 failed**. Untouched `214ed20` under `.validation/baseline` ran the same command: **248 passed, 0 failed**. Five additional cases cover stale registration recovery and malformed version identifiers. Google bootstrap, existing-account synchronization, late responses after identity switches, and rollback regressions are included.
- Analysis: **17 existing findings**, matching untouched `214ed20` (two warnings and fifteen information findings). No new analyzer findings; analysis is not globally clean.
- Focused registration and consent screen suite: **36 passed**, including final error presentation.

From the web app directory, `apps/web`:

```powershell
node node_modules/eslint/bin/eslint.js test/emulator/customer-consent.integration.cjs
node node_modules/eslint/bin/eslint.js
node node_modules/vitest/vitest.mjs run test/components/customer-consent.test.tsx test/components/customer-consent-client.test.tsx test/components/customer-authentication.test.tsx test/components/google-sign-in.test.tsx test/components/customer-auth-dialog.test.tsx
```

- Targeted lint: original five errors reduced to **0 errors, 0 warnings**, exit 0.
- Broader web lint: **0 errors, 0 warnings**, exit 0. Installed CLI entry points were used, matching the prior validation workflow.
- Consent/auth components: **59 passed across 5 files**, no failures. Web production source is byte-for-byte unchanged by this fix.

From `.validation/backend/functions`, `node node_modules/typescript/bin/tsc` compiled the exact backend successfully. From `.validation/backend`:

```powershell
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.consent.test.json --project demo-feasta-consent --only auth,firestore "node --test --test-concurrency=1 functions/test/emulator/customer-consent.integration.cjs"
```

Backend consent suite: **44 passed, 0 failed**, including authorization, rejected writes, independent policy updates, and transaction retry revalidation. Dedicated ports: Auth 44999, Firestore 44080.

From the web worktree root:

```powershell
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.web-consent.test.json --project demo-feasta-consent --only auth,firestore "node apps/web/test/emulator/customer-consent.integration.cjs && node apps/web/test/emulator/customer-consent.integration.cjs --baseline && node ../mobile/scripts/test-mobile-consent.mjs"
```

Final combined run: exit 0. All six web groups passed: registration/independent versions; existing email synchronization/repair/history; stale registration/rollback/no retry; existing Google sync; new Google explicit consent/refreshed versions; malformed authority. Untouched `c3d3b008` web registration reproduced `invalid-policy-version` as expected.

The new mobile runner extracts `_ensureCustomerProfile` directly from the final production Dart file, changing only its private method name for the test wrapper. Flutter executes that exact serializer against an isolated loopback adapter invoking PR #8's unchanged handler with real emulator Auth identities and Firestore transactions. It reproduces the original missing-version failure, proves corrected registration payloads succeed, rejects stale versions without writes to either profile collection, accepts refreshed independent versions, and exercises empty synchronization. The adapter checks profile snapshots after every rejection. This is an executable serializer/handler regression, not a source-text-only assertion.

`git diff --check` passed in both worktrees. Logs are retained in web `.validation/compatibility-final.log`, `.validation/lint-target-final.log`, `.validation/lint-final.log`, `.validation/components-final.log`, `backend-emulator.log`, and mobile `apps/customer_mobile/.validation/{auth-final,registration-final,analyze-final}.log`. Baseline mobile logs are under mobile `.validation/baseline/apps/customer_mobile`.

## Test limits and review recommendation

Recommend code review of both isolated fixes. These results are not deployment approval. The Flutter emulator regression executes the production serializer and strict handler through a test adapter; it does not exercise the complete native FirebaseAuth/FirebaseFunctions plugin stack or a device registration against callable HTTP transport. UI/controller tests and rollback tests cover those client control paths separately. A full device email-registration smoke test remains necessary in an approved staging environment.

Google popup OAuth is stubbed at the web popup boundary, and mobile Google behavior is covered by existing regression doubles. Real OAuth redirect/popup, cancellation, account selection, and platform credentials remain staging checks. App Check enforcement and unauthenticated legal-document access are not established by the adapter. Next session/CSRF transport is stubbed in the web compatibility harness, so real cookie/session exchange remains a staging check. The six harness groups must not be described as full HTTP end-to-end tests.

Best-effort Auth rollback can still leave an Auth-only identity if deletion itself fails. Existing recovery remains available. Older clients lacking policy versions remain intentionally incompatible with the strict backend. Coordinate client/backend rollout after separate approval; do not weaken backend validation or rewrite historical consent.

Firebase CLI shutdown left Java emulator processes alive on this host. Cleanup targeted only command lines containing this task's exact `.consent-fixes/web/.validation/backend/firebase/firestore.rules` path and `demo-feasta-consent`; unrelated processes were untouched.
