# Occasion Lifecycle production cutover decision

Reviewed 2026-10-28 against branch `integration/pia-package-occasion-20261028`,
HEAD `e1c5ab5831eaaeebe46095009bb441742445ec8b` (matched; worktree initially clean).
This is a local engineering decision and runbook, not release authorization.
No production read, write, activation or deployment was performed. The supplied
nine inactive occasions and two published Birthday packages are rollout inputs,
not a newly verified production inventory. The frozen release manifest is unchanged.

## Decision and implemented scope

A controlled maintenance cutover is sufficient for the current legacy booking
contract, conditional on all gates below. No runtime correction or compatibility
bypass is justified by the inspected code. Added one regression proving that
activation withdraws two legacy Birthday offers, preserves unrelated publication
and historical/financial records, and does not restore offers on operation replay.
Pia's package/gallery integration and financial behavior are unchanged.

Maintenance must be an enforced, reviewed pause of NEW agreement preparation,
booking submission and package/gallery publication across Web, current/old mobile
clients, callable entry points, background writers and privileged scripts. A UI
banner is insufficient. Drain in-flight old revisions before lifecycle mutation.
Do not disable the whole project, Auth, customer history, existing agreement
payments, payment callbacks, reconciliation, cancellation, refunds or recovery.
The repository does not itself establish this external maintenance mechanism.
Do not use an ad hoc catalog state change as a substitute for an approved plan.

If uninterrupted NEW booking intake is a requirement, or this pause cannot be
reliably enforced, this cutover is not sufficient. A separately designed and
reviewed backward-compatible transition is then required before deployment. It
must retain authoritative occasion approval, publication and payment protections;
an inactive-occasion exception, environment bypass or inferred provider grant is
not an acceptable transition. Do not deploy the unconditional booking gate into
an all-inactive live catalog outside the controlled window.

## Already implemented

- `submit-booking-request.ts` shares its handler with
  `getBookingPaymentAgreementDisclosures`. New requests transactionally require
  a stable positive catalog generation and an approved, active occasion with
  valid category mappings. All nine inactive legacy event types fail with
  `OCCASION_UNAVAILABLE`, including custom-menu submissions. Missing/transitioning
  catalog fails closed. This is intentional authority enforcement.
- Existing booking replay returns before mutable catalog/occasion/package
  validation, with ownership and stored fingerprint checks retained. Pre-existing
  authentication, input/date and rate-limit requirements still apply; this is
  not a promise that every arbitrarily old replay input is accepted.
- Legacy publication and booking reject V2/unknown offer envelopes and incompatible
  pricing. Publication also reads catalog and active/applicable occasion authority
  in its write transaction. Existing provider/public-profile validation remains.
- Lifecycle execution revalidates ten mandatory release checks inside its final
  transaction. Atomic package/gallery withdrawal, occasion revision, catalog
  revision, operation ledger and immutable audit commit together. It refuses more
  than 40 TOTAL packages or 40 catalog collection-group documents (not merely
  40 affected records), corrupt inventory, stale revisions and inactive admins.
  Do not switch to an offline planner or chunk helper to evade these bounds.
- Lifecycle/withdrawal code does not rewrite bookings, historical package snapshots,
  financial agreements, payment sessions or provider grants. Customer history uses
  stored booking snapshots. Existing payment/recovery paths were not modified.

## Two published legacy Birthday packages

After authorized inventory confirms their IDs, owners, schema and current flags,
preview Birthday activation. Both matching public legacy records are withdrawal
candidates even for ACTIVATION. The atomic operation sets `status=draft`,
`isActive=false`, `isPublished=false`, `providerPubliclyVisible=false`,
`publishedAt=null`; it retains the document ID and package content. Matching public
gallery setups are withdrawn too. The operation records withdrawal IDs/projections.
No manual deletion, conversion to V2, event-type relabeling or grant creation is
needed to preserve existing bookings.

After activation, inspect the resulting drafts and use the normal authorized
legacy publication workflow if each package still passes current provider,
category, content and pricing requirements. Verify the public projection and old
client discovery before reopening intake. If either fails validation, leave it
private and resolve that actual blocker; do not restore flags from a backup.
The V2 revalidation planner is advisory and cannot authorize republication.

## Remaining release blockers and production prerequisites

1. Approved maintenance scope, enforcement/drain procedure and occasion-by-occasion
   authorization are absent from this local evidence. Activating only Birthday
   leaves the other eight event types unavailable for new bookings. Every occasion
   intended to remain bookable needs independent approval and activation before
   intake is reopened; inactivity must never be treated as permission.
2. Real inventory must confirm counts/bounds, the two Birthday IDs, all other
   affected/opaque offers, gallery contracts, category mappings, provider authority,
   and every writer including Admin SDK restore/import scripts. Confirm existing
   payment/recovery operations are independent of the new-intake pause.
3. The frozen manifest has `releaseAuthorized=false`, no approved release commit,
   no deployed artifact digest and historical deployment observations. It is not
   current release evidence. Preserve it; collect separate approved release
   evidence for the actual release source, artifact, rules and checks.
4. Readiness requires `FEASTA_LIFECYCLE_RELEASE_COMMIT_SHA` in the deployed Functions
   environment to match the actual approved source SHA. Privileged operators must
   supply genuine `occasionLifecycleReleaseEvidence/{occasionId}_{action}` documents
   using the strict schema in `occasion-lifecycle-release-evidence.ts`: matching
   project/action/current revisions/source, artifact SHA-256, deployed ruleset,
   two distinct verifier UIDs, all ten verified artifact-backed checks and a TTL
   of at most six hours. Format validation does not independently inspect IAM or
   deployed binaries; operators must verify those claims. Missing evidence blocks
   both activation and deactivation. Do not fabricate or pre-fill proof digests.
5. Secret versions and runtime IAM access must exist before deploying affected
   catalog/suggestion callables: `FEASTA_OCCASION_CATALOG_CURSOR_HMAC_KEY` and
   `FEASTA_OCCASION_SUGGESTION_CURSOR_HMAC_KEY`. Catalog expects canonical base64url
   decoding to at least 32 bytes. Verify the suggestion key's own validator too.
   Keep existing media/payment secrets and rollout policies intact. The release
   SHA marker is environment configuration, not either HMAC secret.
6. For the integrated catalog reader, separately authorize/validate
   `contractPolicies/providerPackageV2`: environment matches the Firebase project,
   positive revision, bounded limits and `featureGates.occasionCatalogReads=true`.
   This read gate grants no V2 publication or booking authority.
7. Deployed indexes must be READY and rules/query compatibility must be verified
   for supported old clients. Current public package rules are not a V2 schema
   boundary; rules do not filter query results. Keep V2 offers withdrawn and V2
   publication/booking gates closed. If the intended release includes public V2
   offers, a verified server-enforced discovery/reader strategy is an additional
   implementation blocker; lifecycle activation alone does not solve it.
8. Live App Check, admin IAM/account authorization, deployed writer coverage,
   old-device behavior, generation races and end-to-end new-booking/disclosure,
   existing-agreement payment and recovery checks remain unverified locally.
   Local unit/source tests cannot satisfy those production attestations alone.

## Recommended production sequence (operator actions; not executed)

1. Approve the final reviewed source/artifact and maintenance/recovery plan. Take
   protected inventories and recoverable backups of affected configuration/public
   records without rewriting financial history. Preserve the frozen manifest.
2. Provision required secret versions/IAM and release environment configuration.
   Stage required indexes early and wait for READY. Verify rules changes against
   legacy query shapes; never add schema predicates that break old queries.
3. Enter and verify the scoped maintenance pause; drain old callable revisions
   and publication writers. Existing bookings/payment/recovery remain operational.
   If this isolation is not possible, STOP and implement the reviewed transition.
4. Deploy the reviewed compatible rules before enabling their protected paths,
   and the complete coordinated Functions artifact: booking/disclosure handlers,
   all package/gallery/eligibility public writers and restoration paths, lifecycle
   readiness/inspect/activate/deactivate, and integrated catalog/suggestion endpoints.
   No activation during partial deployment or mixed unfenced writer generations.
   Confirm actual ruleset, function revisions/artifact identity, environment,
   secrets, App Check, indexes and client compatibility. Rules/indexes need not
   deploy atomically with Functions; all required protections must be live before
   any lifecycle mutation. Do not deploy new restrictive booking checks ahead of
   maintenance while occasions remain inactive.
5. Validate production policy/catalog/category configuration under its separate
   authorization. Verify each of the ten release conditions. Only then have two
   authorized verifiers create genuine short-lived action/revision-scoped evidence.
   Run basic and atomic readiness; both must have no blockers. Advisory readiness
   never substitutes for final transaction checks.
6. An authorized administrator activates each approved target through the callable,
   using current expected revisions, a unique idempotency key and recorded reason.
   Re-read catalog and occasion revisions after EVERY operation: activation bumps
   the global catalog revision, invalidating evidence for later targets. Refresh
   their evidence/readiness rather than reusing a batch of stale attestations.
   Record immutable results and withdrawn package/setup IDs. Never bulk-set active.
7. Validate and republish the two Birthday drafts through the normal workflow if
   authorized and eligible; handle gallery republication similarly. Keep unsupported
   V2 records private. Verify supported-client discovery, disclosure/new submission,
   owned retry, existing agreement payment and recovery without altering historical
   agreements. Reopen intake only for the approved, available occasion scope when
   acceptance checks pass; retain monitoring and an on-call recovery owner.

## Rollback and abort

Before any lifecycle transaction commits: keep intake paused, abort activation and
roll back compatible code/config only if verified safe. An atomic transaction
failure commits neither catalog nor withdrawals. For a timeout/unknown outcome,
inspect the operation/audit and retry the SAME request/key; do not assume failure
or generate another operation. Completed retry returns the immutable result.

After activation commits: reverting code does NOT revert catalog/occasion revisions,
package withdrawal flags, gallery publication, operation ledgers or audits. Keep
new intake/publication paused; retain the safe writer fences and immutable history.
Prefer forward repair under the current contract. If deactivation is authorized,
collect fresh evidence for action=deactivate at CURRENT revisions, run readiness
and use the normal callable with a new operation key. It can withdraw newly
republished content again. Do not decrement revisions, erase audits, restore a
whole Firestore backup, or edit activation flags directly.

Package/gallery recovery is a separate current-validation and authorization step.
Neither code rollback nor reactivation republishes withdrawn content. While the
occasion is inactive, the current publisher must reject republication. Leave
packages private until active authority and normal publication checks succeed.
If returning to an older runtime is necessary, independently review its writer,
booking, payment and reader behavior against the post-cutover data first; an old
unfenced runtime plus changed live catalog is not an automatic safe rollback.
Never revert financial snapshots or disable payment/reconciliation to roll back
occasion discovery. Missing/expired rollback evidence is an operational blocker,
not grounds to bypass the deactivation gate.

## Focused local validation

- Functions TypeScript compilation passed using the installed compiler
  (`node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json`).
  This was compilation, not a fresh dependency install/deployment packaging check.
- 31 tests passed across atomic lifecycle (including the new two-package activation
  regression), booking generation fence, release evidence and publication generation.
- 28 tests passed across actual compiled legacy callable rejection/replay, release
  gates, attested readiness, legacy publication guard and withdrawal planning.
- No emulator, production deployment, real old device or live financial E2E was
  run in this task. Earlier frozen reports are historical evidence only.
