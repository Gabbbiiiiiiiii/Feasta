# Phase 2C-B1: administrator legacy mapping foundation

Implemented locally on `chore/monorepo-setup`. Existing tracked and untracked work
was preserved. No existing source, rules, indexes, package or lockfile was edited
by this task. The callable is deliberately not exported from `functions/src/index.ts`.

Created files:

- `functions/src/packages/setup-gallery-extension-v1.ts`: extension contract v1.
- `functions/src/packages/update-setup-gallery-legacy-mapping.ts`: parser and callable.
- `functions/test/setup-gallery-legacy-mapping.test.cjs`: 18 local mocked transaction tests.
- `docs/setup-gallery-v2-backend-phase2cb1.md`: this completion report.

## Exact extension contract

This contract is independent of the frozen Shared Package Contract V2. It adds
protected metadata to `occasions/{occasionId}`; it does not redefine GlobalOccasion
or expose the field in the frozen public occasion projection.

```typescript
type SetupGalleryLegacyEventType =
  | "birthday" | "wedding" | "debut" | "corporate" | "anniversary" | "other";

interface UpdateSetupGalleryLegacyMappingRequest {
  occasionId: string;
  setupGalleryLegacyEventType: SetupGalleryLegacyEventType | null;
  expectedOccasionRevision: number;
  expectedCatalogRevision: number;
  reason: string;
  idempotencyKey: string;
}

interface UpdateSetupGalleryLegacyMappingResponse {
  extensionVersion: 1;
  occasionId: string;
  setupGalleryLegacyEventType: SetupGalleryLegacyEventType | null;
  occasionRevision: number;
  catalogRevision: number;
  operationId: string;
}
```

Logical callable: `updateSetupGalleryLegacyMapping`. All six request fields are
required and extra fields reject. Occasion IDs use the existing pattern
`^[a-z][a-z0-9_]{1,63}$`. Preconditions must be positive safe integers. Mutation
keys use the existing management pattern `^[A-Za-z0-9_-]{16,128}$`.
Reasons are trimmed, 10–500 Unicode code points; unsafe controls, formatting,
invisible characters and malformed UTF-16 reject before trimming.

Absent stored mapping or explicit null means unmapped. Removal writes null.
There is no inference from names, IDs or aliases, nor a default to `other`.
Different occasion IDs may explicitly share a target. Every newly accepted
operation, including a same-value assignment, advances both revisions once.

## Authorization and consistency

The callable uses existing App Check options, authenticated active administrator
authorization (including Firebase Auth disabled-account checks), and a 60/hour
rate limit. It independently rechecks current administrator profile state in the
transaction, including on replay. Provider ownership and suggestion approval
confer no mapping authority. Existing catch-all Firestore denial protects the new
operation/audit collections and occasion catalog; no client permission was added.

The transaction verifies occasion existence, matching identity, approved moderation
and boolean active state; inactive approved occasions can receive explicit mappings.
It requires positive stored revisions, stable catalog activation, matching expected
revisions and room to increment safely. Only mapping, revision and updatedAt change
on the occasion; only revision and updatedAt change on the global catalog.
Other catalog fields are preserved by update operations.

The same transaction creates an immutable event at
`setupGalleryLegacyMappingAudits/{operationId}` and a result at
`setupGalleryLegacyMappingOperations/{operationId}`. Audit includes administrator,
correlation ID, reason, occasion identity, before/after mapping and both revisions,
compatibility check identity and timestamp. Creation uses `tx.create`, never overwrite.
Operation identity is SHA256 of `[actorUid, logicalOperationName, idempotencyKey]`.
Payload hash uses the parsed, canonical field order and trimmed reason. Identical
retries return the original result before checking now-stale revisions; changed
payload with the same actor/key rejects `already-exists / IDEMPOTENCY_CONFLICT`.
Retention metadata follows the existing 30-day occasion management convention;
retained records replay regardless of elapsed time. There is no cleanup job here.
Mutation, audit and operation commit together or roll back together.

Invalid inputs return `invalid-argument` (existing validation reason conventions);
invalid enum returns `INVALID_LEGACY_MAPPING`, missing occasion returns
`not-found / OCCASION_NOT_FOUND`, stale preconditions return
`aborted / REVISION_CONFLICT`, and corrupt/transitional authority returns
`failed-precondition / CONFIG_UNAVAILABLE`. Compatibility rejection returns
`failed-precondition / GALLERY_REVALIDATION_REQUIRED`.

## Fail-closed rollout prerequisite

No verified withdrawal/revalidation protocol exists. Therefore this foundation
does **not** permit changes in the presence of V2 data. Each new operation reads
the `catalog` collection group inside its transaction, inspects `setups` documents
and rejects unsupported fields, unknown schema versions, nullable/unknown legacy
event types, malformed arrays/records or nonboolean publication state. It blocks
private V2 drafts too, conservatively. The query reads at most 501 catalog documents
and rejects more than 500, including non-gallery catalog documents; query failure
also prevents writes. No caller flag can bypass this check.

This check is a bounded V1-only prerequisite, not a withdrawal implementation or a
claim of a verified deployed rollout. The existing local gallery writer rejects
V2 unconditionally. Before exporting/deploying this callable, separately verify all
deployed privileged writers and public readers, IAM/service accounts and migration
tools. Arbitrary Admin SDK writers cannot be constrained by local source checks.
Before any V2 writing/activation, replace this V1-only prerequisite with a verified
withdrawal/revalidation barrier that serializes gallery writers with the catalog
generation and guarantees safe public visibility. Asynchronous revalidation alone
is insufficient. Scale beyond the conservative scan bound also needs that protocol.

## Validation

- New suite: 18 passed, 0 failed, including suggestion approval isolation.
- Existing targeted suites (occasion suggestions, Package V2 validation, catalog
  read core, runtime packaging): 60 passed, 1 failed. Together with the final new
  suite this is 78 passing tests and the one existing packaging failure.
- The packaging test still fails its unchanged assertion that
  `realpathSync(require.resolve(...))` is inside Functions-local `node_modules`.
  No packaging, linking or assertion changes were made.
- Functions TypeScript compilation: passed via existing `.bin/tsc.cmd` without
  invoking dependency preparation/install scripts.
- Full Functions ESLint: zero errors, 706 existing warnings. New source lint:
  zero errors and zero warnings.
- `git diff --check`: passed. New files were separately checked for whitespace.
- Frozen contract SHA256 remains
  `cec2ed041d9511e894c38e127aab69804ad7f5577eb4afcd1cce53d50cd27e06`.

Tests use an in-memory transaction double with optimistic retry and injected commit
failure; no emulator or live integration coverage is claimed. App Check coverage
verifies the callable's middleware configuration, not a live attestation exchange.
No gallery UI, V1 parser, Cloudinary logic, capabilities, approvals, package creation,
bookings, payments, public activation, Firestore rules or indexes were changed.

## Next required work

Approve the private Setup Gallery V2 stored/writable shape, selection bounds,
nullable draft rules and deterministic primary selection semantics. Then implement
private V2 draft parsing and a versioned gallery writer that validates current
catalog mappings, eligibility, revisions and media in its transaction, preserves
V1 behavior and prevents older full-array writers from overwriting V2 data. Add
the verified withdrawal/publication barrier and resolve the separate runtime
packaging prerequisite before connecting Pia's selector or activating public V2.

No deployment, emulator, live Firebase/Cloudinary write, commit, push, merge,
stash, reset, clean or force operation occurred.
