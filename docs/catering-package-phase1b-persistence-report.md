# Catering Package Phase 1B: compatibility fixes and persistence blockers

Date: 2026-10-28 (Asia/Manila).
Worktree: C:/flutterProject/feasta-catering-package-enhancements.
Branch: feat/catering-package-enhancements.
Starting HEAD: c4e6c3f1c5183b52afcd3cb4525324d308c13888.

## Outcome

Partial implementation under the task's independently-safe-changes allowance.
**V2 draft persistence is NOT implemented or enabled.** Multiple occasions and
Fits All remain open-wizard state and are lost on reload. No V2 writer, private
editor storage, release gate, callable export or production configuration was added.
This report supersedes the prior Phase 1 report's statement that every legacy edit
requires the canonical V2 read configuration.

## Legacy compatibility decision

The Phase 1 form unconditionally used missing PackageOccasionOptions as a save
error. Its service returns null for absent/disabled protected read policy, invalid
or changing catalog, absent authority, authorization failures or read errors.
That is appropriate for offering NEW canonical selections. It is an unintended UI
regression for an existing unchanged legacy draft scope: the deployed legacy
update contract does not use V2 read policy or providerEligibilityAuthorities as
its authorization source. The frozen compatibility section explicitly preserves
legacy scalar eligibility rather than inferring V2 migration from unrelated edits.

The form now permits retaining exactly the original occasion AND original
category on an existing draft when canonical choices are unavailable, provided
current page capabilities still include that occasion. It adds no fallback options.
The user sees a retained-legacy label and an explanation. Changing the category,
removing the occasion, creating a package or losing provider support blocks this
exception. A present canonical catalog continues to reject missing/ineligible
selections; an empty catalog is not treated as absent configuration.

This is UI compatibility, not authorization. The existing update callable still
checks auth/role, rate limits, user/provider linkage, approved provider ownership,
owned draft state, provider occasion/category capabilities, active canonical
service category, payment policy, offer configuration and media ownership. New
images still use the existing verification path. The exception cannot authorize
publication, booking, an inactive category or a revoked provider capability.

A second gap existed on the server: checking request unknown fields did not
prevent an old writer from updating an EXISTING V2 document. updateProviderPackage
now checks the stored envelope after ownership and draft authorization, before
media verification or writes. V2/partial V2 occasion fields and unknown occasion
or offer versions reject with failed-precondition / CLIENT_UPGRADE_REQUIRED.
The new draft predicate allows existing Per Pax/Fixed Bundle drafts. Publication
retains its stricter predicate, including rejecting pricingModel. Booking and
publication behavior is unchanged.

## V2 persistence dependencies identified

The existing pure resolveOccasionV2 helper validates specific/all selection against
supplied authority, but does not load/authenticate that authority or commit writes.
The legacy callables accept complete scalar eventType payloads and have no
idempotency key or expected package revision contract. They must not be reused
for V2 selection serialization. No multi-selection was converted to eventType.

The proposed canonical V2 API and private editor API are declared in
packages/shared-types/src/provider-package-v2.cts and specified in
docs/provider-package-shared-contract-v2-draft.md. They are not package persistence
implementations. Before wiring this wizard to them, the following work remains:

- A dedicated protected draft-write policy/environment gate and transactionally
  pinned policy, stable catalog, complete applicable occasion inventory, explicit
  provider grants and active category authority. The existing catalog READ gate
  does not authorize writes. Fits All must require every applicable active grant,
  with empty writable occasionIds and server-derived match IDs/revisions.
- Canonical package revisions and an explicit CAS initialization path for legacy
  records without revisions. ALL competing package writers must participate;
  a V2-only revision check alongside unversioned legacy updates is insufficient.
- Owner-scoped, payload-bound idempotency records with atomic original results,
  expected revision conflicts and retry-safe package identity allocation.
- A complete compatible offer/payment/media validation adapter; the proposed V2
  request includes offerSchemaVersion and the existing canonical validators
  require scalar eventType. The current V2 resolver also emits a compatibility
  scalar. Resolving that contract must preserve the full tuple as authority and
  must not use a scalar selection as a substitute for multi/all semantics.
- If using the separate private editor-draft contract: bounded typed progress,
  protected owner-only resume, immutable package binding, base revision checks,
  verified asset registry/reference protection, and atomic canonical completion.
  The current wizard uploads inline URLs, whereas proposed resumable progress
  accepts trusted asset IDs. Merely storing the form object is not that contract.

These are implementation dependencies, not a request to activate/provision data.
No production authority/configuration was inspected or changed. This patch makes
no claim that deployed data satisfies them. An end-to-end safe V2 writer was not
completed; idempotent V2 save/reload/concurrency tests therefore remain outstanding.

## Publication and maintenance

V2 publication/customer booking remain gated by existing legacy guards. Per Pax
and Fixed Bundle remain draft-only. Occasion Lifecycle, generation fencing and
maintenance admission/control reads were not modified. Private legacy editing
continues its existing contract; intake/publication pauses continue to fence their
existing scopes. No draft edit is a maintenance admission to publication/booking.

The Firestore rules regression explicitly demonstrates that an Admin writer could
expose a V2 document by publishing it. This is an existing rollout blocker, not
new permission to do so. All public writers/readers and old clients need verified
compatibility before V2 publication is enabled.

## Validation

All commands ran locally in this worktree; no deploy, commit, push or merge.

- Web: node node_modules/vitest/vitest.mjs run with these seven files under
  apps/web/test/components: provider-package-occasion-chips.test.tsx,
  provider-package-occasion-contract.test.ts, provider-package-management.test.tsx,
  provider-package-wizard-ux.test.tsx, provider-package-catalog.test.tsx,
  package-occasion-options-service.test.ts, provider-package-layout-refinement.test.tsx.
  Result: 7 files, 97 tests passed. Includes retained legacy save/remount from the
  saved payload (mocked callable, not a live browser reload), missing configuration,
  revoked page capability, category/removal restrictions, stale canonical options,
  multi/all save/upload rejection and pricing/media regressions.
- Backend: node --test with functions/test files legacy-occasion-publication-guard,
  provider-package-v2, provider-package-management, provider-package-update-category,
  provider-package-publish-category, package-pricing-model, provider-package-images,
  provider-package-payment-terms, occasion-package-revalidation and intake-maintenance
  (all .test.cjs). Result: 80 passed, no skips. Includes V2 selection validation,
  revoked grants, universal revalidation, revision conflict simulations and
  maintenance races. These do not prove a V2 persistence transaction exists.
- Functions TypeScript: node node_modules/typescript/bin/tsc --pretty false passed.
  Web TypeScript: node node_modules/typescript/bin/tsc --noEmit --incremental false passed.
- ESLint on both modified backend TypeScript files and both modified Web TSX files:
  passed with no warnings after reflowing a pre-existing long payment projection line.
- Firestore emulator demo-feasta-maintenance (127.0.0.1:61880):
  functions/test/emulator/intake-maintenance.integration.cjs passed, including real
  transaction activation races, paused admissions, financial recovery and rules
  bypass denials. Financial gateway dependencies in its fixtures are mocked.
  functions/test/rules/occasion-legacy-client.rules.test.cjs passed 2 tests with
  RULES_FIRESTORE_ONLY=true. The first combined invocation passed maintenance but
  failed the rules setup because Storage was not running; corrected Firestore-only
  execution passed. CLI shutdown left its Java child listening; the corrected tests
  used that same task-owned emulator and it was then stopped explicitly.
- git diff --check passed. No frozen manifest, shared contract, rules, indexes,
  Flutter files, booking/payment implementation or dependency changes.

## Pia: Customer Web / Flutter handoff

No customer integration change is required for these compatibility fixes. Keep
existing unsupported-V2 visibility/booking rejection. Before V2 publication:
read and display the full specific/all tuple, enforce current match/revision and
eligibility semantics, verify discovery/detail/availability/booking and selected
service-tier pricing/payment snapshots, and test old clients against actual rules.
Fits All is not a client-expanded wildcard. Provider editors need the separate
revision-aware writer and may never truncate selections to eventType. Persisted
V2 reload, authorization, idempotency and concurrency acceptance is still required.

## Exact changed files

- apps/web/src/app/provider/packages/provider-package-form.tsx
- apps/web/test/components/provider-package-occasion-chips.test.tsx
- functions/src/packages/legacy-occasion-publication-guard.ts
- functions/src/packages/update-provider-package.ts
- functions/test/legacy-occasion-publication-guard.test.cjs
- docs/catering-package-phase1b-persistence-report.md (this file)
