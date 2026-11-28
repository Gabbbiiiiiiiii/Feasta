# Stage D security remediation: admission before privileged media verification

Repository: C:\flutterProject\feasta-catering-package-enhancements
Branch: feat/catering-package-enhancements
HEAD remains 3486b126e836071fd0abc00e16f1f928788a3b14. Uncommitted Stage D and Stage E review work is preserved.

## Root cause and fix

Create/update previously read the operation ledger outside the canonical transaction and called verifyPackageImages before checking approved provider ownership, the private-write policy, maintenance, current category/occasion eligibility, package revision and payment policy.

The single existing canonical transaction body is now reused as `runPhase(admissionOnly)`:

1. Existing Firebase Auth, strict request.app/App Check check, active provider role and rate-limit checks remain unchanged. Request structure/canonical input parsing remains before media work.
2. A read-only admission phase runs the entire existing transaction validation path: active profile, provider ID from the trusted profile, approved owned provider, project-bound default-disabled policy, policy limits, maintenance, operation ledger/replay/conflict, update package ownership/private status/CAS, active category, stable catalog and explicit occasion/category grants, provider capacity and payment bounds.
3. An authorized matching replay returns its recorded result without external verification, preserving the existing replay contract.
4. For a new create/update operation, the admission phase returns before any package, ledger or maintenance-admission writes. Only then does verifyPackageImages run, outside any retried Firestore transaction. All submitted media, including retained URLs, still uses the existing verifier; no ownership/resource check was removed.
5. Active Firebase Auth account/role is refreshed after media verification. The final transaction reruns the same validation path against fresh snapshots, including ledger/revision conflicts, then commits the original package/operation/maintenance writes atomically.

The admission phase is not used as cached permission for the final write. This avoids duplicated validation implementations and preserves all existing transactional safeguards. Rate accounting still runs once per request.

Completion retains its original single canonical transaction. It accepts only saved unbound progress, rejects unverified editor asset IDs, converts to an image-free canonical payload and never calls the media verifier. Its atomic package/progress/quota/ledger behavior is unchanged.

## Paths and helpers audited

- createProviderPackageV2, updateProviderPackageV2, completeProviderPackageEditorDraft and their shared callable/runPhase path.
- parseV2DraftWrite, parseOfferV2 and packageWriteFromProgress.
- requireAuth, requireRole/requireActiveUser and resolveBackendAccountState.
- authorizeProviderForPackageManagement, authorizeOwnedPackage and assertDraftPackage.
- requireActiveServiceCategoryInTransaction, projectPublicOccasionV2, resolveOccasionV2, assertPackageMatchesProviderCapabilities and assertPackagePaymentTermsWithinPolicy.
- requireMaintenanceOpen and recordMaintenanceAdmission.
- validatePackageEditorProgress and assertNoUnverifiedEditorAssets.
- verifyPackageImages and verifyProviderServiceImage: URL owner/path checks precede the privileged Cloudinary resource lookup; the resource helper checks returned URL, type, format and size. The V2 request path's only business-related external resource operation is this Cloudinary verification chain. Secret declarations do not fetch media. Necessary Auth reads and security rate accounting remain part of admission.

No client provider identity is accepted. No new helpers or handlers were exported through index.ts. The existing feature gate remains default-disabled and strict App Check remains intact.

## Regression coverage

The existing demo-emulator integration suite now supports test-local dependency overrides. Security tests execute the real canonical parsers, provider authorization, media URL ownership checks, Auth/Firestore emulator access and transactions. Only the external verifyProviderServiceImage boundary is stubbed. A separate wrapper counts entry to verifyPackageImages, proving denied requests do not even enter that helper. No live Cloudinary calls occur.

Create and update negative tests assert zero verifier and Cloudinary calls for disabled gates, wrong policy environment, missing authentication/App Check, invalid provider ownership, provider/account ineligibility, maintenance, malformed pricing/occasion input, forged identity, unsupported/inactive category/occasion, capacity mismatch and invalid payment policy. Update additionally covers unowned/published packages and stale revisions. Denial codes are asserted for the admission scenarios.

Positive tests cover authorized media creation and updates, verification of retained URLs, original-result replay, conflicting replay and concurrent same-key creation without duplicate packages. Invalid external media and foreign-owner URLs reject without a package write. Tests mutate policy, provider ownership/eligibility, account profile, maintenance, occasion grants, category and package revision during the stubbed external verification; final authorization/CAS rejects the writes. Auth disablement is tested both before verification (zero calls) and during verification (post-media Auth recheck denies). Completion tests reject unverified assets with zero media calls and successfully complete/replay without media calls.

## Validation results

- Direct existing Functions TypeScript compiler: compilation and noEmit passed.
- ESLint on the changed backend module: passed, zero warnings/errors.
- JavaScript test syntax and final emulator execution: passed.
- Combined Stage C/D emulator suite plus new security regressions: **86 passed, 0 failed, 0 skipped**. This includes the original 22 tests plus 64 additional tests/subtests; Node reports 30 top-level tests.
- Targeted existing Functions regressions: **72 passed, 0 failed, 0 skipped** (V2 validators, progress parsing, package management/pricing/images/payment terms, legacy publication guards, booking offer behavior).
- git diff --check: passed.

All integration writes used `demo-feasta-stage-d` with loopback Auth/Firestore endpoints. The final run used a temporary copy of firebase.package-drafts.test.json with unused ports (Auth 61349, Firestore 60349, websocket 61350, hub 60439, logging 60539) and absolute local rules/index paths. A retry was required because the previous emulator shutdown left its original port occupied; that launch failed before tests ran. The tracked/uncommitted Stage D configuration was left untouched. No dependencies were installed or node_modules links changed.

For reproduction, compile directly with `node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json`, then use the existing demo-only emulator command from the Stage D report. If its ports are occupied, use a temporary configuration with free loopback ports; keep `--project demo-feasta-stage-d --only auth,firestore`. Run both functions/test/emulator/package-editor-progress-v2.integration.cjs and functions/test/emulator/provider-package-drafts-v2.integration.cjs.

## Remaining boundaries and risks

No known blocker from the reported authorization-ordering issue remains. Admission is a server-authorized snapshot; revocation after admission cannot retract an external read already in flight, but fresh final checks prevent unauthorized canonical writes. Firestore cannot atomically lock a remote Cloudinary resource; existing media mutability/evidence lifecycle limitations remain unchanged. No immutable gallery or booking-evidence guarantees are introduced.

Successful live Cloudinary resource verification, native callable transport and browser acceptance remain untested. These tests use raw-handler transport with real emulator authorization/transactions. The existing native demo App Check integration issue and Stage E Web integration remain separate work. V2 publishing/customer booking remain fenced. There is no production activation authorization in this remediation.

## Files and working tree

Changed in this task:

- functions/src/packages/provider-package-drafts-v2.ts
- functions/test/emulator/provider-package-drafts-v2.integration.cjs
- docs/catering-package-stage-d-security-remediation.md (new report)

Pre-existing changes retained without edits in this task:

- Modified functions/src/packages/provider-package-editor-progress.ts
- Untracked docs/catering-package-stage-d-backend.md
- Untracked docs/catering-package-stage-e-review.md
- Untracked firebase.package-drafts.test.json

The Stage D implementation and integration test were already untracked and remain so. All work is uncommitted. No reset, stash, discard, dependency installation, node_modules junction changes, handler exports, feature activation, Web/Mobile changes, booking/payment behavior changes, production Firebase/Cloudinary access, deployment, push, merge or commit occurred.
