# Customer Event List — Phase 2A

Local implementation on `chore/monorepo-setup`. No active application integration,
registered endpoint, Firebase writes, deployment, commit, or push.

## Resource and security boundary

`customerEventLists/{customerUid}` is a single version-1 planning document:
`version`, `ownerUid`, `revision`, `currency: PHP`, `entries`, nullable `schedule`,
and `migration: {version: 1, completed: true}`. No timestamps, booking IDs,
payment state, consent, recovery records, or authorization fields are accepted.
Unknown fields are rejected at every object level. Prices are display estimates.

Direct Rules access is **get only**, for the matching authenticated, active,
unblocked customer according to the existing protected `/users/{uid}` helpers.
Collection queries and all client create/update/delete operations are denied.
Read rules sanity-check the stored top-level envelope, owner, version, integer
revision, migration marker and 24-entry bound; missing own documents can be read.
Unrelated profile permissions and the default-deny fallback are unchanged.

Rules do **not** enforce deep payload validation or UTF-8 byte size. The inactive
trusted writer validates the entire proposed document, active customer identity,
and compare-and-swap revision before calling an injected transaction interface.
It has no Admin SDK implementation or public endpoint yet. Admin writes bypass
Rules; Phase 2B must restrict IAM and route every write through this boundary.
This is a tested pure writer contract, not a deployed server enforcement service.

## Shared schema and mapping

| Canonical field | Web source | Mobile source |
| --- | --- | --- |
| `kind` | package → `catering_package`; `custom_menu` | `catering_package`; `marketplace_service` |
| `providerId`, `selectionId` | provider + package/menu ID | provider + package/service ID |
| `variantId` | custom-menu serving option ID | null |
| `identity` | kind:provider:selection[:servingOption] | same encoding |
| `providerName`, `name` | providerName + packageName/menuItemName | providerName + packageName/serviceName |
| `estimatedPrice`, `imageUrl` | price, imageUrl | estimatedPrice, imageUrl |
| `expectedRevision` | configuration.expectedPackageRevision | package config revision / standalone service expectedRevision |
| `href`, `menu` | packageHref/providerHref; menu key, serving names, description and guest range | absent native equivalents retained in canonical envelope |
| `configuration.event` | complete saved event | complete saved event |
| package offer fields | sharedContractVersion, expectedPackageRevision, serviceTier, packageThemeId | same |
| theme fields | themeInspiration notes + referenceSetupId | themeChoice + customTheme, retained separately |
| food fields | foodChoiceSelections, selectedFoods | same |
| additional selections | selectedDecorations, selectedFurniture, selectedEventServices | selectedDecorations, selectedFurniture, selectedAddOns (including serviceId and expectedRevision) |
| requests and estimates | event specialRequest, own add-on flag/note, estimatedTotal, pricingContext | same plus optional provider-specific specialRequest |
| `schedule` | separate Web Event List schedule | nullable; full envelope preserves Web context |
| readiness | derived display state from kind/configuration/revision | same; never booking authorization |

The closed schema supports 24 distinct entries, 100,000 compact JSON UTF-8 bytes
per document and 24,000 per entry. Reject oversize/capacity errors atomically;
never truncate. Text bounds use UTF-16 code units in both runtimes. Web attached
services allow 30; Mobile add-ons allow 20. Custom-menu guest ranges allow the
existing Web maximum of 1,000,000. Entry identity includes the serving option;
this deliberately differs from the legacy Web menu key.

`schema.json` and both embedded schemas are generated from the schema script.
The same JSON fixture corpus is consumed by TypeScript and Dart tests. Dart
normalizes integral doubles before compact JSON size checks and encoding.

## Compatibility and safe projections

Both codecs decode and preserve all canonical kinds and both configuration
representations. Native projection is deliberately conservative: Web cannot edit
standalone marketplace services or Mobile-only theme/add-on/request fields;
Mobile cannot edit custom menus or Web-only theme/service representations.
These return explicit read-only results retaining the complete canonical entry.
Native projection does not authorize submission. Phase 2B must display these
states, retain the full envelope, and update only intended fields; never replace
cloud records by re-encoding a lossy native projection.

Shared IDs accept 1–160 characters to preserve short Web IDs; native Mobile
requires 8–160 for provider/package/service IDs, so short-ID entries stay read-only.
The cloud codec additionally requires HTTPS images without credentials/fragments
and internal customer hrefs without backslashes/newlines. Legacy values failing
these stricter safety/size checks must remain local for explicit review. No
adapter trims, silently drops, or mutates the original saved records. Source
native codecs remain unchanged. Theme and add-on editor parity is future work.

## Revision and migration protocol

1. Authenticate and read `/users/{uid}` and the planning document **inside one
   trusted transaction**, before writes. Require customer role, active status,
   isActive true and isBlocked false. Never use token role claims alone.
2. Initialize only if the document does not exist, using a validated local
   snapshot transformed to cloud revision zero. Persist the versioned completion
   marker atomically with entries. Local source data is never deleted here.
3. Existing cloud data always wins, even an empty document. Do not merge old
   local data from another device. The writer reports review required when
   existing cloud data meets nonempty local data. Same-identity and over-capacity
   conflicts require explicit review; retaining the local record preserves them.
4. Mutations carry the revision actually read. Require exactly current + 1;
   reject stale, skipped, cross-owner and exhausted revisions. A failed CAS must
   be surfaced, not retried by blindly updating the expected revision.
5. Remove/clear retain an empty document and migration marker. No deletes or
   migration reset API exists. Old local snapshots cannot automatically restore
   removed entries. Server transaction retries must re-read authoritative data.

No guest transfer, local draft, submission, payment or reconciliation behavior
changes. Existing Mobile/Web session generations remain untouched. Phase 2B must
bind asynchronous work to the captured UID **and session generation**, cancel old
listeners, handle offline/failed writes visibly, implement conflict review, and
wire selective confirmed-snapshot cleanup without changing booking recovery.

## Exact Phase 2A file manifest

Only existing file modified: `firebase/firestore.rules`.

New files:

- `contracts/customer-event-list/schema.json`
- `contracts/customer-event-list/fixtures.json`
- `scripts/generate-customer-event-list-schema.mjs`
- `scripts/generate-customer-event-list-fixtures.mjs`
- `functions/src/customer-event-lists/schema.ts`
- `functions/src/customer-event-lists/contract.ts`
- `functions/src/customer-event-lists/trusted-writer.ts`
- `functions/test/customer-event-list-schema.test.cjs`
- `functions/test/rules/customer-event-list.rules.test.cjs`
- `apps/web/src/lib/customer/event-list/customer-event-list-cloud-contract.ts`
- `apps/web/test/components/customer-event-list-cloud-contract.test.ts`
- `apps/customer_mobile/lib/shared/models/customer_event_list_cloud_schema.dart`
- `apps/customer_mobile/lib/shared/models/customer_event_list_cloud_contract.dart`
- `apps/customer_mobile/test/features/customer/event_list_cloud_contract_test.dart`
- `docs/customer-event-list-phase2a-contract.md`

The Web codec imports the dependency-free Functions contract directly, using a
type-only import for the native hook types; it does not pull server SDKs into the
client. Phase 2B may package it as a shared module when coordinating runtime
deployment. Functions index and vendored shared-types package are untouched.

## Validation and release gate

Executed validation:

| Command / scope | Actual result |
| --- | --- |
| Web Vitest: cloud contract, configuration, isolation, reconciliation | 74 passed across 4 files (48 new contract/writer tests) |
| Flutter tests: cloud contract, configuration codec, existing customer Event List | 89 passed across 3 files |
| Web `tsc --noEmit` | passed |
| Functions `tsc --noEmit` | passed |
| Targeted Web and Functions ESLint on new TypeScript files | passed |
| Targeted Flutter analysis on the 3 new Dart files | passed |
| Node schema identity test | 1 passed |
| Dedicated Firestore Rules suite | 1 skipped; no emulator configured; zero security assertions executed |
| `git diff --check` | passed |

Earlier test import/cast errors and Dart formatting lints were corrected. Flutter
test execution required access to the existing SDK cache outside the workspace;
the successful run did not start an emulator. No network installation was used.
Rules behavior cannot be claimed verified without executing emulator assertions.
The dedicated Rules test skips unless FIRESTORE_EMULATOR_HOST is explicitly set;
it does not start an emulator. No emulator was authorized for this phase.

Before release: authorize and run Rules tests, implement/test the real Admin
transaction wrapper and authenticated endpoint, implement Phase 2B listeners and
UI states, run cross-device/offline/session and selective-cleanup integration
tests, then coordinate Rules/backend/client deployment with cloud sync disabled
until all server support is ready. This phase alone is not production-ready sync.

Verified backups are outside the repository at
`C:\Users\gabbyyy\AppData\Local\Temp\feasta-phase2a-20261116-001221`:
SHA-256-verified original rules, original status, preexisting tracked-work patch,
and verified copies of all 48 preexisting untracked files. No preexisting source
file other than the rules was edited.
