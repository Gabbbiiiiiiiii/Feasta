# Phase 3B local release review

Status: implementation verified locally; release is not cleared while the wider regression failures remain unresolved. No commit, push, deployment, production data mutation, feature-gate value change, or PayMongo setting change was performed. No Firebase emulator or live booking/payment was used.

## Repository and Firebase status

- Branch: chore/monorepo-setup.
- HEAD at preflight and handoff: 5c4a97a19cb399613872039e9809fd65d63e4401.
- Seven pre-existing local changes were present and preserved. Only the existing customer V2 discovery test among those seven was further edited to test production admission and complete canonical fixtures.
- Existing project: feasta-catering-system; existing Functions region: asia-southeast1.
- The working tree remains dirty and uncommitted. Firebase deployment commands were not run. Remote deployed versions/configuration were not inspected, so this review does not claim that production currently runs this implementation.

## Publication requirements and implementation

The existing publishProviderPackage callable continues to route typed V2 requests into the existing two-phase transaction. Its emulator/demo-only publication restrictions were replaced with the existing environment-bound contractPolicies/providerPackageV2 authorization. packageDraftWrites, packagePublication, customerDiscovery and customerBooking must explicitly be true; no policy values were changed.

Fixed and customizable packages support both per_pax and per_bundle. The publisher requires authentication, production App Check, active provider role/account, provider ownership and approval, a public eligible profile, a valid operating-day/lead-time configuration, current provider categories and capacities, a complete canonical V2 draft, exact request envelope, positive revision and idempotency key. Incomplete editor progress and individual-food contracts cannot publish.

Missing runtime environment bindings cannot admit publication replay or customer reads.

The publisher reuses canonical tier/price/capacity/payment parsing, validates food inclusions and exact customizable group rules, validates themes/media limits, externally verifies provider media ownership, and refreshes Auth role before the commit phase. Policy, maintenance, package revision, provider, category, occasion catalog, grants, and payment policy are reread transactionally. Missing or malformed production payment policy fails closed; legacy fallback behavior was not changed.

Private drafts use a placeholder eligibility revision. Publication now resolves current eligibility and writes the validated discovery projection atomically with published flags and the next revision. It does not grant eligibility from the placeholder. Revoked grants and invalid transitions fail. Concurrent transaction reads/CAS and the operation record preserve revision and idempotency safety.

## Customer admission and booking

Existing Web discovery/detail/provider readers remain in use. The event filter now uses the existing occasionMatchIds query path in production. Existing indexes are present in the repository; their deployed availability has not been verified.

Web and the Mobile callable gateway use the shared production completeness, provider, capacity, payment and occasion predicates. The same food-choice parser is reused by server publication and booking. Both readers require published lifecycle flags, current policy/environment, stable catalog, current grant revisions and exact membership, active canonical category, eligible provider/account/schedule, complete tiers/foods/themes/media/payment terms. Web verifies catalog document IDs as well. Drafts, malformed records and revoked/stale authority stay hidden.

The existing getCustomerPackageV2 callable remains the Mobile gateway. Its allowlisted response now retains offerStructure, packageStyle, publishedAt and canonical offer/payment fields. The Flutter Phase 3A changes were preserved and all four configuration compatibility tests pass. Legacy discovery/publication behavior stays fenced by the existing legacy guards.

Provider UI affordances retain explicit environment opt-ins without requiring emulator mode: NEXT_PUBLIC_PROVIDER_PACKAGE_V2_DRAFTS_ENABLED and NEXT_PUBLIC_PROVIDER_PACKAGE_V2_PUBLICATION_ENABLED. These do not confer server authorization. No environment or Firebase feature-gate values were set. Legacy priced drafts retain their draft-only UI warning.

submitBookingRequest and the existing payment/session/refund implementations were not modified. Its fresh package read invokes the updated admission inside the booking transaction, then enforces expected revision, guest count, tier/theme/occasion and exact food selections. Existing authentication, App Check, idempotency, one-event-per-day occupancy protection, integer-centavo totals, immutable offer/food/financial snapshots, historical records, refunds and PayMongo live-mode settings remain in place.

## Verification

| Check | Result |
| --- | --- |
| Shared build/contracts | 50 passed, including the freeze test and decimal payment-policy regression |
| Functions build | Passed; generated local runtime archive and integrity pins refreshed |
| Targeted Functions publication/booking/legacy/runtime | 168 passed after final build |
| Production transaction simulations | 60 passed, included in the targeted result |
| Full Functions regression run | 2,908 passed; 26 failed out of 2,934 |
| Web focused regression run | 131 passed across seven suites |
| Final Web production admission/adapter recheck | 13 passed after final shared change |
| Web security | 152 passed |
| Web TypeScript | Passed |
| Web lint | Passed, two existing warnings |
| Functions lint | Passed, zero errors; 753 warnings in the broad lint run |
| Flutter full suite | 1,161 passed, four skipped |
| Flutter V2 targeted compatibility | 11 passed, including all four configurations and legacy identity |
| git diff --check | Passed |

Functions failures: one unchanged export-inventory mismatch for initializeProviderOccasionCapabilities, and 25 setup-gallery-b2d-lifecycle tests whose custom module loader rejects firebase-admin/auth. index.ts, the capability implementation, and that lifecycle harness were not edited. The two publication-related obsolete expectations were updated to assert validated production admission and malformed customizable-food rejection rather than an emulator-only ban; all their legacy rejection assertions remain.

The broader Web run observed six failures across provider-setup-gallery-v2-manager (one), customer-event-planning-marketplace (two), event-finder-budget-ui (one), and package-occasion-options-service (two). It stopped making progress and was interrupted; there is no full-suite completion claim. These suites were not edited. Their failures still require release triage; an isolated HEAD baseline run was not performed.

Evidence is in .tmp/phase3b-shared-verified.log, phase3b-final-build.log, phase3b-functions-verified.log, phase3b-functions-final.log, phase3b-web-regressions-final.log, phase3b-web-verified.log, phase3b-web-security-final.log, phase3b-web-typecheck-final.log, phase3b-web-lint.log, phase3b-functions-lint.log, phase3b-flutter-verified.log and phase3b-flutter-full.log. All tests used mocks/local execution; transaction simulations model read-set retries and do not prove deployed Firestore behavior.

## Freeze-test investigation

The original frozen Markdown SHA-256 assertion passes and remains unchanged. The failure came from later exact additive fields in PackageEditorProgressV2 (offerStructure, packageStyle, individualFoodItems, individualFoodDraft), followed by the PackageV2Write metadata intersection. The test previously knew only the foodChoiceGroups extension. It now asserts each extension's exact name, type and optionality, removes only those asserted additions for comparison, and still compares every original frozen definition and union exactly. The frozen document and canonical source types were not rewritten. Rebuilding also refreshed previously stale generated provider declaration files.

## Targeted deployment scope for later authorization

Deploy these existing Functions together after release review, using the rebuilt shared runtime archive:

- publishProviderPackage (the internal V2 handler is not a separately exported deployment target).
- createProviderPackageV2.
- updateProviderPackageV2.
- completeProviderPackageEditorDraft.
- getCustomerPackageV2.
- submitBookingRequest.
- checkCustomerProviderAvailability.

Web must subsequently ship its updated reader/query/UI code. No payment, checkout, webhook or refund deployment is requested by this change. Existing editor/media policy gates still apply where those workflows are used. No deployment has been authorized or performed here.

## Remaining rollout risks

Resolve or explicitly disposition the broader regression failures before release. Review the new admission rules against existing production policy/profile/schedule/category/capacity/payment documents using an authorized read-only release check; no such production inspection was performed here. Missing configuration will intentionally hide/reject V2 packages. Confirm existing discovery composite indexes in production and coordinate Web/Mobile compatibility versions before any explicit gate activation. Review currently published V2 records, if any, for the stricter completeness rules. Catalog/grant revision changes intentionally hide stale packages until an authorized lifecycle workflow revalidates them. Media verification availability and App Check registrations remain production dependencies. No emulator or live transaction testing was performed, per restriction.

## Preserved pre-existing files

- apps/customer_mobile/lib/shared/models/feasta_models.dart
- apps/web/src/app/provider/packages/page.tsx
- apps/web/src/lib/customer/discovery/marketplace-types.ts
- apps/web/src/lib/customer/discovery/public-package-normalization.ts
- apps/web/test/components/customer-package-v2-discovery.test.ts
- apps/web/test/components/provider-package-management.test.tsx
- apps/customer_mobile/test/package_v2_compatibility_test.dart

## Exact working-tree file inventory

This list includes the seven preserved incoming changes, Phase 3B source/tests, generated runtime artifacts and lockfile integrity updates. Untracked local evidence logs are ignored by Git.

- apps/customer_mobile/lib/shared/models/feasta_models.dart
- apps/web/src/app/provider/packages/page.tsx
- apps/web/src/app/provider/packages/provider-package-card.tsx
- apps/web/src/lib/customer/discovery/marketplace-types.ts
- apps/web/src/lib/customer/discovery/package-discovery-service.ts
- apps/web/src/lib/customer/discovery/public-package-normalization.ts
- apps/web/src/lib/customer/discovery/verified-package-v2.ts
- apps/web/src/lib/provider/provider-package-v2-client.ts
- apps/web/test/components/customer-package-v2-discovery.test.ts
- apps/web/test/components/provider-package-management.test.tsx
- apps/web/test/components/provider-package-v2-adapter.test.ts
- functions/pnpm-lock.yaml
- functions/src/packages/customer-package-v2.ts
- functions/src/packages/food-choice-groups-v2.ts
- functions/src/packages/provider-package-drafts-v2.ts
- functions/test/function-security-contract.test.cjs
- functions/test/legacy-package-publication-guard.test.cjs
- functions/test/provider-package-v2-booking.test.cjs
- functions/test/provider-package-v2-persistence-simulated.test.cjs
- functions/vendor/feasta-shared-types-0.1.0.tgz
- functions/vendor/shared-types-manifest.json
- packages/shared-types/dist/customer-package-v2.cjs
- packages/shared-types/dist/customer-package-v2.cjs.map
- packages/shared-types/dist/customer-package-v2.d.cts
- packages/shared-types/dist/customer-package-v2.d.cts.map
- packages/shared-types/dist/provider-package-v2.d.cts
- packages/shared-types/dist/provider-package-v2.d.cts.map
- packages/shared-types/src/customer-package-v2.cts
- packages/shared-types/test/customer-package-v2.test.mjs
- packages/shared-types/test/provider-package-v2-freeze.test.mjs
- pnpm-lock.yaml
- apps/customer_mobile/test/package_v2_compatibility_test.dart
- docs/phase3b-production-publication-release-review.md
