# Production maintenance enforcement â€” NO-GO pending baseline and operational proof

Reviewed 2026-10-28 (Asia/Manila), starting clean on integration/pia-package-occasion-20261028
at f7163351108241fcaab5547f6ad23e26108eeaa7. Local uncommitted implementation only.
No deployment, production data write, occasion activation, push, merge or commit.
The frozen release manifest and Pia's UI/package integration behavior are unchanged;
publication adapters receive only the required server fence.

## Existing mechanism search and production parity

Tracked-source searches covered functions, Web server actions/services, mobile,
Firebase rules/config, scripts/tools, shared packages and operational docs. There
are no local AGENTS.md instructions in the target tree. appSettings/public's
maintenanceMode exists only in emulator seed data: no reader enforces it.
File Maintenance settings control legal/catalog authoring. occasionCatalog/current
generation protects transitions, not a global administrator-controlled pause.
Neither is reused as a maintenance switch. No suitable repository mechanism found.

Read-only Firebase Functions inventory on 2026-10-28 found 124 active deployments.
See maintenance-production-observation.json for exact source generations, Firebase
hashes, downloaded archive SHA-256 values and normalized primary-source comparisons.
Eight relevant source archives were read; seven primary writer files differ from
the expected integration HEAD, while onUserSecurityStateChanged matches. Production
submitBookingRequest has neither this integration's OCCASION_UNAVAILABLE check nor
the new maintenance import. Production writers have mixed deployment hashes.
Firebase hashes are not Git SHAs or complete source-provenance attestations.

This establishes a real mismatch, NOT full production parity. Dependency closure,
compiled-source correspondence, deployed rules and Web/Vercel release provenance
have not been established. The current integration branch MUST NOT be deployed as
a maintenance-only update. No deployable Stage A artifact is approved or claimed.
The archives can contain deployment configuration; they are local evidence only,
not committed source or redistribution artifacts. The JSON contains no credentials.

## Writer inventory and local enforcement

| Writer / path | Coverage and behavior during pause |
| --- | --- |
| submitBookingRequest (Web and current/old mobile callable) | NEW booking/financial-agreement construction gated in existing transaction, after owned fingerprint-checked replay. Commits admission and booking together. |
| getBookingPaymentAgreementDisclosures | Same shared handler; new preparation gated. A successful preparation writes only an admission timestamp, no booking/agreement. |
| Legacy mobile _createBookingRequestLegacy / direct SDK | mainEvents, providerRequests, bookings writes are denied by rules; no UI cooperation assumed. Production rules parity still required. |
| publishProviderPackage | Transactionally gates new public package flags and any republish. |
| publishProviderService | Transactionally gates addons publication. |
| Web saveProviderSetupGallery / saveProviderSetupGalleryAction | Any replacement retaining a published setup gates and fences in the same transaction; all-private saves/withdrawals remain possible. |
| Private Web Setup Gallery V2 writer | Future public replacement also fenced; existing release constants remain false. No V2 enablement. |
| reviewProviderVerification (approve/restore) | Gates when provider/public package projection would become public. Suspension/rejection are not gated. |
| onUserSecurityStateChanged | Gates transactions projecting public visibility; hiding/withdrawal remains possible. Pending publication retries may resume only after reopening. |
| updateProviderBusinessProfile / provider branch of updateRoleAccountProfile | Public profile/projection updates fenced. Customer/admin profile updates remain separate. |
| Web approveProviderVerification / provider account restore | Gates implicit reappearance through active/approved owner/provider state; customer restores and account blocking are unaffected. |
| createServiceCategory / reactivateServiceCategory | Gates creation/restoration of active category authority that can make existing public offers eligible again. Discontinuation/deletion and metadata authoring remain available. |
| seed-service-categories --apply | Gate and creates in one Firestore transaction; cannot seed active authority while closed or unconfigured. |
| create/updateProviderPackage and create/updateProviderService | Draft-only or require draft; no public creation. Archive and lifecycle withdrawal only remove visibility. |
| Admin occasion lifecycle and withdrawal/coordinator paths | Withdraw public projections only; do not republish, create bookings or create agreements. Existing release authorization unchanged. |
| Scheduled booking/initial-expiration/balance/refund/disbursement/historical reconciliation | Existing operations only; no new booking/package/service/gallery publisher found. Unfenced intentionally. |
| backfill-query-policy --apply | Adds missing deletion metadata/search tokens, never flips existing deletion/publication flags. Not an intake publisher; privileged execution still under operational change control. |
| full-payment-migration-dry-run / preview-occasion-migration | Read-only reports. No production publication capability. |
| Emulator seed/reset/import/export and acceptance fixtures | Loopback-emulator-bound; fixture public records do not form a production writer. |
| Provision-admin / Web reset-admin-password | Identity administration only; do not create bookings/offers. Existing authorizations unchanged. |

Existing financial operations deliberately do not import the maintenance module:
existing agreement checkout/replay, payment webhook settlement, cancellations,
refunds, refund reconciliation, payment expiration, remaining balance, disbursement
and historical booking recovery. Booking history/readers are unchanged. A pause
does not extend financial deadlines or alter frozen agreements or reservations.
Account restoration which implicitly republishes offers waits for publication to
reopen; this does not suspend refund/reconciliation/recovery services.

Outside code control: deployed old Functions/Next revisions, unknown deployed
aliases, external jobs, Firestore Console, Admin SDK/service-account scripts,
managed restore/import, privileged direct writes and backups. Rules do not constrain
Admin SDK principals. The checked-in gate cannot prove absence of those writers.
Inventory/disable their prohibited write capability via reviewed IAM/run controls
while preserving payment service principals. No blanket project/service shutdown.
An unknown or uncontrolled writer is a NO-GO, not a deferred acceptance item.

## Control protocol and race boundary

Dedicated private maintenanceControls/intake document:
schemaVersion=1, positive safe integer revision, intake/publication booleans.
TRUE means paused. There is no expiry, cache, environment bypass or automatic open.
Missing/malformed/inaccessible configuration rejects prohibited work; a read error
aborts rather than falling back to open. An impossible open-intake/closed-publication
combination is rejected. This document is independent of occasion/catalog data.

Every prohibited commit reads this document and, AFTER all reads, updates its
lastAdmissionAt in the SAME transaction. Activation/reopening transactionally
replaces this document. The shared write gives an explicit serialization point:
a concurrent admission either commits before activation, or retries and rejects.
Agreement preparation has this write too, even though it creates no booking.
Already completed disclosures are not revoked; subsequent new submission rechecks.
Transport responses can arrive after activation for earlier committed operations;
activation is a commit boundary, not a promise about network response order.

This central fence deliberately trades throughput for a simple safety boundary.
Hot-document contention can abort/retry admissions safely. Production capacity and
latency acceptance at expected peak load is REQUIRED before approving Stage A.

setIntakeMaintenance requires existing App Check configuration, authenticated active
admin (Auth/user check plus transactional user recheck), recent auth within five
minutes, rate limit, reason 10â€“500 chars, operationKey 16â€“128 safe identifier chars,
and expectedRevision. Config and immutable maintenanceAudits/{sha256(uid:key)} commit
together. Replays return historical receipts without repeating the state change;
a reused key with different input fails. Stale revisions abort. Client writes to
both new collections explicitly denied, including client admins. Cloud IAM remains
an external trust boundary; audit storage needs the same production IAM review.

inspectIntakeMaintenance is active-admin read-only, App Check/rate protected.
Use it for current state; a mutation replay receipt is NOT a current-state read.
If unavailable/malformed, remain paused and investigate. Missing control bootstrap
requires expectedRevision=0 AND both scopes paused. A malformed existing control
cannot be silently repaired or opened by bootstrap. No automatic initialization.

Example authorized callable payloads (instructions only; none executed):

    {expectedRevision: 0, intake: true, publication: true,
     reason: "Approved maintenance bootstrap", operationKey: "unique_bootstrap_key_001"}
    {expectedRevision: N, intake: true, publication: true,
     reason: "Approved cutover maintenance", operationKey: "unique_cutover_key_0001"}
    {expectedRevision: N, intake: true, publication: false,
     reason: "Approved publication acceptance", operationKey: "unique_publish_key_0001"}
    {expectedRevision: N, intake: false, publication: false,
     reason: "Approved intake reopening", operationKey: "unique_reopening_key_01"}

N is the CURRENT revision, not a reusable constant. Operators must authenticate
through a supported admin Firebase/App Check client; do not introduce an Admin SDK
direct-config-write utility. Record receipt, current-state inspection and audit ID.
Publication reopening is global and authorizes all otherwise-valid publishers;
control provider/admin access during acceptance or approve that broader reopening.
Reopening both scopes together is permitted only by an explicit admin operation;
the cutover procedure requires publication acceptance first, intake last.

## Independent deployment stages â€” preparation is blocked on parity

Stage A is a separate baseline-derived maintenance release; Stage B is the lifecycle
release. This is a design, not authorization to deploy either artifact.

1. Establish production source closure for EVERY affected Function and Web action,
   including compiled modules, shared runtime/vendor/package lock and current rules.
   Reconstruct/identify reviewed per-writer baseline commits; retain unrelated live
   financial fixes and mixed revisions. Verify digests against source generations
   and build artifacts, plus Web/Vercel immutable release ID. Review unknown aliases,
   jobs/importers/service-account IAM. Seven primary-source mismatches already block
   treating integration HEAD as that baseline. No arbitrary old branch substitution.
2. On isolated baseline source, port ONLY maintenance.ts, the admin control/inspection
   exports, new private rules, the gate/read+admission calls enumerated above and
   seed-category script fence. Keep baseline booking/publication contracts and
   dependencies; do NOT bring occasion-generation/active-occasion booking behavior,
   lifecycle endpoints, V2 enablement or Pia UI into Stage A. Build a separate reviewed
   Functions artifact and Web artifact. Compare baseline-to-Stage-A diffs and test
   baseline-compatible legacy intake while OPEN, plus financial operations CLOSED.
   Do not transplant current full writer files or deploy this branch wholesale.
3. Review compatible rules on the verified rules baseline. Deploy control/inspection
   callables first, bootstrap both scopes PAUSED, verify audit, then explicitly OPEN
   if maintaining baseline intake during rollout is approved. This affects no old
   unfenced writer and is NOT yet a maintenance window. Deploy baseline-compatible
   fenced writers and Web actions while control is OPEN. Missing config instead
   fails closed for upgraded paths; mixed generations must never be called a pause.
4. Stage A coordinated Function target inventory: submitBookingRequest,
   getBookingPaymentAgreementDisclosures, publishProviderPackage,
   publishProviderService, reviewProviderVerification, onUserSecurityStateChanged,
   updateProviderBusinessProfile, updateRoleAccountProfile, createServiceCategory,
   reactivateServiceCategory, plus setIntakeMaintenance/inspectIntakeMaintenance.
   Web targets: both gallery writers/actions, verification approval, provider account
   restore and their maintenance helper. Script target: seed-service-categories.
   Verify current deployed export names against inventory, not this list alone.
5. Verify all Stage A artifact/revision identities, rules, App Check and capacity;
   remove traffic from old revisions, expire old Web/server actions and drain all
   in-flight unfenced transactions/background invocations. Disable uncontrolled
   publication/import scripts via reviewed controls. Only THEN close both scopes
   through setIntakeMaintenance, inspect current state/audit, and probe every legacy
   intake/publication path. Demonstrate existing financial/recovery paths remain live.
   No lifecycle mutation before this complete coverage/drain proof.
6. Stage B: keep the Stage A gate/audits CLOSED. Deploy the separately approved
   coordinated Occasion Lifecycle Functions/Web/rules/index release with the same
   maintenance protocol. Provision genuine secrets, exact release marker, inventory,
   current revisions, two-verifier evidence and all other existing runbook conditions.
   No automatic occasion activation. Authorized admins use existing lifecycle APIs
   separately for each approved occasion; verify atomic withdrawal and audit results.
7. Open PUBLICATION only after lifecycle acceptance/authorization. Revalidate and
   republish eligible withdrawn drafts through normal guarded publication; no direct
   flag restoration. Verify supported-client discovery, baseline compatibility,
   agreement/submission and all financial/recovery acceptance. Open INTAKE last,
   with a fresh key/current revision/reason, verify current state and monitor.

Abort: close both scopes with a NEW operation key/current revision; retain the gate,
financial services and audits. Do not roll back to unfenced revisions. Follow the
existing lifecycle runbook for committed occasion/withdrawal forward recovery.
If production baseline/coverage/IAM/drain/load proof is missing, STOP: NO-GO.

## Local verification and limits

Functions compilation and Web TypeScript check passed. New unit tests exercise
closed/missing/corrupt/read-failed config, bootstrap, authorization/recent-auth hooks,
audit/replay/stale CAS, concurrent admin operations, admission conflicts and reopening.
Actual compiled legacy callables reject old payloads/new preparation during pause;
owned fingerprint/ownership replay stays available. Existing financial domain and
lifecycle regressions are included in the final local test run.

The dedicated demo Firestore emulator fixture verifies real transaction activation
races/concurrent rejection, existing-booking checkout and cached replay with both
scopes paused (mock gateway), existing webhook acceptance, refund execution and
reconciliation suites, publication-first reopening, intake reopening and missing
configuration rejection. A first attempt using the historical payment-checkout
fixture failed before gateway invocation because it lacks current reservation/
payout data; no financial guard was relaxed. The dedicated valid-reservation
fixture replaced it for focused maintenance acceptance. An initial emulator
timestamp-order assertion also prompted explicit shared-write fencing before the
successful race run. These runs are local, not real gateway/device/IAM validation.

FEASTA now has a locally tested maintenance implementation candidate. It does NOT
yet have a proven production maintenance cutover capability. Production baseline
parity/release artifact, Web/rules provenance, privileged-writer isolation, revision
drain and load/operational acceptance are external blockers. Decision: NO-GO.

### Final recorded results

- 92 distinct focused unit/regression tests passed (11 new maintenance tests,
  six compiled legacy callable tests, plus selected lifecycle/generation/runtime,
  payment, cancellation and refund regressions). The final focused rerun was 17/17.
- Functions TypeScript compilation and Web TypeScript no-emit check passed.
- Changed Functions ESLint check: zero errors; line-length warnings remain.
- Dedicated Firestore emulator command exited 0. Real activation race/concurrent
  rejection, existing checkout/cached replay, webhook suite, refund B6 execution
  and reconciliation, reopening/missing config, and 16 legacy/client-admin denied
  writes passed. Gateway HTTP was mocked; all data writes used a demo project and
  loopback Firestore emulator.
- Frozen release manifest diff is empty. Work remains uncommitted.

Reproduce focused checks from repository root:

    node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json
    node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json
    node --test functions/test/intake-maintenance.test.cjs functions/test/occasion-legacy-client-booking.test.cjs
    node functions/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.maintenance.test.json --project demo-feasta-maintenance --only firestore "node functions/test/emulator/intake-maintenance.integration.cjs"

The emulator fixture refuses a non-demo project or a non-loopback Firestore host.
Do not use production credentials or a real gateway to run acceptance fixtures.