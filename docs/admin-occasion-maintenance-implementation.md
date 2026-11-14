# Admin Event Types / Occasions: local implementation

## Repository state

Inspected branch `chore/monorepo-setup`, HEAD
`acbf67d3aa92208486c76b6ed22065144423272d`. Original working tree was clean.
The supplied `740d03a13be73bff231a1a8c0ab78e7f89c18868` checkpoint was older;
implementation used the actual current source. No repository AGENTS.md applied.

## Implemented operations

- `listAdminOccasions`: complete active/inactive metadata list at a stable catalog
  revision, ordered by sort order then ID. Fails closed above 500 catalog records;
  never presents a truncated catalog as complete.
- `createAdminOccasion`: canonical approved identity, **inactive only**, with exact
  frozen V2 identity fields and active authoritative category validation.
- `updateAdminOccasion`: label, aliases and integer sort order. Permanent ID,
  active state, moderation state, creator, timestamps and compatibility metadata
  cannot be supplied as editable fields. Applicability must remain the same set.
- `previewAdminOccasionImpact`: proposed activation, deactivation or applicability,
  pinned to expected occasion/catalog revisions. Returns counts and category
  validity, never private packages, bookings or provider records. Scans at most
  501 records per source (500 inspected plus truncation detection); universal
  packages count as potential impacts. Nested/unknown schemas require offline
  inventory. The response always has `allowed: false`.

All four use the existing authentication, current active-role checks (including
Firebase Auth disabled state), App Check options, rate limiting and region
`asia-southeast1`. Profile authority is checked again inside the transaction,
including before idempotent replay. No UI session supplies administrator authority.

Mutations use strict unknown-field rejection, actor/action-scoped hashed
idempotency keys, payload conflict checks, exact saved-result replay, expected
occasion/catalog revisions, safe integer overflow checks, and transactional name
reservation checks. Occasion updates, catalog revision increments, operation
results and create-only audit records commit together. Existing name reservations
are retained conservatively. The catalog must already exist and be stable; this
implementation does not initialize it.

## Reused V2 implementation and lifecycle blockers

Reuses `occasions`, `occasionCatalog/current`, `occasionNameReservations`, frozen
`GlobalOccasion`/`NewInactiveOccasionInput` types, the canonical review validator,
canonical normalization, validation/revision primitives and existing security
helpers. Existing exported `listApprovedOccasions`, provider suggestion submission,
queue and review callables remain singular and unchanged.

The UI calls existing suggestion moderation to reject, map to active identities,
or approve matching inactive identities. New identities can be created inactive
through maintenance and subsequently matched to a suggestion. Existing moderation
policy gates, HMAC cursor secret requirements and backend applicability checks
still apply; the UI does not enable them.

There is no activation/deactivation mutation. Applicability updates are rejected
for active **and inactive** records. The V2 contract requires verified withdrawal,
provider revalidation, catalog-generation transitions and Customer Web/Flutter
compatibility before these operations. Existing setup-gallery authority explicitly
has incomplete writer coverage (`SETUP_GALLERY_WRITER_COVERAGE_VERIFIED = false`);
provider capability mutation and legacy gallery mapping remain unexported. A
bounded reference scan cannot replace these barriers. Public catalog read gates
are unchanged; no configuration flag is enabled by this implementation.

## Admin interface

Adds **Event Types / Occasions** to Admin File Maintenance without changing the
Service Categories, Agreements or Business Documents workflows. Provides active
and inactive listing, alias/name/ID search, status filtering, sort controls,
inactive creation, metadata editing, applicable category selection for creation,
read-only applicability for existing records, review queue access, lifecycle
impact dialogs, disabled lifecycle controls, loading/empty/error/retry states,
save confirmation and dirty-edit protection (dialog dismissal, maintenance tabs,
link navigation and browser unload). Browser-native confirmation is used for
navigation and final suggestion moderation. Writes use callable Functions only.

## Schema and compatibility

No shared schema, rules, indexes, existing Firestore data or historical IDs were
changed. No competing catalog was introduced. New inactive documents, if these
operations are separately deployed and invoked, use:

`id`, `label`, `normalizedName`, `aliases`, `active: false`,
`moderationState: approved`, `applicableServiceCategoryCodes`, `sortOrder`,
`revision: 1`, `createdBy`, `createdAt`, `updatedAt`.

Updates patch only validated metadata, normalized name, revision and updatedAt;
unknown server-managed fields including `setupGalleryLegacyEventType` survive.
The existing catalog gets only revision/updatedAt changes. Additional private
sidecars are `occasionMaintenanceOperations/{actorActionKeyHash}` (hash, saved
result, actorUid, createdAt) and `occasionMaintenanceAudits/{sameHash}` (actor,
correlation, reason, before/after metadata and catalog revisions, createdAt).
Operation evidence has no automatic TTL. These collections remain protected by
the existing default-deny rules. Existing name-reservation records are reused.

The historical birthday, wedding, debut, anniversary, reunion, corporate,
baptism, graduation and other adapters remain unchanged. No legacy scalar query,
package eventType, booking snapshot, provider eligibility, onboarding, pricing,
payment, publication or customer Web/Mobile reader was modified.

## Offline migration preview

Existing category seeding and emulator fixtures were inspected, never executed.
Run from `functions` against an **already available local inventory**:

```text
node scripts/preview-occasion-migration.cjs <inventory.json>
```

Input shape: `{ "documents": { "occasions/birthday": { ... },
"serviceCategories/catering_service": { ... }, "packages/id": { ... },
"bookings/id/snapshots/id": { ... } } }`.

The script imports no Firebase SDK, connects to no service, and writes no files or
records. It reports deterministic inventory hash, present/missing historical IDs,
canonical name/alias collisions, malformed records, missing/inactive/incompatible
category mappings, package/provider/eligibility/booking potential references,
universal package effects and legacy public-reader risks. Include nested paths
in the inventory; completeness is explicitly unverified. No mappings or grants
are inferred from labels. No actual production inventory was read in this task.

## Validation

Final successful checks:

- Functions TypeScript (`node node_modules/typescript/bin/tsc --pretty false`): pass.
- Focused backend security/V2 suites: **90 passed, 0 failed** (including 19 new
  maintenance/migration tests).
- Additional legacy gallery mapping, package create/update/publish/category and
  booking-policy suites: **41 passed, 0 failed**.
- Web TypeScript (`tsc --noEmit`): pass.
- Targeted Functions and Web ESLint: pass, zero errors/warnings.
- Admin component suites: **49 passed, 0 failed** (11 new; 38 existing).
- `git diff --check`: pass.

Backend tests use local mocks; they do not establish live deployment or emulator
security evidence. App Check options and default-denied rules are asserted
without modifying or running rules. The original three-tab assertion was updated
to require all four tabs, preserving the original operational checks. During
development, new-test type errors and that outdated assertion were corrected;
the final runs above passed.

## Exact changed files and final Git state

Modified:

- `apps/web/src/components/admin/file-maintenance/file-maintenance-client.tsx`
- `apps/web/test/components/file-maintenance-document-catalog.test.tsx`
- `functions/src/index.ts`

Added (untracked until the user chooses to stage):

- `apps/web/src/components/admin/file-maintenance/occasion-management-client.tsx`
- `apps/web/src/lib/admin/file-maintenance/admin-occasion-client.ts`
- `apps/web/test/components/admin-occasion-maintenance.test.tsx`
- `functions/src/admin/occasion-management.ts`
- `functions/scripts/preview-occasion-migration.cjs`
- `functions/test/admin-occasion-management.test.cjs`
- `docs/admin-occasion-maintenance-implementation.md`

Final branch/HEAD remain as recorded above, with these three modified and seven
untracked files only. No deployment, Firebase writes, emulator, commit, reset,
stash, clean, merge, push, rules changes or App Check relaxation occurred.
