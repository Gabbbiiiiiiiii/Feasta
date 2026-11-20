# FEASTA Setup Gallery V2 — B2D security verification

Date: 2026-10-24 (Asia/Manila). Repository: `C:\flutterProject\feasta`. Branch: `chore/monorepo-setup`.

## Decision

Local verification and minimum corrections are complete. No locally reproduced critical authorization, image ownership, or transaction-integrity defect remains in the exercised paths. The final Functions validation follow-up resolved both test-expectation failures: **309/309 targeted Functions tests now pass**, with zero failures/skips. This is backend-local validation, not live authorization certification or deployment approval.

| Readiness state | Decision |
| --- | --- |
| Locally implemented | Yes: B2C private load/save contract, transactional writer, restricted Admin capability workflow, protected revision adapters. |
| Locally tested | Yes: latest Functions follow-up 309/309; earlier web/Vitest/static checks 132/132 (not rerun in the Functions-only follow-up). Zero failures/skips in these latest respective runs. |
| Ready for Pia's frontend integration | Yes: local UI integration, serialization, error handling, disabled-state handling and mocked successful saves. No backend fix blocks that scope. |
| Ready for controlled live testing | No: real authorization execution, isolated deployment-package validation, lifecycle scope and explicit activation/deployment approval remain outstanding. Local export inventory and installed dependency checks now pass. |
| Ready for production | No: live verification and separate public V2 reader/publication approval are required. |

No deployment, live Firebase reads/writes, emulator execution, dependency installation, production configuration change, commit, push, merge, reset, stash or branch switch occurred. Pia's frontend implementation was not modified. Existing dirty and untracked work was retained. Firestore rules were inspected and tested statically, but not changed in this run.

## Security evidence

| Security requirement | Implementation status | Evidence/test | Remaining risk | Release readiness |
| --- | --- | --- | --- | --- |
| Customers cannot read private gallery/eligibility | `providers/*/catalog/*`, authority, policy and capability records have no client allow; recursive default deny applies. Public provider profiles remain intentionally readable under existing rules. | 8 static rule-contract tests, including absence of broader recursive grants. | Rules were not compiled/executed against Firestore; deployed rules unknown. | Local contract only; verify before live. |
| Clients cannot self-grant or rewrite revisions | Grants live in `providerEligibilityAuthorities`, not legacy provider fields. Sidecar and operation/audit/revalidation records are default denied, including Admin clients. | Rules contracts; capability handler and legacy contracts. | Actual authenticated client denials untested. | Verify before live. |
| Classification/status changes follow trusted workflows | Provider owner has no direct update path. Admin-client denylist protects owner, type, categories, event types, verification and active/blocked/suspended/deleted status. User updates whitelist only profile fields. Category writes are callable-only. | Expanded provider/user/category static contracts; account and approval tests. | Admin SDK is privileged; external scripts/IAM and deployed versions are outside local proof. | Verify before live. |
| Trusted operations advance protected eligibility | Existing Functions invalidation helper and Web Admin prepared writers advance a transaction-read sidecar; no inferred occasion grants. Registration, onboarding category changes, account deactivation and verification flows use these adapters. | Eligibility helper tests; reviewed call sites; Admin account/verification regressions. | Tests do not execute every deployed workflow or Firebase Auth race. | Local implementation; live workflow checks required. |
| Admin-only capability approval/revocation | Auth, active Admin role, transactional Admin recheck, provider-owner linkage, current catalog/category validation, revisions and idempotency enforced. App Check options retained. | 17 lifecycle tests executing real handlers and pure helpers with mocked services. | Middleware and actual Firebase Auth authorization are not executed by these mocks. Callable remains unexported. | Restricted local workflow only. |
| Ineligible providers/occasions cannot obtain grants | Provider flags and owner account state checked; inactive/rejected occasions and inapplicable categories denied. Catering-only category authority now stored for mixed providers. | Lifecycle grant-denial cases; real gallery parser/transaction tests. | Auth-disabled owner with unsynchronized profile needs deployed workflow verification. | Verify before live. |
| Revocation invalidates a new save | Capability change increments sidecar revision atomically; writer reads sidecar and compares caller's generation in its write transaction. | Revocation lifecycle test; writer retry test injecting concurrent revocation. | Actual callable refuses changes for providers with packages/V2 galleries; coordinated withdrawal is unavailable. | Must resolve or explicitly bound live scenario before activation. |
| Category changes cannot use stale usage checks | Type-change/delete usage queries now occur inside mutation transaction; create/status changes read the category in their transaction. Gallery and capability transactions also read category docs. | Concurrent usage injection forces retry and rejection; deactivation races tested. | Real query contention/index behavior remains untested. | Local correction verified. |
| Image ownership and metadata | Real owner-folder URL parser plus authenticated Cloudinary resource lookup for new URLs; exact public ID/secure URL, image type, bounded positive bytes and allowed format. Null/non-object responses explicitly rejected. | Real verifier invoked with mocked fetch; cross-owner/arbitrary/query-string URLs; malformed metadata, failed HTTP/timeout, reorder/replacement and removal-after-preflight cases. | Cloudinary API/credentials and asset existence not checked live. Existing valid owned photos retain V1 cached-photo behavior. | Local tests pass; real owned/cross-owner assets must be checked before live. |
| Atomic full replacement and optimistic races | User/provider/gallery/authority/policy/category/complete occasion scan read before the only gallery write; stale revisions reject. External image lookups happen before retrying transaction. | 36 writer tests with pending writes, read fingerprints, retry conflicts and real V1/V2 parsers. | Simulation uses changed-value fingerprints, not actual Firestore document versions, locks or network retries. | Local proof only. |
| B2C identity and exact contract | Server actions delegate through server-only service to existing B2B writer; provider identity comes from linked session. Envelope/version and V2 proposal fields are strict. Derived metadata rejected. | Private action tests, actual writer simulations, TypeScript; handoff checked against exports. | Next server-action/session deployment and App Check boundaries require live verification. | Pia local integration ready. |
| Private/public separation | Private drafts do not require public reads. V2 publication requires separate approval and remains blocked. Pending providers may load under catalog access, but cannot save. | Private-load/draft/publication tests. | No approved public V2 reader. | Publication blocked. |
| V1 and mixed-gallery preservation | Real V1 parser preserved; V2 full replacement retains submitted V1 records; old V1 editor rejects mixed data at preflight and transaction snapshot. Customer projection excludes V2. | V1 gallery and public-compat Vitest suites, mixed writer tests. | Full customer/provider deployment compatibility not exercised live. | Local compatibility passes. |

Firebase Admin SDK operations use server credentials and are not authorized by client Firestore rules. Tight client denies therefore do not prevent these trusted transactions. Their authorization is implemented in server code and depends on deployed credentials/IAM; this run did not test that infrastructure.

## Confirmed corrections

1. **Stale category usage checks.** `updateServiceCategory` and `deleteServiceCategory` previously read aggregate usage outside their mutation transaction. A concurrent assignment could make the decision stale. Bounded existence queries now participate in the same transaction before writes. Only zero/nonzero usage is needed; the returned sizes are bounded to one. Successful deletion audit usage remains zero. Both race tests reject after a simulated conflict/retry.
2. **Mixed-provider capability mismatch.** Approval previously wrote all active provider categories, including add-ons, to `approvedCategoryCodes`. The gallery correctly requires catering categories, so this could make legitimate mixed-provider authority unusable; it also let add-on applicability confer gallery grants. Approval now validates all categories through the existing transaction helper, then retains only transaction-read catering categories. Regression tests cover valid mixed-provider approval and denied add-on-only occasion applicability. Legacy `providers.eventTypesSupported` is unchanged.
3. **Malformed image response handling.** A null Cloudinary response previously caused an incidental property-access exception. The verifier now rejects null, arrays and non-objects explicitly as invalid setup images. This was already fail-closed for writes; the correction gives the intended safe validation path. V1 validation code was not changed.

## Capability lifecycle and activation

`functions/src/packages/provider-occasion-capabilities-v2.ts` exports the module-local `updateProviderOccasionCapabilities` callable, but `functions/src/index.ts` does not re-export it. It was not enabled here.

The supported local lifecycle requires an existing valid protected revision and stable catalog. A revision-only initialized sidecar is invalidation state, not a grant; a successful Admin approval establishes explicit occasion/category evidence. Missing sidecar or malformed revision fails closed. Replays recheck Admin state; the same payload/key returns the recorded result without another revision, while changed payload conflicts. Duplicate grants under a new key and revoking non-held IDs are rejected. Concurrent distinct requests with the same expected revision cannot lose an increment; one commits and the other conflicts. Concurrent identical requests commit once.

Revocation can remove held capabilities even when the provider is blocked, but all capability mutations deliberately refuse providers with packages or any V2/unsupported gallery record (`GALLERY_REVALIDATION_REQUIRED`). There is no coordinated withdrawal worker. This is a functional live-testing limitation, not an authorization bypass. It was retained rather than bypassed. A revision increment alone must not be represented as withdrawing already published material. Legacy mapping mutations have a similar compatibility barrier in their existing tests.

Before activation, agree whether a controlled scenario is limited to initial approval of a package-free, V1-only test provider. Testing a complete Admin revoke/save lifecycle after creating V2 drafts requires an approved extension of the existing workflow. Only after that review, runtime packaging/export checks and explicit deployment approval would the intended entry-point re-export be `export {updateProviderOccasionCapabilities} from "./packages/provider-occasion-capabilities-v2.js";`. Do not add that export or activate policy/gates merely to make UI testing possible.

Category changes rely on authoritative category document reads in the affected transactions. No new global category revision mechanism was introduced.

## Transaction and image coverage boundaries

The writer harness executes the actual writer, actual owner URL parser and actual V1/V2 parsers. Only its in-memory source copy enables the two private-write guards; the on-disk publication guard stays false even in the harness. Reads after pending writes fail. Writes are buffered, discarded on failure/conflict, and committed only after read fingerprints still match. Concurrent same-revision saves yield one commit and one rejected retry.

Covered: successful replacement; stale gallery/catalog/eligibility revisions; injected concurrent revocation, category deactivation, provider blocking/deactivation, owner blocking and catalog mutation; malformed galleries and revisions; missing authority; duplicate setup IDs; invalid/forged occasion data; incomplete pagination; rejection with zero committed writes; mixed V1/V2 preservation. Existing V1 service tests cover an old editor observing V2 only after preflight.

Cloudinary fetch is mocked; no image operation is performed. New and replacement URLs are verified; reordered existing valid owned URLs use the existing trusted-gallery path. A photo removed from the transaction snapshot after preflight cannot be silently reintroduced without verification. This does not guarantee that an already stored asset still exists externally, or that an asset cannot change after verification; those are existing cached-photo/external-service limits.

The lifecycle harness executes real capability/category handlers and pure policy helpers, with mocked Auth authorization, App Check registration, database and audit services. It models query membership conflicts and reads before writes. It does not certify Firebase middleware, real audit delivery, serializable locks, query phantom handling, ABA document changes, transaction exhaustion or deployed indexes. The writer's revocation race injects a changed sidecar directly because the real callable intentionally refuses V2 galleries.

## B2C API contract and gates

Signatures remain:

```ts
loadPrivateProviderSetupGalleryV2Action(input: {galleryWriteSchemaVersion: 2})
savePrivateProviderSetupGalleryV2Action(input: SavePrivateSetupGalleryV2Request)
```

Save requires exactly `galleryWriteSchemaVersion: 2`, `revision`, `expectedCatalogRevision`, `expectedProviderEligibilityRevision`, `setups`. Success is `{ok: true, gallery}`; failure is `{ok: false, code, error}` using the documented safe error union. The returned gallery contains trusted authority and `availability`; callers must serialize writable V2 fields rather than resubmit derived loaded fields. No action signature or response type changed in B2D.

The handoff now links this report and distinguishes its historical B2C counts from B2D evidence. Retain every desired record in a full replacement. Conflicts require reload and explicit reconciliation, not automatic revision substitution.

On-disk gates are still false:

- Web: `PRIVATE_V2_WRITER_COVERAGE_VERIFIED`, `MIXED_GALLERY_PUBLIC_V1_COMPATIBILITY_VERIFIED`, `PRIVATE_V2_PUBLICATION_VERIFIED`.
- Functions authority: `SETUP_GALLERY_WRITER_COVERAGE_VERIFIED`.

No live policy was inspected or changed. A policy alone cannot bypass these guards. Save currently returns disabled before authentication/database access; its deeper behavior is exercised only in the offline harness. Loading still requires an existing valid environment/expiry policy and trusted authority. There is no automatic authority initialization by load.

## Validation results and reproduction

| Validation | Final result |
| --- | --- |
| Functions TypeScript (`node node_modules/typescript/bin/tsc --noEmit`, in `functions`, final follow-up) | Passed, exit 0. Earlier B2D also compiled emitted output successfully. Direct compiler invocation avoids the build script's dependency installation. |
| Web TypeScript (`node node_modules/typescript/bin/tsc --noEmit`, in `apps/web`) | Passed, exit 0. |
| Selected Functions Node tests, final follow-up, 19 files | **309/309 passed; 0 failed; 0 skipped.** Original 17-file selection now has 253 passing tests (one added catalog security contract); 56 additional expiration/worker regressions pass. Lifecycle suite remains **17/17**. Initial B2D baseline was 250/252. |
| Writer transaction Node suite | **36/36 passed**, 0 skipped. |
| Rules static contracts plus approval contracts | **12/12 passed** (8 rules + 4 approval), 0 skipped. Not Firestore rules execution. |
| Web focused Vitest, 6 files | **84/84 passed**, 0 skipped. |
| Targeted Functions ESLint | Passed, zero warnings/errors. |
| Final follow-up ESLint on both changed CJS tests | Passed with `--max-warnings=0`, zero warnings/errors. Additional reviewed-source scan: zero errors, one pre-existing `max-len` warning at `src/payments/initial-payment-expiration-worker.ts:20`; strict warning-limit invocation exits 1 for that warning. Source left unchanged. |
| Targeted Web source and changed CJS tests ESLint | Passed, zero warnings/errors. CJS tests explicitly document their Node `require` convention. |
| `git diff --check` | Passed. Git emits existing LF/CRLF conversion notices, not whitespace errors. |
| Firebase/emulator/Cloudinary live, full monorepo tests, deployment build/runtime preparation | Not run, as requested. |

### Final Functions failure resolution

Both failures were first reproduced individually, each reporting 0 passed / 1 failed, using installed local dependencies:

```text
node --test --test-name-pattern="all deployed exports remain in the reviewed inventory" test/function-security-contract.test.cjs
node --test test/provider-package-v2-runtime.test.cjs
```

After corrections, each command reports **1/1 passed**, zero failures/skips.

1. **Outdated export inventory expectation.** `function-security-contract.test.cjs` omitted existing `listApprovedOccasions` and `reconcileInitialPaymentExpiration` exports. Source review confirmed the catalog callable retains App Check, rate limiting, protected policy, stable revision, secret-backed cursor and bounded public projection controls. The expiration worker is private scheduled work with bounded resources; its existing offline worker/expiration regressions pass. The explicit inventory now includes exactly these existing exports, retains exact set equality, adds a catalog security-controls contract, and explicitly asserts that `updateProviderOccasionCapabilities` is absent. No entry-point export or activation changed. The catalog source's outdated comment saying it is not entry-point exported remains only a documentation discrepancy; deployed state is unknown.
2. **Invalid physical-path expectation under pnpm.** `provider-package-v2-runtime.test.cjs` assumed the resolved dependency must physically sit beneath `functions/node_modules`. The installed direct dependency links into root `node_modules/.pnpm`, which is the existing workspace layout. The test now requires resolution to equal the real path of the explicit Functions dependency's V2 file. It additionally checks exact package identity/export mappings, the Functions `file:vendor/...` dependency declaration, and byte-for-byte equality of installed package metadata, V2 runtime and declaration files against the vendored archive (read without extraction or installation). All original require/import identity, declaration, archive SHA-256, and both lockfile SHA-512 assertions remain and now execute successfully. No implementation/package-content incompatibility was demonstrated. This does not certify installation inside an isolated deployment upload.

Final follow-up edits are limited to `functions/test/function-security-contract.test.cjs`, `functions/test/provider-package-v2-runtime.test.cjs`, and this report. Prior local edits in those files were preserved. No runtime implementation, package manifest, lockfile, dependency, frontend, export or release gate changed. The ignored final validation log is `.tmp/b2d-functions-final-validation.log`.

Commands used for focused web tests, from `apps/web`:

```text
node node_modules/vitest/vitest.mjs run test/components/provider-setup-gallery-private-actions.test.tsx test/components/provider-setup-gallery-v2-writer.test.tsx test/components/provider-setup-gallery-v2.test.tsx test/components/provider-setup-gallery-public-compat.test.tsx test/components/provider-setup-gallery.test.tsx test/components/admin-user-access-service-contract.test.tsx
```

Node web checks, from repository root:

```text
node --test --test-reporter=spec apps/web/test/components/provider-setup-gallery-v2-transaction.test.cjs apps/web/test/components/provider-eligibility-rules-contract.test.cjs apps/web/test/components/provider-approval-status-contract.test.cjs
```

Functions checks, from `functions`:

```text
node --test --test-reporter=spec test/setup-gallery-b2d-lifecycle.test.cjs test/provider-eligibility-revision.test.cjs test/provider-occasion-capabilities-legacy-contract.test.cjs test/provider-occasion-suggestions-v2.test.cjs test/provider-package-v2.test.cjs test/provider-package-v2-runtime.test.cjs test/provider-package-v2-read-core.test.cjs test/setup-gallery-legacy-mapping.test.cjs test/setup-gallery-v2-authority.test.cjs test/account-state.test.cjs test/provider-verification-statuses.test.cjs test/verification-document-workflow.test.cjs test/function-security-contract.test.cjs test/provider-package-create-category.test.cjs test/provider-package-update-category.test.cjs test/provider-package-publish-category.test.cjs test/provider-package-service-category.test.cjs test/initial-payment-expiration-worker.test.cjs test/initial-payment-expiration.test.cjs
```

Functions lint targets: `src/admin/service-category-management.ts`, `src/packages/provider-occasion-capabilities-v2.ts`, `src/packages/setup-gallery-v2-authority.ts`, `src/shared/provider-eligibility-revision.ts`. Web lint targets: the V2 writer, private service, setup-gallery actions, transaction CJS test and rules CJS test. Both use the installed `node_modules/eslint/bin/eslint.js`; Web additionally uses `--max-warnings=0`.

Final follow-up lint, from `functions`: `node node_modules/eslint/bin/eslint.js test/function-security-contract.test.cjs test/provider-package-v2-runtime.test.cjs --max-warnings=0`. The Functions ESLint configuration applies TypeScript-specific rules to `src/**/*.ts`; this invocation checks the changed CommonJS test files under the existing configuration. `git diff --check` also passes.

## Files changed in this B2D run

1. `functions/src/admin/service-category-management.ts`
2. `functions/src/packages/provider-occasion-capabilities-v2.ts`
3. `apps/web/src/lib/provider/provider-setup-gallery-v2-writer.ts`
4. `functions/test/setup-gallery-b2d-lifecycle.test.cjs` (new)
5. `apps/web/test/components/provider-setup-gallery-v2-transaction.test.cjs`
6. `apps/web/test/components/provider-eligibility-rules-contract.test.cjs`
7. `docs/feasta-setup-gallery-v2-pia-handoff.md`
8. `docs/feasta-setup-gallery-v2-b2d-security-report.md` (new)
9. `functions/test/function-security-contract.test.cjs` (final validation follow-up)
10. `functions/test/provider-package-v2-runtime.test.cjs` (final validation follow-up)

Ignored local validation output includes `.tmp/b2d-functions-tests.log` and normal generated `functions/lib` compiler output; no generated dependency archive or package lock was rebuilt. Other files already reported by initial `git status` are prior work, not B2D edits.

## Remaining blockers and next stage

**Must fix before Pia's local integration:** none identified. Pia must honor `canSave: false` and `canPublishV2: false`, use mock successful responses, and handle UNAVAILABLE when authority is not configured.

**Must resolve or verify before controlled live end-to-end testing:**

1. Local export-inventory and installed dependency validation is now green. Separately validate the isolated deployment upload/runtime before deployment; the existing `verify-deployment-runtime.cjs` performs a dependency installation, so it was not run under this task's no-install restriction. No deployment or activation is authorized by a passing source inventory.
2. Execute real authorization tests separately: unauthenticated/customer/unrelated-provider/owner/Admin reads and writes for private catalog, sidecar, catalog/policy revisions and capability operation/audit records; protected provider classification/status and user role/linkage/account fields; category client denials. Test multi-field changes and Admin clients. This requires a separately authorized rules emulator run or controlled environment; none was launched here.
3. Validate deployed server actions with valid, expired, revoked and Auth-disabled sessions; linked/cross-provider access; blocked/inactive/suspended/rejected/deleted providers and owners; Admin role removal; App Check rejection on callables and the distinct Next server-action boundary. Verify trusted Admin SDK workflows still succeed under the intended IAM.
4. Agree the capability lifecycle scope and resolve the existing V2/package withdrawal restriction before testing post-V2 revocation through the real callable. Confirm all deployed privileged writers use the current revision protocol.
5. With separate approval, establish trusted test authority, approved occasion/category data and valid environment/expiry policy. Verify real owned/cross-owner/malformed/missing Cloudinary resources without using production customer data.
6. Obtain explicit review/approval for any callable export, controlled deployment and private-write activation. Execute real conflict/retry and mixed V1 customer regressions in that environment. Keep public V2 publication disabled.

**Can wait until production release:** public V2 reader/projection and publication approval, production policy/IAM/deployment validation, and broader rollout/operational acceptance. These cannot be deferred if the controlled test explicitly includes public V2 behavior.

**Next exact action:** Pia should implement and exercise the documented private editor contract locally using mocked successful saves and the real disabled/unavailable responses; coordinate backend readiness work from the six-item live-testing checklist before scheduling live end-to-end testing.
