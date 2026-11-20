# Phase 2C-B2A: authority audit and disabled Setup Gallery policy

Date: 24 October 2026 (Asia/Manila). Branch: `chore/monorepo-setup`.
Status: **local primitives and adapter specification complete; comprehensive writer
coverage is not established. V2 persistence and public exposure remain disabled.**

## Confirmed storage and writer inventory

The existing source of provider operational eligibility is
`providers/{providerId}`: `ownerId`, `providerServiceType`, `serviceCategories`,
`eventTypesSupported`, `verificationStatus`, `isActive`, `isSuspended`, `isDeleted`
and related access flags. `users/{ownerId}` supplies linked provider identity,
role and active/blocked account state. `serviceCategories/{code}` supplies current
category status and service type. The existing gallery transaction checks the
provider and owner documents; it does not establish approved V2 occasion grants.

There is **no persistent provider eligibility revision or authoritative stored V2
capability set implemented in the inspected repository**. Revision names in the
frozen types, pure resolvers and `occasion-v2-validation.ts` are interfaces and
validators, not persisted authority. `parseCapabilityChange` does not implement a
grant/revoke transaction. Legacy `eventTypesSupported` is not an approved V2 grant
set and must never be expanded automatically into new occasion capabilities.

| Mutation path | Actual writes / transaction behavior | Revision coverage |
| --- | --- | --- |
| `functions/src/providers/register-provider.ts` | Admin SDK `runTransaction`; creates provider service type, categories and event types, initially `draft` | No eligibility revision |
| `functions/src/providers/save-provider-onboarding-draft.ts` | Admin SDK `runTransaction`; step 3 assigns validated operational fields into provider and verification snapshots | No eligibility revision; not a new approval authority |
| `functions/src/verification/submit-provider-verification.ts` | Admin SDK transaction; changes provider verification/access state to pending | No eligibility revision |
| `functions/src/verification/review-provider-verification.ts` | Admin SDK transaction; approval writes `approved`, active and suspension state; rejection path also changes eligibility | No eligibility revision |
| `apps/web/src/lib/admin/provider-verification/provider-verification-service.ts` | Admin SDK transactions; approval writes `verified`, rejection writes `rejected` and inactive | No eligibility revision; `verified` is not silently treated as `approved` by this work |
| `apps/web/src/lib/admin/users/admin-user-service.ts` | Admin SDK batch after reads; changes user account state and associated providers' `isActive`/`isBlocked` | No eligibility revision; batch is atomic but has no transaction read-set precondition |
| `functions/src/admin/service-category-management.ts` | Admin SDK transactions; create/update/discontinue/reactivate/delete global categories, including reference checks | No provider revision fan-out or global eligibility generation |
| `functions/src/scripts/seed-service-categories.ts` | Admin SDK batch creates missing category documents | No eligibility generation; privileged operational path |
| `firebase/firestore.rules`, provider admin update branch | Direct authenticated admin client updates use `changesNone` denylist; categories, service type, event types and a hypothetical new revision field are not protected by that list | Uncovered authorized writer; cannot assert server-owned revision on provider document |
| Same rules, owner soft-delete branch | Client can atomically set deletion metadata and `isActive: false`, restricted by `changesOnly` | No revision increment; must read provider directly at commit |
| V2 capability grant/revoke | Request parser only; no storage/writer located | Unresolved prerequisite; no invented grants |
| `functions/src/packages/provider-occasion-suggestions-v2.ts` | Admin SDK moderation transaction creates approved **inactive** canonical occasions at revision 1 and advances `occasionCatalog/current.revision`; mapping a suggestion does not grant provider capabilities | Existing catalog writer participates in generation for creation |
| `functions/src/packages/update-setup-gallery-legacy-mapping.ts` | Admin SDK transaction updates explicit mapping, occasion revision and global catalog revision with audit/idempotency | Existing B1 fence preserved; bounded V1-only barrier rejects V2 galleries |
| Occasion activation/deactivation | No activation persistence writer located; schemas/parsers are not mutation endpoints | All future/privileged activation writers must join catalog generation protocol |

`update-provider-business-profile.ts` was inspected: it updates business profile
fields and derives search tokens from existing categories/event types; this is not
a V2 grant writer. Package/addon writers consume provider categories; creating an
addon does not grant provider categories. Query-policy backfill consumes the
existing profile to build projections and does not establish grants. Emulator
seed fixtures are not a production approval source and were not executed.

This is a local source/rules audit. Deployed Functions, IAM, console edits,
external scripts and service accounts were not inspected through live services.
No claim of comprehensive deployed privileged-writer coverage is made.

## Revision design and initialization (specified, not installed in writers)

Use a server-owned sidecar `providerEligibilityAuthorities/{providerId}` under the
existing default-deny rules. Proposed fields: positive safe-integer `revision`,
explicit administrator-approved `approvedOccasionIds`, and provenance/audit fields.
Do not store the sole revision on `providers`: the existing admin update denylist
does not protect a new field. No sidecar has been created or backfilled.

`nextEligibilityRevision` provides a bounded initialization/increment primitive.
Missing initializes to 1 **only in an authorized transaction after current
approval evidence is independently established**. Missing on a gallery read fails
`authorityRevision`; it is never equivalent to 1 or valid eligibility. Null,
fractional, nonnumeric, zero/negative and unsafe revisions reject. Overflow blocks.

Initialization must read provider, owner, category documents and missing sidecar
in the same transaction, use create for the sidecar, and record administrator
approval evidence for each grant. It must not translate legacy event types into
grants, alter selections or mark old galleries valid. Two initializers conflict
on the missing document; retry must recognize the existing authority, not overwrite
it. Subsequent grant/revoke, provider category/service-type/verification changes
must read and increment the sidecar in the **same** transaction as the mutation.
Use expected revisions and idempotent operation records for administrator actions.

Global category status/type changes require a protected shared category generation
updated by every category writer, or a verified transactionally consistent fan-out
protocol; reads of the actual category documents remain required. Owner account
and soft-delete changes must be checked through their actual transaction read set.
A sidecar revision alone cannot cover these paths today. Direct admin capability/
category edits must be restricted or routed through the protocol before activation.
This work changes no rules and makes no false writer-coverage claim.

## Separate protected Setup Gallery policy

New internal module: `functions/src/packages/setup-gallery-v2-authority.ts`.
New independent storage contract: `contractPolicies/setupGalleryV2`. Existing
default-deny rules cover this document and the proposed sidecars. Policy provisioning
must be a separately audited administrator backend/IAM operation; a caller-supplied
document or `approvedBy` string cannot establish authority. No loader, policy writer,
callable/export, policy document, seed or environment activation override was added.
The future loader must read this exact path with Admin SDK inside the gallery
transaction, not accept request fields or reuse the package policy.

Required fields: positive safe `revision`, exact `effectiveEnvironment`, server-clock
`validFromMillis`/exclusive `validUntilMillis`, independent boolean `privateWrites`
and `publicReads`, `maxSpecificOccasions` (1..10), `maxApplicableOccasions` (1..1000),
`maxCatalogRecords` (1..2000), `pageSize` (1..100), `maxPages` (1..100), and mandatory
`requireCurrentRevisions: true`, `requireValidEligibility: true`. Limits must satisfy
specific <= applicable <= scanned catalog. A rollout may choose lower bounds;
increasing these implementation ceilings requires reviewed code. Unknown fields,
missing values, malformed limits, wrong environment, future or expired validity
fail closed. No test project enables a production gate.

Both gates default off. `setupGalleryGate` returns false for missing/invalid policy
and also when the module's **hardcoded false** writer-coverage barrier is present,
even if both policy booleans are true. A policy cannot attest to writer coverage.
The production V1 service continues its unconditional V2 rejection; these internal
primitives are deliberately not routed into any production reader or writer.
`contractPolicies/providerPackageV2` and the frozen contract were not modified.

## Trusted adapter and transaction strategy (specified, not a working writer)

1. Authenticate the provider and strictly parse only the writable payload. Reject
   payload authority, derived fields, policy overrides and capability claims.
   Perform external Cloudinary ownership/resource verification before entering
   retried transactions, retaining the existing exact URL/resource checks.
2. Inside **one** Firestore transaction, read provider, linked active owner, gallery,
   protected sidecar, policy, shared category generation (once implemented), all
   claimed catering category documents, and `occasionCatalog/current`. Require
   stable catalog activation, valid positive revisions, approved/active owner and
   provider, current catering eligibility and fresh policy validity. Missing grants
   or revisions reject. Never treat onboarding categories as a new occasion grant.
3. Enumerate the entire canonical `occasions` collection with deterministic document
   ID ordering and `startAfter(lastId)`. Use transaction queries for **every page**,
   not the public cursor endpoint or one limited query. Count all scanned records,
   including inactive/inapplicable records; require an empty terminal page. Enforce
   page, read and execution ceilings and fail closed rather than truncate. Terminal
   proof consumes a page: exhausting `maxPages` before it is an error, including
   when the last nonempty page was short. The helper implements these bounds.
4. Validate document identity, approved moderation, active flags, category
   applicability, occasion revisions and explicit B1 mappings. Validate grants
   against their approved sidecar, with no scalar-based inference. Feed the existing
   pure resolver only this trusted complete snapshot. Evaluate all applicable
   active occasions for Fits All, including more than ten, and enforce
   `maxApplicableOccasions` as the resolver's `maxEffectiveMatches`. No subset may
   be returned as a complete Fits All result.
5. Compare gallery, provider eligibility, policy, catalog and category generations
   with the expected server snapshot; `assertAuthorityRevisions` is only a
   comparison primitive. Recheck current stored gallery schema and asset membership
   as V1 already does. All reads precede writes. Derive eligibility metadata and
   write the full gallery with incremented gallery revision in this transaction.
   Policy expiry must also be considered on each retry; Firestore has no automatic
   commit-time wall-clock precondition, so a bounded validity margin/transaction
   deadline protocol must be settled before claiming validity through commit.

Firestore read-set conflicts force retries after provider/owner/category/policy/
sidecar changes. Catalog writers must update the shared generation atomically so
concurrent additions, removals, activation, applicability and B1 mapping changes
cannot create a phantom stale Fits All write. This requires writer coverage, not
merely comparing revisions in memory or re-reading before an unrelated write.
Gallery generation changes and exact stored-schema validation retain full-array
protection. Catalog read budgets bound returned documents, not a guarantee about
all internal Firestore index work; use bounded transaction timeout/operational
execution limits as well. No external calls belong inside retried transactions.

## Validation and limits of evidence

New tests cover revision initialization versus missing authority, malformed and
overflow revisions, capability/category generation invalidation, stale policy and
catalog comparisons, disabled independent gates with incomplete coverage, strict
configuration validity, full enumeration across pages beyond ten records, catalog
and page limits, and invalid/nonadvancing cursors.

These are primitive and in-memory pagination tests. There is no production provider
revision initializer or trusted adapter, so provider initialization concurrency,
transactional provider/category/catalog fencing and end-to-end paginated Fits All
transaction acceptance remain **unverified prerequisites**, not passing acceptance
claims. Existing B1 mocked tests cover concurrent identical operations, stale
revisions and atomic rollback; existing gallery tests retain ownership, revision,
concurrent schema/full-array protection and V1 behavior coverage.

Executed without packaging preparation, emulator, install or live services:

- Functions `tsc`: passed.
- Targeted Functions ESLint: passed (after wrapping one long line).
- Functions authority/B1/suggestion/V2/read/runtime suites: **85 passed, 1 failed**
  (86 total; new authority suite 7 passed).
- Separate runtime rerun: same pre-existing **shared-types packaging failure**:
  `Functions installed V2 contract subpath loads through require and import` fails
  the assertion that the resolved realpath is under Functions-local `node_modules`.
  Assertion, package artifacts and packaging scripts were not modified or suppressed.
- Web gallery V1/V2 and provider-detail tests: **74 passed**, three files.
- Web TypeScript `tsc --noEmit`: passed. Functions TypeScript and targeted ESLint
  were repeated after final source edits: passed without warnings.
- `git diff --check`: passed, with existing CRLF conversion warnings. The command
  excludes untracked files; the three new files were also checked for trailing
  whitespace separately.

## Exact remaining prerequisites for B2

1. Resolve explicit approved V2 grant storage/provisioning and audit every deployed
   privileged writer; remove direct unrevisioned admin eligibility mutations or
   design an equally strong protocol. Wire all listed mutation paths atomically.
2. Implement protected revision initialization with approval evidence, idempotency
   and concurrent initializer tests; cover category generation and account changes.
3. Implement the trusted Admin SDK adapter, protected policy loader, page queries,
   transaction fences and retry/expiry limits; test conflicts and paginated Fits All
   end to end without bypassing the production coverage barrier.
4. Approve and implement B1 withdrawal/revalidation protocol. Its current V1-only
   mapping barrier stays intact and must not be disabled merely to accept V2.
5. Resolve shared-types Functions-local runtime packaging separately, preserving
   its assertion. Add owner-authorized private V2 persistence/read service and
   acceptance tests only after authority/fencing are verified. Public exposure and
   provider UI integration require their own later work and explicit activation.

No prior modified or untracked file was overwritten. New source/test/report files
are the only authored changes in this task. No deployment, emulator, live Firebase/
Cloudinary access, commit/push/merge/stash/reset/clean, branch switch, rule change,
public activation, provider modal change or frozen shared-contract edit occurred.
