# Strict UI revisions ? realme C55 review

Implemented in the original repository on `feat/mobile-customer-parity`. No commit, push, merge, deployment, production data/rules changes, booking submission or payment was performed. Existing edits and diagnostic reports were retained.

## Files changed in this task

- `lib/features/customer/customer_home_screen.dart`
- `lib/features/customer/event_customization_screen.dart`
- `lib/features/customer/widgets/preparation_availability.dart`
- `lib/features/customer/widgets/package_option_cards.dart`
- `test/features/customer/event_services_revision_test.dart` (new)
- `test/features/customer/preparation_availability_test.dart`
- `test/features/customer/package_customization_revision_test.dart`
- `test/features/customer/provider_discovery_test.dart`
- `test/features/customer/goldens/package-options-1.0.png`
- `test/features/customer/goldens/package-options-2.0.png`
- `docs/strict-ui-revisions-review.md` (this report)

Paths above are relative to `apps/customer_mobile`. Several touched files already contained local work before this task; this list does not attribute their full Git diff to this task.

## Canonical Event Services

Website source: `apps/web/src/lib/service-categories/service-category-service.ts`, consumed by `apps/web/src/app/services/page.tsx` and the customer provider directory. The web reader loads `serviceCategories`, validates category codes/name/type/status, sorts alphabetically (case-insensitive locale collation), and exposes active categories. The directory industry selector also filters active categories.

Home now uses the existing Flutter `FeastaRepository.getActiveServiceCategories(forceRefresh: true)`, which reads that same existing collection, validates records and sorts names case-insensitively. It fetches on screen creation and pull-to-refresh/retry, bypassing the repository memory cache. Refresh completion waits for the category request. Loading, empty and failure states never supply invented categories or stale cards. Cards retain compact horizontal scrolling; navigation sends the actual category code through `CustomerSearchScreen.initialCategoryCode`. Display names are canonical. Existing mobile icon families are mapped by code; unknown codes use the neutral grid icon, because the canonical contract has no icon field.

This is genuinely data-driven for authorized mobile reads: category membership, name and active status changes appear on the next refresh or Home creation. It is not a realtime subscription. Alphabetical ordering follows the website's intent; Dart lowercase comparison is not identical to JavaScript locale collation for every accented/punctuated name.

Access limitation: `firebase/firestore.rules:793` restricts category reads to `isActiveSignedInUser()`. The website uses Admin SDK reads and can display categories publicly. Guest mobile reads can therefore fail and show the retry state. Unconditional public/guest parity is NOT complete. Supporting that requires a backend-owned public read endpoint or a separately reviewed public read policy for the existing catalog, with the same validation/filtering/order. No new endpoint, collection or rule was invented or changed, and production category contents were not queried or modified here.

## Availability

Successful validated available responses render a pale-green rounded banner with a green checkmark, emerald provider-name heading (for example, ?SB is available?), and ?Available for your selected event.? beneath it. The exact advisory sentence was removed from the mobile implementation. It remains only in the negative test assertion.

Checking, incomplete, unavailable and unable-to-verify states remain neutral. The original callable, response validation, debounce, generation-based stale-response guard and rechecking remain in place. Input changes immediately clear green success styling. No reservation or booking action was added.

## Theme Options

Published themes now use compact horizontal cards with the actual reference image, name, optional published description, and trailing circular selection indicator. Missing/broken images use the existing neutral compact fallback. Theme cards no longer contain Choose/Selected text; catering service-tier Choose/Selected controls remain.

Published themes appear first, then No theme needed, then Request a custom theme. Selection is exclusive; published themes can be deselected. Custom requests expand a labelled multiline field with the requested example placeholder and Cancel request. Cancelling clears only custom-theme draft information. Re-tapping the selected custom request preserves text. Draft restoration, Back/Continue, review notes and existing pricing remain intact; custom themes get no invented price.

## Validation

- Focused suite: 39 tests passed across event_services_revision, preparation_availability, package_customization_revision, provider_discovery and explore_marketplace.
- Visual baselines regenerated and inspected at 360 logical pixels / representative C55 scale, text scales 1.0 and 2.0. Theme choices wrap without overflow. Separate golden comparison run passed.
- Changed-file Flutter analysis: no issues (8 files).
- `git diff --check`: passed; existing CRLF normalization warnings only.
- Firebase was mocked in widget tests. Live authorization, catalog contents and availability responses were not verified on production.

## Required realme C55 review

1. Signed in: check canonical categories, horizontal scrolling, category-code filtering and pull-to-refresh. Guest: verify a truthful load failure under current policy.
2. Select a valid future date/time and verify the banner with the provider name after a successful check. Change date/time and confirm success disappears immediately; check unavailable/offline states.
3. Check published theme thumbnails/fallbacks, radio indicators, select/deselect, No theme needed, custom text entry, cancellation and preserved unrelated notes.
4. Navigate Back/Continue and Review Event; verify selected theme/custom request and service-tier estimate.
5. Check normal and enlarged text, keyboard, multiline input and fixed footer spacing. Do not submit a booking or initiate payment.

Only the request text was attached; `revisions (2).pdf` and its screenshots were not available. Styling follows the supplied textual specifications; exact screenshot matching remains unverified.
