# Phase 2C-B2: private validation foundation and remaining authority bindings

## 23 October 2026 continuation with the supplied v1.2 specification

Current status: **private parser and pure resolver implemented; transactional V2
persistence remains incomplete and disabled**. The earlier report below is retained
as historical evidence, not the current statement that the specification is absent.

Authority: the supplied `FEASTA_Setup_Gallery_Occasion_Extension_v1.2.md` and
Gabriel's explicit local B2 request supersede the attachment's older prohibition
on implementation. They do not authorize deployment, activation or live writes.

Added `apps/web/src/lib/provider/provider-setup-gallery-v2.ts` and
`apps/web/test/components/provider-setup-gallery-v2.test.tsx`. No existing production
source, UI, B1 mapping implementation, frozen contract, shared package, lockfile,
Flutter code, rules or indexes were changed in this continuation.

Implemented independently of the frozen package occasion resolver:

- Strict private mixed V1/V2 structural parsing; duplicate setup IDs, unsupported
  versions, missing/unknown V2 metadata, invalid revisions/states and invalid
  owner-scoped images reject. Reuses existing text/image/publication bounds.
- Nullable legacy scalar only for unpublished V2; no inferred `other`. Legacy
  parser/editor and public projection continue rejecting V2. This structural
  parser is deliberately not routed into the legacy editor or public reader.
- Writable V2 records exclude `eventType` and every derived metadata field.
  Specific selections enforce unique IDs and a positive server-supplied maximum
  (tested at the initial value 10 and at a stricter configured value).
- Complete Fits All resolution validates every applicable occasion and every
  capability, including sets over ten. Missing completeness, exhausted catalog
  or effective-match budgets, inactive/unknown/inapplicable or ineligible choices
  fail closed; no partial matches are returned.
- Explicit B1 mappings only; preserves the previous scalar if an effective
  eligible occasion still maps to it, otherwise sortOrder then ID determines the
  mapped scalar. Unmapped drafts resolve null; unmapped publication rejects.
- Only `valid` / `review_required` parse; successful fresh resolution emits
  server-derived `valid` plus both supplied authority revisions. Structural
  parsing alone does not certify revision freshness or public eligibility.

The authority input is a pure internal validation interface, **not an API or a new
physical backend contract**. No caller route accepts it. Catalog completeness and
currentness must be proved by a future trusted adapter, not asserted by a provider.
There is no pagination, transaction-race or full V2 persistence completion claim.

B1 source and its 18 mocked tests confirm the exact protected
`occasions/{occasionId}.setupGalleryLegacyEventType` six-value/null mapping and
atomic occasion/global catalog revision increments. Its V1-only barrier remains:
mapping changes reject if V2 galleries exist. That barrier was not weakened.
The existing full-gallery writer retains revision comparison and exact stored
snapshot validation; all V2 writes reject, including deletion by old full-array
writers. Public V2 remains independently excluded.

Remaining concrete ambiguities / required work before persistence:

1. Confirm the physical server-owned provider eligibility revision source and
   how approved catering categories/capabilities are bound to that generation.
   The extension expressly leaves this source unverified. Do not guess a field.
2. Confirm the separate protected Setup Gallery gate's storage and configuration
   contract, including specific-selection and bounded execution/memory limits.
   No package-policy changes or invented feature-flag path were introduced.
3. Implement the trusted complete bounded catalog loader and atomic provider,
   category, catalog, policy and gallery revision fencing after external media
   verification. Test concurrent mutations before enabling any test writer path.
4. Replace/coordinate B1's V1-only mapping barrier with an approved withdrawal /
   revalidation protocol before accepting V2 data. Preserve the current barrier
   until then. Complete the separately required deployed privileged-writer audit.
5. Add an owner-authorized V2 read/write service separate from Pia's scalar
   editor, customer public compatibility, and transactional V2 acceptance tests
   once those authority bindings are confirmed. No V2 publication is enabled.

Validation for this continuation: 74 Web tests passed across the new V2 suite,
existing gallery suite and provider-detail foundation; 18 B1 mapping tests passed.
Web TypeScript and targeted ESLint passed. `git diff --check` passed (existing
line-ending warnings). Frozen contract SHA256 remains
`cec2ed041d9511e894c38e127aab69804ad7f5577eb4afcd1cce53d50cd27e06`.
No deploy, emulator, Firebase write, commit, merge, push or activation occurred.

## Earlier partial B2 report (retained)

Status: **partial; private V2 persistence foundation is not complete**.
Local branch: `chore/monorepo-setup`. Existing modified and untracked work retained.

## Authority limitation

The full Pia Setup Gallery Occasion Extension Specification v1.2 was not found
in the workspace or local pasted-text attachments. Prior Phase 2C/B reports
explicitly record its absence. B1 supplies the protected
`setupGalleryLegacyEventType` enum/null contract and atomic administrator mapping
mutation, but explicitly leaves private draft shape, selection bounds, nullable
draft rules and deterministic primary selection semantics for follow-up approval.
The current request supplies field names and some rules, but does not supply
the deterministic v1.2 selection algorithm or eligibility-state values.
Those requirements have not been invented. The full source was requested.

## Files changed by this task

- Modified `apps/web/src/lib/provider/provider-setup-gallery-service.ts`:
  runtime validation of the full-gallery request envelope.
- Modified `apps/web/test/components/provider-setup-gallery.test.tsx`:
  12 new regression cases for writer markers, envelope metadata and mixed galleries.
- Created this report.

The first two files already contained local changes; those were preserved.
No Functions source, shared package, frozen contract, UI or public reader changed.

## Exact current request and response behavior

`saveProviderSetupGallery` accepts `{revision: number, setups: unknown,
galleryWriteSchemaVersion?: number}` at the TypeScript boundary. Runtime accepts
only those three own enumerable keys. Missing marker preserves legacy V1 behavior;
explicit numeric `1` is accepted. Numeric `2` throws the private-V2-disabled error
before gallery/media reads or mutations. Any other explicit marker (including null,
string or boolean) throws an unsupported-writer-version error. Unknown envelope
metadata, including caller-provided revisions/eligibility/match IDs/gates, rejects.
Missing or invalid revision/setups continues to reject. Successful legacy writes
retain the existing `{revision: input.revision + 1, setups}` response.

The existing server action forwards runtime input to this guard and returns
`{ok: true, gallery}` on success or `{ok: false, error}` for caught save failures.
Its existing public-path cache invalidation remains unchanged.

**No accepted V2 request or response is claimed.** A V2 record with a missing
writer marker still fails the strict legacy record parser. An unversioned V1
request remains necessary for the unchanged single-selection modal.

## Draft schema and gates

No private V2 stored schema/parser or owner-authorized V2 reader was added.
The requested version `2`, scope/IDs, nullable scalar and four server metadata
fields remain unsupported until the v1.2 authority resolves their semantics.
Legacy parsing still rejects V2, partial V2, unrecognized metadata and null scalars;
it never strips fields to reinterpret a record as V1.

Private V2 writing is unconditionally disabled in the request guard. Public V2
reading remains independently disabled by the existing public projection's strict
V1 parser. These are hard rejections, **not** a completed protected configurable
write gate or an isolated test-enabled V2 implementation. No environment flag,
policy mutation, new callable/export or B1 callable activation was added.

## Full-gallery overwrite, authorization and assets

Existing atomic full-gallery writes remain. Preflight rejects any unsupported
stored record, including a V2 record omitted from the incoming array. The exact
transaction snapshot is independently parsed after revision comparison, preventing
a concurrent V2 insertion from being deleted even without a revision increment.
The added mixed-gallery case verifies that editing just V1 cannot remove a private
V2 draft and that rejection occurs before external photo checks or transaction writes.

Existing approved-provider authentication, catering capability, transaction-time
provider ownership/status and active owner checks remain intact. Existing public
provider publication restrictions remain. Cloudinary ownership, URL/resource identity,
format, size and image-count checks remain; external verification still runs outside
the transaction, with current asset membership rechecked inside it.

No V2-specific authoritative catalog/eligibility validation was added. There is no
claim of complete Fits All enumeration, validation beyond ten occasions, stale
catalog/provider revision handling, deterministic mapping or unmapped draft acceptance.
No mapping fallback to `other` was introduced.

## Validation

Executed directly through existing local binaries, without dependency installation,
packaging preparation, deployment or emulators:

- Web Vitest: `provider-setup-gallery.test.tsx` and
  `provider-detail-foundation.test.tsx`: **68 passed**, two files.
- Web TypeScript: `.\node_modules\.bin\tsc.cmd --noEmit`: passed.
- Functions TypeScript: `.\node_modules\.bin\tsc.cmd`: passed.
- Web ESLint on the modified service and test: passed.
- Functions Node tests: `setup-gallery-legacy-mapping`,
  `provider-occasion-suggestions-v2`, `provider-package-v2`,
  `provider-package-v2-read-core`, `provider-package-v2-runtime`:
  **78 passed, 1 failed**.
- Separate runtime-test rerun confirmed the same failure:
  `Functions installed V2 contract subpath loads through require and import`.
  `realpathSync(require.resolve(...))` resolves outside Functions-local
  `node_modules`. This pre-existing packaging failure was not repaired or weakened.
- `git diff --check`: passed (existing line-ending warnings only).
- Frozen shared contract SHA256 remains
  `cec2ed041d9511e894c38e127aab69804ad7f5577eb4afcd1cce53d50cd27e06`.

The Web regression suite also covers legacy compatibility, provider suspension,
ownership, concurrent gallery revisions/schema changes, public exclusion,
Cloudinary verification and exclusion of gallery references from trusted booking
submission. No valid-private-V2 or complete B2 acceptance coverage is claimed.

## Remaining B2 work and B3 dependencies

1. Obtain the full v1.2 specification: exact eligibility states, selection bounds,
   deterministic mapping order/ties, null-draft semantics and catalog applicability.
2. Implement strict private parser and owner-authorized reader separately from
   legacy parsing/public projection; expose a clear upgrade-required legacy result.
3. Implement an independently protected, default-off, test-configurable private
   writer gate and version-2 full-replacement contract, rejecting provider-supplied
   server metadata and deriving all compatibility/eligibility values server-side.
4. Validate every specific selection and the complete active applicable Fits All
   set, including every catalog page and provider approval; fence trusted catalog,
   eligibility and gallery state again in the atomic commit after media checks.
5. Add the requested V2 acceptance/failure/concurrency tests. Resolve the separate
   shared-types runtime packaging prerequisite outside this task.
6. Before B3 integration or activation, address B1's V1-only mapping barrier:
   it deliberately rejects even private V2 galleries. A verified mapping-change
   revalidation/withdrawal protocol and deployed privileged-writer audit remain
   release prerequisites. Public V2 exposure needs separate authorization and work.

No deployment, emulators, live Firebase or Cloudinary writes, commit, push, merge,
stash, reset, clean, force operation, branch switch, security relaxation, payment,
booking or package-publication change occurred. Pia's branch was not touched.
