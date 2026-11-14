# FEASTA Phase 2C-B — contract decision and local compatibility report

Status: safe independent compatibility validation completed; mapping implementation
and Pia's backend integration remain blocked on explicit contract decisions.

## Confirmed authority and missing decisions

Gabriel confirmed during this task that Pia's v1.2 specification exists in
coordination messages, with no confirmed standalone file. The mapping field name,
allowed values and administrator mutation contract have not been formally confirmed.
He explicitly directed that these details not be invented, and that mapping-dependent
V2 persistence and publication stay disabled. Repository and local attachment searches
found the Phase 2C request but no separate v1.2 specification.

The frozen contract was checked against its occasion schema, catalog, legacy primary,
suggestion review and gallery definitions. Its SHA256 remains
`cec2ed041d9511e894c38e127aab69804ad7f5577eb4afcd1cce53d50cd27e06`.
The frozen contract and shared package were not modified.

Existing authoritative storage is `occasions/{occasionId}`. `GlobalOccasion` declares:
`id`, `label`, `normalizedName`, `aliases`, `active`, `moderationState: 'approved'`,
`applicableServiceCategoryCodes`, `sortOrder`, `revision`, `createdBy`, `createdAt`,
`updatedAt`. It declares no legacy gallery mapping field. Catalog state is
`occasionCatalog/current`, with global `revision`, activation state and update timestamp.
These are local source findings; no live records were read.

**Exact mapping field/storage contract: not approved; none added.**
The existing gallery V1 scalar enum is birthday, wedding, debut, corporate,
anniversary, other. That enum is not proof of the approved mapping value contract.
The package contract's derived primary is an eligible occasion ID; it is not a
catalog-to-gallery legacy enum mapping. Neither names nor aliases establish mappings.

Decisions required before implementation:

1. Exact catalog metadata field(s), type, absence/null meaning, permitted targets,
   mapping identity/moderation metadata and provenance requirements.
2. Mapping cardinality and duplicate semantics: whether multiple occasion IDs may
   share a target, and how a primary is chosen for multiple selected occasions.
3. Administrator callable name and exact request/response/error contract, revision
   preconditions, reason limits, idempotency scope/replay/conflict semantics and
   immutable audit storage contract. Specify atomic occasion/catalog increments and
   behavior when mappings change or are revoked.
4. Exact Setup Gallery v1.2 stored and writable V2 shapes, selection bounds,
   authoritative eligibility/category checks and stale catalog behavior.
5. Nullable private draft rules and private reader contract, including how the legacy
   modal remains protected from V2 records and how version-aware saves distinguish
   supported writers. No nullable package or booking contracts are authorized.

## Administrator path and disabled work

**New administrator mapping mutation: none**, because its contract is unapproved.
`reviewOccasionSuggestion` in
`functions/src/packages/provider-occasion-suggestions-v2.ts` is the existing
administrator-only suggestion review path. Its `map` decision resolves a suggestion
to an active applicable occasion; it does not edit catalog mapping authority.
`approve_new` creates an inactive approved occasion and atomically advances catalog
revision. Existing revision, idempotency and immutable audit mechanisms apply to
suggestion review, not an authorized new legacy mapping API.

No speculative catalog fields, secondary catalog, mapping resolver or save route
were introduced. Mapping reads cannot validate an unapproved shape. V2 gallery
persistence, nullable private V2 drafts and V2 publication remain unconditionally
rejected. Client assertions of valid mapping or catalog revision cannot enable them.
No feature gates or publication settings changed.

## Independent compatibility work

Phase 2C parser and transaction protections remain in place: legacy serialization
is preserved, newer versions/unknown metadata cannot fall back to V1, and both
preflight and exact transaction snapshots reject unsupported stored records before
full-array replacement. Concurrent schema/revision changes cannot remove V2 data.
Both Customer Web readers retain fail-closed public filtering. Private unsupported
V2 drafts reject before reaching Pia's unchanged modal.

This task adds five focused tests:

- A provider cannot use administrator suggestion review to write authority.
- Unapproved candidate mapping fields, invalid candidate values and duplicate
  candidate targets cannot be smuggled into occasion creation. These test payload
  fields are intentionally unsupported examples, not a proposed storage contract.
- Suggestion mapping and replay leave catalog records/revision unchanged and
  create one audit; suggestion mapping is not legacy mapping authority.
- Nullable V2 drafts in a mixed gallery are rejected by private loading and hidden
  by public reading.
- Caller-asserted mapping approval cannot authorize V2 publication.

Existing focused tests cover stale catalog/suggestion revisions, invalid mapping
targets for suggestion resolution, idempotency, atomic rollback, disabled gates,
V1 behavior, legacy replacement protection, concurrent changes, ownership/account
status, and Cloudinary verification. No test claims a new legacy mapping API exists.

## Local writer audit and release prerequisite

Searching tracked and untracked source for gallery paths, setup document references
and save calls found one concrete gallery mutation:
`saveProviderSetupGallery()` via `saveProviderSetupGalleryAction()`, called by the
existing manager. Customer/provider read sites do not write. No additional concrete
gallery mutation was found in Functions, administrative utilities or migration scripts.
No Firestore permissions, authentication, App Check or media checks changed.

Separately required before release: a read-only production audit of deployed
privileged service accounts/IAM, server/Functions versions, administrative utilities,
migration tools and Firestore rules. Confirm all deployed writers enforce equivalent
schema/revision protection. Local source inspection does not verify deployed access.

## Files changed in this task

- Modified `apps/web/test/components/provider-setup-gallery.test.tsx` (two tests).
- Modified `functions/test/provider-occasion-suggestions-v2.test.cjs` (three tests;
  preserved the existing untracked file and its contents).
- Created `docs/setup-gallery-v2-backend-phase2cb.md` (this report).

No production code changes were warranted by the confirmed missing contract.
Existing Phase 2C production changes and unrelated tracked/untracked work were retained.

## Local validation

- Web: **56 passed, 0 failed**, setup gallery and provider detail foundation tests.
- Functions: **61 tests: 60 passed, 1 failed** across occasion suggestions, V2
  validation, catalog read core and runtime packaging tests. The same packaging
  assertion failed before the three new Functions tests were added (57/58 passed).
- The failure is `Functions installed V2 contract subpath loads through require
  and import`: `realpathSync(require.resolve(...))` is outside the Functions-local
  `node_modules` tree. It fails before that test's later archive/integrity checks.
  No dependency relinking, shared-package changes or weakened assertion was used
  to hide this separate runtime packaging prerequisite.
- Functions TypeScript compilation: passed using the existing local `tsc` binary.
- Web TypeScript `tsc --noEmit`: passed.
- Targeted Web ESLint and Functions ESLint on relevant occasion validation/review
  modules: passed. Functions configuration targets source TypeScript; the added
  CommonJS tests were executed by Node's test runner.
- `git diff --check`: passed; existing CRLF warnings are unrelated to whitespace errors.

No deploy, live Firebase access/writes, emulators, commit, push, merge, reset,
stash or clean. Pia cannot yet begin backend-connected local multi-occasion
integration: obtain the exact decisions above and resolve the separate Functions
runtime packaging failure first. V1 work can continue under the existing contract.
