# Shared Package Contract V2: Backend Phase 1

Authority: `provider-package-shared-contract-v2-draft.md`, independently verified SHA-256
`cec2ed041d9511e894c38e127aab69804ad7f5577eb4afcd1cce53d50cd27e06`.
The implementation authorization is the Backend Phase 1 task; the frozen document's
historical draft/approval language does not enable any release gate.

## Scope and module boundary

`packages/shared-types/src/provider-package-v2.cts` owns the additive definitions.
The package root exports their types only. `@feasta/shared-types/provider-package-v2`
has matching `types`, `import`, `require`, and Node10 `typesVersions` entries.
Its generated `.cjs` contains no runtime behavior or Firebase dependency.
Functions' existing archive preparation script now refreshes dependencies with
`--ignore-workspace`, preserving its standalone vendored install instead of joining
the parent workspace during the refresh.
Archive preparation refreshes only this generated file archive's SHA-512 entry in
the standalone and workspace lockfiles, then installs with `--frozen-lockfile`.
Registry package integrity entries remain unchanged.
Packing uses a fresh temporary destination before copying the archive into vendor;
this avoids Windows errors when pnpm opens an installed file dependency for output.
Storage timestamps use a structural seconds/nanoseconds type compatible with native
Firestore timestamps; API timestamp projections use UTC RFC3339 strings.

The new `functions/src/packages/*v2-validation.ts` modules are isolated helpers.
No callable, trigger, production parser, booking calculation, or public reader calls
them. No feature is enabled. No V1 interface or existing validation is replaced.

Callers must supply current server-loaded catalog records, explicitly approved
capabilities, validated active canonical categories, revisions, and configured limits.
These contexts must never be constructed from client authorization/eligibility claims.
The helpers do not authenticate callers, implement transactions, or authorize writes.
New complete occasion writes reject missing/partial tuples; existing scalar behavior
remains entirely in the existing legacy implementation.

Offer validation normalizes each inclusion contribution independently, checks raw
limits before deduplication, and resolves only the selected tier with shared promises
first. PHP conversion uses decimal digits to produce integer centavos without rounding.
Standalone no-tier resolution requires an explicit server decision for historical data.
The arithmetic helper does not replace booking or payment calculations.

## Verification

- Shared tests include actual installed-package layouts under Web bundler, Functions
  CommonJS/Node10, and NodeNext resolution, plus forbidden-field type fixtures.
- Backend tests cover configuration, eligibility, selection boundaries, exact private
  request branches, Unicode reason limits, public projection privacy, tier isolation,
  raw inclusion limits, decimal precision, guest bounds, and malicious input shapes.
- The Functions runtime test checks the installed vendored contract and its manifest.
- Existing package, pricing, payment, image, capability, and booking tests remain intact.

Executed checks:

| Check | Result |
| --- | --- |
| Shared TypeScript build and shared unit tests | Passed; 44 tests |
| Full Functions TypeScript compilation (`node node_modules/typescript/bin/tsc`) | Passed |
| Full Web TypeScript compatibility check (`node node_modules/typescript/bin/tsc --noEmit`) | Passed |
| Targeted backend unit tests, including V2 and existing package/booking regressions | Passed; 120 tests, no skips |
| Existing Functions ESLint configuration on all four new validator modules | Passed; no errors or warnings |
| Archive preparation, installed CommonJS/ESM loading, manifest and both lockfile integrity checks | Passed |
| Packaging/test JavaScript syntax checks | Passed |

Compilation and package preparation were checked separately after restoring pinned
dependencies: repeated package-manager refreshes and Windows archive output access
errors initially interrupted the build workflow. No dependency versions changed.

## Files added or changed by this phase

- Contracts/exports: `packages/shared-types/src/provider-package-v2.cts`,
  `packages/shared-types/src/index.ts`, `packages/shared-types/package.json`.
- Validators: `functions/src/packages/v2-validation.ts`,
  `functions/src/packages/occasion-v2-validation.ts`,
  `functions/src/packages/occasion-suggestion-v2-validation.ts`,
  `functions/src/packages/offer-v2-validation.ts`.
- Backend tests: `functions/test/provider-package-v2.test.cjs`,
  `functions/test/provider-package-v2-runtime.test.cjs`.
- Shared tests: `packages/shared-types/test/provider-package-v2.test.mjs`,
  `packages/shared-types/test/provider-package-v2-freeze.test.mjs`,
  `packages/shared-types/test/fixtures/provider-package-v2.mts`,
  `packages/shared-types/test/fixtures/provider-package-v2.cts`.
- Packaging: `functions/scripts/prepare-shared-runtime.cjs`,
  `functions/vendor/feasta-shared-types-0.1.0.tgz`,
  `functions/vendor/shared-types-manifest.json`, `functions/pnpm-lock.yaml`,
  `pnpm-lock.yaml` (only the generated archive integrity changes in each lockfile).
- Generated declarations: `packages/shared-types/dist/index.d.ts`,
  `packages/shared-types/dist/index.d.ts.map`, and the four new
  `packages/shared-types/dist/provider-package-v2.{cjs,cjs.map,d.cts,d.cts.map}` files.
- This report: `docs/provider-package-v2-backend-phase1.md`.

The frozen specification and pre-existing Best Fit/Event Finder edits and untracked
files were preserved. Existing API implementations, booking/payment code, rules,
indexes, Flutter source, and Provider UI feature branch were not changed.

## Dependencies before Phase 2 and activation

- Implement protected policy loading/revision pinning and disabled rollout gates.
- Integrate current auth, App Check, approved ownership and active administrator checks;
  add authoritative reads, revision conflicts, transaction/idempotency and rate accounting.
- Implement catalog/capability coordination, verified withdrawal barriers, guarded
  transitions, audit/outbox, and resumable eligibility revalidation.
- Implement private editor persistence, structural progress/size policy validation,
  reference protection and atomic canonical completion using all existing validators.
- Obtain reviewed seed applicability and explicit capability migration evidence.
- Integrate compatible Admin, Customer Web, Provider Web and Flutter readers/writers,
  with verified old-client handling, rules/index readiness and separate release approval.
- Gallery/evidence lifecycle, booking snapshots, retention and destruction barriers are
  outside this phase. Four theme images and canonical pricing publication/booking
  restrictions remain in effect; expanding or removing them requires separate approval.

No deployment, emulator, external data write, migration, commit, push, or activation
is part of this phase.
