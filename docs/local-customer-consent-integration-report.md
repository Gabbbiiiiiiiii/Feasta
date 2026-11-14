# FEASTA local customer-consent integration report

Review date: 2026-10-15 (Asia/Manila).

## Outcome

The isolated candidate is assembled and ready for Git integration review, with known baseline failures still open. Functions compilation and the Next.js production build succeeded. The required local consent suites passed. This is not a clean full-regression pass or production-release approval. No native Flutter release artifact was built.

Worktree: C:/flutterProject/feasta-consent-local-integration
Branch: test/customer-consent-local-integration
Starting and final HEAD: c3d3b0084fbfd5cf920f1c6a011c792cbab1acd8
All integration changes remain uncommitted and unstaged; nothing was pushed, merged or deployed. Original working files and existing worktrees were not modified. Authorized fetch/worktree creation updated shared Git metadata only. No production configuration/settings or cloud resources were changed.

## Exact sources

| Role | Revision |
|---|---|
| Verified integration base, origin/chore/monorepo-setup | c3d3b0084fbfd5cf920f1c6a011c792cbab1acd8 |
| Backend PR #8 | cfe91f51bfa40ee4a717ef9ce6b809b99c4f29a4 |
| Web original compatibility commit | 2d2c1ee603c26a02be09dc8cd9053ca3a60b0b3e |
| Web PR #9 final, including ESLint correction | 85c0d00308f500b5c42e2ba7faac8cdb02d3e4a1 |
| Pia latest mobile candidate, origin/feat/mobile-customer-parity | 981f3bab196cdcc74549dd1bb6564a074ca931cb |
| Pia registration fix within that candidate | 368b510e31c02a3eb32e546d84091ee4653c6141 |
| PR #10 comparison and serializer harness source | 52c13198ea652ddde6daa03da9ce56267050405d |
| Earlier mobile prerequisite, ancestry only | 214ed20f81a48cacad64893d89eccfdb74cc4125 |
| Mobile/integration merge-base | 00c92c93b7cea513e58eeefe75c01b72854e5bbe |

## Divergence and reconciliation

The integration side has four unique commits since the merge-base: f0cdf7e9, a94f378d, 2dfb9a23 and c3d3b008. Pia's side has eight: cfbf7cb2, b26ef36d, e52fc9e3, 1c96995b, c59e0b21, 214ed20f, 368b510e and 981f3bab. The integration side changed no apps/customer_mobile files since the merge-base. Thus there are no overlapping mobile files requiring textual conflict resolution. Newer backend/provider/security integration behavior remains intact.

A file-level diff selected 55 mobile files, rather than replacing the directory or merging/cherry-picking the branch. These include the registration flow and its required bootstrap, operation coordinator, auth-state repository, guards, navigation, verification, account/session recovery and tests. No mobile dependency manifest or lockfile change was required. Both backend/web patches passed apply checks without conflicts.

Final normalized-content comparison after the final P2 correction: 54 of the 55 selected mobile files equal Pia's latest revision. The sole exception is apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart: its unrelated add-on booking-notification text was restored to the integration base; every other byte in that file was preserved. All eight selected Functions files equal PR #8. All 13 selected web files equal PR #9 except the emulator harness's backend package path. Its configuration rules path was similarly adjusted. PR #10 was not merged; its standalone serializer harness was retained and pointed at this candidate's Functions output.

### Pia versus PR #10

| Area | Decision and evidence |
|---|---|
| Registration input | Retain Pia: both versions are required constructor/controller arguments, preserved unchanged by normalization. PR #10 allowed empty defaults and rejected them later. |
| Displayed agreements | Retain Pia: detached document snapshots drive both legal links and submission. Loader/document generation guards discard stale completions; both acceptances reset on reload. No production version 1.1 is hardcoded. |
| Strict error recovery | Retain Pia: exact code/reason pairs map to four distinct registration failures and reload documents unchecked, requiring explicit consent. PR #10 had less complete registration-specific recovery. |
| Identity switching | Retain Pia: captures UID before entering the shared operation queue and checks identity around profile creation and verification completion. Different signed-in emails are rejected. |
| Registration rollback | Both use captured created-user deletion and preserve the profile failure if rollback fails. Retain Pia tests for successful rollback, rollback failure and same-email recovery. Email delivery failure does not delete an already-created account. |
| Same-email recovery | Pia sends the explicit displayed consent payload directly. PR #10 first tried empty synchronization and only resent consent after consent-required. Ordinary login/bootstrap synchronization remains empty; explicit recovery may update policy acceptance under strict backend validation. Backend tests cover preservation of historical timestamps on ordinary synchronization. |
| Version syntax validation | PR #10 additionally rejected surrounding whitespace and versions longer than 100 characters on the client. Pia rejects blank versions and preserves exact values. Retain Pia: the unchanged strict backend rejects malformed identifiers before profile writes, and serializer/backend tests exercise rejection. Stricter client-side syntax checks remain a possible UX improvement, not an authorization boundary. |
| Optional effective date | Retain Pia's shared legal validator and tests permitting omitted effective dates. The actual backend authority remains stricter; no claim that malformed authority is accepted. |
| Google consent submission failure UI | PR #10 had an extra submissionError callback and generic unconfirmed-submission notice. Pia still reloads documents and clears consent on failure, with controller policy recovery messages. The additional generic notice was not ported; it is a remaining UX difference. Fresh consent and identity protections remain intact. |
| Verification | Retain Pia's repository mocks, registration/controller/widget tests and broad security/navigation prerequisites. Retain PR #10's exact serializer bridge for strict-handler verification. |

## Emulator isolation and tooling

Only project demo-feasta-consent was used for additional Auth/Firestore integration writes. Backend tests assert loopback 127.0.0.1:44080 (Firestore) and :44999 (Auth); cross-platform tests assert :48080 and :48999. The Flutter serializer bridge listens on :48081. Dedicated hub/logging/websocket ports are defined in the two test configs. UI is disabled and singleProjectMode is enabled. Synthetic example.test identities and policy fixtures were used.

The worktree did not receive the original web .env.local. Next build used process-local synthetic demo values, emulator flags and local Admin SDK endpoints. Production .firebaserc, firebase.json, Firestore rules/indexes, Next configuration, mobile Firebase options and all dependency lockfiles have no changes in the final candidate. The real mobile app was not launched with its production Firebase initialization; Flutter tests use mocks or the explicit loopback bridge. The web integration harness replaces the Firebase client boundary and connects emulator Auth explicitly.

Pia's reported cache problem did not recur here: Firestore emulator v1.21.0 JAR was already present in this user's cache, and Java 25 started it successfully. Dependencies were resolved offline from locked caches. The canonical Functions build prepares and installs the shared-types archive before TypeScript compilation, resolving the reported missing-module/build-layout problem without backend contract changes.

Initial archived-baseline dependency junctions proved unsuitable for pnpm verification: baseline tooling attempted package reconciliation through those links, causing temporary module-resolution failures and a shared dependency layout change inside this new candidate. The junctions were removed safely, baseline dependencies installed independently, and candidate locked dependencies restored. Final Functions build and 41 focused consent tests passed afterward. The earlier incomplete baseline attempts are tooling failures, superseded by the completed independent-baseline runs. Cross-platform results establish serializer/handler behavior; they are not a claim that every test was rerun under the final restored package layout.

No task processes or listeners on the dedicated emulator ports remained at the final read-only process inspection. Emulator logs show shutdown. Local logs and the untouched archived baseline remain under ignored .validation/. Incidental generated SDK files/source maps were restored to base bytes in this candidate; application source was preserved.

## Validation commands and results

Commands ran in this worktree unless a baseline path is shown. Saved evidence is in .validation/logs. PowerShell sometimes labels native stderr as NativeCommandError even for successful tools; explicit exit codes and test totals were used where available.

| Check / command | Candidate result | Baseline / evidence |
|---|---|---|
| pnpm install --offline --frozen-lockfile; flutter pub get --offline | Passed; final manifests/lockfiles unchanged | Independent baseline dependency preparation completed |
| pnpm --dir packages/shared-types build; pnpm --dir functions build | Passed, including final restored dependency layout | Archived base Functions build passed; backend-final-build.txt / backend-baseline-build.txt |
| node --test test/customer-consent.test.cjs from functions | 41 passed, 0 failed | New strict cases; backend-focused.txt |
| node --test test/*.test.cjs from functions | 1,399 passed, 4 failed / 1,403 | 1,358 passed, same 4 failed / 1,362; backend-tests.txt / backend-baseline.txt |
| pnpm exec firebase emulators:exec --config firebase.consent.test.json --project demo-feasta-consent --only auth,firestore "node --test functions/test/emulator/customer-consent.integration.cjs" | 44 passed, 0 failed | backend-emulator.txt |
| pnpm typecheck from apps/web | Passed | web-typecheck.txt |
| node node_modules/eslint/bin/eslint.js from apps/web | Passed, explicit exit 0; includes emulator harness | web-lint-final.txt |
| pnpm exec vitest run with nine selected consent/authentication component files | 111 passed, 2 failed / 113 | Isolated provider file on baseline: 39 passed, same 2 failed / 41; web-auth-tests.txt / web-baseline-provider-final.txt |
| pnpm test:security from apps/web | 141 passed, 1 failed / 142 | Same 141 passed, same 1 failed / 142; web-security.txt / web-baseline-security-final.txt |
| pnpm build from apps/web, synthetic process-local demo configuration | Passed; compiled, TypeScript completed, all 73 static pages generated and route table emitted | web-build.txt; no deployment configuration change |
| pnpm exec firebase emulators:exec --config firebase.web-consent.test.json --project demo-feasta-consent --only auth,firestore "node apps/web/test/emulator/customer-consent.integration.cjs && node scripts/test-mobile-consent.mjs" | Six web scenario groups plus exact Flutter serializer passed; command exit 0 | cross-platform-emulator.txt |
| flutter analyze --no-pub | 17 findings: 2 warnings, 15 infos; no errors | Exact same 17 diagnostic lines on archived base; flutter-analyze.txt / flutter-baseline-analyze.txt |
| flutter test --no-pub test/features/authentication test/app/router test/registration_rollback_test.dart test/features/customer/customer_account_controller_test.dart test/features/customer/customer_account_management_screen_test.dart test/features/customer/customer_password_change_repository_test.dart test/features/customer/password_recovery_store_test.dart --reporter expanded | 354 passed, 0 failed | flutter-tests.txt |
| git diff --check | Passed | Final source has no whitespace errors |

The nine selected web component files were customer-authentication, customer-auth-dialog, customer-consent, customer-consent-client, google-sign-in, customer-verification, account-management, provider-authentication and admin-authentication, all under test/components with .test.tsx suffixes.

### Matching baseline failures

Backend failures match by test name/assertion; numeric positions differ because the candidate adds 41 cases:

- customer-account-security.test.cjs:49: shared preference and session mutations require trusted roles (source-format assertion).
- function-security-contract.test.cjs:385: refund adjudication and execution never accept browser money authority (source-format assertion).
- provider-settlement-wiring.test.cjs:50: settlement conflict fails closed before duplicate finance creation (ordering assertion).
- webhook-settlement-wiring.test.cjs:44: remaining-balance webhook does not override provider-request lifecycle (source-block assertion).

Web provider component failures occur in both candidate and base:

- uploads a private verification document and prevents premature submission.
- communicates upload progress and replacement state.

Both fail looking up the Document type label (second assertion at provider-authentication.test.tsx:1419); this change does not alter provider verification UI.

Web security failure in both: provider-phase-f-contract.test.mts:161, verification document actions use direct file selection and consistent navigation; expected source pattern input.click() is absent.

No new failures were observed in these completed comparisons. Existing failures remain unresolved and require triage; this report does not certify the underlying production paths.

## Cross-platform behavior and evidence boundaries

- Real emulator-backed web registration submits independently loaded T-7/P-3 versions; stored records match. Existing email login repairs customer projection via {} and preserves historical consent timestamps.
- Stale registration rejects and rolls back without automatic resubmission. Existing Google synchronization uses {}. New Google consent-required rejection signs out; explicit refreshed consent provisions with T-8/P-3. OAuth popup is stubbed with emulator email credentials.
- Missing/malformed policies, all four error reasons, independent Terms/Privacy changes, restricted roles/statuses, historical consent, rejected-request no-profile-write invariants, concurrency and transaction retry are covered by the strict backend suite. Both client suites cover policy recovery and UI fresh consent.
- The bridge extracts the production Flutter _ensureCustomerProfile method verbatim (renaming it for access), calls the unchanged compiled strict ensureUserProfile handler via a loopback test server, and uses actual Auth/Firestore emulators. It reproduces missing-version rejection, submits independent versions, rejects stale versions, explicitly recovers, and verifies {} sync and unchanged user/customer records on rejected calls. It does not execute the entire Firebase callable SDK transport or full native registration UI end to end.
- Flutter repository/controller/widget tests exercise captured displayed documents, rollback and retained-identity recovery, account switching, disposal, session protection, navigation and mocked callable payloads. These complement the bridge; they do not establish native OAuth success.

## Files changed and reasons

The following is the reviewable application/configuration/document file set relative to the verified base. Ignored dependency/build/log artifacts are excluded.

| File | Reason |
| apps/customer_mobile/docs/dynamic-published-policy-consent-review.md | Upstream implementation evidence; historical results are superseded by this report. |
| apps/customer_mobile/docs/email-action-return-report.md | Upstream implementation evidence; historical results are superseded by this report. |
| apps/customer_mobile/docs/email-registration-policy-consent-review.md | Upstream implementation evidence; historical results are superseded by this report. |
| apps/customer_mobile/docs/password-change-security-recovery-report.md | Upstream implementation evidence; historical results are superseded by this report. |
| apps/customer_mobile/lib/app/app.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/app/router/customer_auth_navigation.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/core/helpers/auth_guard.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/core/helpers/verification_guard.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/core/security/auth_operation_coordinator.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/application/customer_auth_controller.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/application/customer_registration_controller.dart | Pia latest registration: captured displayed documents, independent versions, fresh-consent recovery and validation. |
| apps/customer_mobile/lib/features/authentication/application/email_verification_controller.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/application/phone_verification_controller.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/data/repositories/auth_repository.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/data/repositories/customer_auth_state_repository.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/data/services/auth_service.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/data/services/customer_profile_bootstrap.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/data/services/firebase_phone_verification_service.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/domain/customer_registration.dart | Pia latest registration: captured displayed documents, independent versions, fresh-consent recovery and validation. |
| apps/customer_mobile/lib/features/authentication/domain/phone_verification.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/presentation/authentication_gate.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/authentication/presentation/customer_consent_screen.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/customer/account/application/customer_account_controller.dart | Pia dependency chain: serialized account operations, password/session recovery and account security. |
| apps/customer_mobile/lib/features/customer/account/data/firebase_customer_account_repository.dart | Pia dependency chain: serialized account operations, password/session recovery and account security. |
| apps/customer_mobile/lib/features/customer/account/data/password_recovery_store.dart | Pia dependency chain: serialized account operations, password/session recovery and account security. |
| apps/customer_mobile/lib/features/customer/account/domain/customer_account_management.dart | Pia dependency chain: serialized account operations, password/session recovery and account security. |
| apps/customer_mobile/lib/features/customer/account/presentation/customer_account_management_screen.dart | Pia dependency chain: serialized account operations, password/session recovery and account security. |
| apps/customer_mobile/lib/features/presentation/screens/customer_register_screen.dart | Pia latest registration: captured displayed documents, independent versions, fresh-consent recovery and validation. |
| apps/customer_mobile/lib/features/presentation/screens/email_verification_screen.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/presentation/screens/forgot_password_screen.dart | Pia dependency chain: serialized account operations, password/session recovery and account security. |
| apps/customer_mobile/lib/features/presentation/screens/legal_document_screen.dart | Pia latest registration: captured displayed documents, independent versions, fresh-consent recovery and validation. |
| apps/customer_mobile/lib/features/presentation/screens/login_screen.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/presentation/screens/role_selection_screen.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/lib/features/presentation/widgets/customer_login_modal.dart | Pia dependency chain: authentication bootstrap, identity coordination, navigation, verification or consent safeguards. |
| apps/customer_mobile/test/features/authentication/auth_guard_bootstrap_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/authentication_gate_widget_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/authentication_responsive_accessibility_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/customer_auth_controller_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/customer_auth_navigation_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/customer_auth_state_repository_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/customer_consent_screen_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/customer_profile_bootstrap_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/customer_registration_controller_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/customer_registration_screen_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/email_registration_repository_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/email_verification_controller_lifecycle_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/email_verification_return_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/firebase_phone_verification_service_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/authentication/legal_document_screen_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/customer/customer_account_controller_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/customer/customer_account_management_screen_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/customer/customer_password_change_repository_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/features/customer/password_recovery_store_test.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/customer_mobile/test/helpers/password_recovery_preferences.dart | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/web/src/app/login/login-form.tsx | PR #9 dynamic displayed consent, exact independent version serialization, error recovery and existing-account synchronization. |
| apps/web/src/components/auth/customer-consent-review.tsx | PR #9 dynamic displayed consent, exact independent version serialization, error recovery and existing-account synchronization. |
| apps/web/src/components/auth/customer-registration-form.tsx | PR #9 dynamic displayed consent, exact independent version serialization, error recovery and existing-account synchronization. |
| apps/web/src/components/customer/providers/customer-login-modal.tsx | PR #9 dynamic displayed consent, exact independent version serialization, error recovery and existing-account synchronization. |
| apps/web/src/lib/auth/client-session.ts | PR #9 dynamic displayed consent, exact independent version serialization, error recovery and existing-account synchronization. |
| apps/web/src/lib/auth/customer-consent.ts | PR #9 dynamic displayed consent, exact independent version serialization, error recovery and existing-account synchronization. |
| apps/web/src/lib/auth/sign-in-error.ts | PR #9 dynamic displayed consent, exact independent version serialization, error recovery and existing-account synchronization. |
| apps/web/test/components/customer-auth-dialog.test.tsx | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/web/test/components/customer-authentication.test.tsx | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/web/test/components/customer-consent-client.test.tsx | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/web/test/components/customer-consent.test.tsx | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/web/test/components/google-sign-in.test.tsx | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| apps/web/test/emulator/customer-consent.integration.cjs | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| docs/customer-consent-backend-report.md | Upstream implementation evidence; historical results are superseded by this report. |
| docs/local-customer-consent-integration-report.md | Final combined integration results and review recommendation. |
| docs/web-customer-consent-compatibility.md | Upstream implementation evidence; historical results are superseded by this report. |
| firebase.consent.test.json | Dedicated backend demo emulator configuration from PR #8. |
| firebase.web-consent.test.json | Dedicated demo emulator ports; rules path adapted to this worktree. |
| functions/package.json | PR #8 transactional published-policy authority, shared projection, strict contract, or test commands. |
| functions/src/auth/customer-consent-policy.ts | PR #8 transactional published-policy authority, shared projection, strict contract, or test commands. |
| functions/src/auth/ensure-user-profile.ts | PR #8 transactional published-policy authority, shared projection, strict contract, or test commands. |
| functions/src/documents/current-legal-agreement.ts | PR #8 transactional published-policy authority, shared projection, strict contract, or test commands. |
| functions/src/shared/published-legal-agreement.ts | PR #8 transactional published-policy authority, shared projection, strict contract, or test commands. |
| functions/test/customer-consent.test.cjs | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| functions/test/emulator/customer-consent.integration.cjs | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| functions/test/helpers/customer-consent-suite.cjs | Consent, authentication, rollback, identity or account-security regression coverage from the selected source revision. |
| scripts/test-mobile-consent.mjs | PR #10 exact production serializer bridge, adapted to the assembled strict backend. |

## Remaining risks and recommendation

Proceed to a human Git integration review of this uncommitted candidate. Review the mobile prerequisite chain and explicit same-email recovery behavior, then triage the four backend, two provider component and one web source-contract baseline failures before any release approval. No unresolved textual conflicts or newly observed regression failures remain in the exercised checks. The full regression suite is not green.

Older mobile clients that omit displayed policy versions remain incompatible with the strict new-customer contract. A coordinated client/backend rollout and enforced minimum compliant version or registration pause is still required; existing-account {} synchronization remains supported. Do not silently invent policy versions or record acceptance for content a customer did not review.

Still requiring a real staging environment and device/browser testing: native Google OAuth and account switching across SDK/plugin boundaries; real callable HTTP transport, Firebase ID tokens and App Check enforcement; Android/iOS builds and signed application behavior; email verification delivery/action links; real browser cookie/session behavior, OAuth domains and CSP; network interruption and process restart during rollback/recovery; concurrency with administrative policy publication and coordinated old-client gating. No successful native OAuth, App Check, production transport or deployment testing is claimed.

Stop for review. Do not commit, push, merge PRs #8/#9/#10 or deploy from this report.

## Final P2 correction and commit readiness ? 2026-10-15

Verdict: **SAFE FOR INTEGRATION COMMIT**, within the explicit scope below. This authorizes no commit, push, merge or deployment; stop for review. Prior baseline failures and staging/deployment blockers remain open.

The unrelated notification-text hunk at feasta_repository.dart around line 2482 was excluded because booking-notification wording is outside the consent/authentication integration scope. The exact text from base c3d3b0084fbfd5cf920f1c6a011c792cbab1acd8 was restored, including its pre-existing encoding. This task deliberately does not repair that older text defect. A byte-range replacement verified that every other byte and all 3,361 CRLF sequences were preserved; no other notification or business behavior changed. The remaining diff in this file is only the coordinator import, serialized active-customer check, and transition notification before security-driven sign-out.

Targeted validation:

- flutter analyze --no-pub lib/features/authentication/data/repositories/feasta_repository.dart: PASS, no issues, exit 0.
- flutter test --no-pub test/features/authentication/customer_registration_controller_test.dart test/features/authentication/email_registration_repository_test.dart test/registration_rollback_test.dart --reporter expanded: PASS, 36 tests, 0 failures, exit 0.
- git diff --check: PASS. Tracked content diff: 46 files, 2,902 insertions and 753 deletions.
- Source comparison: only the documented notification-line exception differs among Pia's 55 selected mobile files; registration, auth security, same-email recovery and rollback code/tests remain intact. All eight selected Functions files match PR #8. The 13 selected web files retain only the previously documented harness backend-path adjustment relative to PR #9.
- Serializer harness still matches PR #10 after removing BOM/CRLF differences and applying only the documented backend-path adjustment. It was not rerun because its source and all consent behavior are unchanged.
- No substantive diff in production Firebase/deployment configuration or dependency lockfiles. No emulator test or production connection was needed for this text-only correction.

Validation evidence: .validation/logs/notification-correction.json, flutter-notification-analyze.txt and flutter-notification-tests.txt. These local evidence files are excluded from the commit.

Exact intended commit scope: the **82 files** in the preceding Files changed and reasons table (46 tracked substantive files plus 36 untracked integration files). Include their current content, including this corrected repository file and updated report; the notification-text hunk is absent. The 55-file mobile chain, backend/web consent source, all listed regression tests, two emulator configs, serializer harness and seven reports remain included. No additional files are authorized by this scope.

Git status also reports 46 generated paths as modified despite all 46 matching HEAD byte-for-byte and having no content diff. Exclude apps/customer_mobile/{linux,macos,windows} generated plugin files, packages/shared-types/dist outputs and functions/vendor/shared-types-manifest.json. Also exclude dependencies, SDK/build outputs, .validation archives/logs/generated bridge tests and all production environment/configuration changes. Do not use blanket staging. The index remains empty; HEAD and branch are unchanged.
