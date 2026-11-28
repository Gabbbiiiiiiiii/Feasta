# Catering Package V2 validation and compatibility report

Worktree: `C:\flutterProject\feasta-catering-package-enhancements`<br>
Branch: `feat/catering-package-enhancements`<br>
Checkpoint: `3486b126e836071fd0abc00e16f1f928788a3b14`<br>
Date: 2026-10-29 (Asia/Manila)

## Outcome and limits

Stage F2's private, text-only food-choice workflow is validated locally. The two reported wizard failures are fixed. Incomplete editor progress resumes with its unfinished options; canonical package drafts require complete groups. Emulator coverage verifies creation, reopening, revision-checked changes, removal, strict metadata rejection and completion from saved progress.

Customer food-choice support has been added to the existing Web/Mobile selection, draft, review and booking contracts. Backend code resolves rules and historical display snapshots from the package read inside the existing booking transaction. Clients send IDs, never prices or selection rules. This is compatibility groundwork, not a completed V2 customer release: real discovery continues to reject V2 packages. Component tests inject package details and do not demonstrate a public V2 discovery-to-booking journey.

**The overall requested enhancement is not fully complete.** Multi-occasion customer discovery, catalog/provider generation verification, customer occasion selection, and Per Pax/Per Bundle display/estimate compatibility remain outstanding across the public readers. The server's V2 booking fence stays closed. Secure V2 publication support has not been completed: the existing publisher still rejects V2 before publication, and its gate has been strengthened against a food-choice-only legacy-shaped envelope. No claim is made that rejecting a package constitutes publication revalidation.

Publication must remain disabled until those customer integrations are implemented and verified. A complete-task/release commit is not recommended yet. A reviewed private-workflow checkpoint could be considered separately; no commit was made.

## Completed implementation

- Corrected the ambiguous food-validation assertion without removing validation. The UI has both a food-step alert and a form-level alert after attempted navigation.
- Gave the incomplete-progress test valid prerequisites, retained a new unbound editor flow, and verified unmount/reopen restoration of unfinished option names.
- Removed duplicate Functions food-choice interfaces. Functions resolves its type-only V2 imports to canonical generated shared declarations. The existing packaging tool now refreshes these declarations before staging its clean vendor archive.
- Preserved the immutable Phase 1 specification/hash. Its freeze test permits only the explicitly reviewed optional `foodChoiceGroups?: FoodChoiceGroupV2[]` additions on `OfferV2` and `PackageEditorProgressV2`, while still comparing every original field and union exactly.
- Hardened metadata validation against accessors, symbol/hidden properties, duplicates and invalid selection counts; added multiple-group coverage.
- Added customer stable selection IDs, exact-count validation and authoritative selected-option snapshots in the existing booking transaction. Legacy empty selections retain their previous payload/fingerprint shape.
- Added Web required-count controls, saved draft parsing/restoration, stale-ID reconciliation, named review and ID-only submission.
- Added Mobile package metadata parsing, required-count controls, draft persistence, immutable customization snapshots, booking-attempt restoration and summary/submission propagation.
- Hardened legacy Web/Mobile discovery and backend booking/publication boundaries: food-choice metadata, including null or an empty array, cannot be passed off as legacy by stripping schema markers.
- Repaired stale unit-test fixtures with real maintenance policy data, document references and timestamp support. These repairs retain the real maintenance validator and transaction read-before-write checks.
- Updated the source-export inventory and a payment source assertion's whitespace handling. The CommonJS Node contract test has a file-specific ESLint exception for `require` imports.

## Verification

The final counts are recorded below. Earlier diagnostic failures were corrected and must not be confused with final results.

| Check | Result |
| --- | --- |
| Installed TypeScript: shared-types build | Passed |
| Installed TypeScript: Functions build, without install wrapper | Passed |
| Web TypeScript | Passed |
| Shared-types tests | 44 passed, 0 failed |
| Food-choice metadata validator | 17 passed, 0 failed |
| Focused provider/F2 Web suite | 90 passed, 0 failed |
| Customer Web selection/draft suite (before added full-flow case) | 55 passed, 0 failed |
| New complete Web food-choice component flow | 1 passed (39 unrelated tests filtered out) |
| Full Web regression | 2813 passed, 0 failed (224 files) |
| Full Functions unit/security suite | 2319 passed, 0 failed |
| Focused booking food-choice/legacy-fence tests | 14 passed, 0 failed |
| Auth/Firestore draft + publication-fence emulator suite | 78 passed, 0 failed |
| Native Firebase SDK callable transport emulator script | Passed, exit 0 |
| Mobile food-choice + booking/preparation/persistence/visibility tests | 80 passed, 0 failed |
| Analysis of all 11 modified Mobile implementation files | No issues |
| Web ESLint | Passed, no errors/warnings |
| Functions ESLint | Passed, 0 errors; existing project warnings remain |
| git diff --check | Passed |

Functions ESLint reported 729 warnings on the initial full lint run, principally existing line-length warnings. No production lint rule was disabled. Local output is retained in ignored `docs/catering-package-*.local.log` files.

The emulator tests use real local Auth/Firestore and, for the native script, the Firebase SDK callable transport. Cloudinary responses in these tests are mocked. They prove admission ordering and media validation behavior, **not live Cloudinary success**.

The isolated worktree lacked Flutter's package map/graph. The existing installation's files were reused locally, with resolved package roots and the local package redirected to this worktree. These ignored local artifacts were not installed or committed. No dependency directories/junctions were replaced.

## Remaining implementation and acceptance work

1. Complete the authoritative V2 customer discovery path and current occasion/provider eligibility generation checks on Web, Mobile, backend and direct-read rules. Existing legacy filters intentionally remain in place.
2. Complete customer selection of a valid occasion for multi-occasion/Fits All packages and carry the selected occasion through availability, agreements and submission.
3. Complete and verify Per Pax/Per Bundle display and estimate behavior on both clients against authoritative server calculations. Do not infer a pricing model or price from client input.
4. Exercise a genuine V2 discovery-to-booking journey on Web and Mobile, including stale rules/revisions, agreements, one-event-per-day availability, payment terms/deadlines and historical booking snapshots.
5. Extend the existing publisher only after these prerequisites: authoritative approved occasions/current revisions, complete offer/food rules, provider/category/payment policy, verified owned media and final transactional revalidation. Retain current production gates. This task did not add a parallel publisher or activate V2 publication.
6. Complete the browser and real-service acceptance below. No live-service credential was requested, displayed or used for a Cloudinary operation in this task.

## Reproduce local checks without installing dependencies

Run from the enhancement worktree, using the existing installations:

```powershell
node apps/web/node_modules/typescript/bin/tsc -p packages/shared-types/tsconfig.json
node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json
node apps/web/node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit
node --test packages/shared-types/test/*.test.mjs
node --experimental-strip-types --test functions/test/food-choice-groups-v2.unit.test.mjs
node --test functions/test/*.test.cjs
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.package-drafts.test.json --project demo-feasta-package-drafts --only firestore,auth "node --test --test-concurrency=1 functions/test/emulator/provider-package-drafts-v2.integration.cjs"
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config functions/firebase.package-native.test.json --project demo-feasta-package-native --only auth,firestore,functions "node functions/test/emulator/provider-package-native.integration.cjs"
```

From `apps/web`, run `node node_modules/vitest/vitest.mjs run --maxWorkers=4` and `node node_modules/eslint/bin/eslint.js`.

From `apps/customer_mobile`, run:

```powershell
flutter test --no-pub test/food_choice_v2_test.dart test/features/customer/booking_contract_test.dart test/features/customer/booking_preparation_test.dart test/features/customer/booking_attempt_test.dart test/features/customer/booking_attempt_storage_test.dart test/features/customer/booking_preparation_flow_test.dart test/core/helpers/legacy_occasion_visibility_test.dart
```

Do not use the existing `functions` build/test wrapper during a no-install session: it invokes `prepare-shared-runtime.cjs --install`, which runs a dependency install. The direct compiler/test commands above avoid that step. Build shared types first because Functions' type-only mapping consumes the generated canonical declarations.

## Browser and real-service acceptance checklist

Use the existing isolated demo setup and seeded provider. Confirm all Firebase endpoints are loopback and the project ID starts with `demo-`; do not substitute a production project or production media account. Start the existing local emulator/browser configuration, using the ports it declares. The private browser flag additionally requires development mode, `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, a demo `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_PROVIDER_PACKAGE_V2_DRAFTS_ENABLED=true`, and the existing editor-progress flag. Do not enable production flags or V2 publication.

For the existing browser fixture, after the direct builds above, use a dedicated PowerShell terminal from the worktree root (this enables only the existing demo-private gates):

```powershell
$env:FEASTA_STAGE_E_WEB_PORT = '58143'
$env:GCLOUD_PROJECT = 'demo-feasta-stage-e'
$env:FIREBASE_ADMIN_PROJECT_ID = 'demo-feasta-stage-e'
$env:NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-feasta-stage-e'
$env:FIREBASE_CONFIG = '{"projectId":"demo-feasta-stage-e","storageBucket":"demo-feasta-stage-e.firebasestorage.app"}'
$env:NEXT_PUBLIC_FIREBASE_API_KEY = 'demo-only'
$env:NEXT_PUBLIC_FIREBASE_APP_ID = 'demo-only'
$env:NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'demo-feasta-stage-e.firebaseapp.com'
$env:NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'demo-feasta-stage-e.firebasestorage.app'
$env:NEXT_PUBLIC_USE_FIREBASE_EMULATORS = 'true'
$env:USE_FIREBASE_EMULATORS = 'true'
$env:NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT = '58146'
$env:NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT = '58145'
$env:NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT = '58144'
$env:NEXT_PUBLIC_STORAGE_EMULATOR_PORT = '58147'
$env:NEXT_PUBLIC_PROVIDER_PACKAGE_EDITOR_PROGRESS_ENABLED = 'true'
$env:NEXT_PUBLIC_PROVIDER_PACKAGE_V2_DRAFTS_ENABLED = 'true'
$env:FEASTA_V2_DRAFT_DEMO_ENABLED = 'true'
$env:WEB_ALLOWED_ORIGINS = 'http://127.0.0.1:58143'
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config firebase.stagee.browser.local.json --project demo-feasta-stage-e --only auth,firestore,functions,storage "node functions/test/emulator/stagee-browser-demo.local.cjs"
```

The fixture seeds the existing demo account, validates the real local session route, starts Next.js and prints the local login instructions. Open `http://127.0.0.1:58143/provider-login`, then `/provider/packages`. Stop with Ctrl+C when finished. If an assertion, required local configuration or unexpected live-service prompt blocks startup, stop and report that result; do not bypass the checks. This browser command was documented, not executed in this task. It must not be used for live Cloudinary acceptance.

1. Sign in as the seeded provider. Create a new package with valid name/description, occasions, guest range and a priced enabled tier.
2. On Food menu, add Main Dish: Chicken Afritada, Pork Menudo, Sweet and Sour Fish, required count 1. Add a second group requiring 2 of 3 options. Retain an independent legacy included dish.
3. Save the private package draft. Close/reopen, change one option/count, save and reopen again. Delete a group, save/reopen and confirm removal and retained legacy inclusions. Confirm Firestore remains draft/private with all public flags false and revisions increasing.
4. In a new unbound editor, add a titled group with blank options. Save Progress & Exit, reload, Resume and verify blanks/title/count. Package Draft completion must fail until all choices are valid; valid completion must use the saved editor revision exactly once.
5. Test a second provider, stale revision, lost response/retry, revoked gate and maintenance pause. No cross-owner writes, duplicate packages or privileged media calls before admission are allowed. Verify legacy publication rejects V2 and food-choice-only envelopes.
6. Live Cloudinary acceptance requires an explicitly identified nonproduction Cloudinary account and its own securely configured credentials. The native test fixture uses placeholders and overrides resource responses; it cannot perform this acceptance. In a real nonproduction service setup, upload through the normal provider uploader, save/reopen the package, and verify the owned asset through the normal backend verifier. Test a foreign owner URL and revoked/deleted asset; inspect asset ownership and admission behavior. Stop if only production credentials/accounts are available. Do not paste credentials into reports or logs.
7. Customer V2 acceptance is currently **blocked by remaining implementation**, not satisfied by injecting a package fixture into a component. After items 1?5 in Remaining work are implemented, test real discovered packages on Web and Mobile for required counts, unknown/duplicate/missing options, changed authoritative rules, preserved snapshots, both pricing models, themes, agreements/payment timing and daily provider availability before considering any publication gate change.

## Files changed in this task

Existing uncommitted provider/V2 work was preserved. The following task edits are layered on top of it; generated shared output is listed separately. Untracked-at-start files remain uncommitted.

- `apps/web/eslint.config.mjs`
- `apps/web/src/components/customer/bookings/event-customization-experience.tsx`
- `apps/web/src/components/customer/bookings/food-choice-selector.tsx`
- `apps/web/src/lib/customer/bookings/food-choice-selection.ts`
- `apps/web/src/lib/customer/bookings/customer-booking-submission-client.ts`
- `apps/web/src/lib/customer/bookings/customization-draft.ts`
- `apps/web/src/lib/customer/discovery/marketplace-types.ts`
- `apps/web/src/lib/customer/discovery/public-package-normalization.ts`
- `apps/web/test/components/provider-package-v2-wizard.test.tsx`
- `apps/web/test/components/customer-food-choice-selection.test.tsx`
- `apps/web/test/components/customer-booking-customization.test.tsx`
- `apps/web/test/components/legacy-occasion-publication-guard.test.ts`
- `functions/scripts/prepare-shared-runtime.cjs`
- `functions/tsconfig.json`
- `functions/src/packages/food-choice-groups-v2.ts`
- `functions/src/packages/provider-package-drafts-v2.ts`
- `functions/src/packages/legacy-occasion-publication-guard.ts`
- `functions/src/bookings/food-choice-selection.ts`
- `functions/src/bookings/submit-booking-request.ts`
- `functions/test/food-choice-groups-v2.unit.test.mjs`
- `functions/test/food-choice-selection.test.cjs`
- `functions/test/emulator/provider-package-drafts-v2.integration.cjs`
- `functions/test/function-security-contract.test.cjs`
- `functions/test/package-payment-terms-v2.test.cjs`
- `functions/test/provider-restoration.test.cjs`
- `functions/test/provider-visibility-revision.test.cjs`
- `functions/test/setup-gallery-b2d-lifecycle.test.cjs`
- `functions/test/occasion-legacy-client-booking.test.cjs`
- `packages/shared-types/src/provider-package-v2.cts`
- `packages/shared-types/test/provider-package-v2-freeze.test.mjs`
- `apps/customer_mobile/lib/shared/models/food_choice_v2.dart`
- `apps/customer_mobile/lib/shared/models/feasta_models.dart`
- `apps/customer_mobile/lib/shared/models/event_customization_data.dart`
- `apps/customer_mobile/lib/shared/models/booking_contract.dart`
- `apps/customer_mobile/lib/core/helpers/booking_preparation.dart`
- `apps/customer_mobile/lib/core/helpers/legacy_occasion_visibility.dart`
- `apps/customer_mobile/lib/features/customer/event_customization_screen.dart`
- `apps/customer_mobile/lib/features/customer/event_draft_persistence.dart`
- `apps/customer_mobile/lib/features/customer/booking_attempt_coordinator.dart`
- `apps/customer_mobile/lib/features/customer/booking_summary_screen.dart`
- `apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart`
- `apps/customer_mobile/test/food_choice_v2_test.dart`
- `apps/customer_mobile/test/core/helpers/legacy_occasion_visibility_test.dart`
- `docs/catering-package-f2-completion-report.md`

Generated: `packages/shared-types/dist/provider-package-v2.cjs`, `.cjs.map`, `.d.cts`, `.d.cts.map` were rebuilt from the canonical source. The pre-existing shared-types build outputs and all other pre-existing working-tree modifications were retained. The complete current worktree inventory is available with `git status --short`; it includes changes from before this task.

No reset/clean/stash, dependency installation, package-manager change, production Firebase/Cloudinary write, deployment, commit, merge or push was performed.
