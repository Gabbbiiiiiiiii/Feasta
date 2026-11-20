# Package creation wizard UX review

Branch: feat/provider-setup-gallery-v2-ui. Existing uncommitted gallery, offer builder, uploader, and focus-restoration changes preserved. No backend, rules, release gates, or customer code changed.

## Implemented

The pricing model is in Step 2. The interactive calculator and Step 5 estimated guest subtotals have been removed. Step 5 retains a read-only review of entered tier prices. Price helpers and save payloads are unchanged. Step 1 follows name, suitable occasion/event type, service category, description. A single authorized category is displayed read-only and initialized for submission; multiple categories require selection. An existing nonmatching category remains selected and subject to existing authority validation rather than being overwritten. Existing names, descriptions, event values, inclusion arrays and pricing models retain their original state and serialization.

Step 4 Next already uses type=button and handleSubmit returns before Step 5. Navigation implementation is unchanged. New regression exercises valid fields through all five steps, premature form submissions, no media upload/create/update before final save, and explicit final creation with the legacy single eventType payload. Multiple-category selection is also covered.

The unsupported-backend save error mapping, draft-only controls, publication restrictions and server financial authority remain unchanged. The pricing-model publication notice moved with its control into Step 2.

## Backend coordination required

### Multiple occasions

The active ProviderPackageInput and package reader in apps/web/src/lib/provider/provider-package-client.ts persist one eventType. Legacy create/update allowlists in functions/src/packages/create-provider-package.ts and update-provider-package.ts do not provide this form a multi-occasion round trip. Shared provider-package-v2.cts defines WritableOccasionV2, PackageV2Write, revisioned V2 requests and a server-derived eventType/discovery projection. occasion-v2-validation.ts validates approved catalog/capability authority. This is partial integration evidence, not authorization to send an array through the legacy writer.

Before enabling persistence of multiple package occasion chips or Fits All: approve and connect browser V2 create/update/read adapters, sharedContractVersion=2, idempotency keys, expectedRevision, authoritative occasion/catalog/provider revisions, eligibility and applicable category filtering. Round-trip specific/all scope, preserve derived legacy eventType, and verify public discovery readers and historical V1 records. Confirm deployed callable/App Check and environment gates without enabling release gates. Package chips are local editing state and require exactly one supported occasion before navigation or saving. Add Occasion has a contract-matched adapter and mocked UI coverage, but production submission/history are explicitly blocked until deployment and integration readiness are verified (see provider-gallery-ui-improvements-review.md). Suggestion approval does not activate occasions or grant provider eligibility.

### Required food choices

OfferV2 and ExistingPackageWriteInput in provider-package-v2.cts still use foodInclusions:string[]. The browser package writer and package-domain parser use plain inclusion strings. functions/src/bookings/booking-package-offer.ts resolves service tier/theme selection; submit-booking-request.ts validates selectedFoods against packageData.foodInclusions through validatePackageSelections; these are flat inclusion membership checks, not required group cardinality rules. Customer submission types in apps/web/src/lib/customer/bookings/customer-booking-submission-client.ts do not establish required food-group selections. No complete provider-write/customer-select/booking-validate/snapshot contract was found.

Intended flow: provider adds an included dish OR a separate choice group, names the group, assigns stable option IDs and exact/min/max selection counts (Dessert: exactly one of Leche Flan, Fruit Salad, Buko Pandan). Customer sees included dishes separately and must satisfy each required group before booking. Server validates membership, duplicate/unknown IDs, limits and revision against authoritative package data; reject missing/stale selections. Agree on schema version, limits, stable IDs, edit/delete migration, V1 behavior, and whether choices have price effects. Approved provider and public reader adapters must round-trip groups. Booking request/validation and immutable booking/financial snapshots must capture resolved IDs/names/counts and authoritative price effects; retries, historical display and payment agreement calculations need compatibility tests. Never encode choice rules in food inclusion strings. No customer flow was changed or enabled.

### Tier inclusions

ServiceOptionV2 and functions/src/packages/offer-v2-validation.ts support per-tier decor/furniture/equipment with shared-first resolution. Browser PackageServiceOption in apps/web/src/lib/catering/package-offer-configuration.ts and serializeProviderPackageOfferDraft support only price/includedServices and would discard structured fields on reload. Approve complete V2 browser read/write/draft adapters and revision handling before editing those fields. Extend normalization, draft state and serialization together; test all tiers, shared-first deduplication, disabled tiers, save/reopen, rejected legacy writes and historical shared inclusions. Keep existing shared decorations/furniture/services unchanged; current supported tier service notes remain intact. The UI now explains shared scope.

## Historical validation (superseded by the finalization handoff)

- New wizard regression: 2/2 passed.
- Focused pricing/editor/offer/category, V1 gallery, V2 writer/manager, public compatibility and uploader focus suites plus package catalog: 157 passed, 14 failed across 11 files. All 14 failures are in provider-package-catalog.test.tsx and match the previously documented baseline test names. No new focused suite failures.
- Targeted ESLint: passed from apps/web. An additional invocation from repository root found no ESLint config; rerun from the web app uses its existing configuration.
- TypeScript: tsc --noEmit --incremental false passed. Initial incremental invocation failed only because sandbox permissions prevented writing tsconfig.tsbuildinfo.
- git diff --check: passed (Git emits an LF/CRLF conversion notice).
- screenshots.pdf was not found in the provider workspace or accessible reference workspaces. Screenshot annotation comparison and actual mobile/desktop browser visual review were not performed. Existing responsive grid/scroll classes are retained.

Files changed for this request: apps/web/src/app/provider/packages/provider-package-form.tsx; apps/web/test/components/provider-package-wizard-ux.test.tsx; docs/provider-package-wizard-ux-review.md. All other dirty files predate this task.

No commit, push, merge, rebase, reset, stash, clean, deployment or GitHub operation performed.

## Finalization validation

The current finalization run passed 255 tests across 20 suites, web TypeScript, targeted ESLint and git diff --check. The earlier 14 catalog failures above are resolved by navigating the current wizard and retaining the existing payload, payment, upload and modal assertions. See provider-package-creation-requirements-handoff.md for current feature availability, exact dependencies and the 20-file commit manifest. Request/history are implemented behind a frontend block; live backend operation and visual/device browser behavior were not verified. No backend or protected release gate was enabled.
