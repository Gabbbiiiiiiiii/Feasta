# Phase 2C local compatibility report

Status: safe compatible subset implemented; Phase 2C is partially blocked.

## Scope and safety

Branch: `chore/monorepo-setup`. Existing tracked and untracked work was retained.
Frozen `provider-package-shared-contract-v2-draft.md` SHA256 verified:
`cec2ed041d9511e894c38e127aab69804ad7f5577eb4afcd1cce53d50cd27e06`.
No contract changes, deployment, emulator, live Firebase access/writes, feature
activation, catalog seeding, commit, push, merge, reset, stash or clean performed.

Modified files:
- `apps/web/src/lib/provider/provider-setup-gallery.ts`
- `apps/web/src/lib/provider/provider-setup-gallery-service.ts`
- `apps/web/test/components/provider-setup-gallery.test.tsx`

Created: this report. Provider modal and customer visuals are unchanged.

## Storage and compatibility

Storage remains `providers/{providerId}/catalog/setups`, with the existing
`providerId`, `setups`, `revision`, `createdAt`, `updatedAt` envelope. Legacy setup
records retain `id`, `title`, `description`, scalar `eventType`, `themeTags`,
`imageUrls`, `isPublished`. The event type remains one of birthday, wedding, debut,
corporate, anniversary, other. Existing V1 normalization and optional fields remain.
An explicit `setupOccasionSchemaVersion: 1` is preserved; absent versions stay absent.
Unknown setup fields now fail closed instead of being discarded.

All other explicit versions, including 2, are recognized as unsupported and rejected.
Occasion fields without a V2 marker also reject. There is no accepted V2 gallery
shape yet: neither structurally plausible V2 nor malformed V2 falls back to V1.
Nullable `eventType` is rejected for V1 and V2, including unpublished V2 drafts.
No nullable package or booking types were introduced.

## Full-gallery protection

Preflight parsing blocks unsupported stored records before media verification.
The central transaction independently validates the exact current stored setups,
incoming setups and persisted revision before replacement, including records the
caller omitted. A concurrent V2 record therefore blocks deletion, downgrade,
publication and overwrite, even when revision did not change. Invalid stored
revisions and revision overflow reject. Revision conflicts require reload.
Caller compatibility flags cannot authorize V2.

Provider authentication, ownership, user account state, approval, catering
eligibility, public-provider publication checks and Cloudinary ownership/resource
verification remain. Assets reused from preflight must still exist in the transaction
snapshot or have been verified; otherwise saving requires reload.

## Authoritative mapping blocker

Local source confirms `occasions/{occasionId}` and `occasionCatalog/current`.
`GlobalOccasion` has no approved field mapping occasion IDs to the gallery's legacy
event-type enum. No exact authoritative mapping field or authorized mapping writer
was confirmed. Labels, aliases and IDs cannot supply that authority.

`functions/src/packages/provider-occasion-suggestions-v2.ts` contains the
admin suggestion-review mutation: approve_new creates an inactive occasion and
increments the catalog revision within one transaction. Its map decision resolves
a suggestion to an existing occasion; it is NOT a legacy gallery event-type mapping.
Thus an atomic catalog mechanism exists, but no mapping update protocol exists.
No live catalog contents or deployed authorization were inspected.

Smallest follow-up: approve a Setup Gallery Occasion Extension v1.2 storage/input
contract (field names, selection bounds, metadata, draft rules); approve a backend
catalog mapping field and its semantics, including multi-selection primary choice;
add an admin-authorized audited mapping mutation that atomically increments occasion
and catalog revisions. Then implement gallery validation/publication against current
catalog and eligibility in the guarded transaction and add validated private V2
reader support before enabling Pia's selector. Keep the frozen package contract intact.

## Readers and privileged writer audit

Both `provider-detail-service.ts` and `readPublishedProviderSetups()` use
`publicProviderSetups()`. That projection fails closed to an empty gallery on any
unsupported/malformed record and otherwise exposes only published V1 with photos.
Existing provider authorization/category checks remain upstream. Private loading
rejects unsupported records with a compatible-editor/support error; it never hands
V2 to the legacy modal. This deliberately does not provide V2 draft consumption.

Local source inspection found one concrete setup gallery writer:
`saveProviderSetupGallery()`, reached by `saveProviderSetupGalleryAction()`.
No additional concrete gallery writer was found in Cloud Functions, administrative
utilities or migration scripts. No alternative save route was added. Firestore rules
were not changed. Generic Admin SDK/service-account tools can bypass application
guards; source inspection does not establish deployed access.

Release prerequisite: separately audit production IAM/service accounts, deployed
Functions/server revisions, admin/migration tools and Firestore rule coverage using
read-only access. Confirm every privileged gallery writer uses equivalent version
and revision protection before any V2 data is introduced.

## Validation

- Focused Vitest: **54 passed, 0 failed**, two files: setup gallery and provider detail foundation.
- Web TypeScript `tsc --noEmit`: passed.
- Targeted ESLint for the three modified Web files: passed.
- `git diff --check`: passed (existing line-ending warnings only).

Coverage includes legacy serialization/display, explicit V1 preservation, unsupported
versions, contradictory metadata, nullable drafts, publication rejection, public
projection exclusion, replacement/deletion protection, concurrent schema/revision
changes, provider ownership/status and existing Cloudinary resource checks.
No valid-V2 acceptance test is claimed: valid V2 cannot be defined authoritatively
from the supplied request and checked-out source. Gallery V2 mutations remain
unconditionally disabled, independent of caller flags or catalog read gates.

Initial pnpm exec attempts triggered automatic dependency relinking and Windows
EPERM errors. Validation succeeded using existing local `.bin` commands directly;
no dependency or lockfile edits were intentionally made.

Pia remains blocked on the approved gallery contract, authoritative mapping and
mapping writer/revision protocol, plus private V2 consumption and catalog-validated
publication. This phase must not be marked fully complete.
