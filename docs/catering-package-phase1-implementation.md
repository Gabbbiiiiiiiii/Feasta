# Catering package Phase 1 implementation and gates

Date: 2026-10-28 (Asia/Manila). Repository: feasta-catering-package-enhancements.
Branch: feat/catering-package-enhancements. Starting and final HEAD: ab3bc0b9b54a15e682efab70062f003ba66a51fd.

## Existing implementation inspected

- The provider wizard already had removable occasion chips, keyboard support, legacy scalar initialization, and a guard rejecting multiple selections before navigation or saving.
- Legacy createProviderPackage/updateProviderPackage accept eventType, not the V2 occasion tuple. Unknown fields are rejected. Existing ownership, provider capabilities, category, image, payment, draft and publication checks remain authoritative.
- occasion-v2-validation.ts already defines specific/all validation, explicit provider grants, server-derived matching IDs and revision metadata. Occasion Lifecycle revalidation invalidates universal packages when newly applicable occasions lack grants.
- Occasion suggestion callables already handle authenticated approved ownership, canonical duplicates, pending/rejected/approved own duplicates, idempotency, quotas, administrator moderation and revision conflicts. Moderation does not activate an occasion or grant capability.
- OccasionRequestDialog already handles submission/history/error states, but provider-occasion-suggestions.ts deliberately returns false from occasionRequestsAvailable until browser/backend integration is verified.
- list-approved-occasions-v2.ts has a protected read policy, bounded pagination and revision checks. It is not exported by the current deployment entry point. No export was added here.
- Firestore packages rules retain server-only writes. No rules or maintenance-enforcement changes were made.

## Completed locally

- Removed the form's hardcoded occasion allowlist. The server page passes a read-only canonical snapshot from occasions, occasionCatalog/current and providerEligibilityAuthorities. Choices require active approved catalog rows, explicit provider grants, assigned category applicability, a stable catalog and a valid protected read policy for the configured project.
- The reader rechecks linked user/provider ownership and active approved eligibility in the transaction. It returns no choices when configuration, revisions, authorization, network access or a complete bounded catalog cannot be verified. The 200-row bound fails closed rather than returning partial authority. Page category options still come from the active service-category service.
- Multiple chips now survive forward/back navigation and appear together in review. Duplicate selections remain prevented. Current policy limits are checked without deleting over-limit or historical selections.
- Fits All is exclusive: choosing it clears specific IDs; adding a specific occasion exits Fits All. Its state survives navigation, and it can be removed.
- Reused + Add Occasion in the form. The existing integration gate remains closed. Opening the dialog explains unavailability; no request is sent, and no new option is inserted automatically.
- Legacy single-occasion initialization is preserved. A historical unsupported occasion remains visible for deliberate correction. The legacy reader refuses V2/partial-V2 package records, and its input normalizer rejects V2 occasion fields instead of silently dropping them.
- Added explicit revision-conflict save feedback. This does not add revision checking to the legacy mutation contract.
- Existing Per Pax/Fixed Bundle single-occasion draft persistence, service-tier prices, payment terms, images and food menu behavior remain covered by regression tests.

## Deliberate gates and remaining work

This is a gated UI/read integration, not end-to-end multi-occasion persistence or a release activation.

Multi-occasion and Fits All selections remain only in the open wizard. They cannot be saved, uploaded, published or converted into a legacy eventType. They are lost when the wizard is discarded or the page reloads. Even one canonical occasion outside the legacy provider eventTypesSupported contract is blocked from saving through the legacy writer.

If the canonical read policy or explicit capability authority is absent, package saving is unavailable; there is no fallback to hardcoded or legacy choices. This may affect previously editable legacy drafts in an environment that has not provisioned the canonical authority. The existing historical selection stays visible.

Canonical Fits All intent is the existing frozen V2 tuple: occasionSchemaVersion: 2, occasionScope: all, occasionIds: []. Specific intent uses occasionScope: specific with one or more unique approved IDs. Fits All is not a wildcard that activates or authorizes all present/future catalog IDs. The server must derive occasionMatchIds from the current active approved applicable catalog, require every corresponding explicit provider grant, and store catalog/provider revisions and eligibility state. New catalog generations or capability changes require coordinated server revalidation and publication/availability fencing. The UI never supplies these derived authorization claims.

Before enabling persistence, implement and validate a compatible package writer with transactional package/catalog/provider revision checks, authoritative policy/ownership/capability/category reads, canonical resolution and all existing financial/media checks. Coordinate every public writer, publication validation, booking and availability reader with lifecycle fences. Private draft storage could be added separately, but is not introduced by this change. No unsafe extension of the scalar callables was made.

Before enabling requests, verify actual callable deployment, App Check, protected policy, indexes, cursor secret and browser integration; then separately review removal of the existing local gate. Admin approval alone still does not make an occasion selectable: activation, applicability and explicit provider capability approval are required.

## Pia: Customer Web and Flutter Mobile handoff

No customer Web, Flutter Mobile or public API contract was changed by this patch. Their future compatibility work remains a prerequisite to publishing V2 packages:

- Read the complete V2 tuple; use occasionMatchIds plus valid current eligibility/revision metadata for matching, rather than treating legacy eventType as the full selection.
- Display multiple specific occasions and the Fits All label distinctly. Do not expand all into current or future IDs on the client.
- Preserve existing booking/publication/availability safeguards and lifecycle generation fences. Legacy customers must not expose or book unsupported V2 records.
- Support Per Pax and Fixed Bundle pricing and booking snapshots before their existing publication gate is lifted. Preserve tier prices and canonical payment terms.
- A future provider mobile editor must send the approved writable tuple and expected revisions through a compatible V2 writer; it must never truncate multi-select to eventType or send server-derived matches/eligibility as authorization.

No Phase 2 tier-specific inclusions or Phase 3 food choices were added.

## Validation

All commands below run in this checkout, using existing local dependency installations linked through ignored node_modules junctions; dependency versions and lockfiles were not changed.

Web command (apps/web): node node_modules/vitest/vitest.mjs run test/components/provider-package-occasion-chips.test.tsx test/components/occasion-request-dialog.test.tsx test/components/provider-package-catalog.test.tsx test/components/provider-package-management.test.tsx test/components/provider-package-wizard-ux.test.tsx test/components/package-occasion-options-service.test.ts test/components/provider-package-category-options.test.tsx test/components/provider-package-category-form-contract.test.tsx test/components/provider-package-layout-refinement.test.tsx test/components/provider-package-occasion-contract.test.ts test/components/provider-package-editor-refinement.test.tsx

Result: 11 files passed; 133 tests passed; 0 failures, skips or unhandled errors. Coverage includes multi-select, Fits All transitions, navigation, unavailable catalog, unsupported historical values, explicit provider grants, approved-only catalog, request dialog gates and moderation outcomes, network errors, pricing/payment regressions and incompatible payload guards.

Backend command (functions): node --test test/provider-package-v2.test.cjs test/provider-occasion-suggestions-v2.test.cjs test/provider-package-update-category.test.cjs test/provider-package-publish-category.test.cjs test/occasion-package-revalidation.test.cjs test/legacy-occasion-publication-guard.test.cjs test/provider-occasion-capabilities-legacy-contract.test.cjs

Result: 73 passed; 0 failed, skipped or cancelled. Includes existing revision conflicts, universal revalidation, capability authorization and unauthorized V2 publication rejection. Functions source was unchanged.

Web TypeScript: node node_modules/typescript/bin/tsc --noEmit --incremental false — passed.
Functions TypeScript: node node_modules/typescript/bin/tsc --pretty false — passed.
ESLint: node node_modules/eslint/bin/eslint.js with every changed source/test TypeScript file listed explicitly — passed, 0 errors/warnings.
Git: git diff --check — passed. Frozen release manifest has no diff. HEAD and branch unchanged.

Earlier runs: a sandboxed Functions compile could not emit ignored lib files; the authorized local compile passed. Initial broader Web runs exposed the new server service missing a mock and one layout fixture missing canonical choices. The missing mock attempted reads against the test project feasta-test and received permission/network errors; no data writes were made. Fixtures were corrected and the full selected suite reran green. The first focused wizard run passed all 12 tests independently.

No Firestore rules emulator, live integration, deployment or production-readiness verification was performed. No commit, push, merge, occasion activation, production data modification, frozen manifest edit or maintenance-enforcement change was made.

## Files changed

Source:
- apps/web/src/app/provider/packages/page.tsx
- apps/web/src/app/provider/packages/provider-packages-client.tsx
- apps/web/src/app/provider/packages/provider-package-form.tsx
- apps/web/src/lib/provider/package-occasion-options.ts (new)
- apps/web/src/lib/provider/package-occasion-options-service.ts (new)
- apps/web/src/lib/provider/provider-package-client.ts
- apps/web/src/lib/provider/provider-package-save-error.ts

Tests:
- apps/web/test/components/package-occasion-options-service.test.ts (new)
- apps/web/test/components/provider-package-occasion-contract.test.ts (new)
- apps/web/test/components/provider-package-occasion-chips.test.tsx
- apps/web/test/components/provider-package-catalog.test.tsx
- apps/web/test/components/provider-package-management.test.tsx
- apps/web/test/components/provider-package-wizard-ux.test.tsx
- apps/web/test/components/provider-package-layout-refinement.test.tsx

Report: docs/catering-package-phase1-implementation.md (new).
