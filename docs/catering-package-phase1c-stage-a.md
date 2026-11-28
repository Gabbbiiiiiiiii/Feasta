# FEASTA Catering Package — Phase 1C Stage A (candidate, NOT deployable)

**Basis:** The user's 44-file source archive and subsequent source supplement from `feat/catering-package-enhancements`, commit `6e6f40b6b75cbd8dd184ca9a41c7499de7d2c627`.

## Implemented as an isolated candidate

- Pure strict parser for the frozen `PackageEditorProgressV2` shape, including partial `specific`/`all` occasion intent, incomplete numeric strings, per-tier editor fields, nesting bounds and an overall 128-KiB limit.
- New **unexported** callable implementations `saveProviderPackageEditorDraft` and `getProviderPackageEditorDraft`, storing only **private, incomplete, unbound** editor progress. Save uses server-allocated draft IDs, per-draft revisions, per-actor payload-bound idempotency ledgers, a permanent quota of 20 private draft records per provider, verified provider ownership, App Check, rate limits, and transactional maintenance admission. Reads are owner-only (and remain possible under maintenance).
- New **independent, default-off** policy gate `contractPolicies/providerPackageV2.featureGates.packageEditorProgressWrites`. Its effective environment, policy revision, occasion count and theme image limit are validated; an absent gate fails closed. This proposal does **not** authorize any canonical V2 package write or public feature activation.
- The supplied Firestore rules already end with a recursive default-deny rule; no rules modification is needed at this stage. Client access to the new collections remains denied unless those rules change.
- Upload/media registry linking remains unimplemented: nonempty asset IDs are refused by the callable. The pure parser only checks their syntax, not ownership.

## Not implemented, not to be implied

- This is **not** a completed V2 package draft writer. `packageId` and `expectedPackageRevision` must both be `null`; bound editing and the canonical `completeProviderPackageEditorDraft` flow remain unavailable pending a coordinated package-revision adapter and full payment, catalog, capability and media validation.
- No `functions/src/index.ts` export was added, no Web form was wired, and no data is persisted by the currently running UI. **Multi-occasion/Fits All wizard selections still do not survive a reload.** They will only be saved when the reviewed callable is activated and a compatible Web save/resume interface is added.
- No production policy mutation, API deployment, rule deployment, Firestore write, or Git commit/push/merge is authorized.
- An old privileged Admin SDK process still requires operational isolation in a future release.

## Validation status

Seven pure validator tests passed with Node 22 using a local TypeScript transpile. **Functions TypeScript compilation, Firestore emulator transactions, App Check, rule emulator, and browser integration could not be executed with the source-only ZIPs** (they do not include full repo dependencies and runtime config). The new callable is thus an **unverified implementation candidate**, not a production-ready release.

Review the frozen draft schema and asset/reference accounting with the team before activating the new policy gate. Do not alter the approved Occasion Lifecycle runbook or the frozen manifest to treat this as release authorization.

## Local validation after applying the patch

At `C:\flutterProject\feasta-catering-package-enhancements`:

```powershell
node functions/node_modules/typescript/bin/tsc --project functions/tsconfig.json --noEmit
if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed.' }
node functions/node_modules/typescript/bin/tsc --project functions/tsconfig.json
if ($LASTEXITCODE -ne 0) { throw 'Functions build failed.' }
node --test functions/test/package-editor-progress-v2.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Focused tests failed.' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Git diff check failed.' }
git status --short
```

If compilation or existing tests expose a real contract mismatch, **do not export or deploy**; reconcile the implementation first. A separate Firestore emulator/rules review is required before a callable export is even considered.

## Local verification update — October 28, 2026

In the actual Catering Package worktree, direct Functions
TypeScript no-emit validation and compilation passed.
All seven focused parser tests passed.

The standard pnpm build command was not completed because
its dependency-preparation step attempted to reinstall
node_modules shared with the original FEASTA repository.

Firestore transaction behavior, App Check enforcement,
rules-emulator coverage, and browser integration are not
yet verified. Keep the callables unexported and the feature
disabled until those checks are completed.