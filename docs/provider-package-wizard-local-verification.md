# Provider package wizard local verification — 2026-11-04

This is a partial implementation, not a production readiness sign-off.

## Findings and root causes

- Serving sizes used direct inline edits to parent state. Add created an empty row immediately; edit and removal had no isolated save boundary. Replaced with compact rows and a Radix/shadcn dialog.
- Customizable food selections already have a V2 serializer and restore path. The frontend V2 gate requires an explicitly enabled demo emulator, a demo project, and nonproduction mode. The backend independently requires an isolated demo environment. The local web environment disables emulators. Consequently the connected environment selects the legacy writer, which cannot accept customizable choices. These restrictions were preserved. No feature activation or deployment was performed.
- Draft media recovery is unfinished by design. The registration service is internal-only and explicitly requires discard, completion and cleanup integration before provider enablement. Existing ownership/proof/registry checks and assertNoUnverifiedEditorAssets were preserved. Save Progress & Exit still rejects selected images; it does NOT preserve them. No draft upload signing or publication promotion was enabled.
- The generic Review & Save rejection hides the underlying callable validation details. Local legacy routes already accept pricingModel, offerStructure and packageStyle through pre-existing edits. No live callable response or deployed source evidence establishes which field caused the reported rejection. A stale deployed schema is possible, not established. Known classification/version/menu/media reasons now receive specific messages; known step errors offer direct return navigation. Unknown diagnostics remain private.

## Implemented behavior

- Serving modal: six inputs; isolated Add/Edit state; explicit Save/Cancel; dirty-discard and removal confirmation; existing Radix focus trapping, Escape, scrolling and return focus. Validates duplicate normalized names, whole counts, minimum/maximum order, serving limit 10,000, quantity limit 100, positive centavos and PHP 10 million maximum line total. Eight-option limit retained. Parent state updates only after valid modal save; older incomplete options can still be restored and edited.
- Images: drag-and-drop uses the same file validator as Choose Images. Existing JPEG/PNG/WebP, 5 MB, eight-image, preview, cover, reorder and removal behavior retained. Local selection and uploaded states are distinguished. Byte-level upload progress, draft recovery, promotion and eventual cleanup remain unfinished.
- Themes: optional setup-tier restriction retained; Drop-Off explanation improved; cards show their first image. Existing edit/remove dialog retained.
- Submission: synchronous ref guards duplicate final submissions before React rerenders. V2 immutable pending request, idempotency key, revision safeguards and response validation remain intact.
- Regression covers customizable groups and included dishes separately, Back/Next navigation and exact V2 update payload. Simulated backend V2 read and lifecycle suites pass. This does not prove connected production persistence.
- The broader Review layout was already sectioned; a complete review redesign and individual-serving summary were not implemented.

## Exact source/test files changed in this session

1. apps/web/src/app/provider/packages/provider-package-individual-food.tsx (pre-existing untracked file)
2. apps/web/src/app/provider/packages/provider-package-form.tsx (pre-existing modified file)
3. apps/web/src/app/provider/packages/provider-package-offer-builder.tsx
4. apps/web/src/components/provider/catalog-image-uploader.tsx
5. apps/web/src/lib/provider/provider-package-save-error.ts
6. apps/web/test/components/provider-package-individual-food.test.tsx (pre-existing untracked file)
7. apps/web/test/components/provider-package-v2-wizard.test.tsx (pre-existing modified file)
8. apps/web/test/components/provider-package-serving-modal.test.tsx (new)
9. apps/web/test/components/provider-package-save-diagnostics.test.ts (new)

This report is docs/provider-package-wizard-local-verification.md. Logs are under .tmp/wizard-*.log. Backend generated JavaScript was rebuilt with tsc; no backend source was edited in this session. All unrelated local changes were retained.

## Verification

- Web tsc --noEmit: pass.
- Functions tsc --noEmit and local tsc build: pass.
- Targeted ESLint: pass (nine files).
- Wizard Vitest: 6 files, 72 passed, 0 failed (.tmp/wizard-web-tests-final.log).
- Diagnostic Vitest: 1 file, 5 passed, 0 failed.
- Targeted Functions media/draft/V2 read/pricing tests: 129 passed, 0 failed (.tmp/wizard-targeted-functions.log).
- Full Functions regression: 2,575 tests, 2,567 passed, 8 failed, 0 skipped (.tmp/wizard-functions-tests-final.log). All eight failures are in occasion-lifecycle-release-gate.test.cjs, whose VM mock rejects ./occasion-routine-deactivation.js. This is outside the edited wizard files and was left unchanged. Three initially failing media files pass when their required FEASTA_CLOUDINARY_PROOF_MODULE, FEASTA_MEDIA_REGISTRY_MODULE and FEASTA_MEDIA_LOOKUP_MODULE variables point at the compiled local modules.
- Earlier runs caught obsolete inline-edit test assumptions and a transient JSX/test typing issue; these were corrected and the final checks above supersede them.
- git diff --check: pass; Git emits existing LF/CRLF conversion warnings.

## Remaining blockers and safeguards

V2 is hard-disabled outside demo emulators in local source; deployment alone will not enable it. A separately reviewed production authorization/readiness change is required. Individual-food canonical writes and customer booking remain unsupported. Full media signing/registration/restoration/promotion/cleanup must be integrated before image-preserving progress can be enabled. The exact connected backend rejection requires its sanitized callable error details or authorized read-only diagnostics; no production mutation was attempted. No live successful package save is claimed.

Branch: chore/monorepo-setup. Worktree remains dirty with pre-existing modified and untracked files, plus this session's changes. Nothing was committed, pushed or deployed. No Firebase emulator, production Firestore write or Cloudinary write was used.

## Continuation — backend failures and persistence contracts (2026-11-04)

This section supersedes the earlier test totals. The wizard is still **not production-complete**. No release gate was enabled.

### Priority 1: all eight original failures investigated

Git history establishes that the stale tests and routine deactivation routing predate the wizard work: both are in committed `1e17f9c7` (November 3). Neither the route source nor the test file had local modifications at the start of this continuation. All eight failed at fixture construction because the mock omitted `./occasion-routine-deactivation.js`. Merely adding that import mock would conceal a deeper mismatch: execute and preview now delegate to routine deactivation, while the old tests asserted the legacy atomic-withdrawal branch. The production transaction contract, authorization and lifecycle validation were not relaxed.

| Original failing test | Individual finding and replacement evidence |
| --- | --- |
| Deactivate refuses missing release evidence before atomic writes | Obsolete route expectation. Callable delegates authenticated actor and parsed input to the routine transaction. Routing tests require that delegation and reject entry to legacy helpers. Real routine tests verify admin access, active category, state and revision checks. |
| Preview includes ten unresolved release safeguards with zero inventory | Obsolete preview contract. Callable returns routine readiness evidence unchanged; it cannot fabricate legacy readiness. |
| Preview reports live private package dependency | Obsolete semantics for logical deactivation. Existing routine tests explicitly preserve private drafts and package records rather than withdrawing provider content. |
| Preview reports live booking dependency | Booking protection remains required. Real routine tests reject live bookings with zero writes, including a late-page live booking. Callable tests preserve the booking denial as a structured failed-precondition. |
| Terminal booking history creates no live dependency blocker | Real routine tests preserve terminal booking and payment records and allow complete historical inventory; old permanently-unverified legacy preview expectation was stale. |
| Missing booking relationship fails closed in preview | Real routine tests still fail closed on orphan requests and missing occasion evidence, including late pages. |
| Oversized booking inventory blocks preview | Old 41-record cap is obsolete. Real routine tests require complete pagination, handle more than 40 completed/unrelated bookings and exact page boundaries, and reject late unsafe records. |
| Completed retries reach atomic validation without stale readiness | Retry ownership, fingerprint and audit safeguards now belong to the routine transaction. Existing routine tests cover idempotent retries and changed-payload conflicts. Callable tests verify identity and payload delegation. |

The stale suite was rewritten as honest callable routing/error-translation tests, and the existing 23-test routine transaction suite was explicitly included in validation. Unknown transaction faults continue to propagate. Two existing booking refusal reasons were added to the callable's known error translation list; their security decisions are unchanged.

### Priority 2 and Step 5: exact contracts and actual fixes

- `createProviderPackageV2` accepts an exact V2 canonical envelope: version, idempotency key, approved occasion selection, complete pricing/capacity, tier extras, included dishes and optional choice groups, themes, payment terms and media URLs. `updateProviderPackageV2` additionally requires package identity and expected revision.
- `completeProviderPackageEditorDraft` accepts ONLY editorDraftId, expectedRevision, expectedPackageRevision:null and idempotencyKey. It rereads saved private progress under ownership/revision checks, converts it on the server, and atomically writes the canonical package, completed editor state, quota and operation result. It does not accept a replacement client package payload.
- Demo isolation remains mandatory: frontend requires NEXT_PUBLIC_PROVIDER_PACKAGE_V2_DRAFTS_ENABLED=true, demo project, emulator mode and nonproduction build; backend requires FEASTA_V2_DRAFT_DEMO_ENABLED=true, demo project and loopback emulator configuration. Inside the transaction, project-bound policy revision/limits and packageDraftWrites must also pass. Progress has its separate packageEditorProgressWrites gate. Publication additionally requires its own demo opt-in and publication/discovery/booking policy gates. V3 has a separate opt-in. None was enabled or bypassed.
- Existing readiness documentation (`catering-package-stage-d-security-remediation.md` and `catering-package-v2-integration-readiness.md`) identifies these as gated integration contracts; deployed indexes, old-client/customer discovery and booking compatibility, App Check/origin/security acceptance and production activation remain separate readiness milestones. A deployment alone would not enable the V2 writers.
- Newly fixed backend data-loss risk: individual-food serving contracts are editor-only, but direct canonical/completion calls could previously omit that data during conversion. Canonical V2 individual writes and progress carrying individualFoodDraft now explicitly refuse with INDIVIDUAL_FOOD_PACKAGE_UNSUPPORTED. Private progress remains supported. No serving data is flattened or discarded to obtain success.
- Newly fixed diagnostic issue: completion could throw an internal EditorProgressError that Firebase would obscure. It now returns the known public error reason with a structured media field/Step 4 marker when the existing guard refuses image references. The guard itself remains intact.
- Newly fixed acknowledgement issue: legacy mutation clients now require success:true, the expected status and valid/matching package identity. V2 additionally requires the exact package revision; completion must match the editor identity and next editor revision. A malformed/unmatched response cannot count as saved. V2 ambiguous results retain the pending immutable request for retry.

A new no-network in-memory transaction suite executes the **compiled real V2 callable**, real parsers and domain ownership checks, with injected Auth/service/Firestore boundaries. It verifies Per Pax and Fixed Bundle package commits, preserved included dishes and customizable choices, owner-domain reads of the stored result, one-commit idempotent replay, atomic editor completion/quota decrement, non-demo/disabled-policy refusal, stale revisions, wrong ownership, individual-food refusal and unverified package/theme asset refusal. It is not a Firebase emulator: no process/service/listener is started, and simulated environment values exist only in the injected module context. No live Firestore, Cloudinary or Auth operation is performed.

**Persistence claim:** in-memory transactional persistence is verified; deployed Firestore persistence and the production owner-read path are not. Owner-domain authorization in the simulation is not a Firestore Rules acceptance test. The exact original connected-backend field rejection remains unproven without its sanitized callable response. Component and backend simulations are separate tests, not a deployed end-to-end journey.

### Priority 3: Step 4 status and security work

The existing media manifest, exact owner/draft/kind/theme paths, trusted Cloudinary proof lookup, immutable registry admission and draft-discard protection were preserved. Registration now rechecks active account state before Cloudinary lookup and again before registry creation. Tests prove blocked actors cause no lookup, and account blocking after proof prevents registration.

**Step 4 is NOT complete.** Registration is still internal-only. There is no connected authenticated draft-scoped upload-signing/browser registration route, verified reference save-and-restore response contract, canonical promotion/reference tracking, or secure cleanup worker. The browser still uses the separate service-image upload flow. A registry proof by itself cannot authorize promotion or deletion. A safe replacement for assertNoUnverifiedEditorAssets would need all those boundaries, including race-safe protection of canonical references. They were not invented or enabled under the existing contracts. Selected images still cannot be preserved by Save Progress & Exit; registered-media discard remains blocked rather than leaking subcollections or deleting potentially referenced assets.

**Step 5 is NOT genuinely complete for the connected environment.** The supported draft-save code paths and all-five-step UI navigation are locally tested, but V2 is intentionally disabled there, image-bearing progress cannot complete, individual-food canonical packages remain unsupported, and there is no deployed persistence confirmation. No publish action or production capability was enabled to conceal these limits.

### Exact files changed by this continuation

- apps/web/src/lib/provider/provider-package-client.ts — validate legacy mutation acknowledgement; preserve prior edits.
- apps/web/src/lib/provider/provider-package-v2-client.ts — match V2 acknowledgement identity/revisions.
- apps/web/src/lib/provider/provider-package-mutation-response.ts — new pure acknowledgement validators.
- apps/web/src/lib/provider/provider-package-save-error.ts — individual-food, media-completion and unconfirmed-response explanations.
- apps/web/test/components/provider-package-save-diagnostics.test.ts — two added diagnostic regressions.
- apps/web/test/components/provider-package-mutation-response.test.ts — new response validation regressions.
- functions/src/admin/occasion-lifecycle-actions.ts — structured translation of two existing booking refusal reasons.
- functions/src/packages/provider-package-drafts-v2.ts — reject lossy individual-food canonical conversion; map completion validation errors safely; preserve prior edits.
- functions/src/packages/provider-editor-draft-media-registration-v1.ts — active account revalidation at both phases; preserve pre-existing untracked work.
- functions/test/occasion-lifecycle-release-gate.test.cjs — replace obsolete legacy-path assumptions with routine callable routing tests.
- functions/test/editor-draft-cloudinary-lookup-v1.test.cjs — default to local compiled module when override is absent.
- functions/test/editor-draft-cloudinary-proof-v1.test.cjs — same default, preserving explicit override support.
- functions/test/editor-draft-media-registry-v1.test.cjs — same default, so ordinary full-suite invocation works.
- functions/test/provider-editor-draft-media-registration-v1.test.cjs — realistic profile state and before/after-proof blocking regressions.
- functions/test/provider-package-v2-persistence-simulated.test.cjs — new compiled-callable in-memory persistence coverage.
- docs/provider-package-wizard-local-verification.md — this appended audit; earlier report retained.

### Final validation

| Check | Result |
| --- | --- |
| Web TypeScript | Pass |
| Functions TypeScript and local compilation | Pass |
| Targeted Web ESLint, 6 files | 0 errors, 0 warnings |
| Targeted Functions ESLint, 3 files | 0 errors; 7 pre-existing max-len warnings in touched files |
| Wizard/diagnostic/acknowledgement Vitest, 8 files | 82 passed, 0 failed |
| Targeted contract/media/draft/lifecycle tests | 173 passed, 0 failed |
| Full backend CJS suite plus real routine-deactivation MJS suite | 2,610 passed, 0 failed, 0 skipped |
| git diff --check | Pass, exit 0 |

Logs: `.tmp/continued-web-tests-final.log`, `.tmp/continued-contract-tests-final.log`, `.tmp/continued-full-backend-final.log`.

An unrestricted-concurrency rerun had one worker-level failure in the unrelated occasion-historical-operator-runner suite without individual test output; its isolated 10 tests passed immediately. The complete suite then passed with --test-concurrency=4. No assertions or production behavior were changed for that transient failure. PowerShell also treated Git CRLF warnings redirected to stderr as an error record; explicit git diff --check with command-local core.safecrlf=false returned 0. Repository Git settings were not changed.

Final branch: chore/monorepo-setup. Worktree remains dirty with all pre-existing modifications retained; 59 modified/untracked paths at verification. Nothing was staged, committed, pushed or deployed. No emulator was run. No production write or live Cloudinary write was made.

## Media recovery continuation — 2026-11-04 (partial; not release-ready)

**Step 4 still cannot save and restore verified images. Step 5 is not ready for
connected-environment verification.** This continuation implements a candidate
upload boundary and an additional discard safeguard, not the complete requested
media lifecycle. No placeholder preservation success was added. The existing
image-bearing progress/completion refusal remains intact.

### Findings and changes in this continuation

- The existing provider/service signers use overwrite=true and their own public
  ID namespaces. Reusing them for editor recovery would not establish immutable,
  draft-scoped ownership. A separate signing plan now signs overwrite=false,
  allowed JPG/JPEG/PNG/WebP formats and the exact owner/draft/kind/theme/asset path.
- A candidate callable authenticates, requires App Check with no emulator
  exemption, checks provider role and rate limits, and delegates active-account,
  approved-provider, draft ownership, incomplete/unbound state, revision and
  project-bound progress policy checks to the existing registration access check.
  Client owner/provider/asset/public-ID/URL claims are rejected as unknown fields.
  The client selects an existing owned draft and kind; the server validates both,
  verifies a theme belongs to saved progress and allocates the asset ID.
- Before signing, the candidate creates a server-owned upload reservation in a
  Firestore transaction. IDs are allocated outside transaction retries. Outstanding
  reservations are bounded to 56 per draft, including interrupted attempts.
  Signing happens after commit; signing failures do not report upload success.
  This is not yet a request-key-idempotent upload API: separate request retries
  can consume separate reservations. The reservation bound is not a substitute
  for the existing per-package/per-theme image count limits at attachment.
- Discard previously checked only mediaAssets. It now also refuses deletion when
  mediaUploadReservations contains an unresolved upload, protecting the draft and
  quota from being removed while a delayed upload can still arrive. This remains
  a refusal guard, not a cleanup implementation.
- The candidate callable is absent from functions/src/index.ts and also checks
  an independent absent-by-default packageEditorMediaWrites policy flag. That
  flag was not created or enabled. Do not export/deploy/enable the candidate until
  the lifecycle below is implemented. Existing release gates are unchanged.

### Exact files changed by this continuation

1. functions/src/packages/editor-draft-upload-plan-v1.ts — new signing parameter contract.
2. functions/src/packages/provider-editor-draft-upload-v1.ts — new disabled candidate callable/reservation boundary.
3. functions/src/packages/provider-editor-draft-media-registration-v1.ts — export existing authorization helper for the candidate; registration behavior unchanged.
4. functions/src/shared/cloudinary.ts — separate draft signer; preserve existing provider/service signers.
5. functions/src/packages/provider-package-editor-progress.ts — refuse discard with outstanding upload reservations.
6. functions/test/editor-draft-upload-v1.test.cjs — 28 new no-network tests.
7. functions/test/provider-editor-draft-media-discard-v1.test.cjs — reservation fixture and one new refusal regression.
8. docs/provider-package-wizard-local-verification.md — this report.

All other modified/untracked paths predate this continuation and were retained.
Local generated Functions JavaScript was rebuilt, with no deployment.

### Remaining implementation and release prerequisites

These are unfinished engineering work, not claims of externally blocked or
successfully implemented functionality:

1. Bind registration to a persisted reservation and immutable Cloudinary asset
   identity/version; reject replacement, expired/cancelled reservations and
   concurrent deletion. The existing registration service still verifies an
   exact resource path and ownership, but is not integrated with reservations.
2. In the same revision-safe save transaction, validate every manifest ID against
   server-owned verified records, preserve package order/theme membership and
   persist the manifest. Owner recovery reads must revalidate references and
   return authoritative URLs/order/theme associations. Current progress still
   calls assertNoUnverifiedEditorAssets and rejects nonempty image references.
3. Implement a durable cleanup state machine/outbox with leases, retries and
   Cloudinary reconciliation outside Firestore transactions. Cover signing
   failure, upload success with lost registration, delayed signature use, removal
   and discard. Do not remove a reservation before outstanding upload capability
   is reconciled. Do not delete assets based only on a client URL/public ID.
4. Atomically protect canonical references during completion, then copy/promote
   with recoverable operation records where needed. Cleanup must check canonical
   and published package references, including concurrent completion. Current
   media-bearing completion remains refused; no deletion worker was introduced.
5. Connect uploader/save/resume/removal UI only after those backend boundaries.
   Existing thumbnails, cover selection, reorder and theme previews remain local
   behavior and do not prove persisted media recovery.
6. Direct signed browser uploads cannot themselves impose the 5 MiB byte limit.
   Cloudinary documents that presets have no per-preset file-size limit:
   https://cloudinary.com/documentation/upload_presets . Existing backend proof
   validation rejects oversized assets before registration. Strict rejection
   before Cloudinary storage needs a bounded server upload transport or another
   independently verified enforcement mechanism; no unsupported max_file_size
   signing parameter was invented. No Cloudinary write/configuration was made.

Step 5's Per Pax/Fixed Bundle conversion, menu validation, individual-food
refusal, revision acknowledgements, pending request idempotency and duplicate
submit guards were not changed. Its existing frontend and backend hard demo
emulator fences still prohibit connected production V2 writes. Exact release
prerequisites remain: reviewed production authorization/code change rather than
boolean-only activation; compatible backend/readers and old-client/customer
booking acceptance; required additive index deployed and READY in the intended
environment; App Check/origin/security acceptance; completed media lifecycle;
separately authorized nonproduction Cloudinary acceptance; deployed persistence
and owner-read verification. Individual-food canonical writes remain unsupported.

### Verification for this continuation

Results are recorded below after the final bounded runs. Tests use injected
service boundaries/in-memory fixtures only, not emulators or live services.
Upload tests exercise the actual compiled callable with mocked authorization and
Firestore/Cloudinary boundaries; existing registration tests separately exercise
the real ownership/revision access checks. They are not deployed integration or
Cloudinary acceptance tests. Missing-resource/cross-owner tests remain existing
coverage; cleanup/recovery/promotion behavior is unimplemented and unverified.

| Check | Final result |
| --- | --- |
| Web TypeScript, tsc --noEmit | Pass |
| Functions TypeScript, tsc --noEmit, and local compilation | Pass |
| Selected Web ESLint, 6 source files | 0 errors, 0 warnings |
| Selected Functions ESLint, 6 source files | 0 errors, 6 pre-existing max-len warnings (5 in drafts-v2, 1 in shared/cloudinary) |
| New upload-boundary tests | 28 passed, 0 failed |
| Upload, registration and discard focused tests | 50 passed, 0 failed |
| Media/editor/progress/simulated completion tests | 128 passed, 0 failed |
| Full backend CJS suite plus real routine-deactivation MJS suite, concurrency 4 | 2,639 passed, 0 failed, 0 skipped |
| Wizard/diagnostic/acknowledgement/management Web tests, 8 files, maxWorkers=2 | 87 passed, 1 timed out (15-second existing limit) |
| git -c core.safecrlf=false diff --check | Pass |

The timed-out Web test is provider-package-management.test.tsx:
“guides edits through five steps and preserves categorized dishes”. The first
parallel run also timed out in that same test (87 passed, 1 failed). Neither
Web source nor that test was edited in this continuation; the timeout remains
a verification limitation unless the isolated check below succeeds. No test
timeout or assertion was weakened. An initial backend run overlapped the discard
source/fixture edit and failed on the stale single-subcollection mock; the final
full run above includes the updated fixture and passes. Corepack also attempted
to download the pinned pnpm under sandbox DNS restrictions; the web rerun used
the normal escalation mechanism and did not change dependency manifests/locks.

Logs: .tmp/media-recovery-focused.log, .tmp/media-recovery-targeted.log,
.tmp/media-recovery-full-backend-final.log, .tmp/media-recovery-web.log and
.tmp/media-recovery-web-isolated.log.

Isolated timeout follow-up: the same five-step editing test passed unchanged
with maxWorkers=1 (1 passed, 23 excluded by name filter; 13.47 seconds test time).
This supports load sensitivity, but does not turn the failed combined run into
a clean run. A final serial combined run is recorded separately below.

**Final serial combined Web run:** 8 files passed, **88 passed, 0 failed**,
maxWorkers=1, unchanged 15-second test timeout and assertions. Log:
.tmp/media-recovery-web-final.log. This supersedes the earlier combined-run
failure for final test status; the load-sensitive failures are retained above
for transparency. Final backend status remains **2,639 passed, 0 failed**.

No commits, pushes, deployments, feature activation, emulator processes,
production writes or live Cloudinary mutations were performed. Branch remains
chore/monorepo-setup. All pre-existing local work was retained.

## Step 4.1B ? reservation-bound registration (2026-11-04)

Implemented locally; uploader remains disabled and absent from index.ts. No
feature gates, deployment, emulator, live Firestore or Cloudinary writes used.
All prior worktree changes were retained on chore/monorepo-setup.

### Implementation and lifecycle

Signing reservations now persist exact cloudinaryPublicId, issuedAtMs and
expiresAtMs (one hour). The signed timestamp is fixed before transaction retries
and passed to the signer after commit. Existing reservations without this new
contract fail closed; do not backfill ownership/proof from browser claims.

Registration reads the reservation before any lookup, verifies authenticated
owner/provider, draft, asset, kind/theme, exact public ID and issuing revision,
then repeats authorization/reservation reads in the final transaction. Only
reserved and registered states are admissible. Expired reserved, revoked,
cleanup_pending, retired, unknown/malformed and missing records are refused.
Any draft revision change is conservatively incompatible; completed, missing or
reassigned drafts fail authorization. A concurrent discard cannot commit past
the existing reservation/media refusal guard.

Cloudinary lookup/proof remains outside transactions. Trusted proof now requires
Cloudinary asset_id and a positive integer version, and an exact versioned
secure delivery URL. Registry creation and reservation consumption commit in one
transaction. Both records retain immutable Cloudinary identity/version. Consumed
reservations authorize only unchanged registry/proof replay; they never permit
creating a missing registry record or assigning another asset. No overwrite or
asset-ID recycling was introduced.

| Situation | Durable behavior |
| --- | --- |
| Reserved, not uploaded | reserved until deadline; safe to attempt upload/registration within validity |
| Uploaded, not verified, or outcome unknown | still reserved; no untrusted browser uploaded marker; lookup can be retried |
| Verification fails/interrupted | zero registration writes; no in-flight lease to strand the draft |
| Verified and registered | registered atomically with immutable registry create |
| Lost registration response | same revision/scope and identical trusted proof return unchanged, including after reservation expiry |
| Expired or abandoned | registration refused; reservation retained as cleanup evidence |
| Revoked/cleanup_pending/retired | no admission; names reserved for future cleanup coordinator, which is not implemented here |
| Draft changes/discard conflict | final transaction refuses; no partial registry admission |

Expiry is NOT proof of Cloudinary absence or authorization to delete. The
56-reservation bound and discard refusal remain. Repeated abandoned signing or
upload attempts can exhaust that bound until a cleanup/reconciliation coordinator
exists. This is an explicit remaining release blocker; no claim that expiry
alone provides provider-facing cleanup/recovery. A single interrupted lookup
holds no permanent verification lock and may be retried until expiry.

### Integration requirements before enablement

1. Private progress: replace assertNoUnverifiedEditorAssets only after validating
   every manifest reference against this server-owned registry and reservation
   under the same owner/draft/revision save transaction. Preserve the versioned
   authoritative URL/identity. Reject duplicates, wrong kind/theme, removed theme,
   cleanup/revoked assets and count-limit violations. Owner recovery must perform
   equivalent authorization/reference validation rather than trust saved URLs.
2. Ordering: persist packageAssetIds in cover-first display order and each theme's
   ordered assetIds keyed by stable editorThemeId. Resolve registry records by ID
   and reconstruct those arrays in manifest order, never query or upload order.
3. Cleanup: durable outbox/state machine, leases, bounded retries and reconciliation
   outside Firestore transactions. Handle signing failure, delayed uploads,
   missing resources, expired reservations, lost registration responses, removal
   and discard. Preserve tombstones/immutable identity through the full signed
   upload capability horizon; never recycle IDs or infer deletion from expiry.
   Retire subcollections and quota only through coordinated cleanup.
4. Canonical protection: atomically protect package/theme references during
   completion/promotion; cleanup and promotion must contend on shared reference
   records. Recheck canonical/published references before deletion; use immutable
   resource identity/version, not client URLs. Promotion needs durable operation
   records/retry semantics. Current image-bearing completion refusal stays.
5. Authenticated/App Check registration callable and uploader/save/resume/removal
   wiring remain absent. Preserve independent media/progress/demo gates. Strict
   pre-storage byte enforcement remains separate from post-upload proof rejection.

### Files changed in this step

- functions/src/packages/provider-editor-draft-media-registration-v1.ts
- functions/src/packages/provider-editor-draft-upload-v1.ts
- functions/src/packages/editor-draft-cloudinary-proof-v1.ts
- functions/src/shared/cloudinary.ts
- functions/test/provider-editor-draft-media-registration-v1.test.cjs
- functions/test/editor-draft-upload-v1.test.cjs
- functions/test/editor-draft-cloudinary-proof-v1.test.cjs
- functions/test/editor-draft-cloudinary-lookup-v1.test.cjs
- docs/provider-package-wizard-local-verification.md

Local ignored generated Functions JavaScript was rebuilt with tsc. No Web source
or shared types were changed in this step; Web TypeScript was not rerun.

### Validation

The registration suite runs real TypeScript service code through the existing
isolated loader with injected Firestore/Auth/Cloudinary boundaries. Additional
cases run the compiled real lookup/proof modules. The transaction fixture buffers
writes until success and simulates optimistic conflict retries; concurrent calls
produce one create and one unchanged result. This is not a real Firestore or
Cloudinary acceptance test. Existing upload, discard and media tests are retained.

- Targeted media/editor/progress/simulated completion: 155 passed, zero failed.
- Final Functions TypeScript, ESLint, full backend and diff results recorded below.
- Logs: .tmp/step41b-targeted.log, .tmp/step41b-registration.log,
  .tmp/step41b-functions-types.log, .tmp/step41b-eslint.log,
  .tmp/step41b-full-backend.log.

Final Step 4.1B results: Functions tsc --noEmit passed; local tsc compilation
passed. Targeted ESLint (four source files) passed with zero errors and the one
pre-existing max-len warning in shared/cloudinary.ts. Full backend CJS suite plus
occasion-routine-deactivation MJS: 2,666 passed, zero failed/skipped. Targeted
media/editor suite: 155 passed, zero failed. No test assertions/timeouts were
weakened. Web checks were unaffected and not rerun (prior verified baseline:
88 passed). Final git diff --check passed. Git status retains the same 62 dirty
paths (33 modified, 29 untracked), with no staging, commit or push. The nine
paths listed above are the only session edits; all were already dirty/untracked.

## Verified draft-media persistence and recovery continuation (2026-11-04)

This section supersedes the previous reservation-exhaustion blocker. It establishes
local server transaction behavior, not deployed persistence or browser recovery.
The upload candidate and all release flags remain disabled. No production write,
Cloudinary write, emulator, staging, commit, push or deployment was performed.

### Reservation capacity and cleanup safety

The signer now counts only state=reserved AND expiresAtMs greater than trusted
server Date.now() inside each transaction attempt, with a 57-document bounded
query and a 56-active-reservation ceiling. Registered/consumed records and expired
reservations no longer exhaust active upload capacity. Expiry remains a derived
state; original scope, public ID, issue/deadline, proof and consumption evidence
are retained unchanged. A delayed signing transaction refuses an already-expired
capability. Creating a reservation also updates the owning draft's media metadata,
so concurrent allocations contend even against an initially empty collection.
This metadata does not increment the editor revision or alter saved progress.

The additive mediaUploadReservations(state, expiresAtMs) COLLECTION index is
included locally in firebase/firestore.indexes.json. It must be deployed and READY
in the intended environment before enabling the signer. It was NOT deployed.

Capacity reclamation does not delete Firestore or Cloudinary resources, mark an
object absent, recycle IDs, or authorize cleanup. Existing registered-media and
any-reservation discard refusals remain. Expired reservations stay queryable for
reconciliation; registration still refuses them. Orphan storage and audit records
can accumulate until the separately required reconciliation/deletion worker is
implemented. No deletion worker was invented without canonical reference safety.

### Exact private persistence/recovery contract

The existing progress.marketingAssetIds array is the ordered package manifest.
Each progress.themes entry retains its editorThemeId and ordered assetIds. No
alternate client URL/proof/ownership fields were introduced. In the save
transaction the existing structural parser and media manifest/ownership validator
are used with point reads of every mediaAssets record AND its registered
mediaUploadReservations record. The helper checks owner/provider/draft/kind/theme,
verified state, consumed reservation, immutable Cloudinary identity/version,
versioned authoritative URL and reservation metadata. No Cloudinary lookup occurs
inside save/get/list transactions. The trusted registry is the proof boundary.

Save enforces revision, global reference uniqueness, eight package images, four
per theme (or a lower current policy limit), twelve themes and strict shapes/IDs.
New-draft asset references cannot acquire someone else's media. Image-bearing
saves additionally require the existing packageEditorMediaWrites flag, which was
not enabled. Non-media progress remains under its existing independent gate.
The canonical completion assertNoUnverifiedEditorAssets guard remains intact.

Save/get/list return the original ordered IDs in progress and an additive media
field when images exist:

- media.packageAssets: ordered {assetId, url, kind, themeId} entries.
- media.themes: ordered {themeId, assets: ordered entries} associations.

URLs are reconstructed from validated server-owned records in manifest order,
never from browser claims, query order or cached operation response media.
Current active account/provider ownership is reauthorized for get/list/save.
Saved operation replay keeps its original revision/result while revalidating the
current owned draft and all referenced media; malformed/missing/revoked references
fail closed. Replay after draft deletion/reassignment now refuses rather than
returning stale private data. No second draft write occurs on an identical retry.
Owner recovery remains available when write flags are disabled or maintenance is
paused; registry validation is still mandatory. No temporary file preview counts
as server-persisted media.

All referenced documents are read before writes. Firestore transaction read-set
conflicts cover admission versus changes to registry/reservation/draft state.
The helper performs at most 112 parallel point reads for 56 assets per draft;
list remains bounded to twenty owned drafts. No cleanup deletion path is exposed.

### Focused regression evidence

New tests run the compiled real progress, upload and registration handlers with
real parsers, ownership helpers and provider authorization. Only Auth/rate-limit,
maintenance, Cloudinary and Firestore boundaries are injected. The in-memory
transaction fixture buffers writes, refuses read-after-write, retries optimistic
conflicts and keeps network/signature calls outside their own transaction context.
It verifies order/theme recovery, all rejection boundaries, repeated revisions,
immutable operation replay, stale revisions, current account/owner checks,
non-media behavior, expired capacity recovery, concurrent final capacity slots,
registration/save races, cleanup-state conflicts, save/discard races, and retained
registered/completed/canonical records. This is not a Firestore emulator, Rules
acceptance test, real Cloudinary request or deployed end-to-end verification.

An initial focused run had three fixture/assertion failures: its global transaction
counter confused concurrent unrelated transactions with the current call context,
and a test incorrectly assumed progress handlers were absent from index.ts. The
fixture now uses AsyncLocalStorage per transaction; the export assertion covers
the actual disabled upload/registration boundary. No security assertion or test
timeout was weakened. Final runs below pass.

### Inspected remaining release blockers

1. Browser upload/registration: prepareProviderEditorDraftUploadV1 remains absent
   from index.ts; registerEditorDraftMediaV1 remains internal. Browser images
   still use the separate service-image flow. No authenticated registration
   callable, draft-scoped upload/progress/retry UI, or verified image adapter has
   been connected. App Check/origin/rate-limit acceptance remains necessary.
2. Browser save/resume: provider-package-form.tsx persistProgress still emits
   empty media ID arrays, and handleSaveProgress explicitly refuses selected
   images. provider-package-progress.ts SavedEditorDraft does not yet type/use
   the additive media response. A future client must preserve registered IDs and
   map media.packageAssets/media.themes into image state without replacing IDs
   with URLs. Do not advertise image-preserving Save Progress & Exit yet.
3. Discard/cleanup: existing refusal guards remain. A durable reconciliation
   outbox/worker needs leases, retries, delayed-upload horizon handling, immutable
   Cloudinary identity checks and safe subcollection/quota retirement. Expired
   capacity recovery implemented here is not physical orphan cleanup.
4. Canonical promotion/completion: provider-package-drafts-v2 still refuses all
   media-bearing editor completion before packageWriteFromProgress, which still
   produces empty canonical media arrays. Direct package validation accepts the
   existing owner service-image namespace; it does not promote draft assets.
   A durable promotion operation and atomic canonical reference protections are
   still required. A cleanup worker must transactionally check shared reference
   records and canonical/published package references before any deletion.
5. Step 5: Per Pax/Fixed Bundle conversion and existing V2 idempotency/revision
   contracts were retained; pricing/food-menu code was not edited. The browser
   V2 writer and backend demo-only gates remain as before. Media-bearing final
   completion, connected owner-read/persistence verification, production
   authorization, compatibility/security acceptance and strict pre-storage byte
   enforcement remain separate blockers. Private media persistence is implemented
   server-side locally, not enabled as a connected browser journey.

### Exact files changed in this continuation

- firebase/firestore.indexes.json (additive reservation capacity index)
- functions/src/packages/editor-draft-media-progress-v1.ts (new transaction helper)
- functions/src/packages/provider-package-editor-progress.ts (admission/recovery/account checks)
- functions/src/packages/provider-editor-draft-upload-v1.ts (capacity recovery/contention)
- functions/test/editor-draft-upload-v1.test.cjs (query/update fixture support)
- functions/test/provider-editor-draft-media-progress-v1.test.cjs (35 real-handler regressions)
- docs/provider-package-wizard-local-verification.md (this continuation)

Ignored generated Functions JavaScript was rebuilt locally. All pre-existing
modified/untracked work was retained; no Web source or shared types were changed.

### Verification

- Functions TypeScript --noEmit and compilation: passed.
- Targeted ESLint, three source files: zero errors, zero warnings.
- Media/editor/progress/simulated completion: 190 passed, zero failed.
- Full backend CJS suite plus occasion-routine-deactivation MJS, concurrency 4:
  2,701 passed, zero failed/skipped.
- Web TypeScript: unaffected; not rerun. Existing Web baseline retained.
- git diff --check and final Git status recorded below.

Logs: .tmp/media-progress-focused.log, .tmp/media-progress-targeted.log,
.tmp/media-progress-eslint.log, .tmp/media-progress-full-backend.log.

Final diff validation: git -c core.safecrlf=false diff --check passed. Final Git
status: chore/monorepo-setup, 65 dirty paths (34 modified, 31 untracked), nothing
staged. Compared with the starting status, the additive index and two new files
account for three additional dirty paths; every pre-existing change remains.
No commits, pushes, deployments, emulator, feature activation or live writes.

## Safe draft-media cleanup and canonical protection continuation (2026-11-04)

Local candidate implementation, NOT a release-readiness sign-off. All previous
worktree changes remain. No emulator, production Firestore/Cloudinary write,
feature activation, staging, commit, push or deployment was performed. The
browser upload candidate and image-bearing V2 completion remain disabled.

### Cleanup authorization and canonical protection

New private drafts carry mediaLifecycleVersion=1. New upload reservations carry
an explicit canonicalProtection version 1 record with state=draft_only and null
package/operation identities. The signer requires the draft marker. These markers
are server-created before upload; no legacy record is silently backfilled from
client URLs, claimed asset IDs, or the absence of a single package URL.

Cleanup requires the current project-bound packageEditorMediaCleanupWrites flag,
which is absent/off by default. Owner-requested scheduling reuses the real active
provider, ownership and expected-revision authorization. Internal worker functions
are not callable exports; only a future trusted service/IAM boundary may invoke
them. Job scope is derived from the persisted reservation and exact owned path.
Missing or malformed scope, proof, reservation, lifecycle marker or ownership
fails closed. Active registered progress references cannot enter cleanup.

Before scheduling/claiming/deleting, the coordinator checks the reservation's
canonical protection and a bounded server-side inventory of the provider's
canonical packages (maximum 100; a 101st result requires reconciliation). Package
cover/gallery images and theme images protect the source regardless of draft,
completed or published status. Malformed/unsupported media evidence fails closed.
Completed editor drafts and any pending promotion are protected. Canonical or
promotion_pending reservation markers prohibit cleanup even when a package is
missing or inconsistent. The ledger pin and cleanup_pending reservation contend
in transactions, so a future promotion cannot acquire an asset already frozen
for cleanup. Existing canonical writers reject the draft namespace; full
promotion must retain these pins and use the same reference boundary.

Legacy drafts/reservations lacking markers require an explicitly authorized,
complete inventory/migration audit before cleanup or promotion. No live migration
was attempted. Providers with more than 100 canonical packages likewise need a
reviewed bounded coverage mechanism; the implementation refuses rather than
assuming the first page establishes absence.

### Durable states, external operations and retry behavior

Jobs are stored outside draft subcollections in
providerPackageEditorMediaCleanup/{hash(draftId,assetId)}. The original reservation
and registry records retain scope and proof audit evidence.

| Record | State transitions |
| --- | --- |
| Reservation | reserved/registered/revoked -> cleanup_pending -> retired |
| Registered media | verified -> cleanup_pending -> retired |
| Cleanup job | pending -> deleting (leased) -> reconciled; failure -> retry -> deleting |
| Media-bearing discard | incomplete -> discarding -> discarded parent tombstone |
| Promotion foundation | planned with pinned sources -> cancelled only before copying starts |

Scheduling freezes the reservation and any registry entry in the same transaction
as job creation and a draft pending-cleanup counter increment. Save/recovery can
no longer admit frozen or retired records. Duplicate scheduling uses the same job.
A worker claims one resource with a server token and two-minute lease; expired
leases can be reclaimed. Target immutable Cloudinary identity/version is recorded
before deletion. All external lookup/delete calls occur outside transactions.

Deletion waits until reservation expiry plus a 24-hour quarantine. This delay is
NOT treated as proof of resource absence or as an absolute upload-completion
bound. An authenticated server Admin lookup must establish the exact image/upload
resource or return an actual 404. Authentication, timeout and other lookup errors
remain failures. Deletion uses delete_resources_by_asset_ids for a single immutable
asset ID, with strict acknowledgement validation; replacement identities/versions
are refused. The API contract was checked against the installed Cloudinary SDK
and https://cloudinary.com/documentation/admin_api#delete_resources_by_asset_id .
No Cloudinary acceptance test or configuration/write was performed.

An interrupted network request or failed final Firestore commit leaves a retryable
job. A lost deletion acknowledgement is recovered by the next trusted missing
lookup. The counter is decremented only once with registry retirement. Reconciled
jobs retain daily next-run timestamps so late upload arrivals remain tracked;
replacement identities require review rather than unsafe deletion. Parent and
resource IDs are never recycled. Five-second Cloudinary request timeouts, bounded
worker batches, leases and durable checkpoints permit recovery after interruption.

reconcileExpiredEditorDraftMediaV1 discovers at most four expired unregistered
reservations per call using a collection-group query and durable compound cursor.
The cursor wraps after each complete pass so legacy records requiring review do
not permanently starve later candidates. drainEditorDraftMediaCleanupV1 processes
at most four due resource jobs; retry timestamps/backoff or evidence-review delay
avoid a busy error loop. It also runs bounded queue/audit-only discard continuation
without adding Cloudinary calls. No scheduler/trigger was exported or activated.

### Discard and quota reconciliation

The original authenticated owner/provider, expected revision, idempotency hash,
quota bounds and non-media immediate-discard behavior remain. With cleanup disabled
or lifecycle evidence missing, EDITOR_DRAFT_MEDIA_CLEANUP_REQUIRED still blocks
media-bearing discard. The safeguard is replaced only in the gated versioned path.

A permitted request atomically marks the draft discarding and stores a durable
pending_cleanup operation with its immutable request identity. Upload signing,
registration, saving and completion cannot race past this state. The response is
{discarded:false, cleanupPending:true, editorDraftId} until reconciliation is done.
A provider retry uses the same request key; a trusted worker can continue without
the browser using the server-stored operation. Different-payload/key conflicts and
stale revisions remain refusals.

Each continuation handles at most four asset jobs. Before releasing quota, bounded
resumable inventory pages audit every reservation and registry record, including
malformed records without state fields that inequality queries would omit. Each
retired record must have matching reconciled job evidence and canonical protection.
A missing/ambiguous record blocks finalization. Pending work retains quota. Final
state and quota decrement commit atomically exactly once; repeated/concurrent
retries cannot decrement again. Canonical completion is additionally refused while
any cleanup counter or promotion pin is present.

Media-bearing discard intentionally retains a parent tombstone, retired registry/
reservation audit records and global jobs. It clears private progress and removes
the draft from the active quota/list. Subcollections are never left under a deleted
parent; delayed uploads remain reconcilable. Physical audit purging is not
implemented and must not be inferred from the discarded acknowledgement.

### Canonical promotion foundation and precise unfinished work

prepareEditorDraftMediaPromotionV1 remains internal and independently gated by
packageEditorMediaPromotionWrites (not enabled). It reauthorizes the current
provider/draft/revision and real verified manifest, preserves package/theme order,
allocates a server target package identity, records immutable source identities
and operation-scoped target public IDs with overwrite=false, and atomically pins
every reservation plus the draft. Identical retries return the same target;
changed scope/source/proof, another operation, or an occupied canonical target
conflicts. Request property order does not change identity.

cancelEditorDraftMediaPromotionV1 idempotently releases only an untouched planned
operation. Copying or reconciliation states cannot be cancelled as if no external
work occurred. Neither function copies/uploads or writes a canonical package.

Full promotion is deliberately unfinished: implement leased copy/verification and
compensation/reconciliation, verify immutable destination identities with overwrite
prevention, atomically commit the canonical ordered manifest/reference ledger and
package/editor/quota result, retain source/destination references through partial
failure, protect customer/published projections, and reconcile copied targets on
abort. Canonical validation currently accepts the existing service-image namespace,
not the planned draft-promotion namespace. These contracts must be extended with
trusted promoted-asset admission before removing assertNoUnverifiedEditorAssets.
Image-bearing completion therefore remains refused; no writer/demo/publication
feature restrictions were relaxed.

### Remaining release prerequisites

- Authorized inventory/migration for existing unversioned records; no automatic
  ownership/protection backfill. Reviewed coverage for larger canonical inventories.
- Deploy and verify READY the new collection-group reservation index and the
  state/discardNextAuditAtMs index, plus prior media/progress indexes. None deployed.
- Wire an IAM-protected bounded scheduler/queue to discovery, cleanup and discard
  continuation, with monitoring, review queues and Cloudinary acceptance for
  timeout/404/immutable-delete/quarantine/late-upload behavior. No such trigger is
  exported. Review tombstone/audit retention and storage costs before enabling.
- Complete canonical promotion/references and abort recovery described above.
- Browser authenticated draft upload/registration, verified-ID save/resume/removal,
  and byte progress remain unwired. Browser discard must persist operation identity
  and distinguish cleanupPending from discarded; its current void adapter is not
  ready for this new response. No browser success claim or activation was added.
- Step 5 retains demo-only V2 writer gates and publication restrictions. Connected
  persistence/owner recovery, old-client/customer/booking compatibility, production
  authorization, App Check/origin/security acceptance and pre-storage byte-limit
  enforcement remain required. No pricing or food-menu implementation was changed.

### Exact files changed in this continuation

1. firebase/firestore.indexes.json
2. functions/src/packages/editor-draft-media-cleanup-v1.ts (new)
3. functions/src/packages/editor-draft-media-promotion-v1.ts (new)
4. functions/src/packages/provider-package-editor-progress.ts
5. functions/src/packages/provider-editor-draft-upload-v1.ts
6. functions/src/packages/provider-editor-draft-media-registration-v1.ts
7. functions/src/packages/provider-package-drafts-v2.ts
8. functions/src/shared/cloudinary.ts
9. functions/test/editor-draft-upload-v1.test.cjs
10. functions/test/provider-editor-draft-media-discard-v1.test.cjs
11. functions/test/provider-editor-draft-media-progress-v1.test.cjs
12. functions/test/provider-package-v2-persistence-simulated.test.cjs
13. functions/test/editor-draft-media-cleanup-cloudinary-v1.test.cjs (new)
14. docs/provider-package-wizard-local-verification.md

Ignored generated Functions JavaScript was rebuilt locally. Existing test fixtures
were extended for the real new boundary; prior security assertions were preserved.
The disabled-discard test now expects both reservation and registry reads instead
of one. A cursor mock initially dropped collection-group/compound cursor state;
fixing it made the pagination/starvation tests pass without weakening assertions.
The final results below supersede those intermediate fixture failures.

### Verification

Real compiled handlers and Cloudinary adapter are tested with injected service
boundaries and optimistic in-memory transaction retries. No emulator, network
Cloudinary deletion, Firebase mutation or deployed end-to-end acceptance is claimed.
Final Functions TypeScript/compilation, ESLint, targeted/full backend totals and
Git status follow below. Web source/shared types are unchanged; Web TypeScript
was not rerun.

Logs: .tmp/media-cleanup-targeted.log, .tmp/media-cleanup-full-backend.log,
.tmp/media-cleanup-focused.log, .tmp/media-cleanup-eslint.log.

Final cleanup/protection validation:

| Check | Result |
| --- | --- |
| Functions TypeScript --noEmit and local compilation | Passed |
| Targeted ESLint, seven source files | 0 errors, 0 new warnings; 6 existing max-len warnings (5 drafts-v2, 1 shared/cloudinary) |
| Media/editor/progress/cleanup/promotion and simulated completion | 246 passed, 0 failed/skipped |
| Full backend CJS suite plus occasion-routine-deactivation MJS, concurrency 4 | 2,757 passed, 0 failed/skipped |
| git -c core.safecrlf=false diff --check | Passed |
| Web TypeScript | Unaffected; no Web source edits, not rerun |

The final checks include the canonicalized promotion retry fingerprint and a
request-field-order retry assertion. The targeted and full totals add 56 new
regressions to the previous 190 / 2,701 baseline. Final Git status is
chore/monorepo-setup: 68 dirty paths (34 modified, 34 untracked), nothing staged.
Only the fourteen paths listed in this continuation were edited. Three new files
account for the three additional dirty paths; all prior local work is retained.
No commits, pushes, deployments, feature activation, emulator, or production
Firestore/Cloudinary writes occurred.
