# Dynamic published policy consent review

Review date: 2026-10-15 (Asia/Manila). Updated for the confirmed backend consent contract addendum.
Branch: `feat/mobile-customer-parity`. HEAD remains `1c96995`.

## Implementation and exact changed files

All changes are inside `apps/customer_mobile`:

- `lib/features/authentication/presentation/customer_consent_screen.dart`: independently validates both returned published documents, requiring nonblank string versions and names, nonempty sections, nonblank section titles, and nonempty lists of nonblank string paragraphs. No fixed version/date or semantic-version format restriction. Controls are absent while loading or when either document is invalid. Displays all section content, optional summary and effective date, and each independently captured version. Adds policy retry, clears both acceptances on reload, explains outdated-policy recovery, and prevents interaction during acceptance/cancellation.
- `lib/features/authentication/presentation/authentication_gate.dart`: forwards the two independent versions with the identity generation and consent revision. Keys consent screens by both values and guards old cancellation callbacks with the captured UID, generation, and revision.
- `lib/features/authentication/application/customer_auth_controller.dart`: requires both submitted versions, passes them to the repository, and increments consent revision on backend `consent-required` or `policy-version-outdated` rejection so even immediate rejection recreates the screen and reloads both documents unchecked. Rejects acceptance callbacks after disposal, during sign-out, with an obsolete revision or identity generation, or before the auth stream catches up with a changed Firebase identity. Existing bootstrap identity checks, account switching, refresh, terminal account states, and sign-out remain in force.
- `lib/features/authentication/data/repositories/customer_auth_state_repository.dart`: requires both version arguments and sends them unchanged through the existing callable; maps the confirmed `failed-precondition` / `policy-version-outdated` response before generic preconditions and retains coordinated identity checks. No direct consent Firestore writes.
- `test/features/authentication/customer_consent_screen_test.dart`: mocks 1.1, future and independent versions, initially unchecked acceptance, exact submission, decline, invalid versions/names/sections/titles/paragraphs in either document, network and callable authorization retries, replacement during loading, and cancellation with late completion.
- `test/features/authentication/customer_auth_state_repository_test.dart`: checks independent 1.1 Terms and 1.2 Privacy callable values and protected-read gating before acceptance. Verifies both confirmed reason mappings and that an unknown precondition reason retains generic handling without protected reads.
- `test/features/authentication/customer_auth_navigation_test.dart`: updates the mocked request interface and policies, exercises exact old versions after publication changes, reloads on both confirmed backend consent responses, requires fresh explicit acceptance, and tests network/callable submission recovery without automatic resubmission. Tests old screen acceptance/cancellation callbacks after sign-out, account switching, and a new consent revision; a late outdated response cannot change a switched identity.
- `docs/dynamic-published-policy-consent-review.md`: this review and backend compatibility handoff.

## Published version flow and confirmed callable contracts

Read-only inspection of `functions/src/documents/current-legal-agreement.ts` and `functions/src/shared/current-agreement.ts` confirms:

- `getCurrentLegalAgreement` request: `{purpose: 'platform_terms'}` or `{purpose: 'privacy_notice'}`.
- Response: `{agreement: null}` or a current published projection containing `code`, `name`, `summary`, `version`, `effectiveDate`, and `sections: [{title, paragraphs}]`. Flutter uses the existing loader in `asia-southeast1`. The backend selects the published document; Flutter validates response structure for safe display, without claiming authoritative consent validation.

Read-only inspection of `functions/src/auth/ensure-user-profile.ts` confirms these accepted request fields:

```json
{
  "acceptedTerms": true,
  "acceptedPrivacy": true,
  "termsPolicyVersion": "<exact displayed Terms version>",
  "privacyPolicyVersion": "<exact displayed Privacy version>"
}
```

The screen captures its displayed strings and forwards them through AuthenticationGate -> CustomerAuthenticationController -> CustomerConsentRepository -> ensureUserProfile. Neither string is trimmed, normalized, substituted, or copied from the other. Acceptance requires both initially unchecked boxes.

The checked-in success response is `{success: true, created: boolean, user: {uid, role, accountStatus}}`. The existing repository consumes callable completion and then the controller refreshes the trusted account state. No new response fields or local proof of authoritative version validation have been introduced.

## Confirmed error handling

Gabbiiiiiiiii confirmed the following contract in the user's addendum; the updated backend is not deployed yet:

- Outdated policies: Firebase Functions code `failed-precondition` with `details.reason: 'policy-version-outdated'`.
- Missing explicit consent: `details.reason: 'consent-required'`.

The repository matches the outdated-policy code and reason before generic `failed-precondition` handling and returns a distinct internal failure kind. The controller sets an outdated-policy notice, increments the consent revision, and returns to explicit onboarding with the same current identity. Both agreements reload, both checkboxes reset, and no acceptance is automatically resent. The notice asks the customer to review and accept both current agreements again. Old screen callbacks cannot use the new revision. Unknown failed-precondition reasons keep the existing generic configuration handling.

`consent-required` uses the same fresh onboarding flow without the outdated-policy notice. Neither reason is interpreted as an expired session or causes sign-out. Tests model each confirmed rejection, verify that old displayed versions were submitted unchanged, and verify that only fresh explicit acceptance submits the new independent versions.

Policy loading failures or null/malformed responses display an unavailable message and a Retry policies action. Callable `permission-denied`/`unauthenticated` loading errors have separate authorization guidance. Retry loads both documents and does not submit acceptance. Cancellation remains available during loading. During submission, existing handling distinguishes network, callable access, blocked/disabled/unsupported-role accounts, and genuine expired Firebase sessions. Transient recovery uses the authentication gate; tests confirm no protected account access or acceptance retry happens automatically after rejected submissions.

Identity protection operates at the screen, controller, and coordinated repository layers. The controller verifies the current repository identity even before stream notifications catch up. Generation and revision checks reject obsolete screen callbacks. Completion checks discard a previous account's asynchronous success/failure. Cancellation checks also capture the UID so an obsolete callback cannot sign out a different account.

## Remaining backend deployment blocker

The request fields and outdated-policy error contract are now confirmed; there is no remaining mobile contract blocker for this addendum. The updated backend is explicitly **not deployed**. The checked-in backend allows submitted version fields but ignores them, writing constants from `customer-consent-policy.ts` (`2026-07-29`). Mobile cannot make that backend validate or record the published versions correctly.

Before release, Gabbiiiiiiiii's backend change must independently validate each submitted version against the authoritative current published agreement, fail closed when policies cannot be resolved, reject outdated versions/publication races before profile or consent mutations using the confirmed error, and store the verified versions. Verify deployment to the expected region through the backend release process. This remains a release blocker, not an unfinished Flutter error mapping. No new unavailable-policy error reason was invented.

Current production versions 1.1 / 1.1 are user-provided confirmed findings, not client constants. No production requests were made to verify them or the deployment.

## Verification

- Formatting completed for all seven changed Dart files using the installed Dart SDK.
- Focused consent screen/repository/navigation tests: **74 passed**.
- Authentication and router regressions: **236 passed** (`flutter test --no-pub test/features/authentication test/app/router`). Includes Google Sign-In, account recovery, identity switching, pending bootstrap cancellation, and gate regressions.
- Changed-file analysis on all seven Dart files: **No issues found**.
- `git diff --check`: passed. Git reported only existing desktop plugin line-ending notices.
- SHA-256 comparison: all seven pre-existing modified desktop plugin files remained byte-for-byte identical to their initial contents.
- No production Firebase requests, staging, commits, pushes, deployments, resets, rebases, or merges.

## Final Git status (seven pre-existing desktop plugin modifications excluded)

```text
 M apps/customer_mobile/lib/features/authentication/application/customer_auth_controller.dart
 M apps/customer_mobile/lib/features/authentication/data/repositories/customer_auth_state_repository.dart
 M apps/customer_mobile/lib/features/authentication/presentation/authentication_gate.dart
 M apps/customer_mobile/lib/features/authentication/presentation/customer_consent_screen.dart
 M apps/customer_mobile/test/features/authentication/customer_auth_navigation_test.dart
 M apps/customer_mobile/test/features/authentication/customer_auth_state_repository_test.dart
 M apps/customer_mobile/test/features/authentication/customer_consent_screen_test.dart
?? apps/customer_mobile/docs/dynamic-published-policy-consent-review.md
```

Stopped for review with changes unstaged.
