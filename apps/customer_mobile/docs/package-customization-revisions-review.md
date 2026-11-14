# Package and customization revisions ? 18 October 2026

Branch: `feat/mobile-customer-parity`. Source changes only; ready for realme C55 review.

## Revisions

1. Package Details uses vertically stacked selectable service cards with published title/name (or existing tier label), optional published description, formatted price, published includedServices, and Choose/Selected state.
2. Service, theme and About sections have separate rounded surfaces and 16px section gaps.
3. Select Package has no sliders icon; existing login and fresh eligibility check remain.
4. Published theme names/descriptions and first available imageUrls reference (legacy imageUrl also supported) share a preview component. Missing/failed images use compact neutral fallbacks. Empty optional theme sections are omitted. Details previews are informational; customization retains the supported tier-dependent selection workflow.
5. A connected four-number non-interactive display replaces step chips, including Review's fourth step. Continue validates schedule, future date/time, guests, city and address before Step 2; it validates package/service/theme/inclusion compatibility before Step 3. Review retains fresh backend package/add-on checks and complete validation. Back preserves compatible fields; reopened drafts start at Event Details to require validation again.
6. Customize your event introduces a compact Selected Package summary with image fallback, name, provider and explicitly labeled published package price. The header occurs once per scrollable step, rather than duplicating a large summary within sections.
7. Customize Package uses the same ServiceOptionCards as Details. Initial selection transfers after eligibility checks; customization changes update Details through an in-memory callback. The session draft and Review carry the selected tier. PackageThemeCards is shared between preview and selection. Switching to drop-off clears incompatible themes; supported tier changes preserve compatible themes.
8. Price Estimate uses aligned label/value rows, one shared calculation and a single published-price disclaimer. Unknown request costs remain explicitly excluded. Missing prices never become zero.
9. Footer shows Known estimate and Estimated total using the same calculation, then outlined Back left and emerald Continue right. Both amounts describe the current published-price estimate; no separate final-charge calculation is invented. Compact incomplete states avoid verbose footer wrapping. SafeArea remains; keyboard hides the sticky footer, leaving the form scrollable and actions restored on dismissal.

## Pricing and data limits

Selected tier price replaces package base price. Existing selected priced add-ons are added once. A missing tier or unknown selected price prevents a numeric total. Titles use the existing tier labels when custom titles are absent; missing provider descriptions/inclusions are omitted. No sample provider prices, theme names, fees or inclusions are hardcoded.

The web reference was inspected in apps/web/src/components/customer/packages/package-detail.tsx and its tier helper. The six-page revisions.pdf was not present in the supplied attachment/workspace, so direct screenshot matching is unavailable. No live Firestore records were read or changed during this task; tests use fixtures and repository doubles. Device review must confirm the current SB published data.

## Exact implementation/test files changed in this task

- lib/core/helpers/booking_preparation.dart
- lib/features/customer/package_details_screen.dart
- lib/features/customer/event_customization_screen.dart
- lib/features/customer/booking_summary_screen.dart
- lib/features/customer/widgets/booking_preparation_price.dart
- lib/features/customer/widgets/package_option_cards.dart (new)
- test/features/customer/booking_preparation_flow_test.dart
- test/features/customer/phase2_refinement_test.dart
- test/features/customer/package_customization_revision_test.dart (new)
- test/features/customer/goldens/package-options-1.0.png (new)
- test/features/customer/goldens/package-options-2.0.png (new)
- docs/package-customization-revisions-review.md (this report)

Local test transcripts: revision-test-results.txt, revision-flow-results.txt, revision-new-tests.txt. They are diagnostics, not application assets. All earlier uncommitted work, commits, seven generated-plugin files and configuration were retained.

## Validation

Focused suites: booking_preparation_test.dart, booking_preparation_flow_test.dart, phase2_refinement_test.dart, package_customization_revision_test.dart. Coverage includes replacement pricing, unknown prices, single service selection, selection transfer, theme fallback and preservation, sequential validation, draft Back navigation, login boundaries, fresh backend rejection, keyboard dismissal, responsive 360px layouts and 1x/1.3x/2x text, aligned footer actions, and no booking/payment submission calls.

Two readable-font component goldens establish service/theme/progress regression baselines at 1x and 2x. These are generated baselines, not comparisons with the unavailable PDF. Existing tests verify package image fallbacks and preparation-only Review. Final results: 34 tests passed, including both golden comparisons. Changed-file analysis: no issues. git diff --check: passed (existing CRLF conversion warnings only).

## Realme C55 review

Review the actual SB package's three published service prices and inclusions, service transfer in both directions, theme photos, spacing and footer composition against revisions.pdf. Complete date/time/guest/address validation, Back edits, tier/theme changes, priced add-ons and Review. Check Android safe areas, keyboard open/close, scroll access and enlarged system text on the physical phone. No build was installed and no app data was cleared by this task.

No commit, push, merge, deployment, Firebase rule/configuration changes, maps work, booking submission or payment was performed. Stop here for device review before another feature.
