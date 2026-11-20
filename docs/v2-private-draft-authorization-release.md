# V2 private draft authorization release

Prepared 6 November 2026 (Asia/Manila). No deployment, production writes, emulators,
Git commits, pushes, resets, cleaning or stashing were performed.

## Cause and corrected rule

The shared create/update/completion writer treated providerEligibilityAuthorities
occasion/category grants as a prerequisite for private V2 drafts. Missing or
revision-only authority documents failed with PROVIDER_OCCASION_APPROVAL_REQUIRED;
restrictive existing grants also blocked otherwise valid drafts.

Private V2 writes now use the resolver's existing server-only global eligibility
mode with the transaction-loaded canonical catalog and provider service categories.
This does not activate V3 or change the persisted sharedContractVersion. Authentication,
App Check, active owner/account, provider ownership, approved/verified active provider,
active catering category, approved provider category, applicable active approved
occasion, capacity/payment/media validation, stable catalog, CAS and operation journals
remain required. An explicit provider isBlocked denial was added to the private writer
when its regression test exposed that the existing package-domain helper omitted it.

Missing, revision-only, malformed, empty-grant and fully initialized sidecars are
consistently irrelevant to private draft permission. No authority document is read,
created, backfilled or modified by private writes. Availability preferences are not
used as evidence. The eventTypesSupported value passed to legacy capacity validation
is derived only from the canonical resolved selection, never provider preferences.

V2 response/readback compatibility retains providerEligibilityRevision: 1 as a private
wire-format placeholder. It is not an observed protected revision or grant. The package
stays draft, inactive, unpublished, invisible, and publishedAt null. Publication still
loads real authority, re-resolves eligibility and compares revisions independently.
The customizable V2 publisher remains disabled. Do not interpret private draft
occasionEligibilityState or its compatibility revision as publication permission.

## Files authored or changed

- functions/src/packages/provider-package-drafts-v2.ts
- functions/test/provider-package-v2-persistence-simulated.test.cjs
- functions/test/provider-authority-bootstrap.test.cjs
- apps/web/src/components/layout/navigation.ts
- apps/web/src/app/admin/provider-occasions/page.tsx
- apps/web/src/lib/provider/provider-package-save-error.ts
- apps/web/test/components/provider-authority-approval-error.test.ts
- apps/web/test/components/admin-provider-occasion-retirement.test.ts
- docs/v2-private-draft-authorization-release.md (this report)

The new release overlays these changes onto .tmp/provider-authority-bootstrap-release,
which incorporates .tmp/customizable-v2-release compatibility work. The manifest shows
exactly one changed Functions product source and three changed Web product sources;
shared-types and all other baseline product source files are unchanged. Tests and
this report accompany the overlay. Existing unrelated workspace source was preserved.

## Admin and frontend

Provider Occasions was removed from shared Admin navigation (desktop/mobile consumers
use that configuration). Source/test searches found no other route callers. The old
route was a read-only diagnostic, not an approval workflow; it now authenticates the
administrator and redirects old bookmarks to /admin/providers. The separate prepared,
unwired administrative transport remains intact for protected publication workflows.
Provider Verification, approved occasion maintenance, authority collections and audit
history are retained. No replacement draft approval UI or wizard step was introduced.

Save errors now explain verification, active account, approved category, unavailable
or incompatible occasion and configuration/revision failures. The obsolete approval
error from older deployed code requests backend compatibility, not another admin
approval. Error handling does not clear entered wizard data; existing wizard regression
suites passed.

## Operations and security

Changed callables: createProviderPackageV2, updateProviderPackageV2,
completeProviderPackageEditorDraft (same shared writer).

Private progress save/get/list recovery never consumed the sidecar, so no changes or
redeployment of those handlers are needed for this correction. Missing-sidecar save,
edit, get, completion and owner-domain package readback are tested locally.

Publication, booking, public read guards and Fixed Package implementation are unchanged
from the compatibility release. In particular, the isolated publisher retains the
previous release's deployed-compatible legacy guard, not the broader development
publisher. Legacy publication rejects V2/customizable/pricing/selection contracts.
Internal V2 publication remains unexported and production-disabled. No rules, indexes,
feature gates, booking, payment or availability implementation changed.

## Verification

- Focused isolated Functions: 194 passed, 0 failed, 0 skipped.
- Focused Web: 58 passed across six suites; Admin retirement: 2 passed.
- Functions TypeScript compilation: passed in original and isolated source trees.
- Web full TypeScript, --noEmit --incremental false: passed.
- Relevant Functions lint: passed with seven max-len warnings (six pre-existing,
  one touched authority condition); zero errors.
- Relevant Web lint: passed, zero errors.
- git diff --check: passed (line-ending warnings only).

Coverage includes Per Bundle pricing, 10-15 guests, included Steamed Rice, selectable
Main Dish choices, create/edit/readback, progress save/recovery/completion, exact replay,
conflicting idempotency and stale package revisions, transitioning catalog, rejected
unknown/inactive/unapproved/inapplicable occasions, rejected unverified/inactive/blocked/
suspended/deleted providers and unapproved categories, owner/App Check enforcement,
legacy Fixed/Bilao compatibility, V2 read/booking and publication guards, and existing
sidecar-bearing providers. Tests inject Firebase services and simulate transactions;
they do not prove live App Check transport, real Firestore contention or production IAM.

The initial regression run had one failure: blocked provider documents were accepted
by the old package helper. The explicit private-writer denial fixed it; final 194 pass.
An initial pnpm invocation attempted automatic dependency reconciliation and failed
under restricted network access. Verification completed using installed Node tool
entry points directly. Dependencies are local junctions for verification; no new
package versions or lockfile changes are part of this release. No fresh independent
production dependency install was performed for this correction. Existing baseline
shared runtime/vendor archives and publication security compatibility are retained.

Evidence is in .tmp/private-draft-authorization-release/release-evidence, including
SHA-256 baseline/release/workspace comparison and exact changed-source inventory in
authorization-manifest.json. The release contains rebuilt Functions lib artifacts.
Historical copied review documents describe prior releases; this report supersedes
their private-draft approval instructions and target lists for this correction.

## Targeted deployment requirements (not executed)

Project feasta-catering-system, region asia-southeast1. Update exactly these changed
Functions after review:

1. createProviderPackageV2
2. updateProviderPackageV2
3. completeProviderPackageEditorDraft

initializeProviderOccasionCapabilities is already deployed per the request; it is
unchanged and is not required to create drafts. Do not initialize the test provider's
sidecar, export updateProviderOccasionCapabilities or publishProviderPackageV2Internal,
or activate publication/discovery/booking gates for this correction. Release the three
Web product changes through the normal Web release process separately.

Before enabling/testing real production Create Draft, verify the deployed
publishProviderPackage includes the prior isolated release's legacy V2 rejection guard.
The supplied previous release documents identified an older deployed publisher that
could publish V2 drafts and a locally prepared guarded replacement; this session did
not re-inspect deployment state. If still missing, publishProviderPackage is an
additional prerequisite update using the preserved guarded isolated version, not a
new policy relaxation. Do not assume the four deployments stated in the request
include this publication prerequisite. No other Functions require updating for the
new authorization correction itself.

## Remaining live-test prerequisites

Deploy the reviewed candidate and compatible Web changes; verify the publication
prerequisite above and current packageDraftWrites/environment configuration. Re-read
provider IqJ2lbW28Mhp0giZxUUOSw9V7V13, its owner, approved active catering category,
canonical Birthday and stable catalog before real testing. Revision 22 and historical
provider evidence were not assumed current. No production state was read or changed
in this local implementation session. Use an authenticated provider with App Check
and verify the created package remains private, menu/pricing/capacity persist, and
reopening/editing works. Live media ownership verification still needs live testing
if images are submitted. No additional admin occasion approval is a prerequisite.
