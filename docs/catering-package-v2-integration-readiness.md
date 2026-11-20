# Catering Package V2 integration readiness

Date: 2026-10-30 (Asia/Manila). Worktree: `C:\flutterProject\feasta-catering-package-enhancements`. Branch: `feat/catering-package-enhancements`. Target: `chore/monorepo-setup`.

## Status

Automated verification is complete. Integration and interactive/live-service acceptance remain separate pending milestones. No commit, merge, push, deployment, index deployment, or production activation has yet been performed. No merge, commit, push, deployment, index deployment, or production publication is authorized or performed.

V2 customer discovery, customization and authoritative booking are implemented for explicitly enabled demo environments. Production publication and V2 readers remain hard-disabled. This is a gated integration candidate, not permission to activate production.

## Completed behavior

- The existing publisher routes explicit V2 requests through the existing draft validation architecture. It verifies authenticated provider ownership, active/approved owner and business eligibility, approved category and occasions, catalog/provider generations, complete offers/food rules, guest range, payment policy and owned media. Publication compares the expected revision, persists an idempotency operation, increments the revision, and makes a draft public only inside its successful final transaction.
- Media verification occurs between admission and final transactional validation. The final transaction rereads mutable authority and compares the canonical verified payload hash. Revoked gates, maintenance, changed eligibility/catalog, account disablement and changed media cannot bypass admission or final checks. Cloudinary calls remain mocked in automated tests.
- Web public package pages, details and provider package lists verify V2 eligibility before normalization. Flutter uses the allowlisted `getCustomerPackageV2` projection; private drafts and stale/invalid generations are rejected. Existing legacy readers remain available for legacy records.
- Both clients preserve multi-occasion/Fits All membership, pricing units, tier options and independent inclusions, images/themes and required food groups. Customer selection of an eligible occasion, tier and dish IDs reaches the booking request with the observed package revision. Clients do not supply authoritative prices or food rules.
- The existing booking transaction rechecks V2 eligibility, publication state, occasion, capacity, revision, tier, themes and required choices. Existing centavo calculations and payment/agreement rules remain authoritative. Tier/offer and dish display snapshots are frozen in booking records. Owned retries replay historical results without recalculating them from a changed package.
- Existing availability, accepted-hold/one-event-per-day scheduling, payment deadlines, cancellations, refunds, complaints and financial authority paths were retained. Pending requests continue to follow the existing non-reserving behavior; accepted live holds reserve the provider date.
- Provider publication UI is explicitly demo-gated, carries the saved revision, and reuses a request key across retries. Owner readers support published V2 records. Legacy publish calls preserve their original one-argument client call shape.

## Final review fixes

Three actual integration issues were corrected during final verification:

1. The new OR discovery query originally ran regardless of V2 rollout state. Web and Flutter now retain scalar `eventType` queries by default; the OR query is restricted to explicit debug/demo emulator configuration. This avoids making existing production legacy discovery depend on an undeployed V2 index.
2. Flutter's existing bootstrap used fixed emulator ports and production Firebase options. Explicit debug-only demo project and port overrides now permit the same isolated environment as Web. Invalid/non-demo or non-debug overrides fail before initialization; a mismatched initialized native app also fails closed. Live App Check activation is skipped only for that validated debug demo path; release configuration and production App Check remain unchanged.

3. Booking input now rejects orphan/malformed V2 revision fields and V2 package markers on custom-menu requests, so the new marker cannot widen the legacy custom-menu occasion contract. Executable rejection tests assert the failures occur before transaction reads.

The full Web run also exposed and corrected a server-only import ordering regression in the verified readers and two missing awaits in the availability test calendar helper. The subsequent full attempt exposed a request/render synchronization timeout and queued one-shot mock replies leaking into later cases. The helper now waits for request startup before rendered-result assertions, and each case resets queued replies. All functional assertions and their original timeouts were retained; three independent 15-test stability runs passed without retries.

The browser fixture was also repaired to use the canonical `catering_service` category, approved category authority, ordered occasions, eligible public provider profile and a verified customer. It uses a minimal test-only Functions entry with mocked media, not the production Functions entry. Windows cleanup stops only the fixture-created Next process subtree. Preparation accepts equivalent CRLF placeholder files without rewriting existing environment or secret files.

## Automated verification

| Check | Final result |
| --- | --- |
| Full Web, post-fix, two bounded thread workers | 2,818 passed, 0 failed, 225 files |
| Two affected Web files | 33 passed, 0 failed |
| Availability stability after request-phase/mock isolation fix | 3 independent runs x 15 passed, 0 failed; no retries |
| Focused V2 Web suites | 64 passed, 0 failed, 4 files |
| Functions regression | 2,331 passed, 0 failed, 0 skipped |
| Strict food-group validator | 17 passed, 0 failed |
| Shared contracts | 49 passed, 0 failed |
| Relevant Flutter tests | 100 passed |
| Publication/security and expanded lifecycle emulators | 96 passed, 0 failed, 0 skipped |
| Native Firebase SDK callable/rules lifecycle | PASS; script exit 0 |
| Real Next server/session + SDK lifecycle smoke | PASS for Per Pax and Fixed Bundle; script exit 0 |
| Web TypeScript and ESLint after final fixes | PASS; 0 ESLint findings |
| Functions and shared TypeScript | PASS |
| Functions ESLint | 0 errors, 729 baseline warnings |
| Flutter analysis | Exit 1: same 14 baseline findings; 0 new diagnostics |
| Tracked and untracked source diff/whitespace | PASS - tracked diff and staged whitespace checks |

Focused Web totals overlap the full suite and must not be added to it. Native/server smoke scripts are lifecycle assertions, not TAP test totals. Logs and JSON reports are retained locally under `docs/catering-package-v2-*.local.*`.

A subsequent attempt was cancelled after the availability failure cascaded: 1,451 passed, 3 failed and 2 skipped in 57 executed files (225 planned). This incomplete attempt is not a full-suite pass.

The initial complete serial run produced 2,816 passed and 2 failed across 225 files. Its import-order regression and missing async waits were fixed; the affected files then passed all 33 tests. Earlier interrupted/worker-timeout attempts are not counted as passes.

The timeout-affected parallel Web attempts are diagnostic runs, not passes. A focused rerun of the previously affected availability file passed all 15 tests. The final full run uses two bounded thread workers, no competing heavy test workloads, and explicit 30-second test/hook timeouts; no test assertions or security validation were removed.

## Index review and sequencing

`firebase/firestore.indexes.json` adds one `packages` COLLECTION index:

| Field | Mode |
| --- | --- |
| occasionMatchIds | CONTAINS |
| isActive | ASCENDING |
| isPublished | ASCENDING |
| providerPubliclyVisible | ASCENDING |
| status | ASCENDING |
| isDeleted | ASCENDING |
| createdAt | DESCENDING |
| __name__ | DESCENDING |

This matches the V2 branch of the OR query on both clients and its stable creation-time/document-ID cursor order. The scalar legacy branch retains its existing index. No index was deleted or deployed. The deployed index state was not inspected; no production Firebase access was used. Emulator query success does not prove that a hosted composite index has finished building.

For any future production activation: review and approve the rollout first; deploy the additive index to the intended environment; wait until it is READY; verify both query branches; deploy the compatible backend/readers while gates remain closed; complete browser/device/media acceptance and the old-client/direct-read compatibility review; only then consider separately approved gate/code changes. The current hard emulator fences cannot be opened by merely changing Firestore policy booleans. Controlled integration with those fences closed does not require immediate production index deployment.

## Isolated browser acceptance

Run from the feature worktree in a dedicated PowerShell terminal. Use the existing installed dependencies. Do not run dependency installation or any predeploy/build wrapper that invokes installation.

```powershell
Set-Location C:\flutterProject\feasta-catering-package-enhancements
node apps/web/node_modules/typescript/bin/tsc -p packages/shared-types/tsconfig.json
node functions/node_modules/typescript/bin/tsc -p functions/tsconfig.json
node functions/test/native-package-drafts/prepare.cjs

$env:NODE_ENV = 'development'
$env:FEASTA_STAGE_E_WEB_PORT = '58143'
$env:FEASTA_STAGE_E_MOBILE_WEB_PORT = '58153'
$env:GCLOUD_PROJECT = 'demo-feasta-stage-e'
$env:FIREBASE_ADMIN_PROJECT_ID = 'demo-feasta-stage-e'
$env:NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-feasta-stage-e'
$env:FIREBASE_CONFIG = '{"projectId":"demo-feasta-stage-e","storageBucket":"demo-feasta-stage-e.firebasestorage.app"}'
$env:NEXT_PUBLIC_FIREBASE_API_KEY = 'demo-only'
$env:NEXT_PUBLIC_FIREBASE_APP_ID = 'demo-only'
$env:NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '1234567890'
$env:NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'demo-feasta-stage-e.firebaseapp.com'
$env:NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'demo-feasta-stage-e.firebasestorage.app'
$env:FIREBASE_ADMIN_STORAGE_BUCKET = 'demo-feasta-stage-e.firebasestorage.app'
$env:NEXT_PUBLIC_USE_FIREBASE_EMULATORS = 'true'
$env:USE_FIREBASE_EMULATORS = 'true'
$env:NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT = '58146'
$env:NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT = '58145'
$env:NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT = '58144'
$env:NEXT_PUBLIC_STORAGE_EMULATOR_PORT = '58147'
$env:NEXT_PUBLIC_PROVIDER_PACKAGE_EDITOR_PROGRESS_ENABLED = 'true'
$env:NEXT_PUBLIC_PROVIDER_PACKAGE_V2_DRAFTS_ENABLED = 'true'
$env:FEASTA_V2_DRAFT_DEMO_ENABLED = 'true'
$env:FEASTA_V2_PUBLICATION_DEMO_ENABLED = 'true'
$env:NEXT_PUBLIC_PROVIDER_PACKAGE_V2_PUBLICATION_DEMO_ENABLED = 'true'
$env:WEB_ALLOWED_ORIGINS = 'http://127.0.0.1:58143,http://127.0.0.1:58153'
$env:FEASTA_BROWSER_SMOKE_ONLY = 'false'
$env:FEASTA_BROWSER_SEED_V2 = 'true'
node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --config functions/firebase.package-v2.browser.local.json --project demo-feasta-stage-e --only auth,firestore,functions,storage "node functions/test/emulator/stagee-browser-demo.local.cjs"
```

The preparation script copies only generated local rules/index fixtures and verifies placeholder secrets; it does not install dependencies. Stop if it reports unexpected local fixture content. Do not overwrite real credentials to make it pass. These flags and policy writes apply only to the guarded demo fixture. The same command with `FEASTA_BROWSER_SMOKE_ONLY=true` checks real provider/customer session routes and package-page HTTP responses. With the seed enabled, it also verifies private draft invisibility, publishes both models, checks real Next discovery/detail rendering, rejects incomplete food choices, and validates authoritative booking, frozen snapshots and replay before stopping. This is server/SDK acceptance, not interactive UI acceptance.

With `FEASTA_BROWSER_SEED_V2=true`, the real Firebase SDK creates two private, image-free drafts: Browser Per Pax V2 and Browser Fixed Bundle V2. Each has all three independently configured tiers and required food groups (1 of 3 main dishes and 2 of 3 side dishes). They remain private until the provider publishes them. Use these to test resume/edit/publication without live uploads, in addition to creating incomplete progress from scratch. The fixture prints demo login details after its assertions pass. Provider: `phase1c-browser-provider@example.invalid`; customer: `v2-browser-customer@example.invalid`; demo password: `DemoOnly_4567!`. Use distinct browser profiles or different browsers for provider and customer. Two Chrome incognito windows share a session. Provider login is `http://127.0.0.1:58143/provider-login`; customer login is `http://127.0.0.1:58143/login`.

1. Provider: open `/provider/packages`. Create a package with Birthday + Wedding, guest range 20-100 and enabled priced tiers. Save incomplete progress, close, resume, edit and complete a private draft. Reopen and verify food groups, theme choices and independent tier decorations/furniture/equipment. Do not select any image files in this mocked-media fixture. Image-free drafts are supported; real upload and delivery are separate acceptance checks.
2. Add a required food group with three dishes and count 1, and another requiring 2 of 3. Verify incomplete/invalid groups cannot complete. Check private drafts are absent from `/customer/packages` and direct customer reads are denied.
3. Publish through the existing provider confirmation action. Verify one revision increment/public record, successful retry behavior and the same package appearing to the customer. Repeat with Fits All and the other pricing model. Do not change production flags.
4. Customer: filter by the second occasion, open the discovered package, choose that occasion, select each tier and verify only its independent inclusions. Confirm per-guest versus fixed-bundle labels, required dish counts, and guest-range estimates. Save/resume the draft and verify stale choices are reconciled.
5. Review real agreement disclosures and submit. Confirm server amounts and frozen tier/dish snapshots in the emulator booking records. Change the package/rules or revision in a separate emulator-only test and verify a fresh stale submission is rejected while the original owned request replays. Do not attempt real payments.
6. Exercise a second provider/customer account, revoked eligibility/gates, maintenance, foreign media references and a provider's accepted live hold on the same date. No cross-owner writes, leaked drafts, duplicate requests or price/rule overrides should succeed.
7. Stop with Ctrl+C. If startup, session, configuration, media or authorization assertions fail, record the failure and fix the cause; do not bypass the check. Do not reset or terminate unrelated emulators.

### Flutter acceptance against the same demo

Leave that browser/emulator terminal running. From `apps/customer_mobile`, using an existing Flutter Web/Chrome installation:

```powershell
flutter run --no-pub --debug -d chrome --web-hostname=127.0.0.1 --web-port=58153 --dart-define=USE_FIREBASE_EMULATORS=true --dart-define=FIREBASE_EMULATOR_PROJECT_ID=demo-feasta-stage-e --dart-define=FIREBASE_EMULATOR_HOST=127.0.0.1 --dart-define=FIREBASE_AUTH_EMULATOR_PORT=58146 --dart-define=FIRESTORE_EMULATOR_PORT=58145 --dart-define=FIREBASE_FUNCTIONS_EMULATOR_PORT=58144 --dart-define=FIREBASE_STORAGE_EMULATOR_PORT=58147
```

Sign in as the seeded customer and repeat discovery, second-occasion selection, tier/food choices, guest estimates, draft restoration, review and booking/replay. The explicit demo override uses placeholder options and fails outside debug emulator mode. Native Android emulators use `10.0.2.2` instead of `127.0.0.1`; native platform Firebase initialization/device acceptance still needs its own run and must stop on a default-app/options mismatch rather than falling back to production. Automated Dart tests and Firebase SDK transport tests are not a claim of completed physical-device acceptance.

### Browser UI automation limitation

The browser access host was unavailable. The native Chrome fallback was then stopped by Computer Use because it could not determine the current Windows browser URL confidently enough to enforce policy. No subsequent browser/app input was issued. The [computer-use skill](C:/Users/gabbyyy/.codex/plugins/cache/openai-bundled/computer-use/26.1023.51421/skills/computer-use/SKILL.md) delegates to its [guidance](C:/Users/gabbyyy/.codex/plugins/cache/openai-bundled/computer-use/26.1023.51421/docs/guidance.md), which requires: "stop issuing app input" when Computer Use stops the turn. Full browser click-through and native-device acceptance remain pending. An unused acceptance incognito window may remain open and can be closed manually.

The server/SDK smoke completed independently with real Next sessions/pages and real Firebase SDK calls; it does not claim browser event-handling or physical-device acceptance.

## Real Cloudinary acceptance still required

Automated tests replace Cloudinary resource responses. They verify admission ordering, URL ownership, invalid/deleted response handling and transactional races, not live upload or delivery.

A separately authorized, explicitly identified nonproduction Cloudinary account is needed. Use the normal signed provider uploader and real backend verifier in a reviewed nonproduction setup. Keep credentials in secure configuration and out of logs/reports. Verify an owned asset survives save/reopen/publication, a foreign provider asset is denied, a deleted/revoked asset is denied, and returned resource type/secure URL/allowed format/size satisfy the existing validator (package/theme media limit: 5 MiB). Confirm asset ownership namespace `feasta/providers/{uid}/services/{serviceId}/image`, theme images, delivery URLs and real upload failure/retry behavior. Do not use the mocked native/browser Functions entry for live verification. No live credentials or live uploads were used here.

## Flutter diagnostics

The established baseline is 14 diagnostics: 0 errors, 1 warning and 13 informational findings. New integration diagnostics must be fixed before finalization.

| File / location | Count | Classification |
| --- | ---: | --- |
| authentication/data/services/promotion_service.dart:3 | 1 | Existing unused import warning |
| authentication/data/services/promotion_service.dart:10 | 1 | Existing initializing-formal suggestion |
| customer/availability_check_screen.dart:132,133 | 2 | Existing `withOpacity` deprecation info |
| customer/payment_success_screen.dart:78 | 1 | Existing `withOpacity` deprecation info |
| customer/recovery_offers_screen.dart:186,188,367,385,460,479 | 6 | Existing `withOpacity` deprecation info |
| customer/recovery_offers_screen.dart:363 (two positions) | 2 | Existing underscore naming info |
| test/food_choice_v2_test.dart:2 | 1 | Existing relative-lib-import info from F2 |

Paths in the table are under `apps/customer_mobile/lib/features` unless prefixed with `test/`. Unrelated baseline diagnostics were not suppressed to obtain a green report.

## Changed files and preservation

The complete current modified/untracked inventory, including pre-existing A-F2 work, is in `docs/catering-package-v2-changed-files.txt`. Generated shared output is included; the canonical browser emulator config is `functions/firebase.package-v2.browser.local.json`. The earlier root `firebase.package-v2.browser.local.json` is preserved as a superseded diagnostic configuration and should be excluded from integration. Vitest caches now stay under this feature worktree at `apps/web/.next/cache/vitest` despite the dependency junction; `docs/*.local.log` and `docs/*.local.json` diagnostic reports are not integration source. The explicitly listed Firebase emulator configuration files and fixture source are reproducibility inputs; generated placeholder `.env.local`/`.secret.local` files remain excluded.

Core V2 additions/changes include:

- Shared: `packages/shared-types/src/customer-package-v2.cts`, its generated `dist` files, package exports and tests; original V2 shared schema/F2 food contracts remain preserved.
- Backend: `functions/src/packages/customer-package-v2.ts`, `provider-package-drafts-v2.ts`, `publish-provider-package.ts`, `functions/src/bookings/{booking-contract,booking-package-offer,submit-booking-request}.ts`, `functions/src/provider-availability/check-customer-provider-availability.ts`, reviewed source export inventory and V2 unit/emulator/native tests.
- Web: verified public reader, discovery/detail/provider readers and normalizer/types; customization/draft/submission/tier/price presentation; provider publication adapter/card/confirmation; shared-code resolution and V2 client tests.
- Mobile: verified repository reads; package/customization/booking models; occasion/tier/price preparation and review; draft/attempt restoration; debug demo configuration/bootstrap and tests.
- Infrastructure/test-only: additive Firestore index, dedicated demo emulator/browser configs, mocked native entry and repaired browser seed/session fixture.

No reset, clean, stash, dependency install, junction replacement, branch switch or removal of unrelated work was performed. No source edits were made to `C:\flutterProject\feasta`; its three pre-existing modified paths remain present. Approval is still required for any commit, integration merge, push, deployment or production activation.

## Integration context

At review, feature HEAD was `3486b126`; local target `chore/monorepo-setup` was `bacd0d86`. The feature is 13 commits ahead and 0 behind that local target. Current implementation changes remain uncommitted. No remote fetch or merge was performed. The main worktree retains its three pre-existing modified files; any approved commit/integration must preserve that work and exclude diagnostic artifacts and the superseded root browser config.

## Remaining acceptance and readiness decision

Gate-disabled integration candidate. Automated verification passed. Interactive browser/device and authorized nonproduction Cloudinary acceptance remain outstanding. Production activation is not approved.
