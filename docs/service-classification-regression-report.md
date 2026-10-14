# FEASTA service classification implementation and regression report

Date: 15 October 2026 (Asia/Manila).

Implementation is complete on `feat/service-classification-ui` in `C:\flutterProject\feasta-service-classification-update`, based on freshly fetched `origin/chore/monorepo-setup` at `c3d3b008`. No commit, push, PR, merge, deployment, production Firebase write, data migration, or rules change was performed.

Recommendation: **NO-GO for a fully validated PR** until the existing integration failures are resolved or explicitly accepted. The classification change itself has no newly introduced regression failures in the suites run. A review-only PR would be technically reasonable after that disposition and the user's approval; none has been created.

## Exact proposed files

- `apps/web/src/app/become-a-provider/page.tsx`
- `apps/web/src/app/provider/business-profile/provider-business-profile-client.tsx`
- `apps/web/src/app/provider/onboarding/[step]/provider-onboarding-step-form.tsx`
- `apps/web/src/components/admin/file-maintenance/document-catalog-management-client.tsx`
- `apps/web/src/components/admin/file-maintenance/service-category-management-client.tsx`
- `apps/web/src/components/admin/provider-verification/provider-verification-queue.tsx`
- `apps/web/src/components/admin/provider-verification/provider-verification-review-panel.tsx`
- `apps/web/src/components/admin/reports/admin-provider-performance.tsx`
- `apps/web/src/components/admin/users/user-details-content.tsx`
- `apps/web/src/components/customer/discovery/marketplace-search.tsx`
- `apps/web/src/lib/admin/reports/admin-report-excel.ts`
- `apps/web/src/lib/admin/reports/admin-report-export.ts`
- `apps/web/src/lib/customer/planning/event-planning-context.ts`
- `apps/web/src/lib/customer/providers/provider-catalog.ts`
- `apps/web/test/components/customer-event-planning-marketplace.test.tsx`
- `apps/web/test/components/file-maintenance-document-catalog.test.tsx`
- `apps/web/test/components/provider-business-profile.test.tsx`
- `apps/web/test/components/provider-onboarding-services.test.tsx`
- `apps/web/test/components/provider-verification-queue.test.tsx`
- `apps/web/test/provider-onboarding-flow.test.mts`
- `apps/web/src/lib/service-categories/service-classification-label.ts`
- `apps/web/test/components/service-classification.test.tsx`
- `apps/web/test/components/service-classification-marketplace.test.tsx`
- `functions/test/emulator/service-classification.integration.cjs`
- `docs/service-classification-occurrences.csv`
- `docs/service-classification-regression-report.md`

Local validation logs, dummy `.secret.local`, emulator configuration copies, dependency/build output, and the detached comparison worktree under `.validation/` are evidence, not proposed source changes. Generated shared-types and Flutter plugin artifacts were restored to their checkout contents. The baseline source was not edited. The original dirty checkout and Pia's branch received no source edits. A temporary audit output was briefly written under the original checkout's `.tmp` directory and removed; subsequent work and evidence stayed in the isolated worktree.

## Presentation changes

- Added one typed classification label map with `catering` ? **Catering**, `addon` ? **Other Event Services**, and `both` ? **Catering & Other Event Services**. Unknown inputs explicitly display **Unknown service classification**; they never fall through to the combined label. Existing validators still reject invalid persisted/API identifiers.
- Admin Platform Setup / Service Categories: added a named, read-only section explaining the two predefined classifications. It uses semantic `section`/`dl`/`dt`/`dd`, one column on small screens and two from `sm`, with no classification management actions. Existing category management remains in its original tab.
- Renamed the Service Categories table heading, filter, filter badge, form label, mobile detail caption, and related help copy to **Service classification**. Default `addon`, dropdown values, field names, capacity flags, code generation, lifecycle controls, and mutation payloads are unchanged.
- Provider onboarding: renamed **Additional event services** to **Other Event Services** in the offering selector and category group; the shortcut is **+ Add other event services**. Selecting either/both still saves `catering`/`addon`/`both` and the original category codes.
- Provider business profile: broad classification labels use the existing wrapper, now backed by the shared display helper; caption becomes **Provider service classification**.
- Customer home planning: renamed its broad classification label and invalid-choice message. Discovery options and badges inherit the helper. Its existing consumers include provider cards, logo cards, results badges, profile, and package detail provider information.
- Admin verification queue: renamed heading/filter/mobile caption; raw `addon`/`both` cells and filter badges now display the new labels. Dropdown **Both** becomes the combined label, preserving value `both`.
- Admin verification review and user details now format the provider classification rather than displaying raw values.
- Admin provider performance summaries/charts and CSV/Excel exports use classification labels. Export headings and filter captions become **Service classification**; exported totals and numeric fields are unchanged.
- Become-a-provider page: broad provider introduction uses **Other Event Services** and the combined classification.

Every direct Add-on terminology change:

| Location | Before | After |
|---|---|---|
| Service Categories filter and editor dropdowns | Add-on | Other Event Services |
| Service Categories table/mobile/search label formatter | Add-on | Other Event Services |
| Service Categories editor help | Add-on categories | Other Event Services categories |
| Business document requirement summary | Add-on providers | Other Event Services providers |
| Business document classification checkbox | Add-on only | Other Event Services |
| Business document combined checkbox | Catering & Add-on | Catering & Other Event Services |
| Business document category targeting caption | Add-on | Other Event Services |
| Provider verification filter option | Add-on | Other Event Services |
| Provider performance single classification | Add-on services | Other Event Services |
| Provider performance combined classification | Catering and add-ons | Catering & Other Event Services |
| Provider recruitment introduction | supported add-on and event services | supported other event services |

Other deliberate label changes include the customer helper's former **Event services** and **Catering and event services**, now using the requested single and combined labels. None of these changes renames a persisted category, package inclusion, booking service, or collection.

## Actual booking add-on labels preserved

No booking/customization/checkout/payment calculation implementation was edited. All web source occurrences below remain unchanged:

- `app/how-it-works/page.tsx`: **Service inclusions or add-ons**.
- `components/admin/bookings/booking-details-drawer.tsx`: **Add-on services** for actual booked services.
- `components/customer/bookings/booking-formatters.ts`: all three **Add-on services** fallback presentations.
- `components/customer/bookings/event-customization-experience.tsx`: both **Displayed add-ons subtotal** labels and **marketplace add-ons** help text.
- `lib/payments/customer-payment-presentation.ts`: existing full-upfront add-ons payment explanation/comment.
- `lib/provider/provider-agreement.ts`: existing packages/add-ons listing obligations and **add-on charges** price disclosure.

Mobile was not edited: booking details/summary, customization, optional service selection, checkout and add-on prices retain their existing Add-ons wording. The baseline occurrence inventory records the relevant lines and their categories, including internal identifiers and test/documentation uses.

## Contract audit and compatibility proof

`service-classification-occurrences.csv` inventories 2,176 matching baseline source/test/documentation lines across web Customer/Provider/Admin, backend, shared types, and Flutter. Categories distinguish classification presentation, actual bookable content, internal contracts/business rules, and tests/documentation. Generic package/catalog wording remains classified as bookable content; declarations, comparisons and payload fields remain internal contracts. No global replacement of identifiers was used.

- Shared `ProviderServiceType` remains `catering | addon | both`; service categories still exclude `both`.
- Backend category validation still accepts only `catering` and `addon`. Provider registration still accepts `both`.
- `serviceType`, `providerServiceType`, `serviceCategories`, category codes/document IDs, callable names/payload keys, and the `addons` collection are unchanged.
- Frontend creation tests assert the original identifiers for both category classifications; editing tests assert the original `addon` field/code and locked active classification. Onboarding tests save/reload all three provider types without remapping categories.
- Marketplace tests exercise the real loader against a mocked Firestore query implementation: original URL identifiers, exact `providerServiceType` query filters, returned providers, category associations, and presentation labels are verified for all three types. Existing filtering behavior is preserved, including exact matching for `both`.
- New emulator tests run actual category handlers against real demo Auth/Firestore: create/edit both types, capacity flags, `adminLogs` audit records, rejection of unknown/combined category values, active-category restrictions, discontinuation/reactivation, in-use provider/add-on deletion restrictions, unused deletion, and denied customer management.
- Emulator fixtures prove stored `serviceType: "addon"`, stored provider `providerServiceType: "both"`, provider category arrays, and seeded optional add-on price `4500` remain unchanged after lifecycle operations.
- No financial serialization, price calculation, booking totals, backend source, shared source, or rules changed. No Firestore migration, Cloud Functions deployment, or Firestore rules deployment is necessary for this UI change.

The new handler integration suite uses `.run()` and real Auth/Firestore authorization; it does not claim to validate HTTP/App Check transport. Existing callable security contracts and rules suites cover those separate restrictions. Browser rendering at physical viewport sizes was not run: responsive help is verified structurally via the actual component's named region, semantic description list, responsive grid classes, and absence of controls.

## Final validation results

| Check | Changed checkout | Integration baseline | Result |
|---|---:|---:|---|
| Focused affected web suites (8 files) | 131 passed, 0 failed | n/a | PASS |
| New classification UI/helper tests | 19 passed, 0 failed | n/a | PASS |
| New marketplace query/result tests | 3 passed, 0 failed | n/a | PASS |
| Full Vitest component suite | 1,833 passed, 18 failed; 167 files | 1,811 passed, 18 failed; 165 files | Same existing failures; 22 added passes |
| Web security contract suite | 141 passed, 1 failed; 142 tests | 141 passed, 1 failed | Same existing failure |
| Backend full Node unit suite | 1,358 passed, 4 failed; 1,362 tests | 1,358 passed, 4 failed | Same four existing failures |
| Shared-types build/tests | build passed; 39 passed, 0 failed | build passed | PASS |
| New category handler emulator suite | 8 passed, 0 failed | n/a | PASS |
| Firestore/Storage rules emulator suite | 73 passed, 1 failed; 74 tests | 73 passed, 1 failed | Same existing failure |
| Provider workflow acceptance script | failed, aborts at assertion; no test-count reporter | same assertion failure | Existing fixture mismatch |
| Payment emulator scripts | 1 file passed, 2 files failed; 3 file-level Node tests | same 1 passed, 2 failed | Existing failures |
| Customer booking/provider lifecycle/availability emulator scripts | 1 file passed, 2 files failed; 3 file-level Node tests | same 1 passed, 2 failed | Availability concurrency passed; existing booking/lifecycle failures |
| Flutter selected tests | 16 passed, 0 failed | isolated integration mobile source | PASS |
| Flutter selected static analysis | 3 files, no issues | isolated integration mobile source | PASS |
| Web TypeScript | exit 0 | n/a | PASS |
| Web ESLint | exit 0, no reported warnings | n/a | PASS |
| Cloud Functions TypeScript build | exit 0 | exit 0 | PASS |
| Backend ESLint | exit 0; 0 errors, 473 warnings | unchanged backend source | PASS with existing warnings |
| Next.js production build | exit 0 with live demo Firestore emulator | n/a | PASS |
| Diff whitespace check | exit 0 | n/a | PASS |

No skipped/cancelled/todo tests were reported in the final Node suites. All tests are reported as actually run; file-level acceptance counts do not imply that later assertions inside failed scripts executed.

Commands: frozen `pnpm.cmd install --frozen-lockfile`; shared `build` and `test`; backend `build`, `lint`, and `node --test functions/test/*.test.cjs`; web `typecheck`, `lint`, `test:security`, and `exec vitest run --maxWorkers=3`; demo Firebase `emulators:exec` for the listed acceptance files; Flutter `pub get --enforce-lockfile`, the three selected test files, and analyze of `service_category.dart`, `provider_onboarding.dart`, and `domain_enum_serializers.dart`.

Evidence lives under `../.validation/`, including `focused-final.log`, `web-components-final.log`, `baseline-components.log`, `web-security-final.log`, `baseline-security.log`, `backend-tests.log`, `baseline-backend-tests.log`, `shared-tests.log`, `emulator-classification-final.log`, `emulator-rules.log`, `baseline-rules-final.log`, `emulator-provider.log`, `baseline-provider-final.log`, `emulator-payment.log`, `baseline-payment-final.log`, `emulator-booking-availability.log`, `baseline-booking-availability.log`, `web-build-final.log`, and Flutter logs. CLI environment dump lines were removed from retained logs.

The build used only `demo-feasta-phase3`, emulator flags/loopback hosts, fake browser Firebase configuration, and no production credentials. Initial build compilation passed but prerender failed without Firestore; rerunning with the local emulator passed. Initial unbounded Vitest run suffered worker startup failures and one timeout; the bounded final run had no worker errors and reproduced the baseline's actual 18 failures. Initial new-test setup mistakes (default app initialization and `auditLogs` instead of `adminLogs`) were corrected; the final eight tests passed without weakening assertions. Java emulator processes sometimes survived CLI shutdown; only command-line-verified processes belonging to these new worktrees were stopped.

## Existing failures, unchanged assertions

Full web component failures by suite: marketplace discovery (2), marketplace header (6), customer packages (3), provider authentication (2), provider earnings statement service contracts (2), admin financial report service contract (1), provider messages contract (1), and representative screens (1). The exact failing case titles match baseline; unrelated assertions were not weakened.

Web security: `provider-phase-f-contract.test.mts`, verification document direct-file selection/navigation expects `input.click()` absent on integration. The onboarding source-contract label expectations were updated to the deliberately changed text and pass.

Backend failures:
- not ok 267 - shared preference and session mutations require trusted roles
- not ok 455 - refund adjudication and execution never accept browser money authority
- not ok 1162 - settlement conflict fails closed before duplicate finance creation
- not ok 1360 - remaining-balance webhook does not override provider-request lifecycle

Rules: private verification file access fails with `storage/unauthorized` in `storage.rules.test.cjs:307`, reproduced on baseline.

Provider workflow: `verifyOnboardingMediaContract` expects `PERMISSION_DENIED`, but its fixture fails earlier with `INVALID_ARGUMENT: businessRegistrationType has an invalid value`, reproduced on baseline. This script aborts before later registration/approval assertions; no end-to-end success is claimed.

Payment: checkout concurrency expects two successful results but receives zero; lifecycle checkout fails because provider payout setup is missing. The webhook script passes. All reproduced on baseline.

Additional booking acceptance: customer booking contract expects schedule-unavailability text but gets a different precondition; provider lifecycle rejects starting before scheduled event time. Availability concurrency passes. Both failures are reproduced on baseline.

## Flutter compatibility and follow-up

Inspected only the new worktree's integration snapshot. Canonical enum serialization remains `catering`, `addon`, `both`; category deserialization accepts `catering`/`addon`. Legacy provider parser aliases `add_on`/`addons` already exist and were left untouched. Provider onboarding tests, customer payment source-contract tests, and runtime security tests pass (16 total); selected classification source analysis passes.

Separate mobile follow-up: review broad provider/discovery wording such as **Add-on Marketplace**, **add-on providers**, **Add-on Provider**, and related empty/error copy in `features/customer/addon_marketplace_screen.dart` and `features/authentication/data/repositories/feasta_repository.dart`. Those views also select actual optional services, so classification descriptions should be updated individually while preserving **Use Selected Add-ons**, booking selections, notification/payment workflow descriptions, subtotals, receipts and prices. No mobile source, Pia branch, or existing worktree was edited.

## Review disposition

The presentation task is implemented and its focused behavior/compatibility tests pass. There are zero observed newly introduced failures; broader integration is already red. **NO-GO for claiming full regression readiness or creating a fully validated PR** until those existing failures receive explicit disposition. Stop here for review. No commit, push, PR, merge, or deployment was performed.
