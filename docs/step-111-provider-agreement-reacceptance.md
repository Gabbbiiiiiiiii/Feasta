# Provider Agreement reacceptance — Step 111 implementation, Step 116 safety review

Branch: `chore/monorepo-setup`. Verified HEAD: `0c3f6f59c24ef75aac24d8f3c73fd6c62d1a745a`.

The original 13 implementation files are retained. Step 116 continues that uncommitted work, adds full previous-history validation and bounded verification queries, and regenerates this report. No branch, commit, push, Firebase deployment, Vercel deployment, or live Firebase write was performed.

## Exact changed files

These are the complete agreement implementation changes relative to HEAD, excluding the user's unrelated local work. Files marked Step 116 received additional safety changes in this review.

| File | Purpose |
| --- | --- |
| `apps/web/src/components/provider/provider-business-agreement-card.tsx` | Agreement card and previous acceptance history |
| `apps/web/src/components/provider/provider-agreement-reacceptance.tsx` | Voluntary review and explicit confirmation dialog; new file |
| `apps/web/src/lib/provider/business-profile/provider-business-agreement-service.ts` | Server projection of current acceptance and history |
| `apps/web/src/lib/provider/provider-agreement-download.ts` | Exact accepted-copy reader/PDF selection; Step 116 policy alignment |
| `apps/web/src/lib/provider/provider-agreement-reacceptance-client.ts` | Authenticated review/accept callable client; new file |
| `apps/web/test/components/provider-business-agreement-record.test.tsx` | Reader/PDF tests; Step 116 chain, boundary, legacy conflict, and parity regressions |
| `apps/web/test/components/provider-agreement-reacceptance.test.tsx` | Explicit confirmation and cancellation tests; new file |
| `firebase/firestore.rules` | Deny client event access and protect agreement fields/pointer |
| `functions/src/index.ts` | Export acceptance callable |
| `functions/src/providers/accept-current-provider-agreement.ts` | Trusted transactional workflow; new file, Step 116 full history validation and query bound |
| `functions/src/shared/published-legal-agreement.ts` | Trusted current provider-purpose publication resolution |
| `functions/test/provider-agreement-reacceptance.test.cjs` | Callable tests; new file, Step 116 safety regressions |
| `functions/test/emulator/provider-agreement-reacceptance.integration.cjs` | Real local Auth/Firestore transaction and rules tests; new file, Step 116 second-acceptance/failure coverage |

`docs/step-111-provider-agreement-reacceptance.md` is the additional documentation artifact. No new implementation files were added beyond the retained 13.

Preserved unrelated work: `functions/vendor/shared-types-manifest.json` and `apps/web/src/app/admin/reconciliation-validation/`. Neither was edited. No booking or financial implementation files changed.

## Acceptance data model

The existing Step 111 format is unchanged:

- `providerAgreementAcceptances/{acceptanceId}`: immutable voluntary acceptance event. `acceptanceId` is SHA-256 of the JSON tuple `[providerId, documentCode, version]`.
- Each event stores `ownerId`, `providerId`, canonical reviewed-document `digest`, complete `snapshot`, server `acceptedAt`, business and representative names at acceptance, `previousAcceptanceId`, and explicit-confirmation `source`.
- The snapshot stores code, name, summary, version, effective date, all sections/paragraphs, and the same server acceptance timestamp.
- `providers/{providerId}.providerAgreementCurrentAcceptanceId` identifies the current voluntary event. `previousAcceptanceId` links older voluntary events, with an explicit `null` at the tail.
- Original acceptance metadata/snapshots remain independently stored in the original provider/verification records. They remain the legacy history entry and are never overwritten, deleted, backdated, or reconstructed from today's catalog.
- Creating an event, moving the pointer, and writing the `provider.agreement_accepted` audit record happen in one Firestore transaction.

No migration or historical 2026-09-23 snapshot is generated. Different versions can form a legitimate event sequence; multiple records claiming the same acceptance must still agree.

## Step 116 safety changes

### Full previous-history validation

Before append **or idempotent replay**, the callable validates every linked event using the same policy as the web reader:

1. Valid deterministic document ID and canonical document digest.
2. Matching owner/provider identities and parseable snapshot.
3. Valid acceptance timestamp, including Firestore timestamp range, equal to `snapshot.acceptedAt` at nanosecond precision.
4. Explicit, well-formed previous link; missing documents, missing links, malformed links, and cycles are rejected.
5. No duplicate versions, even where differing document codes produce different deterministic IDs.
6. Compatibility with every raw legacy evidence record claiming the same version. A reconstructed/ranked summary cannot hide a contradictory secondary record.

Traversal reads at most 100 previous events. A chain of 99 can receive its hundredth event. A valid chain of 100 remains readable/downloadable and can be replayed, but cannot be appended to. More than 100 events fails closed without an additional traversal read. The candidate acceptance lookup is a separate bounded read.

The pure identity/digest/timestamp/legacy policy is intentionally identical in the two existing runtime files, with a regression test checking parity. This avoids adding an implementation file, changing shared package artifacts, or rewriting the history format. Both runtimes retain their existing equivalent snapshot parsers.

### Bounded verification evidence

The transaction queries `providerVerifications` by provider ID with `.limit(11)`. Eleven records are an overflow sentinel: more than ten rejects before any acceptance-state write. Ten consistent records remain supported.

Every returned record must match both owner and provider. All legacy evidence, including provider-level fields, receives self-validation and pairwise conflict checks. Malformed flags, identifiers, timestamps, snapshots, contradictory versions/dates/text, and incompatible same-version chain evidence fail closed. Metadata-only legacy acceptance remains valid and untouched.

On validation failure there is no new acceptance event, pointer update, original-record mutation, or acceptance audit entry. The existing shared rate limiter can still record the attempted request, as intended for abuse protection.

## Authentication, preservation, UI, and PDFs

The callable requires Firebase authentication, the existing active-account/provider-role checks, an active approved provider, and ownership/link checks repeated in the transaction. Provider ID comes from the authenticated server user record. App Check is enforced through existing callable options outside emulation. The existing rate limiter allows 30 review/accept calls per subject per ten minutes.

Review loads the unique trusted active provider-purpose Current publication. Acceptance requires explicit confirmation, the exact reviewed version, and the full canonical document digest. Transactional catalog reads revalidate concurrent publication changes. Deterministic IDs and transactional create preserve concurrency/replay protection; replays never replace timestamps or roll the pointer backward.

The Business Profile card keeps original version/date information, explains unavailable historical text, and provides a separate **Review current agreement** action. The dialog shows the full current text, version, and effective date. A checkbox and **Accept current agreement** action are required. Cancel, Escape, and dialog close do not submit acceptance. After success, the page reloads the new stored acceptance and retains prior history.

The accepted-copy PDF uses only the exact validated stored snapshot and its actual acceptance date. It never substitutes the current published catalog for missing historical text. The original authentic accepted-copy path remains covered by regression tests. Prior authentic text remains viewable in history; a separate historical-event PDF selector is not added.

Original approval/verification decisions, bookings, financial terms, and already authorized features are unchanged. Reacceptance is voluntary and introduces no mandatory feature gate. Existing onboarding code is unchanged. A conflicting legacy record with no voluntary chain can still display its original metadata, with accepted-copy recovery disabled; it cannot authorize a new append.

## Validation results

All checks below were run locally against the final implementation:

| Check | Result |
| --- | --- |
| Functions TypeScript compilation/emitted build (`node node_modules/typescript/bin/tsc`, from `functions`) | Passed |
| Web TypeScript (`tsc --noEmit`, from `apps/web`) | Passed |
| Changed Functions TypeScript ESLint | 0 errors; 4 preexisting max-length warnings in `functions/src/index.ts`; callable/resolver clean |
| Changed Web source/test ESLint | Passed without warnings |
| Relevant Functions unit/regression suites | **108 passed** |
| Relevant Web component/reader/PDF suites | **83 passed** across 5 suites |
| Local Auth/Firestore emulator integration | **3 passed** |
| `git diff --check` | Passed |

Functions tests retain all Step 111 tests and cover deeper corruption, canonical digest/ID, timestamp mismatch/range, wrong owner/provider, circular/broken/malformed links, duplicate versions, 99/100/101-event boundaries, query overflow, exactly ten metadata-only records, contradictory legacy evidence, same-version compatibility, rejection without acceptance-state writes, valid second acceptance, original preservation, replays, and concurrency. Additional suites cover original acceptance, current publication/version history, onboarding, booking agreement, business profile, and App Check policy.

Web tests retain all Step 111 tests and cover the matching history/legacy validation cases, policy parity, the 100-event reader boundary, unchanged accepted-copy PDF content/date, historical snapshot behavior, and cancellation.

Emulator tests use loopback-host and `demo-` project guards. Project `demo-feasta-step116` used local Auth/Firestore only. They verify real concurrent transactions create one immutable event/audit, server commit timestamps, denied provider/admin client writes, validation failure without event/pointer/audit writes, bounded-query overflow, preserved legacy records/bookings, and a valid second acceptance.

The Functions compiler was invoked directly to emit the build. The package script's vendor regeneration/install stage was deliberately not invoked because it rewrites the unrelated local `functions/vendor/shared-types-manifest.json` change. No dependency/package manifest or lockfile was changed.

## Deployment requirements and remaining limits

No commit, push, or deployment has been performed. Final review and explicit deployment authorization remain required.

After approval, release the acceptance Function and Firestore rules together with the Web UI/reader; the Function should be available before exposing the new acceptance action. Verify production Web origins, Firebase authentication, and App Check registration/configuration. Use the standard reproducible shared-runtime packaging/build process in the approved release context after the unrelated vendor manifest work is resolved. The existing provider-ID verification query uses the existing single-field index; no new composite index is introduced.

Ensure the trusted provider agreement type and exactly one valid active Current publication exist. The code resolves that publication dynamically and does not hardcode 1.7 or fabricate old text. No acceptance backfill or data repair is required for valid existing records. Invalid or over-limit histories require investigation rather than automatic rewriting.

The emulator tests invoke the callable handler with real emulated Auth/Firestore, not production callable HTTP transport or real App Check attestation. Shared enforcement configuration is covered by the existing App Check policy suite; a production browser/App Check smoke test remains a release follow-up after authorization. Standard Firestore size/transaction limits still apply in addition to the explicit traversal limits.
