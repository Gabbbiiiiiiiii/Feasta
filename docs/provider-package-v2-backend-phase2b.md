# FEASTA Backend Phase 2B local handoff

Validated locally on 2026-10-23, branch `chore/monorepo-setup`.

## Implementation and scope

The following callables are implemented and exported from `functions/src/index.ts`:

- `submitProviderOccasionSuggestion`: approved owner derived from the current user record; replay, approved catalog label/alias (including inactive), own duplicate (all statuses), quotas, creation precedence. Submission and its saved response commit together. A provider guard serializes concurrent creates; pending and rolling 24-hour counts come from authoritative suggestion records, including terminal records for the rolling quota.
- `listMyOccasionSuggestions`: approved owner scope, optional exact status, default/max 20, `createdAt DESC, document ID DESC`, UTC timestamps.
- `listOccasionSuggestionsForReview`: current active administrator, required `status: pending`, default/max 20, `createdAt ASC, document ID ASC`.
- `reviewOccasionSuggestion`: reject, map, approve existing inactive, approve new. Authorization and protected policy are checked before replay; replay precedes stale revision checks. Catalog and target revisions, canonical name reservations and current categories are verified in the transaction. A new catalog identity remains inactive. Terminal suggestion, optional catalog changes, immutable audit/outbox events and saved response commit together.

No provider capability or package is changed by any moderation branch. Existing App Check options, authorization implementations and Firestore rules were retained. Security tests were expanded for these four exports; existing assertions were retained.

## Setup Gallery V2 integration notes for Pia

Use the frozen shared request/response types in `@feasta/shared-types/provider-package-v2`. Do not send provider ID, status, activation flags or review metadata in submission requests. Keep the same idempotency key and canonical payload when retrying a request.

Submission has four outcomes: `created`, `canonical_match`, `own_duplicate`, and `idempotent_replay`. Replay wraps the original recorded result, including its original status/revision; use the owner list to obtain current moderation state. An inactive canonical match is an existing identity, not permission to select it as an active occasion or claim a provider capability. Moderation does not activate identities or grant capabilities.

Pagination cursors are opaque and bind actor, provider scope, status, direction and page size. Restart pagination when changing those inputs. API timestamps are UTC ISO strings. Return `nextCursor: null` means end of the current query.

New server configuration prerequisites (not provisioned by this task):

- Protected `contractPolicies/providerPackageV2.featureGates.occasionSuggestionWrites` must be exactly true for submission/moderation. This gate is independent of `occasionCatalogReads`.
- The policy must have the current Firebase project as `effectiveEnvironment`, a positive safe integer `revision`, positive safe integer `maxPendingSuggestionsPerProvider`, and positive safe integer `maxNewSuggestionsPerProvider24h`. Effective limits are capped at three pending and five new submissions per rolling 24 hours, with stricter policy values respected.
- The private listing callables use secret `FEASTA_OCCASION_SUGGESTION_CURSOR_HMAC_KEY`: canonical base64url encoding of at least 32 random bytes. Missing/malformed secret fails closed. No secret was created or read from a live project.
- `occasionCatalog/current` must have a positive safe integer revision and `activationState: stable`.
- Three collection-scoped suggestion indexes were added, preserving the existing local catalog index and all unrelated indexes. They have not been deployed.

Private server collections: `providerOccasionSuggestions`, `occasionSuggestionOperations`, `occasionSuggestionProviderGuards`, `occasionNameReservations`, `occasionSuggestionReviewAudits`, `occasionSuggestionOutbox`. Current default-deny rules cover these paths. Operations retain original results and record a 30-day minimum retention timestamp; no TTL or cleanup job was enabled. Outbox delivery is outside this phase; no notification was sent.

## Verification evidence

Final checks:

| Check | Result |
| --- | --- |
| Functions TypeScript: `node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json` | Passed |
| Focused Phase 2B: `node --test functions/test/provider-occasion-suggestions-v2.test.cjs` | 34 passed, 0 failed, 0 skipped |
| Backend regressions (command below, from `functions`) | 242 passed, 1 failed, 0 skipped |
| Targeted ESLint on the two new TypeScript modules and `src/index.ts` | 0 errors; 4 preexisting line-length warnings in index.ts at lines 1090, 1097, 1101, 1102; new modules have no warnings |
| `git diff --check` | Passed |
| Frozen contract SHA256 | `cec2ed041d9511e894c38e127aab69804ad7f5577eb4afcd1cce53d50cd27e06` matches |

Regression command:

```text
node --test test/provider-package-*.test.cjs test/package-*.test.cjs test/booking-package-offer.test.cjs test/account-state.test.cjs test/function-security-contract.test.cjs test/provider-review-security.test.cjs test/security-events.test.cjs
```

The single regression failure is `all deployed exports remain in the reviewed inventory` in `function-security-contract.test.cjs`. It already failed before Phase 2B exports were added, because the inventory lacks `listApprovedOccasions` and `reconcileInitialPaymentExpiration`. Only the four Phase 2B entries and their security assertions were added; these two unrelated discrepancies were preserved. Final failure still reports precisely those two names. Earlier focused-test development failures were corrected; none remain in the final focused run.

Focused coverage includes authentication, active authorization, ownership, suspension, fail-closed policy, normalization/strict fields, inactive canonical matches, terminal duplicates, pending and rolling quotas, stricter policy, optimistic transaction conflict/retry concurrency, same-key concurrency, competing approvals, payload conflicts, preserved replay snapshots, owner/admin pagination, nanosecond cursor positions, tampering/scope binding, all four decisions, review reason/branch validation, catalog/target/suggestion conflicts, reservations, category validity, atomic commit-failure rollback, private default-deny paths and exact index tuples.

Transaction tests use an in-memory optimistic transaction model with conflict retries, atomic buffered commits and read-before-write assertions. They do not constitute live Firestore or emulator verification. No emulator was started, in accordance with the task restriction; deployed index availability and actual Firebase integration remain unverified.

## Files changed by this task

Created:

- `functions/src/packages/occasion-suggestion-v2-core.ts`
- `functions/src/packages/provider-occasion-suggestions-v2.ts`
- `functions/test/provider-occasion-suggestions-v2.test.cjs`
- `docs/provider-package-v2-backend-phase2b.md`

Modified additively:

- `functions/src/index.ts`
- `functions/test/function-security-contract.test.cjs`
- `firebase/firestore.indexes.json`

Existing Phase 1/2A/2B parser/domain files, shared artifacts and all unrelated tracked/untracked work were retained. No Setup Gallery, Event Finder, Customer Web or unrelated Provider Web files were edited by this task.

## Completion and remaining work

Phase 2B implementation is complete locally, with all four callables exported and focused tests green. No Phase 2B implementation blocker remains. The overall regression suite is not fully green because of the preexisting inventory discrepancy described above. Protected configuration/secret provisioning, deployed indexes, real Firebase integration and subsequent release authorization remain separate prerequisites; no production readiness is claimed.

No deploy, Firebase production write, emulator startup, commit, push, merge, reset, stash or clean was performed. The frozen contract was not modified. No message was sent to Pia or anyone else; these notes are ready for coordination.
