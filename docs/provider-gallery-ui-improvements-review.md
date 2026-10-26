# Provider Web UI improvements review

Base: feat/provider-setup-gallery-v2-ui at 6a7245573295800bc832829731c6ee29fea145a4.

## Assessment

| Feature | Assessment | Result |
| --- | --- | --- |
| Occasion selection | PASS local UI / BLOCKED V2 persistence | Responsive native toggle buttons with aria-pressed, multiple selections, keyboard activation, 44px touch targets, authority validation, selection limit and separate Fits All. Saved unavailable IDs remain removable. |
| Add Occasion | PASS gated UI / BLOCKED live workflow | The Add Occasion dialog explains that submission and history are unavailable. Contract-matched adapter and request/history UI exist, but a frontend guard blocks both calls before Firebase initialization until backend integration is verified. No fictional statuses. |
| Gallery presentation | PASS implementation | Responsive 4:3 cover cards, photo counts, full photo preview dialogs in the existing responsive uploader; existing ordering, modal scrolling, empty/loading/restricted states retained. Visual browser review remains outstanding. |
| More than four theme images | BLOCKED | Safe four-image limit preserved, helper text explains it. Existing ordering and new previews work within the contract. |
| Tier pricing presentation | PASS | Enabled/disabled tier summary, current PHP unit price, tier-specific inclusion labels; existing money parsing preserved. The production wizard no longer renders the calculator or estimated guest subtotals. |
| Structured tier decorations/furniture/equipment | BLOCKED browser integration | Draft V2 types/validator exist, but the current browser serializer and legacy actions do not round-trip them. Implementation plan below. |
| V1 compatibility and security boundaries | PASS focused tests | Legacy editor and payload serializers unchanged; no release gate, backend, rules, booking or customer flow changes. |

## Already implemented and preserved

Gallery full replacement serialization, ownership checks, image verification, three authoritative revisions, explicit draft reconciliation, mixed V1/V2 records, V1 event types, saved occasion IDs, restricted publication, and canSave/canPublishV2 checks remain intact. Local draft preparation is permitted while saving is disabled. Closing/discarding still discards the local draft.

Catalog uploader already supports file validation, responsive grids, removal, ordering, cover selection through first position, owner-scoped uploads at save time, and URL cleanup. Theme editor already retains draft images and supports ordered references. Package editor retains independent tier prices, one-per-line tier service notes, shared inclusions, minimum enabled starting price and pricing models. Arithmetic helpers and the reusable preview component remain tested; the production wizard does not render the calculator.

## Exact backend coordination for Gabriel

### Theme image limit

The current chain is:

- apps/web/src/app/provider/packages/provider-package-offer-builder.tsx: serializer rejects theme.images.length > 4; theme uploader maximumImages is 4. Serialization happens before uploadProviderPackageThemeImages, which uses uploadCatalogImages.
- apps/web/src/lib/catering/package-offer-configuration.ts: normalizePackageThemeOptions uses safeHttpsUrlList(raw.imageUrls, 4). A frontend-only increase would silently truncate saved references on reload.
- apps/web/src/lib/provider/provider-package-client.ts: existing write includes themeOptions; read uses normalizePackageThemeOptions. Public normalization uses the same theme normalization.
- packages/shared-types/src/provider-package-v2.cts: themeOptions imageUrls is a readonly string array without an encoded numeric limit. A shared documented numeric policy and boundary tests are needed.
- functions/src/packages/package-domain.ts: MAX_THEME_IMAGES = 4, used by parseThemeOptions. The media verification path verifies package and theme URLs together; the new maximum must retain verification for every image.
- apps/web/src/lib/provider/catalog-media.ts and catalog-image-uploader.tsx: JPEG/PNG/WebP and 5 MB each remain required. Generic package/gallery maximums must stay unchanged.

Before an increase, agree on the new per-theme maximum N (not selected by this change), approve aggregate limits for up to 12 themes, verification latency and payload/storage budgets, update backend acceptance and normalization together, add a shared explicit policy, then update both UI references. Add N accepted/N+1 rejected, full N-image save/load round trip, reordered cover, mixed retained/new uploads, ownership failure, retry and historical four-image compatibility tests. Verify legacy and V2 package writers, public reads and media checks without enabling any release gates.

### Occasion suggestions

Existing submitProviderOccasionSuggestion requires name (2..80 chars, NFKC), optional reason (0..500), and idempotencyKey. listMyOccasionSuggestions accepts status/cursor/pageSize (max 20); statuses are pending, approved, rejected, mapped. Submission uses App Check, authenticated linked provider identity, policy featureGates.occasionSuggestionWrites, effective environment and positive policy revision, pending/daily quotas (bounded at 3/5), duplicate handling and idempotency. Listing uses scoped signed cursors and a configured cursor secret.

Source verification (2026-10-26): functions/src/index.ts exports both callables from functions/src/packages/provider-occasion-suggestions-v2.ts. Request/response shapes match packages/shared-types/src/provider-package-v2.cts and the backend parsers in occasion-suggestion-v2-validation.ts and occasion-suggestion-v2-core.ts. Submission returns created, own_duplicate, canonical_match, or idempotent_replay with the recorded result. Listing returns ISO timestamp items and nextCursor; the browser requests ten items and forwards the opaque cursor. The browser uses the existing authenticated Firebase Functions client in asia-southeast1 and initializes the existing App Check/emulator client; no transport or backend contract is changed.

Request submission/history are distinct from activation and provider eligibility. Their UI supports name/reason validation, result messages, retry identity within the mounted gallery session, duplicate feedback, review remarks, history pagination and safe errors. These flows are verified with mocked callables only. This is implementation evidence, not proof of deployed or operational endpoints.

No deployed environment, callable availability, App Check configuration, feature policy, cursor-secret binding, query-index readiness or live authenticated round trip was verified. The gallery authority response does not expose request availability. Therefore occasionRequestsAvailable() returns false in the frontend adapter, both transport operations reject before Firebase initialization, and the production dialog presents an explanatory message without form or history requests. Tests explicitly mock availability for isolated request UI coverage; separate tests verify the production block. Gabriel must verify those dependencies and approve a release availability mechanism before enabling either browser operation. Listing requires the configured FEASTA_OCCASION_SUGGESTION_CURSOR_HMAC_KEY and authenticated provider scope; it does not use the submission write-policy gate.

Suggestion approval or mapping must never grant provider capability or imply catalog activation. New approved occasions are created inactive by the review callable. Approved active category applicability, explicit provider eligibility and authoritative catalog/provider revisions remain separate requirements. Package multi-occasion persistence and Fits All remain blocked; Gallery V2 retains its existing false writer-coverage and public-V1-compatibility gates and canPublishV2=false. No protected integration gate was enabled.

### Tier-specific structured inclusions

packages/shared-types/src/provider-package-v2.cts ServiceOptionV2 and functions/src/packages/offer-v2-validation.ts support optional decorInclusions, furnitureInclusions and equipmentInclusions per tier. V2 resolution combines shared and selected-tier inclusions using shared-first rules. Existing browser PackageServiceOption in package-offer-configuration.ts contains only price and includedServices; normalization drops other fields, and serializeProviderPackageOfferDraft returns that legacy shape. Sending new fields through the current legacy browser actions would not establish a supported round trip.

Implementation plan: approve browser use of the complete V2 create/update and draft adapters, including offerSchemaVersion, sharedContractVersion, idempotency and expected revisions; verify deployed writer/read normalization and publication restrictions. Extend the V2-only draft type, normalization and serializer together. Render separate per-tier decor/furniture/equipment inputs with shared inclusions shown distinctly. Test shared-first deduplication, disabled tiers, preserved historical shared fields, reopening saved V2 records and rejected unsupported legacy writes. Keep V1 actions and saved records unchanged. Current per-tier includedServices stays supported but is not relabeled as structured decorations/furniture/equipment.

## Files changed

- apps/web/src/app/provider/packages/provider-setup-gallery-v2-manager.tsx
- apps/web/src/app/provider/packages/provider-package-offer-builder.tsx
- apps/web/src/components/provider/catalog-image-uploader.tsx
- apps/web/test/components/provider-setup-gallery-v2-manager.test.tsx
- apps/web/test/components/provider-package-offer.test.tsx
- docs/provider-gallery-ui-improvements-review.md

## Historical validation (superseded by the finalization handoff)

Initial focused gallery/V1/offer tests: 87 passed. Expanded run including new coverage and package catalog: 105 passed, 14 package-catalog failures. All failures are confined to the documented baseline catalog suite (legacy modal/stepper assumptions, hidden inclusion/theme content and old save controls); no new focused failures. Final focused regression and static check results recorded below.

The initial pnpm exec attempt refused an automatic dependency reinstall because no TTY was available. Validation uses the already installed node_modules/.bin tools directly, without changing dependencies.

No commit, push, merge, rebase, deploy, live request or gate activation performed. Browser visual/device testing and live backend integration were not performed.

Final regression: 116/116 tests passed across seven focused suites. Web TypeScript and targeted ESLint passed after correcting readonly-array construction in the new test fixtures. git diff --check passed.

## Finalization validation

The current finalization run passed 255 tests across 20 suites, web TypeScript, targeted ESLint and git diff --check. The earlier 14 catalog failures above are resolved by navigating the current wizard and retaining the existing payload, payment, upload and modal assertions. See provider-package-creation-requirements-handoff.md for current feature availability, exact dependencies and the 20-file commit manifest. Request/history are implemented behind a frontend block; live backend operation and visual/device browser behavior were not verified. No backend or protected release gate was enabled.
