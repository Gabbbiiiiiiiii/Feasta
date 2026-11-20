# Step 7K-7: Mobile Step 3 parity

## Result and deployment blocker

Mobile now displays the normalized event-service catalog inline, with the Web count wording, service images and provider names, advance-booking notices, selected services, displayed add-ons subtotal, optional-service explanation, and Review booking action. Empty catering-provider sections, the browse route button, own-add-ons control, Step 3 request input, and duplicate Step 3 price card are removed. The footer retains the actual package estimate.

**Catalog parity is not active until the new `listCustomerEventServices` callable is deployed in asia-southeast1. No deployment was performed.** Errors fail closed with a retry; Mobile does not fall back to unverified raw records. Existing selections are revalidated through exact-id lookup on the same callable, independently of the discovery page limit.

## Catalog diagnosis

Both platforms use `addons`, not different collections. Web's `getPublicEventServices` uses Admin reads: active + available candidates (60 maximum), then published status, isPublished, not deleted, valid provider id, approved/public/active/non-suspended provider, valid business name/service type, active provider owner linked to that provider, and matching add-on/provider ownerId. It normalizes text, HTTPS image URL and published numeric price, sorts own-provider services first then names, and returns 20.

The old Mobile `marketplaceAddons` additionally required legacy `providerType == addon_provider`, explicit `isDeleted == false`, and createdAt ordering before taking 20. Missing legacy fields, a missing createdAt, or a different candidate window can exclude records Web accepts. It also directly parsed denormalized providerBusinessName and did not perform Web's provider-owner join. `addonsByProvider` likewise used a different bounded direct query. These are confirmed code-path differences; no live photography document was read, so its exact failing field cannot be asserted.

The new callable reproduces the Web checks and normalization. Provider business name comes from the verified provider record; image and price come from the published add-on; lead time comes from the provider's bookingLeadTimeDays. Event-specific eligibility, advance-booking restrictions, availability, and final pricing remain checked by the existing server availability/submission paths. Discovery itself does not assert event availability. Unknown, failed or unavailable checks disable additions; existing selections remain removable.

Portrait Photography from Lerie's Photo should appear after deployment if it still passes the same current Web candidate/owner checks. Its name, provider and 750 price are not hardcoded. Production Web was not modified. Live record status and device rendering against the deployed callable remain unverified.

## Preserved behavior and Step 1 exception

Saved special requests, selected add-on identities, legacy own-add-on notes/settings, draft persistence and restoration, leave dialog, pricing, submission, payment and refund behavior are retained. Legacy own-add-on settings do not become catalog selections or contribute prices.

The requested assumption that Step 1 already contained Special request was false in this checkout: its only input was in Step 3. That existing input was moved to Step 1 using its existing controller and persistence. Therefore Step 1 is **not strictly unchanged**: this relocation is its only functional change. Its calendar and other existing fields are unchanged. Step 2 behavior/design is unchanged; formatting may differ.

## Validation

- Flutter focused Step 3 plus booking, pricing, draft, session, readiness and navigation regressions: 126 distinct tests pass, 0 fail (125-test run followed by 15 focused tests including one additional notice case).
- Backend direct Web/Mobile catalog comparison and function security contracts: 137 pass, 0 fail. The reviewed export inventory includes the new callable and its security requirements.
- Targeted Dart analysis of changed production files and affected tests: no issues.
- Functions TypeScript no-emit compilation: passed.
- Targeted backend ESLint and git diff --check: passed.
- Additional broader runs are not green: 13 failures in mobile_v2_compatibility_test.dart (8 provider-profile capacity cases and 5 provider add-on availability cases), and 1 in package_customization_revision_test.dart (expects Selected Package). These failures concern untouched discovery/profile behavior and remain intact; this is not a claim that the full repository suite passes.
- 320px width / 200% text scaling service rendering, published image/fallback, restrictions, selection/count/subtotal, stale/failed availability, 20-selection enforcement, zero-selection review, saved special-request handoff and server-refreshed add-on pricing are covered.

No reset, stash, staging, commit, push, Firebase write, deployment, or emulator was performed. Existing unrelated modifications and untracked files were preserved.

## Exact files changed in this task

Production:
- apps/customer_mobile/lib/features/customer/event_customization_screen.dart
- apps/customer_mobile/lib/features/customer/widgets/event_services_selection.dart
- apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart
- apps/customer_mobile/lib/shared/models/feasta_models.dart
- functions/src/catalog/list-customer-event-services.ts
- functions/src/index.ts

Tests:
- apps/customer_mobile/test/features/customer/event_services_selection_test.dart
- apps/customer_mobile/test/features/customer/booking_preparation_flow_test.dart
- apps/customer_mobile/test/features/customer/customization_descendants_test.dart
- apps/customer_mobile/test/features/customer/customization_session_test.dart
- apps/customer_mobile/test/features/customer/event_list_customization_ui_test.dart
- apps/customer_mobile/test/features/customer/booking_submission_navigation_test.dart
- apps/customer_mobile/test/features/customer/package_customization_revision_test.dart
- functions/test/event-service-catalog-parity.test.cjs
- functions/test/function-security-contract.test.cjs

Report:
- docs/step-7k-7-mobile-step3-parity.md
