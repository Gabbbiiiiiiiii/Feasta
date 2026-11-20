# Fixed Package V2 persistence and publication

Local implementation on `chore/monorepo-setup`, baseline `f5b762f6`. No production data, gates, maintenance policies, commits, deployments or emulators were used.

Follow-up: the controlled recovery operation is now implemented locally. See [Controlled Fixed recovery](fixed-package-v2-recovery.md) for the preview/confirmation workflow, verification and deployment targets. The persistence correction described here is unchanged; no production recovery has been performed.

## Save routing

New Fixed and Customizable packages always use the V2 writer, regardless of pricing model or the draft UI flag. The client adapter admits these supported V2 structures to the server; it does not authorize them. Server policy, ownership, revision, idempotency, occasion/catalog, capacity, pricing, payment and media checks remain authoritative. Existing packages still choose their writer from their persisted V2 metadata; no revision is invented.

The backend already accepts Fixed V2 creation/update/completion and publication. The customizable-only comment at the callable exports is stale: the actual transaction admits V2 for either structure. Fixed retains publication-maintenance admission, including its witness write. Customizable private drafts retain their existing narrow exemption. No backend runtime changes are necessary and no Firebase Functions need deployment for this patch, provided deployed code matches this baseline.

## Publication

The provider reader derives `v2.publicationReady` from the raw saved record using the shared `isPublishablePackageV2` check with the canonical four-image-per-theme ceiling. The card requires that saved completeness result plus the existing client publication affordance. Server publication still rechecks live feature gates, provider/account eligibility, ownership, revision, catalog, financial policy, media ownership and maintenance. Completeness does not grant publication authority.

Incomplete canonical-pricing drafts keep Edit available, explain the missing saved V2 contract, and remain unpublishable. Individual Food remains blocked in both client controls and server canonical validation. Published records receive no automatic mutations.

## Existing incomplete Fixed drafts: reviewed recovery proposal

The existing `completeProviderPackageEditorDraft` operation only completes unlinked progress: `packageId` and `basePackageRevision` must be null, and `expectedPackageRevision` must be null. `updateProviderPackageV2` requires persisted V2 schema versions, lifecycle fields and a real positive revision. Neither safely upgrades the affected original package IDs. This patch deliberately does not route incomplete records to either operation or create replacement records.

Before recovering `sIWHG0eLBli5CfXoevkT` and `71Rn6dOHj2OWsfd5Rtw1`, review a separate, narrowly scoped in-place completion operation:

1. Read the original owned private draft and produce a complete field inventory and proposed canonical V2 payload for provider review. Include unknown fields; reject unsupported data rather than discard it.
2. Bind the review to an immutable fingerprint of the original record and the proposed payload, plus an idempotency key. Do not invent an existing package revision.
3. After explicit provider confirmation, validate through the same full canonical V2 admission and external media checks, then reread all authority and the original fingerprint in the commit transaction. Require genuinely private, undeleted, unpublished lifecycle state, current ownership and maintenance admission. Reject any concurrent change.
4. Preserve the original ID, creation metadata, and all supported content: name/description, occasions, structure/style, pricing model, every tier price/inclusion, guest bounds, included dishes, choice groups, shared decor/furniture/equipment/services, themes/images and payment terms. Reject any lossy mapping or unsupported field; do not silently remove it. Establish revision 1 only as the new contract revision, with a recovery audit and replay result.
5. Reopen the saved original ID for provider review and use the ordinary, separately authorized publisher. Recovery must never publish.

This section records the reviewed recovery design. Its local implementation is documented in the follow-up linked above; production recovery has not been authorized or performed. No duplicate or replacement package is created. Until the recovery endpoints are reviewed and deployed, keep the original drafts and use Edit only to review/retain details. Do not recreate them through New Package as an implicit recovery.

## Before production publication

Review and release the Web changes. Verify deployed backend parity with this source. Existing server feature and maintenance gates must permit each operation; this work does not change them. Recover the two incomplete Fixed drafts through an approved controlled operation, then verify saved V2 metadata and every retained configuration field. Provider review and the ordinary publication checks remain required. The existing complete Customizable draft needs no migration.

## Verification

Functions build/TypeScript passed. The targeted local compiled-callable and contract suite passed 89/89 tests, including all four structure/pricing combinations, Fixed field preservation through publication, stale revisions, idempotency, ownership, maintenance, unsupported Individual Food and incomplete-record rejection. External image verification is injected in the preservation simulation; it is not evidence of production media ownership.

Seven older simulation assertions were aligned with the existing production catalog authority: V2's compatibility eligibility revision is 1, and active approved catalog entries, rather than obsolete sidecar grants, control eligibility. No runtime authorization changed.

Web and final check results are recorded in the implementation report. Production build requires access to the Google Fonts used by the existing application. Repository-wide Functions ESLint has 750 pre-existing warnings and zero errors under `--max-warnings 0`; unrelated source was left intact.

Final local results:

- Web: 87 targeted tests passed across six files (81 editor/adapter/readback/management tests plus six publication-control tests).
- Web TypeScript: passed after the final changes.
- Changed Web source and tests: ESLint passed with `--max-warnings 0`.
- Web-wide ESLint: zero errors, two existing unused-disable warnings in `provider-eligibility-rules-contract.test.cjs` and `provider-setup-gallery-v2-transaction.test.cjs`.
- Functions build/TypeScript: passed. Final targeted tests: 92/92 passed after adding all four editor-completion combinations.
- Functions-wide ESLint: zero errors, 750 existing warnings; zero-warning threshold failed.
- Web production build: failed fetching existing `Playfair Display` and `Plus Jakarta Sans` Google Fonts; no application workaround was added.
- `git diff --check`: passed.

Exact runtime source files modified for this task:

- `apps/web/src/app/provider/packages/provider-package-form.tsx`
- `apps/web/src/app/provider/packages/provider-package-card.tsx`
- `apps/web/src/lib/provider/provider-package-v2-client.ts`
- `apps/web/src/lib/provider/provider-package-client.ts` (additive saved completeness projection; preserves the pre-existing reader changes)

Regression files modified/added:

- `apps/web/test/components/provider-package-customizable-production.test.tsx`
- `apps/web/test/components/provider-package-customizable-readback.test.ts`
- `apps/web/test/components/provider-package-management.test.tsx`
- `apps/web/test/components/provider-package-v2-adapter.test.ts`
- `apps/web/test/components/provider-package-fixed-v2-publication.test.tsx` (new)
- `functions/test/provider-package-v2-persistence-simulated.test.cjs`

All pre-existing Customer Web Phase A, Provider Request Details and provider reader edits remain in the workspace. This document is the only new development note for this task.
