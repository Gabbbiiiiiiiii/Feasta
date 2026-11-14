# Web customer consent compatibility review

Worktree: C:\flutterProject\feasta-web-consent
Branch: fix/web-customer-consent-compatibility
Base: origin/chore/monorepo-setup at c3d3b008
Backend authority: cfe91f51 (PR #8)
Mobile compatibility reference inspected: 214ed20 (Pia's feat/mobile-customer-parity)
Status: uncommitted; ready for review. No push, merge, PR edit, deployment, production Firebase access, backend source change, rules change, or legal-record change.

## Behavior and caller audit

All web ensureUserProfile calls go through ensureCustomerProfile in client-session.ts:

- Email registration submits names and explicit acceptance with the two independently displayed versions. Existing account creation rollback and verification-email retry behavior are retained.
- Email login sends exactly {} for synchronization and repair; no consent is manufactured.
- Both Google entry points (login page and marketplace dialog) initially send {}. Existing customers can log in without rewriting historical consent. A consent-required response opens a review; the next popup attempt is initiated only by another customer click after both checkboxes are checked.
- Google popup credential ownership, abort/deadline logic, conditional rollback, server session exchange, expected customer role, and account restrictions are retained. Failed profile calls cannot exchange a session.

The new shared review loads getCurrentLegalAgreement twice via the existing Firebase Functions client configured in asia-southeast1, with purposes platform_terms and privacy_notice. It renders the exact returned version, effective date, summary, and complete sections inside expandable agreement text. Text is rendered as React text, without HTML injection. Independent unchecked checkboxes sit beside the version labels.

Only an entirely valid pair can produce a consent payload. Missing documents, bad dates, malformed content, missing/oversized/whitespace-padded identifiers, and unavailable requests fail closed. Requests in flight from a previous reload cannot replace the current review. Manual reload and recognized policy errors clear both checkboxes before loading both documents. There is no background profile resubmission and no version lookup or substitution inside profile submission.

## Final request and error contract

Explicit consent request:

    {
      acceptedTerms: true,
      acceptedPrivacy: true,
      termsPolicyVersion: <exact displayed Terms version>,
      privacyPolicyVersion: <exact displayed Privacy version>
    }

Registration additionally sends firstName and lastName. Email/password remain Firebase Auth inputs and are not sent to ensureUserProfile. Existing login synchronization remains {}.

| Firebase code | details.reason | Web behavior |
| --- | --- | --- |
| failed-precondition | consent-required | Require review and both explicit checks |
| failed-precondition | policy-version-outdated | Reload BOTH agreements, clear BOTH checks, require another explicit submit |
| failed-precondition | policy-unavailable | Fail closed; reload both and offer a manual reload |
| invalid-argument | invalid-policy-version | Discard acceptance, reload both, require fresh acceptance |

No error automatically retries registration, Google authentication, profile writes, or session exchange. For email login, consent errors receive an actionable message while preserving the empty synchronization request. Existing account authorization failures follow the existing error path.

## Changed files

Under apps/web/src:

- lib/auth/customer-consent.ts: callable loader, projection validation, consent type and reason messages.
- components/auth/customer-consent-review.tsx: shared review and acceptance lifecycle.
- components/auth/customer-registration-form.tsx: exact review snapshot and policy recovery.
- app/login/login-form.tsx: Google review and explicit retry.
- components/customer/providers/customer-login-modal.tsx: matching Google dialog behavior.
- lib/auth/client-session.ts: independent version serialization; synchronization unchanged.
- lib/auth/sign-in-error.ts: agreed reason messages for email login.

Under apps/web/test:

- components/customer-consent.test.tsx: malformed projections, independent versions, stale reset, both Google surfaces, existing login, no automatic resubmission.
- components/customer-consent-client.test.tsx: actual request serialization, registration rollback, verification delivery recovery, empty email sync.
- components/customer-authentication.test.tsx: asynchronous published-policy fixtures, independent registration versions, stale registration UI.
- components/customer-auth-dialog.test.tsx: asynchronous review and revised existing-Google contract.
- components/google-sign-in.test.tsx: exact independent versions and stale rejection without session creation/retry.
- emulator/customer-consent.integration.cjs: real web module execution against approved backend handlers and local Auth/Firestore; supports --baseline comparison.

Also firebase.web-consent.test.json (dedicated local demo emulator ports) and this report.

## Validation results

| Check | Changed worktree | Untouched c3d3b008 |
| --- | --- | --- |
| TypeScript, tsc --noEmit | PASS | PASS |
| ESLint, project configuration | PASS, zero errors/warnings | PASS, zero errors/warnings |
| Core auth + consent components | 86 passed / 2 failed (88) | 61 passed / 2 failed (63) |
| Dialog, session, verification, login accessibility | 39 passed / 0 failed | 39 passed / 0 failed |
| Auth security contracts | 28 passed / 0 failed | 28 passed / 0 failed |
| Strict backend consent emulator suite | 44 passed / 0 failed | Backend authority validation |
| Actual web/backend emulator checks | Six scenarios passed | Missing-version incompatibility reproduced as expected |
| git diff --check | PASS | N/A |

Total component results: 125 passed / 2 failed (127); baseline 100 passed / the same 2 failed (102). New component regressions: zero. The two failures reproduce with matching names and assertions on untouched baseline:

- provider authentication and onboarding > uploads a private verification document and prevents premature submission: cannot find choose-file label.
- provider authentication and onboarding > communicates upload progress and replacement state: cannot find document-type label.

Core tests were customer-consent, customer-consent-client, customer-authentication, google-sign-in, provider-authentication, and admin-authentication. Additional component tests were customer-auth-dialog, session-reliability, customer-verification, and login-accessibility. Security contracts were admin-auth-contract, auth-abuse-regression, customer-auth-contract, provider-auth-contract, and provider-phone-auth-contract.

Local evidence is in ignored .validation: auth-results-final.json, auth-extra-final.json, baseline-extra.json, baseline-auth-final.log, auth-security.log, baseline-security.log, typecheck-delivery.log, lint-delivery.log, baseline-typecheck-final.log, baseline-lint-final.log, emulator.log, and web-emulator-final.log. Earlier attempt logs include resolved harness/tool invocation issues; use the final files above. pnpm's automatic dependency verification refused the shared existing dependency layout, so checks used installed CLI entry points directly. No dependency installation was performed in the original repository.

## Emulator scope and reproduction

Only demo-feasta-consent and guarded localhost ports were used. The approved backend was extracted unchanged under .validation/backend and compiled there. The baseline was extracted unchanged under .validation/baseline. The original dirty repository and existing worktrees were not edited. Local node_modules junctions supplied existing dependencies without reinstalling them.

Prepare the two archives with git archive cfe91f51 and git archive c3d3b008, extract each to its directory above, and install dependencies or provide equivalent isolated dependencies. Compile .validation/backend/functions with its installed TypeScript compiler. Run from repository root:

    node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.web-consent.test.json --project demo-feasta-consent --only auth,firestore "node apps/web/test/emulator/customer-consent.integration.cjs && node apps/web/test/emulator/customer-consent.integration.cjs --baseline"

The harness executes the current web loader and client-session module, real Firebase Auth emulator operations, and the exact strict backend handlers using real Firestore transactions. It checks registration, independent versions, existing email repair/history, stale registration rollback/no retry, existing Google empty sync, explicit Google consent, and malformed authority. Six PASS scenario groups are printed. Baseline mode intentionally verifies invalid-policy-version from the original registration client; it is a compatibility defect reproduced, not a new test regression.

The Google popup is stubbed with an emulator credential. Callable HTTP transport, App Check verification, and Next session endpoints are bypassed/stubbed. This proves payload/handler/storage compatibility, not a full browser OAuth or deployed transport test. Backend auth and role protections are also exercised by the 44-test backend emulator suite. Backend suite command (from the extracted functions directory) uses its firebase.consent.test.json and node --test --test-concurrency=1 test/emulator/customer-consent.integration.cjs.

Firebase reported shutdown but left Java Firestore processes holding ports on this host. Only processes whose command lines named this exact worktree's extracted rules path and demo project were stopped. No existing emulator or unrelated process was stopped.

## Remaining risks and release recommendation

Ready for local code review; do not release on these results alone. Triage the two baseline provider test failures separately. Verify real Google OAuth, App Check on unauthenticated legal loading, callable region/transport, cancellation, mobile rollout, role/account rejection, and Next session exchange in an approved staging environment before release. Review agreement reading/scrolling on small screens and inside the registration dialog in a browser.

Coordinate compliant web and mobile releases with PR #8. Older clients that submit acceptance without versions are intentionally incompatible; the baseline emulator check demonstrates that failure. Use the coordinated registration pause and release sequence from the backend review; do not relax backend validation or rewrite consent history to accommodate older clients. Registration rollback still inherits the existing best-effort deleteUser behavior: a cleanup failure can leave an Auth-only account requiring recovery.

No commit, push, merge, deployment, or production integration test was performed. All changes remain available for review in the requested worktree.
