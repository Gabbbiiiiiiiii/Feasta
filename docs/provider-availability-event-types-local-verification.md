# Supported Event Types: local implementation and verification

Date: 2026-11-05 (Asia/Manila)
Branch: chore/monorepo-setup

## Existing gap and implemented behavior

The availability page saved schedule and capacity fields but did not expose an approved occasion catalog, persist provider acceptance preferences, or reject stale settings submissions.

The page now renders Supported Event Types with the existing card and checkbox styles, a two-column grid at the small breakpoint and above, and one column below it. Individual choices, Select all, Deselect all, loading, retry, empty catalog, saving, success, and error states use the existing Save Availability Settings action. Initial choices come from saved IDs; no choices are automatically selected. Failed saves retain current input, and a synchronous pending guard prevents repeated submissions. Saved IDs that lose eligibility remain explicit unsaved-cleanup choices: they are not selectable and cannot be resubmitted.

## Catalog and data contract

The new provider-scoped `getProviderAvailabilityOccasions` callable reads the existing `occasions` collection and `occasionCatalog/current` generation. It reuses `projectPublicOccasionV2`, `isGloballyEligibleOccasion`, and `loadOccasionCatalogReadPolicy`. Catalog reads require the existing environment-scoped `contractPolicies/providerPackageV2` policy with `featureGates.occasionCatalogReads` enabled. Category eligibility is checked against active `serviceCategories/{code}` records and the provider's categories. Only active, approved, applicable occasions with valid stable IDs are returned. The existing catalog contract bounds supported selections at 200 IDs; a larger active catalog fails closed for reconciliation.

Provider choices live at `providers/{authenticatedProviderId}.supportedOccasionIds`. The same document stores `availabilitySettingsRevision`, defaulting to zero for pre-feature records. There is no new event-type catalog.

Legacy `eventTypesSupported`, provider eligibility authorities, package selection, gallery publication, booking validation, and customer discovery remain unchanged. Those legacy fields participate in protected package eligibility and are not treated as provider acceptance preferences. This feature neither grants eligibility nor withdraws packages. Applying the new preference as an additional booking or package restriction would require a separate explicit integration and dependency review.

## Persistence, readback and safeguards

The existing `updateProviderAvailabilitySettings` callable validates request fields and requires the expected settings revision. For a submitted occasion selection, it additionally requires the catalog revision, rechecks the current stable catalog and active categories in its Firestore transaction, and rejects duplicate, malformed, unknown, inactive, rejected, and inapplicable IDs. An empty selection is allowed. Catalog changes and stale settings return an aborted error without writing.

Both callables use Firebase App Check, authenticated provider role checks, rate limits, and server-resolved provider ownership. Ownership and operational approval are rechecked transactionally. Blocked providers are rejected. No request-supplied provider ID chooses the write target.

A transaction updates only the selected provider's existing availability fields, preference IDs, revision and timestamp, with the existing audit mechanism. It does not replace the provider document or touch unavailable dates. Canonical settings returned by the transaction update the form and its saved baseline. A subsequent page load reads the persisted IDs and revision through the existing authenticated server settings reader. Schedule-only edits can be saved during catalog failures by omitting the selection field; omission preserves the persisted selections.

The web settings request now requires `expectedSettingsRevision`; web and backend changes should be released together. Old already-open web clients will fail closed rather than overwrite settings without a revision.

## Exact files changed for this feature

1. `apps/web/src/app/provider/availability/provider-availability-client.tsx`
2. `apps/web/src/lib/provider/availability/provider-availability-client.ts`
3. `apps/web/src/lib/provider/availability/provider-availability-service.ts`
4. `apps/web/src/lib/provider/availability/provider-availability-types.ts`
5. `apps/web/test/components/provider-availability.test.tsx`
6. `functions/src/providers/update-provider-availability.ts`
7. `functions/src/index.ts`
8. `functions/test/provider-availability-occasions.test.cjs` (new)
9. `functions/test/function-security-contract.test.cjs` (only adds the new callable to controls and inventory; preserves pre-existing edits)
10. `docs/provider-availability-event-types-local-verification.md` (this report)

Existing modified and untracked package, occasion lifecycle, and other development work was preserved. No reset, clean, stash, commit, push, emulator, deployment, or production write was performed.

## Verification

- Web TypeScript: `pnpm.cmd --dir apps/web typecheck` passed.
- Functions TypeScript: `pnpm.cmd --dir functions exec tsc` and `tsc --noEmit` passed.
- Web focused tests: 39 passed across `provider-availability.test.tsx`, `provider-availability-contract.test.tsx`, and `customer-provider-availability.test.tsx`.
- Backend focused and regression tests: 146 passed across `provider-availability-occasions.test.cjs`, `provider-availability.test.cjs`, `function-security-contract.test.cjs`, `customer-provider-availability.test.cjs`, and `marketplace-provider-availability.test.cjs`.
- Targeted ESLint checks on changed web source/tests and the availability backend passed.
- `git diff --check` passed.

The new backend tests execute the compiled callables and real occasion projection/eligibility code against an in-memory transactional store, with authentication, auditing, policy loading, timestamps and Firebase adapters injected. They check selection persistence/readback, empty selections, unchanged schedules/capacities/unavailable dates, provider role and ownership failures, duplicate/invalid IDs, stale settings and catalog generations, activation/deactivation/category changes, and disabled-policy behavior. UI tests cover persisted choices, selection actions, canonical save/reload, failures retaining input, retry, retired choices, empty catalogs and duplicate submission prevention.

These tests do not establish deployed Firebase persistence, live App Check configuration, or browser layout screenshots. No Firebase emulator or production data was used.

## Deployment dependencies and remaining limits

Functions requiring deployment, when separately authorized:

- `getProviderAvailabilityOccasions` (new)
- `updateProviderAvailabilitySettings` (changed)

The web changes also require release. No deployment was performed. The existing occasion read policy, stable catalog generation and valid active category/occasion records must already be configured in the target environment; this implementation does not activate or seed them. Their live readiness has not been verified. Live save/reload verification remains pending an authorized non-production environment. There are no remaining local implementation blockers.
