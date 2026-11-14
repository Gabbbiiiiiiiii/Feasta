# FEASTA Stage D: private canonical V2 package drafts

Verified base: `feat/catering-package-enhancements` at `3486b126e836071fd0abc00e16f1f928788a3b14`.
Implementation is local and uncommitted. No deployment, feature activation, dependency installation, Mobile changes, or production writes were performed.

## Files

- `functions/src/packages/provider-package-drafts-v2.ts`: separate V2 create, update and atomic completion handlers.
- `functions/src/packages/provider-package-editor-progress.ts`: completed progress remains owner-readable; incomplete listing excludes completed records before its limit.
- `functions/test/emulator/provider-package-drafts-v2.integration.cjs`: real Auth/Firestore emulator coverage.
- `firebase.package-drafts.test.json`: isolated loopback Auth/Firestore emulator configuration, no Functions deployment configuration.
- This report.

## API contracts

These handlers are deliberately **not exported from `functions/src/index.ts`**. The existing deployed legacy create/update APIs are unchanged. The new logical names are:

| Handler | Request | Response |
| --- | --- | --- |
| `createProviderPackageV2` | Existing shared `CreateProviderPackageV2Request` | Existing shared `PackageMutationV2Response` |
| `updateProviderPackageV2` | Existing shared `UpdateProviderPackageV2Request`, including packageId and expectedRevision | Existing shared `PackageMutationV2Response` |
| `completeProviderPackageEditorDraft` | Existing shared `CompletePackageEditorDraftRequest`; expectedPackageRevision must be null | Existing shared `CompletePackageEditorDraftResponse` |

Create/update accept full canonical replacement payloads, not patches. Writable occasion fields are only occasionSchemaVersion:2, occasionScope and occasionIds. Shared contract version and offer schema version must be 2. Optional pricingModel remains absent for the existing tier-price interpretation, or is per_pax/per_bundle. At least one existing catering service tier is required. Minimum tier price must equal package price. Tier-specific and shared inclusion fields retain the existing V2 normalization and bounds. Unknown fields, server-owned flags, caller identity, revisions/projections and scalar eventType claims are rejected.

A missing or false `contractPolicies/providerPackageV2.featureGates.packageDraftWrites` disables all three operations. Policy revision, project binding and configured occasion/theme limits are required. This is an independent private-write gate; no policy is initialized or changed by these handlers. Stage C progress saves retain their separate gate.

## Actual Firestore schema

Canonical records are stored in **`packages/{serverAllocatedPackageId}`**, not in the progress collection:

- Identity/version: providerId derived from the authenticated user's approved owned provider; sharedContractVersion:2, occasionSchemaVersion:2, offerSchemaVersion:2, revision:1 on create, incremented once per update.
- Content: name, description, canonical serviceCategoryCode, minimumGuests, maximumGuests, themeOptions, imageUrl and optional imageUrls.
- Offer: price, optional pricingModel, serviceOptions keyed by drop_off/buffet_setup/full_service; shared foodInclusions/serviceInclusions/decorInclusions/furnitureInclusions and optional equipmentInclusions. Tier options retain their own inclusion contributions.
- Occasion: occasionScope, occasionIds (empty for all), server-derived eventType, occasionMatchIds, occasionCatalogRevision, providerEligibilityRevision, occasionEligibilityState:'valid'.
- Payment: existing canonical paymentPolicy/depositPercentage/downPaymentPercentage, paymentTermsSchemaVersion:2, balanceDueDaysBeforeEvent:null and server-derived balanceDueHoursBeforeEvent (existing constant for deposit terms, null for full payment).
- Private lifecycle: status:'draft', isActive:false, isPublished:false, providerPubliclyVisible:false, publishedAt:null, isDeleted:false, deletedAt/deletedBy/deletionReason:null.
- Audit: createdAt/updatedAt native Firestore timestamps, createdBy/updatedBy from authenticated UID. Updates preserve creation metadata.

Full updates replace options and inclusions and explicitly delete omitted pricingModel/equipmentInclusions/imageUrls. The request's idempotency key is not stored on the package.

Private `providerPackageV2Operations/{sha256(actor,operation,key)}` records atomically retain actorUid, providerId, deterministic requestHash (object key order independent), original result and createdAt. Create and completion use distinct operation identities. There is no TTL or automatic ledger deletion in this slice.

## Authorization, concurrency and compatibility

Auth, active Auth account/profile, provider role, App Check, approved provider ownership and operational status are required. Profile access is rechecked inside the canonical transaction. Existing rate limiting is retained: V2 create and completion share 20 requests/hour; V2 update allows 60/hour. Existing maintenance admission checks and admission write are used.

The transaction reads the current stable occasionCatalog/current generation, protected providerEligibilityAuthorities sidecar grants/revision, active canonical service category and current provider category/capacity. It never treats legacy eventTypesSupported as an explicit V2 grant. It resolves all selected occasions against approved active applicable records. Fits All requires every applicable active occasion to be approved. The active catalog scan fails closed above 1,000 records. Catalog, capability and category reads belong to the same transaction as the package write, so concurrent authority changes force retries/revalidation. Clients do not supply expected catalog/capability revisions in the frozen package mutation contract; stored projections pin the authoritative revisions read on commit.

Package updates require matching expectedRevision, complete V2 markers, owned draft status, no deletion and all private visibility flags. Published/archived/legacy/partial envelopes cannot be migrated through this writer. A same-key replay is reauthorized and returns the original recorded result before checking changed package/editor revisions or current occasion eligibility; changed payload conflicts. Current write policy and maintenance checks still apply to replays, matching Stage C behavior.

Existing canonical payment-policy bounds, provider guest capacity and theme compatibility checks remain in force. Direct URL media uses the existing Cloudinary ownership/resource verifier for every submitted URL, including retained images; external verification occurs before the Firestore transaction and is skipped on an existing operation-ledger hit. No new upload, asset ownership claim, scalable gallery, deletion or evidence lifecycle is introduced. Four theme images remain the ceiling, additionally bounded by server policy. Live successful Cloudinary verification was not exercised; negative foreign URL validation and existing image regressions were exercised.

Legacy create/update/publish code, public readers, booking/payment code and Firestore rules are unchanged. Existing rules deny direct package mutations and require publication projections for public access. Existing legacy editing, publication and booking fences continue to reject V2; this implementation does not publish or grant marketplace eligibility.

## Stage C completion

Only unbound incomplete progress is supported. Completion reads the saved payload; it accepts no replacement content from the client. It strictly converts numeric text, derives the minimum enabled tier price when Stage C omitted priceText, preserves all enabled tier contributions/theme text, and uses canonical full-payment terms when selected. Unverified editor asset IDs remain rejected. Completion does not infer migration or binding to an existing package.

One transaction creates the canonical package, marks the progress record completed, sets completedPackageId/completedPackageRevision, increments its revision, releases one incomplete-draft quota slot and records the original response. The original progress payload, step and creation timestamp remain intact. Completed records remain retrievable by their owner; save/discard cannot overwrite them, and they are excluded from incomplete listing before the 20-record limit. Concurrent same-key completion returns one package identity; another key cannot complete an already completed record. Failed validation leaves progress and quota unchanged. No cleanup/retention change is introduced.

## Validation

- Direct existing Functions TypeScript compiler: compilation and noEmit checks passed; no package-manager build/install invoked.
- Combined Stage C + Stage D Auth/Firestore emulator tests: **22 passed, zero failures/skips**, project `demo-feasta-stage-d`, loopback endpoints only. Includes create/update, Per Pax/Fixed Bundle/all three tiers, full replacement, invalid pricing/selection, provider ownership, blocked/disabled accounts, App Check, stale/concurrent revisions, replay/conflict, authority transition, gates/maintenance, foreign media, atomic completion/recovery, quota and rate limits, legacy create/edit and V2 publication rejection.
- Targeted existing Functions regressions: **72 passed, zero failures/skips** (V2 validators, progress parsing, package management/pricing/images/payment terms, legacy publication guards and booking offer behavior).

Reproduce without dependency installation:

```powershell
node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json
node functions/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.package-drafts.test.json --project demo-feasta-stage-d --only auth,firestore "node --test --test-concurrency=1 functions/test/emulator/package-editor-progress-v2.integration.cjs functions/test/emulator/provider-package-drafts-v2.integration.cjs"
```

## Remaining Web integration

Review backend changes first. Then separately wire the new V2 request/response adapter, draft revision loading, completion action and conflict/replay recovery. Prevent the legacy editor from opening V2 drafts until compatible editing exists. Keep saved-progress recovery available after completion. Add native callable transport/browser acceptance and successful owned-media validation in an approved isolated environment. Review the ownerUid+state equality query against deployed index configuration before release. Callable entry-point exports, rollout policy, legacy migration/bound editing, gallery asset attachment, publication and customer booking activation remain separate work; nothing here authorizes enabling them.
