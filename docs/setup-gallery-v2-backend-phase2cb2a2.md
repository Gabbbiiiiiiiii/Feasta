# Phase 2C-B2A.2: provider eligibility writer coverage

24 October 2026, Asia/Manila. Branch: `chore/monorepo-setup`.
Local implementation only. **Partial coverage: B2B transactional persistence is
not safe to begin as an authoritative persistence implementation.** Both V2
gates, production V1 rejection of V2, and the B1 compatibility barrier remain.

## Authoritative counter and storage

The existing B2A design is now used by five Functions mutation paths:
`providerEligibilityAuthorities/{providerId}.revision`. No revision is added to
the provider document, where existing administrator client rules use a denylist.
The sidecar remains protected by the existing default-deny rules. Neither normal
provider clients nor administrator clients can write it through those rules.
Admin SDK/IAM writers remain trusted and require their own coverage audit.

`advanceProviderEligibilityInTransaction` uses B2A `authorityRevision` and
`nextEligibilityRevision`. It reads the sidecar and creates revision 1 or updates
an existing positive safe integer to its successor in the caller's transaction.
Missing revision on an existing sidecar, invalid values and overflow reject the
whole operation. A new provider cannot inherit an existing orphaned sidecar.
Existing sidecar properties are preserved; only `revision` is updated.

Initialization here establishes **invalidation history only**, never approval.
A newly initialized sidecar contains exactly `{revision: 1}`: no occasion grants,
approved categories, approval identity or fabricated provenance. This is narrower
than the future approval-bearing initializer proposed in B2A. A missing revision
on a gallery read remains invalid; an initialized counter without explicit trusted
approval evidence also cannot establish valid eligibility. The approved capability
and category evidence lifecycle remains unresolved; these counters cannot activate
V2 or make a legacy provider implicitly eligible.

The helper compares `ownerId`, `providerServiceType`, `providerCategory`,
`serviceCategories`, `eventTypesSupported`, `verificationStatus`, `isActive`,
`isBlocked`, `isSuspended`, and `isDeleted`. Deactivation also compares the linked
owner's `role`, `providerId`, `accountStatus`, `isActive`, and `isBlocked` from
the transaction's user snapshot. No-op values skip even the sidecar read.
Other profile fields, timestamps, availability capacities, prices, financial
state, and public projections are not a new source of approved V2 capabilities.

## Exact writer inventory

Paths below are relative to the repository root. “Covered” describes source
wiring plus local unit evidence, not deployed coverage or an emulator result.

| Path and operation | Relevant fields / mechanism | Revision coverage after this task |
| --- | --- | --- |
| `functions/src/providers/register-provider.ts`: `registerProvider` | Creates owner, service type/category selection, event types, draft verification and inactive operational state in Admin SDK transaction | Covered on actual creation, after validations and category reads. Linked/existing-provider replay branches do not initialize or increment. |
| `functions/src/providers/save-provider-onboarding-draft.ts`: `saveProviderOnboardingDraft` → `saveLinkedProviderApplicationStep`, step 3 | Updates linked provider service type, primary category, categories and event types in transaction | Covered when tracked values change. Unlinked onboarding writes only a draft, not authoritative provider eligibility. Other linked steps do not change these eligibility fields. |
| `functions/src/verification/submit-provider-verification.ts`: `submitProviderVerification` | Provider verification becomes `submitted`, inactive, not suspended; transaction also updates verification/user | Covered after validation/storage checks. Completed operation replay and `alreadySubmitted` return before helper. |
| `functions/src/verification/review-provider-verification.ts`: `reviewProviderVerification` | `start_review`, `approve`, `reject`, `require_resubmission`, `suspend`, `restore` update verification and provider access flags in transaction | Covered after existing approval evidence, owner, transition and package-read checks; revision and decision commit together. No new grant is created. |
| `functions/src/auth/manage-role-account.ts`: `deactivateProviderAccount` | User becomes `pending_deletion`/inactive and provider inactive in transaction | Covered, including owner transition while provider was already inactive. Repeated same eligibility state does not increment. |
| `apps/web/src/lib/admin/provider-verification/provider-verification-service.ts`: `approveProviderVerification`, `rejectProviderVerification` | Admin SDK transactions; approval writes provider `verificationStatus: verified`, active; rejection writes `rejected`, inactive | **Uncovered.** Existing Web path is a separate authority boundary and has a different approval/evidence/status protocol from Functions. It has not been silently rerouted or normalized to `approved`. Requires a Web-compatible sidecar adapter and transaction tests retaining its existing behavior. |
| `apps/web/src/lib/admin/users/admin-user-service.ts`: `manageAdminUserAccountAccess`, `loadMutableUser`, `loadProviderDocuments` | Auth disable/token operations; user/account state and associated providers' active/blocked flags written in Admin SDK batch after separate reads | **Uncovered.** Atomic batch has no read-set fencing. The current provider limit is 498, with user/notification/audit writes in addition; adding one sidecar per provider would exceed the 500-write ceiling. Needs a separately tested transaction/budget migration and Auth/Firestore failure recovery, preserving `verified`-based restoration and duplicate-provider behavior. An increment after the batch is not safe. |
| `firebase/firestore.rules`: `providers/{providerId}` administrator update branch | Direct authenticated admin client updates permit category/service type/event types and other non-denylisted fields | **Uncovered.** Client cannot update protected sidecar atomically. Routing these writes through a server transaction requires changing the authorized client protocol; no existing behavior or rules were changed here. |
| Same rules: provider owner soft-delete branch | Client sets deletion metadata, `isDeleted`, inactive | **Uncovered.** No sidecar advancement; future transaction must read provider directly, and client deletion must eventually join a server-owned protocol for comprehensive generation coverage. |
| `firebase/firestore.rules`: user account updates; privileged user writers | Linked owner role/identity/access state | **Uncovered globally.** The specific Functions deactivation path is covered; arbitrary account/identity mutations are not. Future gallery must read the actual owner document. |
| `functions/src/admin/service-category-management.ts`: `createServiceCategory`, `updateServiceCategory`, `changeCategoryStatus` via `discontinueServiceCategory`/`reactivateServiceCategory`, `deleteServiceCategory` | Global category create/update/status/serviceType/capacity/delete in Admin SDK transactions; some usage checks occur outside them | No provider generation or shared category generation. Must bind the complete referenced category document set into future gallery transaction reads; B2A global-generation/fan-out proposal remains unimplemented. No approval semantics changed. |
| `functions/src/scripts/seed-service-categories.ts`: `main`, `--apply` | Privileged batch creates missing active global categories | No eligibility generation. Not executed, even in dry-run mode (which performs live reads). Must join any selected global generation protocol before activation. |
| `apps/web/src/lib/admin/file-maintenance/admin-service-category-client.ts`: category callable wrappers | Delegates category writes to Functions operations above | Same coverage as those operations; server `admin-service-category-service.ts` reads categories only. |
| `functions/src/packages/occasion-v2-validation.ts`: `parseCapabilityChange`, `validateCapabilityDelta` | Pure approval/revocation request and semantic validators | **No persistence writer exists.** No new grant/revoke endpoint, inferred capability or approval-bearing backfill was invented. Approval/revocation transactional acceptance tests remain blocked on implementing that lifecycle. |
| `functions/src/packages/provider-occasion-suggestions-v2.ts`: `reviewOccasionSuggestion` | Admin moderation may create approved, inactive canonical occasion and advance `occasionCatalog/current.revision` atomically | Existing catalog fence retained. Mapping/approval of a suggestion does not approve provider capabilities. |
| `functions/src/packages/update-setup-gallery-legacy-mapping.ts`: `updateSetupGalleryLegacyMapping` | Transaction updates B1 mapping, occasion/global revisions and operation/audit | Existing atomic fence and V1-only barrier retained; no activation or weakening. |
| Occasion activation/deactivation, privileged console/IAM scripts | Could change canonical active/applicability/moderation eligibility | No activation writer located in inspected production source; external deployed writers are not audited. Every such writer must join catalog generation before V2. |

Additional provider writes inspected: `update-provider-business-profile.ts`
(`updateProviderBusinessProfile`), `auth/manage-role-account.ts`
(`updateRoleAccountProfile`), `update-provider-availability.ts`, `provider-media.ts`,
phone identity synchronization, and `scripts/backfill-query-policy.ts` update
profile/availability/media/contact/query projections, not the tracked provider
category/event-type/approval grants. `auth/audit-account-security-state.ts`
(`onUserSecurityStateChanged`) asynchronously updates `publiclyVisible` and package
visibility after user changes. It is **not** an atomic eligibility fence for the
original user mutation. Public eligibility also consumes profile completeness;
any future public V2 path must read/revalidate those actual fields rather than
assuming this counter covers public exposure. Package/addon creation consumes
categories and does not approve them. No booking/payment writer was modified.

This inventory covers inspected production repository sources/rules, not a live
IAM/deployed-code audit. Other checkouts, generated fixtures and external scripts
are not asserted covered.

## Concurrency and eventual gallery transaction

All five wired paths read the provider before mutation; the helper's sidecar read
occurs after the path's other reads and before its first write on that branch.
Onboarding only calls it on linked step 3; step 1 can already have user writes,
so calling it unconditionally at the provider update would violate Firestore's
read-before-write ordering. No external action is added inside retried callbacks.
The existing submission Storage verification placement is unchanged.

Firestore conflicts on the provider/sidecar cause transaction retries. Two covered
mutations cannot lose a revision increment; concurrent missing-sidecar creation
also conflicts/retries. Any later failure rolls back sidecar and provider writes.
Semantic replay against the latest provider values does not increment. Existing
callable idempotency and transition guards are retained, not replaced by the
counter; their separate operation bookkeeping is not newly claimed atomic with
the decision. A rejected transition cannot commit the staged revision.

The eventual V2 writer must, in one transaction and before any writes:

1. Read provider, linked owner, protected sidecar, protected
   `contractPolicies/setupGalleryV2`, `occasionCatalog/current`, gallery and all
   referenced authoritative category documents. Missing counter/grants/approval
   evidence fail closed; verification alone does not approve new capabilities.
2. Validate actual owner/provider linkage and operational state, current explicit
   capability set, and active approved categories from those snapshots. No cached
   or request-supplied authority is acceptable. Global category changes need the
   chosen complete document-read or generation protocol, not a sidecar assumption.
3. Read every bounded catalog page in that same transaction using B2A's terminal
   page proof. Compare expected provider eligibility, catalog, protected policy
   and gallery revisions with the transaction snapshots. Actual capability,
   category and owner reads are required in addition to revision equality.
4. Resolve all applicable eligible occasions, enforce policy validity/limits,
   revalidate stored schema/assets and advance gallery revision atomically.
   External Cloudinary checks remain outside retries. Settle policy expiry versus
   commit deadline, and B1 withdrawal/revalidation, before implementing persistence.

The comparison regression checks each of the four revision positions independently,
including missing revisions. It does not prove an absent gallery transaction.
Direct admin writes, owner changes and Web batches still violate a universal
provider-generation promise; an asynchronous trigger cannot repair that gap.

## Files authored by this task

- New `functions/src/shared/provider-eligibility-revision.ts`.
- Modified the five Functions writer files listed as covered above.
- New `functions/test/provider-eligibility-revision.test.cjs`.
- New this report.

Initial Git status was inspected first. All previously modified/untracked files
were retained; pre-existing B2A source, shared contract, packaging artifacts,
lockfiles, Web source/UI, indexes and rules were not edited by this task.

## Validation

- Functions TypeScript: `node node_modules/typescript/bin/tsc` passed.
- Targeted Functions ESLint on six authored TypeScript files, with
  `--max-warnings 0`: passed.
- Functions selected suites: **137 passed, 1 failed (138 total)**. Included the
  new **13 passing** revision tests, B2A authority, B1 mapping, provider onboarding,
  business profile, verification statuses/documents/identity, occasion suggestions,
  V2 validators/read-core/runtime. Transaction races/rollback are an optimistic
  in-memory read-set model, not emulator or handler end-to-end integration tests.
- Existing capability tests exercise valid approval and inactive revocation,
  unauthorized grants and malformed deltas in pure validators. They do not certify
  a grant/revoke writer. New tests preserve existing explicit grants without
  inferring any during initialization or provider/category/verification changes.
- Web: **95 passed**, five files: gallery V1/V2, provider-detail foundation,
  admin-user-access service contract, verification queue service.
- Web `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `git diff --check`: passed; new files also checked separately for whitespace.

Separate pre-existing packaging failure: `provider-package-v2-runtime.test.cjs`,
“Functions installed V2 contract subpath loads through require and import”, fails
the assertion that resolved shared-types realpath is under Functions-local
`node_modules`. Independently rerun with the same failure. Assertion and packaging
files were not weakened or changed. Direct existing local tool entrypoints were
used after `pnpm exec` attempted dependency validation/install and aborted on its
no-TTY modules-purge guard; no dependency installation was completed.

## Remaining blockers and B2B decision

Coverage is intentionally **incomplete**, not a completed authoritative provider
eligibility lifecycle. Finish the uncovered Web approval/account paths, resolve
direct client administrator/deletion and all owner-state writers, implement
explicit audited capability approval/revocation and initialization evidence,
choose/test category fencing, and audit deployed privileged writers. The Web
batch cannot safely be patched by adding an asynchronous increment or blindly
doubling its write count. Its Auth recovery and differing verification status
semantics must survive a separately tested migration. None of these blockers is
hidden by a positive counter or waived because unit tests pass.

`SETUP_GALLERY_WRITER_COVERAGE_VERIFIED` remains hardcoded false. No V2 writer,
public exposure, policy provisioning or feature-gate override was added. B2B
transactional persistence is **not safe to begin** until
these authority/fencing prerequisites are closed. No deployment, emulators, live
Firebase/Cloudinary writes, commit, push, merge, reset, stash, clean, branch switch,
Pia UI/branch change, security-rule relaxation or frozen-contract change occurred.
