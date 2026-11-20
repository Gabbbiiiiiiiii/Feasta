# Customer consent authority: implementation and rollout

Implemented locally in `C:\flutterProject\feasta-consent-backend` on
`fix/customer-consent-current-agreements`, based on latest fetched
`origin/chore/monorepo-setup` (`c3d3b008`). No commits, pushes, PRs, merges,
production writes, or deployment were performed. Original worktrees, PR #7,
service-classification, and Pia's branch were not modified. The untouched detached
comparison worktree remains at `.validation/baseline`; logs are ignored local artifacts.

## Files changed

- `functions/src/auth/ensure-user-profile.ts`: validate before either profile write; save verified versions; preserve authorization and repair.
- `functions/src/auth/customer-consent-policy.ts`: replace fixed dates with transactional published-agreement validation.
- `functions/src/shared/published-legal-agreement.ts`: shared trusted projection for public display and consent.
- `functions/src/documents/current-legal-agreement.ts`: use that shared projection.
- `functions/package.json`: focused and emulator test commands.
- `functions/test/customer-consent.test.cjs`: focused callable-handler harness.
- `functions/test/helpers/customer-consent-suite.cjs`: common consent and account-security cases.
- `functions/test/emulator/customer-consent.integration.cjs`: actual Auth/Firestore, concurrency, and SDK retry tests.
- `firebase.consent.test.json`: dedicated loopback demo emulators.
- This report.

## Exact Flutter contract

Use Firebase Functions in `asia-southeast1`, retaining authentication and production
App Check. Fetch both published agreements via `getCurrentLegalAgreement` with
`{"purpose":"platform_terms"}` and `{"purpose":"privacy_notice"}`. Each response
is `{"agreement": {...}}` or `{"agreement": null}` when unavailable. Display the
returned content and retain its exact `agreement.version` with explicit acceptance.
Never substitute a date, assumed label, or newly fetched version for content the
customer actually accepted.

New profile request to `ensureUserProfile`:

```json
{
  "firstName": "Customer",
  "lastName": "Name",
  "acceptedTerms": true,
  "acceptedPrivacy": true,
  "termsPolicyVersion": "1.1",
  "privacyPolicyVersion": "1.1"
}
```

`1.1` is an example from the supplied production findings, not a backend constant.
Use each displayed agreement's version. Names are optional, trimmed, and limited
to 80 characters. Only these six fields are accepted. Versions must be exact,
nonempty string identifiers, at most 100 characters, without surrounding whitespace.

Successful response remains:

```json
{"success":true,"created":true,"user":{"uid":"<authenticated UID>","role":"customer","accountStatus":"active"}}
```

Existing customers return `created:false`. Ordinary synchronization/repair sends
`{}` or optional names. It does not read policies or rewrite historical consent,
even when policy documents are unavailable. False/omitted flags do not record consent.
If either flag is true, both flags and both current versions are required even for
existing customers. Invalid explicit consent aborts all profile writes, including repair.

Stored fields remain `users/{uid}.termsVersion`, `privacyVersion`, `termsAcceptedAt`,
and `privacyAcceptedAt`. Request fields deliberately differ from stored fields.
Timestamps come from the server. Repeated valid acceptance preserves timestamps for
unchanged already-recorded versions. Explicit valid acceptance can record a changed
current version; ordinary sign-in cannot rewrite historical acceptance.

## Error contract

Read Firebase callable `code` and `details.reason` in Flutter.

| Code | Reason | Meaning / action |
|---|---|---|
| `failed-precondition` | `consent-required` | Both literal true flags required; show consent UI. |
| `invalid-argument` | `invalid-policy-version` | Either version is missing, null, empty, malformed, padded, or more than 100 characters; fix serialization. |
| `failed-precondition` | `policy-unavailable` | Trusted current publication is missing, ambiguous, or invalid; block consent and retry later. |
| `failed-precondition` | `policy-version-outdated` | Either identifier is stale; reload both policies, clear acceptance, and request explicit acceptance again. |
| `permission-denied` | `unsupported-role` | Existing user is not a customer. |
| `permission-denied` | `blocked` / `disabled` | Existing Firestore account is restricted. |

Other authentication, App Check, field validation, phone ownership, and rate-limit
contracts are preserved. Disabled Firebase Auth users retain `permission-denied`
without a new reason. Rate limiting remains ten attempts per ten minutes, returning
`resource-exhausted`. Rejection can consume a rate-limit attempt but cannot mutate
user/customer profiles or consent. Consent errors expose no unpublished text, paths,
or private catalog data. Infrastructure failures retain platform error handling.

## Security and races

Authentication, App Check options, rate limiting, customer role/account checks,
verified Auth phone ownership, and phone projection checks remain in place. Rules
are unchanged. Existing-account restrictions run before agreement reads.

Both profiles and the agreement/type catalogs are read in the same Firestore
transaction before any profile write. On contention retries, validation runs again.
The emulator retry test queues profile writes, injects a retryable abort, changes
the policy before the next SDK attempt, and verifies stale consent rejection with
no committed profile writes. Concurrent duplicates produce exactly one creation.
Publication after a successful commit does not invalidate correct historical acceptance.

Exactly one trusted active type, one lineage, and one raw current version are
required. Draft-only duplicate lineages cannot hide ambiguity. All explicit version
entries must parse, normalized version labels must be unique, identifiers must fit
the request contract, and effective dates must be real calendar dates. Legacy
top-level policy content is never publication authority. No migration/backfill occurs.
Full-catalog transaction reads detect duplicates but increase read/lock scope and
may cause contention during catalog administration.

The focused emulator suite invokes the exported callable handler with real local
Auth and Firestore emulators. It does not run the Functions HTTP emulator. Existing
backend security suites additionally cover production App Check configuration and
authentication/authorization contracts. Full auth/web/provider acceptance workflows,
Storage rules, browser flows, and Flutter builds were not rerun.

## Compatibility and coordinated rollout

Inspected integration-base web `apps/web/src/lib/auth/client-session.ts` and mobile
`apps/customer_mobile/lib/features/authentication/data/repositories/auth_repository.dart`.
Registration submits acceptance booleans without version identifiers. Ordinary login
repair uses an empty object. Old clients' new registration will now fail with
`invalid-policy-version`; old flows that submit true flags for existing customers
also fail. Existing empty-object synchronization/repair stays compatible.

Mobile legal display already calls `getCurrentLegalAgreement`. Web legal display
has a separate server resolver whose validation is less strict for malformed catalogs;
submission will fail closed if it displays content that fails backend validation.
Prefer the authoritative callable for coordinated consent display/serialization.
The supplied Flutter `2026-07-29` constraint must be removed in Pia's branch.
No client branch was edited and no unsafe compatibility fallback was introduced.
Existing legacy auth/web/provider emulator fixtures also need current legal documents
and matching customer version identifiers when those full workflows are next updated.

Deployment order, after explicit release approval:

1. Pause registration/first-time Google provisioning for all clients while retaining existing-account access. Gate noncompliant mobile versions, including paths bypassing a visible UI gate.
2. Deploy strict backend during the pause after triaging baseline regression failures.
3. Release web and Flutter clients that display returned content, serialize its versions, handle these errors, and separate ordinary sync from explicit consent.
4. Verify staging email/Google registration, recovery/repair, stale consent, restricted accounts, and App Check over the actual callable transport. Reopen registration only for compliant clients.

Deploying clients first while the old backend is live still records the hardcoded
date. Deploying strict backend first without a pause breaks old new-registration
flows. Use a coordinated registration pause/minimum mobile version gate; do not
roll back to incorrect version recording to accommodate older clients.

## Recommendation

GO for local implementation review. NO-GO for production until coordinated web/mobile
rollout and staging transport checks are ready and the four baseline failures are
triaged. No deployment was attempted.

## Validation results

| Check | Changed branch | Untouched baseline |
|---|---|---|
| Functions build | PASS (`pnpm --dir functions build`, also run by final emulator command) | PASS (same TypeScript compiler against untouched baseline source) |
| ESLint | 0 errors, 473 warnings | 0 errors, 473 warnings |
| Focused backend consent tests | 41 passed, 0 failed | New tests |
| Auth/Firestore consent emulator tests | 44 passed, 0 failed | New tests |
| Full backend suite | 1,399 passed, 4 failed (1,403 total) | 1,358 passed, 4 failed (1,362 total) |
| Firestore rules emulator regression | 37 passed, 0 failed | 37 passed, 0 failed |
| `git diff --check` | PASS | N/A |

The full backend total includes the 41 focused tests; do not double-count them.
All four broader failures reproduce on baseline with the same assertions:

- `customer-account-security.test.cjs:49`: shared preference/session mutations require trusted roles; source-format substring assertion.
- `function-security-contract.test.cjs:385`: refund adjudication/execution reject browser money authority; source-format substring assertion.
- `provider-settlement-wiring.test.cjs:50`: settlement-conflict check ordering assertion.
- `webhook-settlement-wiring.test.cjs:44`: isolated remaining-balance update-block assertion.

New regressions observed: zero. Existing failures: four. These are test failures,
not a claim that the underlying production behavior has been fully diagnosed.
No unrelated fixes were included.

The consent suites cover current 1.1 acceptance, literal flags, independent missing
and stale versions, legacy dates, display/submission changes, malformed/draft/duplicate
catalogs, history preservation, repair, explicit reacceptance, idempotency, restrictions,
provider/admin accounts, unauthenticated calls, unknown trusted fields, phone consistency,
rate limits, rejected-write atomicity, verified phone ownership, concurrent creation,
and SDK transaction retries. All fixtures use local demo emulators.

Repeat focused tests with `pnpm --dir functions test:consent` and emulator tests with
`pnpm --dir functions test:consent:emulator`. On this Windows/Java environment Firebase
reported shutdown but left Java processes holding ports. Only task-created processes
were identified by exact project/rules command line and stopped. Initial port-conflict
launches were tooling failures, not consent test failures; the final suite completed.

## Final error-contract review (October 15, 2026)

This follow-up changed only these three files from the existing implementation:

- `functions/src/auth/customer-consent-policy.ts`: corrected exposed reason strings.
- `functions/test/helpers/customer-consent-suite.cjs`: corrected expected reason strings shared by focused and emulator tests.
- `docs/customer-consent-backend-report.md`: finalized the contract and compatibility findings.

Final consent error contract:

| Condition | Firebase code | details.reason |
|---|---|---|
| Missing explicit acceptance | `failed-precondition` | `consent-required` |
| Outdated agreement version | `failed-precondition` | `policy-version-outdated` |
| Current legal agreement unavailable | `failed-precondition` | `policy-unavailable` |
| Missing, empty, malformed, or invalid version identifier | `invalid-argument` | `invalid-policy-version` |

Request fields remain `acceptedTerms`, `acceptedPrivacy`, `termsPolicyVersion`, and
`privacyPolicyVersion`. Transactional validation, historical-consent preservation,
existing-customer repair, authorization, App Check, and rate limiting are unchanged.

Revalidation after this correction: Functions build PASS; focused consent tests
41 passed / 0 failed; Auth/Firestore emulator tests 44 passed / 0 failed; ESLint
0 errors / 473 existing warnings. Full backend suite: 1,399 passed / 4 failed.
Fresh untouched integration-baseline run: 1,358 passed / the same 4 failed, with
matching failure names. New failures: zero. The Firestore rules results earlier
in this report belong to the preceding implementation validation, not a new run.

Compatibility review remains unchanged except for the final reason names: older
clients submitting acceptance without version identifiers now receive
`invalid-argument` with `invalid-policy-version`. Existing empty-object sync/repair
continues to work. Clients handling the superseded reason names must adopt the four
final names above. The coordinated registration pause, strict-backend release,
compliant web/mobile releases, and staging transport verification remain required.
No commit, push, merge, PR, deployment, or production Firebase modification occurred.
