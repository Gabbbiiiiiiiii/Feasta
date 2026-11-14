# Package Creation implementation and Gabriel handoff

Updated: 2026-10-26 (Asia/Manila)
Worktree: C:/Users/Pia/feasta-provider-v2
Branch: feat/provider-setup-gallery-v2-ui

## Finalization status for integration

Reviewed the original 19 UI/test/documentation files and the necessary provider-package-catalog.test.tsx regression update (20 files total). No unrelated work was identified. The previous 14 catalog failures came from pre-wizard navigation, old food textarea/money input queries and missing discard confirmation. Tests now navigate visible steps and retain payment, inclusion, media, upload, final-save and focus assertions.

Implemented and locally verified: five-step package creation/editing, Per Pax and Per Bundle (fixed guest-range bundle) decimal tier prices, independent tier service notes, minimum enabled starting price, payment/deposit and capacity checks, categorized included dishes, theme/media editing, cover ordering, full-image preview/focus restoration, occasion chips and scalar single-occasion save guards. Canonical pricing models remain draft-only; legacy fixed-price records remain supported. Production wizard has no guest calculator or estimated subtotal.

Implemented but not verified live: request submission and request-history UI plus the adapter matching submitProviderOccasionSuggestion and listMyOccasionSuggestions in local backend source. Production browser calls are explicitly blocked by occasionRequestsAvailable() until deployment, App Check, policy, cursor-secret/index readiness and authenticated round trips are verified. Mock tests cover the prepared workflow; guard tests cover its unavailable production behavior. This release does not depend on live suggestion endpoints.

Waiting for Gabriel: separately verify and approve request/history availability; activate approved catalog occasions and grant explicit provider eligibility; integrate revisioned V2 package writes/readers and customer discovery/booking snapshots before multi-occasion or Fits All persistence; approve pricing-model customer compatibility before publication; integrate food-choice groups, structured tier decor/furniture/equipment and agreed theme image limits above four. Gallery V2 protected write/publication gates stay unchanged and disabled. Backend contracts, Firestore rules and customer flows are unchanged. No deployment or release activation is part of this review.

See provider-gallery-ui-improvements-review.md for exact callable contracts and dependencies. Final validation commands/results and the commit file manifest are recorded below. Historical validation sections describe earlier iterations only.

## Current Step 1 chip UI implementation

Package Creation now displays the existing eventType as a removable chip, with a supported-occasion selector and Add button. Each chip has an accessible X button, approved choices already selected are disabled, and Add verifies membership and deduplicates again in state. Enter on the selector adds the choice without submitting the form; native Add/remove buttons support keyboard activation. After adding or removing, focus returns to the selector. No free-text input, new catalog lookup, capability grant or request submission is part of the selector.

The only choice source is the editor's existing EVENT_TYPES intersected with eventTypesSupported from the authorized provider page. This preserves the existing frontend eligibility boundary; it is not a new V2 catalog or Fits All authority contract. Existing unavailable historical event values remain visible as "no longer supported" chips for explicit removal/correction, rather than being silently replaced or mapped to other. Backend authorization remains authoritative.

Multiple chips are editing-session state only. The validation message states that multiple occasions cannot be saved and requires keeping one to continue. Closing discards unsaved chip edits. Step 1 cannot advance until exactly one supported chip remains. The final submit guard independently rejects zero, multiple or unsupported selections before media upload or create/update calls. eventType is derived only when exactly one chip exists; there is no primary-choice fallback for a multi-selection and no chip array is serialized. The unchanged explicit ProviderPackageInput payload saves that single scalar through the existing create/update API. Existing validation, image ownership workflows, pricing and publication restrictions remain. There is no localStorage or durable draft persistence for these chips.

Fits All has no selectable option because current inputs cannot verify eligibility across every applicable active occasion. The separate Add Occasion entry point remains in Setup Gallery. Its dialog and adapter now block production submission/history until backend integration readiness is verified; the package selector does not invoke them. The finalized catalog selection, activation and provider-eligibility rules below still define the future persistent functionality.

Gabriel still needs to integrate WritableOccasionV2/PackageV2Write and revisioned create/update/read adapters, authoritative catalog/category/eligibility validation and server-derived match IDs, then customer discovery, availability, booking validation and immutable snapshots before multiple chips or Fits All can be persisted. This UI change does not activate those contracts. Food-choice, structured-tier-inclusion and increased-theme-image requirements below remain unchanged.

Files changed for this chip UI request only:

- apps/web/src/app/provider/packages/provider-package-form.tsx
- apps/web/test/components/provider-package-occasion-chips.test.tsx (new)
- docs/provider-package-creation-requirements-handoff.md

Prior chip verification: six focused component suites passed (91 tests), including seven new chip tests, existing single-occasion creation/update compatibility, wizard/layout behavior, Setup Gallery selection/request functionality and the shared request dialog. TypeScript passed with --noEmit --incremental false. Focused ESLint and git diff --check are recorded in the final report. No production backend, shared contract, Firebase configuration or Customer Web/Mobile file was changed; existing dirty/untracked files were preserved. No dependency installation, commit, push, merge or deployment was performed.

## Prior implementation history

Removed the interactive price calculator from Step 2 and calculated guest subtotals from Step 5. Removed preview-only state, imports and review props. Kept Per Pax/Per Bundle, independent tier prices, minimum-derived starting price, payment/deposit inputs, capacity validation and publication gates. The reusable preview component and arithmetic helpers remain available and tested; production wizard code no longer imports the preview. No server calculation was changed.

Removed only Package Creation's OccasionRequestDialog import and entry point. Single supported eventType selection and existing create/update save behavior remain. Shared request component, suggestion adapter and Setup Gallery entry point remain intact. Persistent multiple-occasion saving was not enabled. The current Step 1 implementation above supersedes the old single-dropdown UI; the prior removal of Package Creation's request dialog entry point remains unchanged.

Clarified the scope of existing per-tier includedServices editors with accessible descriptions, and labeled the review's package-wide inclusions as shared. Separate tier service lists and prices already persist; they are not newly invented structured fields. Added regressions for payload boundaries, absence of calculator controls/subtotals and round-trip independence of tier services.

## Active contract evidence

- apps/web/src/lib/provider/provider-package-client.ts: ProviderPackageInput, build/normalize adapters use scalar eventType and flat foodInclusions; no food-choice group write/read contract.
- functions/src/packages/create-provider-package.ts and update-provider-package.ts: active allowlists accept scalar eventType, serviceOptions and shared food/decor/furniture/service lists. They do not accept occasion arrays, offerSchemaVersion or shared equipmentInclusions.
- functions/src/packages/package-domain.ts: active tier parser rejects every key except price/includedServices. Provider capability authorization remains authoritative.
- apps/web/src/lib/catering/package-offer-configuration.ts: web tier normalizer only retains price/includedServices. Adding structured fields solely to the editor would lose them on reload.
- packages/shared-types/src/provider-package-v2.cts explicitly labels its additive V2 definitions as draft, with no deployed activation implied. ServiceOptionV2/OfferV2 and functions/src/packages/offer-v2-validation.ts define tier decor/furniture/equipment, shared equipment, shared-first resolution and precise pricing, but the active legacy create/update writer does not call this parser.
- functions/src/packages/occasion-v2-validation.ts accepts approved catalog IDs, not arbitrary names. It requires active applicable category authority and explicit provider approval and derives eventType/match IDs/revisions. This matches the finalized approved-catalog selection policy, but still requires integration with a versioned package writer and readers before Package Creation can use it.
- functions/src/bookings/submit-booking-request.ts checks selectedFoods against a flat foodInclusions array, then resolves tier/theme via booking-package-offer.ts. This is membership validation, not group cardinality enforcement. booking-package-offer.ts contains the authoritative pricing calculation; it is unchanged.
- apps/web/src/lib/customer/discovery/public-package-normalization.ts excludes records with pricingModel set. Existing draft-only publication restrictions must remain until customer compatibility is approved.

## Proposed contracts: Gabriel approval and implementation required

The approved-catalog occasion behavior below is the finalized product requirement. Contract integration and the other proposed schemas still require Gabriel's implementation and review; no new functionality is enabled by this document.

### Finalized occasion selection: approved, provider-eligible catalog

Package Creation must allow multiple occasions from the administrator-approved, active occasion catalog, filtered to the provider's explicit eligibility and applicable active service category. Display every selected occasion as a removable chip with a keyboard-accessible X button labeled for that occasion. Prevent duplicate IDs in the UI and reject duplicate or unauthorized IDs on the server. Providers select existing catalog entries; unrestricted free-text occasion chips, provider-scoped occasion creation and automatic eligibility grants are not requirements.

Fits All Occasions is permitted only when the backend verifies eligibility for every active applicable occasion. It is not an unchecked wildcard or a shortcut around provider approval. Revalidate against current catalog and provider-eligibility revisions at save, publication and booking; catalog additions, deactivations or capability changes must trigger the existing revalidation policy. If eligibility is incomplete or cannot be verified, reject Fits All and return a clear recoverable error.

Preserve the separate Add Occasion request workflow for suggesting new occasions. A request is not a package selection. Suggestion approval or mapping alone must not make an occasion selectable: the canonical catalog entry must be approved, activated, applicable to the category and explicitly eligible for the provider. Refresh authoritative choices after those transitions; never infer eligibility from suggestion status or fabricate a catalog entry. Preserve Setup Gallery selection authority and its blocked request/history entry point until separately verified. This correction records the required future Package Creation workflow without changing its current UI.

Gabriel must connect the existing draft versioned contracts in packages/shared-types/src/provider-package-v2.cts through authenticated package create/update/read adapters:

```ts
// WritableOccasionV2, composed into PackageV2Write
{occasionSchemaVersion: 2, occasionScope: "specific", occasionIds: ["occasion_wedding", "occasion_corporate"]}
// Fits All uses an empty explicit ID list; the server resolves applicable matches.
{occasionSchemaVersion: 2, occasionScope: "all", occasionIds: []}
// CreateProviderPackageV2Request adds sharedContractVersion: 2 and idempotencyKey.
// UpdateProviderPackageV2Request also adds packageId and expectedRevision.
```

Use stable canonical IDs, not typed labels or comma-separated eventType text. The server enforces the configured maxSpecificOccasions, a nonempty distinct ID list for specific scope, an empty ID list for all scope, valid ID format, active approved catalog membership, category applicability and explicit provider eligibility. Reuse occasion-v2-validation.ts and authoritative server-loaded revisions; reject client-supplied derived eventType, occasionMatchIds, occasionCatalogRevision, providerEligibilityRevision or occasionEligibilityState. Keep strict version/unknown-field rejection, authorization, idempotent retries and optimistic concurrency. Do not send V2 occasion fields to the scalar legacy package writer.

Persist and round-trip scope/IDs, server-derived legacy primary eventType, occasionMatchIds, catalog/eligibility revisions and validity state through provider list/detail/editor readers and public projections. Catalog labels and aliases are display/search metadata; renaming must retain IDs. Stale or revoked selections remain identifiable for correction without being silently accepted. Publish only when authoritative eligibility and all existing publication restrictions pass.

Customer discovery must filter by authoritative occasion membership/match IDs rather than equality with one primary eventType. Update package list/detail projections, filters, search indexes, pagination and cache invalidation in Customer Web and Mobile; resolve labels from the public catalog and hide invalid/ineligible packages. Fits All discovery uses the server-resolved eligible applicable set, never arbitrary client matching.

Booking and availability checks must verify the requested event occasion against the current eligible package occasion set, including Fits All revalidation, and reject mismatched, inactive, stale or unauthorized selections. Define the versioned request's event-occasion ID and package revision together with legacy scalar compatibility. Persist the resolved event occasion ID/label, package revision and applicable occasion contract version in an immutable booking snapshot. Rechecks must use authoritative data and cannot trust client labels, eligibility flags or match lists.

Preserve existing single-event-type packages and bookings. Keep the V1 read/write/booking path supported until an approved migration is complete; map a legacy scalar to a single canonical ID only through an explicit server-owned mapping. Unmapped historical values remain historical values requiring review, never silently become other or acquire new eligibility. Preserve old booking snapshots and fixed pricing; do not rewrite history when catalog labels or package occasions change. Test V1/V2 coexistence, save/reload, duplicate and forged IDs, eligibility revocation, Fits All with incomplete eligibility/catalog changes, suggestion approval without activation or eligibility, discovery membership and booking event matching.

### Customer-selectable food

Proposed package field:

```ts
foodChoiceSchemaVersion: 1;
foodChoiceGroups: Array<{
  id: string;                 // stable opaque ID, preserved on edits
  name: string;
  minSelections: number;
  maxSelections: number;
  options: Array<{id: string; name: string}>;
}>;
```

Keep foodInclusions as always-included dishes, separately rendered. Proposed bounds: 12 groups/package, 50 options/group, group name 2-80 characters, option name 1-160 characters, IDs matching an agreed bounded safe identifier format. Enforce unique group IDs package-wide and option IDs within each group; reject normalized duplicate names within a group. Enforce integer 0 <= min <= max <= options.length, max >= 1; required means min > 0, optional means min = 0, exactly N means min = max = N. The request examples use Dessert 1/1 and Main Dishes 2/2. No redundant required flag is needed. Reordering retains IDs; renaming retains IDs; deleting/replacing groups/options increments package revision and invalidates stale unsent selections.

Proposed booking input: packageRevision plus foodChoices: [{groupId, optionIds: string[]}]. Reject unknown or duplicate groups/options, options belonging to another group, missing required groups, out-of-range counts, disabled/unpublished packages, unauthorized provider/package relations and stale revisions. Missing optional groups resolve to empty lists; required groups cannot be omitted. Perform validation from authoritative package data in the booking transaction, including edit/resubmit flows; client validation is for usability only.

Server persists an immutable booking snapshot containing package ID/revision, food-choice schema version, group IDs/names/min/max, offered option IDs/names and selected IDs/names, plus always-included dishes. Retain snapshots across package edits/deletion and booking retries, and render them for customer/provider booking detail and confirmations. Snapshot creation must be atomic with booking and financial agreement creation and idempotent on retry.

Initial pricing proposal: every offered choice is included in the selected tier price, with no surcharge and no price fields accepted in customer choice input. If paid substitutions are needed, define explicit server-owned option price adjustments, currency/centavo bounds, tier applicability and snapshot totals before activation. Apply them to authoritative subtotal/deposit/balance/refund/payment agreement calculations; never trust a client total. Existing flat selectedFoods values must not be interpreted as group choices.

### Structured inclusions for each enabled catering tier

Integrate existing ServiceOptionV2 fields through an approved end-to-end writer/reader before enabling controls:

```ts
serviceOptions[tier] = {
  price,
  includedServices,       // services for this tier
  decorInclusions,
  furnitureInclusions,
  equipmentInclusions,
};
```

Retain shared package serviceInclusions/decorInclusions/furnitureInclusions and optional equipmentInclusions separately. Use current V2 inclusion limits (50 strings/list, 1-160 characters, normalized duplicate removal). At booking resolve shared items first, followed by the selected tier's items, deduplicating consistently; never include items from another tier. Store resolved lists and source tier/package revision in immutable booking snapshots. Independent price and starting-price-minimum validation remain authoritative. Unchecking a tier excludes it from the saved offer; editor can retain local unsaved text for re-enabling, but server rejects unavailable booking tiers.

Update active create/update allowlists, package-domain parsing, canonical storage, V2 adapter/version routing, provider client types/normalizers, editor hydration/serialization, public projections and booking resolver together. Do not pass V2 fields to legacy callables. Missing arrays on historical records mean empty tier-specific lists; historical shared lists retain their scope and legacy fixed pricing is preserved. No bulk migration may rewrite old booking snapshots. Use expected revision checks to prevent stale editors from erasing newer structured fields.

### Increased theme-image limits (retained requirement)

Keep the requested increase beyond four reference images per theme in the backend handoff. The target maximum N remains to be agreed with Gabriel; this documentation correction does not choose a new limit or change the existing four-image behavior. See docs/provider-gallery-ui-improvements-review.md, Theme image limit, for the existing dependency review.

Update the per-theme limit consistently in package-domain.ts (MAX_THEME_IMAGES), legacy and V2 writers, provider-package-offer-builder.tsx serialization/uploader limits, package-offer-configuration.ts normalization and public/customer readers. Define the numeric policy in the shared contract documentation and tests; an array type alone does not encode a maximum. Approve aggregate budgets for up to 12 themes, payload/storage size and verification latency. Preserve JPEG/PNG/WebP, 5 MB per image, owner verification for every retained/new image, ordering/cover behavior and unrelated package/gallery limits. Require N accepted/N+1 rejected, full save/reload without truncation, reordered cover, mixed uploads, ownership failure, retry and historical four-image compatibility tests before activation. Customer Web and Mobile must render the expanded list without silently truncating it.

### Customer Web and Mobile work

Both clients need multi-occasion package discovery/detail labels and filters, updated event matching/availability, separate included-food and food-choice UI, accessible exact/min/max selection feedback, persisted customization state and valid booking payloads, stale-revision recovery, and immutable booking snapshot presentation. Both need selected-tier structured/resolved inclusion presentation and pricing-model compatibility before publication is unlocked. Cover provider booking detail/confirmations too. Customer Mobile is unchanged in this task; it needs a separately approved implementation after the contract is finalized.

### Security, compatibility and activation checks

Retain auth/role/owner/provider verification, active category/capability checks, App Check, rate limits, image ownership, idempotency, revisions, strict unknown-field rejection, payment terms and publication restrictions. Catalog selection and suggestion approval must not grant category/provider privileges. Reject customer-supplied resolved labels, eligibility, server revisions, totals or inclusion snapshots. Publish/read projections must exclude invalid or ineligible packages. Catalog deactivation/capability revocation must revalidate affected packages and discovery entries without rewriting historical bookings.

Required acceptance coverage: provider save/reopen/edit for each new field, normalization/alias races/idempotency, forbidden fields and cross-owner edits, no fake eligibility, discovery filtering, booking cardinality/membership/stale revisions, snapshot stability after package changes, selected-tier isolation, V1-only readers/writers and historical records, exact centavo totals and unchanged deposit/balance rules. Enable only after approved contracts, deployed server support and Customer Web/Mobile compatibility are demonstrated; no release flag is changed here.

## Files changed by the prior implementation

- apps/web/src/app/provider/packages/provider-package-form.tsx
- apps/web/src/app/provider/packages/provider-package-review.tsx
- apps/web/src/app/provider/packages/provider-package-offer-builder.tsx
- apps/web/test/components/provider-package-management.test.tsx
- apps/web/test/components/provider-package-wizard-ux.test.tsx (pre-existing untracked file)
- apps/web/test/components/provider-package-layout-refinement.test.tsx (pre-existing untracked file)
- apps/web/test/components/provider-package-offer.test.tsx
- docs/provider-package-creation-requirements-handoff.md (new)

Other dirty/untracked files predate this task. Existing docs/provider-package-wizard-ux-review.md describes the previous preview behavior and is historical; this report supersedes it for current calculator behavior. No Functions, Firestore rules, shared contracts, Customer Web or Mobile files were edited. No dependencies installed, commit, push, merge or deployment performed.

## Prior implementation verification

- Focused component suites: 8 files, 112 tests passed initially. After adding the round-trip regression and payload assertions, the two affected suites passed again (8 tests). Total unique focused cases: 113 passing.
- Suites: provider-package-management, provider-package-offer, provider-package-wizard-ux, provider-package-layout-refinement, provider-package-pricing-inputs, provider-package-editor-refinement, provider-setup-gallery-v2-manager, occasion-request-dialog.
- TypeScript: node node_modules/typescript/bin/tsc --noEmit --incremental false passed.
- Targeted ESLint on the three changed production components and four changed test files passed.
- git diff --check passed; Git emits existing LF/CRLF conversion notices.
- Tests use existing local node_modules via direct node invocation. Initial pnpm invocations were blocked by PowerShell script policy; pnpm.cmd then attempted an automatic install that was blocked by sandbox permissions. No dependency installation completed; subsequent checks bypassed package-manager bootstrap entirely.
- No browser visual review or deployed integration test was performed. Server contracts were inspected locally, not activated.

## Prior implementation git status --short

The pre-existing dirty/untracked files listed below remain preserved. Only the files named in the task-specific change list above were edited by this task.

```text
 M apps/web/src/app/provider/packages/provider-package-food-menu.tsx
 M apps/web/src/app/provider/packages/provider-package-form.tsx
 M apps/web/src/app/provider/packages/provider-package-offer-builder.tsx
 M apps/web/src/app/provider/packages/provider-package-review.tsx
 M apps/web/src/app/provider/packages/provider-setup-gallery-v2-manager.tsx
 M apps/web/src/components/provider/catalog-image-uploader.tsx
 M apps/web/test/components/provider-package-management.test.tsx
 M apps/web/test/components/provider-package-offer.test.tsx
 M apps/web/test/components/provider-setup-gallery-v2-manager.test.tsx
?? apps/web/src/components/provider/occasion-request-dialog.tsx
?? apps/web/src/lib/provider/provider-occasion-suggestions.ts
?? apps/web/test/components/catalog-image-uploader-focus.test.tsx
?? apps/web/test/components/occasion-request-dialog.test.tsx
?? apps/web/test/components/provider-package-layout-refinement.test.tsx
?? apps/web/test/components/provider-package-wizard-ux.test.tsx
?? docs/provider-gallery-ui-improvements-review.md
?? docs/provider-package-creation-requirements-handoff.md
?? docs/provider-package-wizard-ux-review.md
```

## Prior documentation correction: finalized occasion requirement

Only docs/provider-package-creation-requirements-handoff.md was edited for this correction. Replaced unrestricted free-entry proposals with multiple administrator-approved, active, provider-eligible catalog selections and removable X chips; documented server-verified Fits All, separate requests, activation/eligibility gates, V2 package integration, discovery/booking changes and V1 compatibility. Food-choice and tier-inclusion requirements are unchanged; the increased theme-image requirement is explicitly retained above. Production code, backend, shared contracts, Firebase configuration and UI behavior are unchanged. Existing modified/untracked files remain preserved; no commit, push, merge or deployment was performed.


## Final validation and commit manifest

- Component regression: 20 suites, 255 tests passed, zero failures. Includes catalog, both pricing-model creation/editing cases, tier serialization, publication restrictions, payment/capacity guards, single-occasion save and stale eligibility, gallery V1/V2 compatibility and protected writer gates, image upload/focus, and request/history UI plus production blocking.
- Command from apps/web: node node_modules/vitest/vitest.mjs run test/components/provider-package test/components/provider-setup-gallery test/components/catalog-image-uploader-focus.test.tsx test/components/occasion-request-dialog.test.tsx --maxWorkers=2 --reporter=dot.
- TypeScript: node node_modules/typescript/bin/tsc --noEmit --incremental false passed.
- Targeted ESLint passed for all eight production files and related package, gallery-manager, uploader-focus and occasion-dialog tests, using node node_modules/eslint/bin/eslint.js from apps/web.
- git diff --check passed. Existing LF/CRLF conversion notices are informational.
- The 14 previously recorded catalog failures are resolved by updating test interactions to the current wizard; payload, payment, media, upload, modal safety and focus checks remain.
- No dependency installation, live request, backend deployment, environment activation, backend contract/rules edit, customer integration or visual/device browser review was performed. Local tests do not establish deployed availability.
- Branch verified: feat/provider-setup-gallery-v2-ui. Remote feature branch matched the local base commit before staging. Commit title: feat(provider): finalize packages and services UI. Push confirmation and full commit hash are provided in the final integration report after the Git operations.

The reviewed manifest contains the original 19 files plus the necessary catalog regression update:

- apps/web/src/app/provider/packages/provider-package-food-menu.tsx
- apps/web/src/app/provider/packages/provider-package-form.tsx
- apps/web/src/app/provider/packages/provider-package-offer-builder.tsx
- apps/web/src/app/provider/packages/provider-package-review.tsx
- apps/web/src/app/provider/packages/provider-setup-gallery-v2-manager.tsx
- apps/web/src/components/provider/catalog-image-uploader.tsx
- apps/web/src/components/provider/occasion-request-dialog.tsx
- apps/web/src/lib/provider/provider-occasion-suggestions.ts
- apps/web/test/components/catalog-image-uploader-focus.test.tsx
- apps/web/test/components/occasion-request-dialog.test.tsx
- apps/web/test/components/provider-package-catalog.test.tsx
- apps/web/test/components/provider-package-layout-refinement.test.tsx
- apps/web/test/components/provider-package-management.test.tsx
- apps/web/test/components/provider-package-occasion-chips.test.tsx
- apps/web/test/components/provider-package-offer.test.tsx
- apps/web/test/components/provider-package-wizard-ux.test.tsx
- apps/web/test/components/provider-setup-gallery-v2-manager.test.tsx
- docs/provider-gallery-ui-improvements-review.md
- docs/provider-package-creation-requirements-handoff.md
- docs/provider-package-wizard-ux-review.md
