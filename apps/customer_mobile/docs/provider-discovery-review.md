# Customer provider discovery review ? 2026-10-18

## Existing behavior and contracts inspected

Home, Search, provider collections and profile sections already read Firestore. Home routes to Search with the entered keyword; category routes pass a category code. Provider cards pass the selected ProviderModel to ProviderProfileScreen. Published package details already provide price, inclusions and customization, and Menu and Reviews use repository streams. The Photos tab was a placeholder.

Public provider listing queries require verificationStatus=approved, publiclyVisible=true, isActive=true, isSuspended=false and isDeleted=false. Public get rules additionally check required profile fields and the linked owner's current account. List rules rely on the backend-owned publiclyVisible projection; the app must not query private owner records. Required public fields are businessName, description, address, city, province and a recognized providerServiceType. Verification badges retain the existing approved verification-status contract.

Packages use isActive, isPublished, providerPubliclyVisible, status=published and isDeleted filters. Existing menu/review visibility queries are preserved. No rules, indexes, backend records or functions were changed.

## Implemented

- Read publiclyVisible into ProviderModel with a false default. A discovery-specific helper rejects private, inactive, suspended, deleted, unapproved and incomplete profiles, and requires city to be Ormoc or Ormoc City (trimmed, case insensitive). This does not change eligibility in booking workflows.
- Enforce this policy on existing Home, recommended, featured, service and Search discovery lists, and defensively on the collection screen.
- Search name, service type and category together with eventTypesSupported, address/location within Ormoc, and provider price-range overlap. Category and keyword now combine; clearing all filters clears the category constraint too.
- Search owns a stable bounded public stream. Typing and changing local criteria no longer recreate the query. Removed dependence on inconsistent legacy searchTokens for this bounded discovery selection.
- Unknown/nonpositive starting prices do not appear as free offers or match budget filters. Unknown guest capacity no longer passes an explicit guest filter. Home and collections display known starting prices; unrated providers have no numerical rating claim.
- Home distinguishes load errors from empty lists. Existing skeletons, collection states, image fallbacks and profile optional-information states are retained.
- Photos displays available public cover/logo URLs, deduplicated, with a truthful empty state and existing network-image fallback.
- Removed the direct provider totalViews increment during profile opening: security rules protect server-owned counters. No replacement write was added.

## Modified files

- lib/core/helpers/provider_discovery.dart (new)
- lib/shared/models/feasta_models.dart
- lib/features/authentication/data/repositories/feasta_repository.dart
- lib/features/customer/customer_home_screen.dart
- lib/features/customer/customer_search_screen.dart
- lib/features/customer/customer_provider_collection_screen.dart
- lib/features/customer/provider_profile_screen.dart
- test/features/customer/provider_discovery_test.dart (new)
- docs/provider-discovery-review.md (this file)

## Validation

Focused Flutter suite: 16 tests passed across provider_discovery_test.dart, provider_review_card_test.dart and home_text_hierarchy_test.dart. Coverage includes unsafe visibility states, required profile information, exact city boundaries, combined filters, missing prices, clearing category/text search, stable query/subscription while typing, correct provider selection for the profile route, loading/empty/error states, absent photos/reviews and a 360-pixel-wide collection layout at 1.3 text scale.

Changed-file Flutter analysis: no issues. git diff --check: passed (existing platform files emit line-ending notices).

No running Firebase emulator test environment was detected at the configured local ports; live approved-provider reads were not validated. No production records were created or changed. Unit/widget streams validate client behavior, not deployed indexes or production projection freshness.

## Backend handoffs and limits

- Discovery Search filters the first 50 public profiles ordered by favoriteCount/document ID; Home recommendation queries remain capped at 20. Ormoc/profile checks occur after those caps. Results are a bounded discovery selection and may omit matching providers outside that selection. Full coverage needs cursor pagination and a canonical server-maintained city/search contract with corresponding reviewed indexes. No new index is needed for the existing unfiltered public query shape; verify deployed index parity on the Firebase environment.
- Ormoc eligibility uses the structured city, not substring matches or inferred service radius. Outside-city providers advertising Ormoc in serviceAreas are excluded under the requested city scope.
- Budgets use provider minPrice/maxPrice summaries, not a quote or live package-price join. Event type uses eventTypesSupported. Package availability and actual prices remain visible in the profile/details. Missing metadata never creates an asserted match.
- Existing catering-only recommendation queries still select providerServiceType=catering; Search can also discover type=both. Broader recommendation coverage would require a reviewed query/index change.
- Date availability is intentionally absent: the existing booking-capacity check does not establish accurate public discovery availability across scheduling constraints. A server-backed discovery availability contract is needed before exposing that filter.
- No gallery collection was established; Photos uses only existing public profile images. Package/menu images remain in their existing sections.
- Public projection freshness remains backend-owned. Restoring view analytics requires an authorized server endpoint; no direct client counter write should be restored.

## Realme C55 review

Check Home ? typed search/category ? provider profile; budget/event/Ormoc-area filters; clear actions; live published packages, inclusions/customization, Menu, Photos and Reviews. Confirm loading/error handling with connectivity changes, keyboard behavior, card height and scrolling at the device font scale. The Home provider rail has slightly more height for the starting-price line. Confirm the unchanged opening animation remains smooth; discovery work was not added to startup/bootstrap.

Existing commits, local platform/branding changes, seven generated-plugin files and diagnostic reports were preserved. No commit, push, merge, deploy or Firebase write was performed.


## Guest search cards and category tabs follow-up ? 2026-10-18

Root cause confirmed with a failing widget regression against the original card: an actual cover-image URL takes the Image.network/loading path with height=double.infinity beneath IntrinsicHeight. Intrinsic measurement fails with height.isFinite, leaving the independently rendered result count visible while the cards cannot lay out. The missing-image placeholder path did not reproduce the failure, explaining why earlier text-only tests passed. Replaced intrinsic/stretch sizing with a naturally sized row and a finite 156-pixel image. The text column can grow. Counts and cards still consume the same filtered collection; the bounded query and guest browsing policy are unchanged. Existing case-insensitive substring/keyword matching already supports single-character name prefixes without Enter.

Profile tabs use normalized existing providerCategory and providerServiceType fields. Photography/videography uses Packages, Portfolio, Reviews; Portfolio reuses deduplicated public cover/logo images and has a camera/portfolio empty state. Catering and cake/pastry use Packages, Menu, Photos, Reviews. Florists and other non-food categories use Packages, Photos, Reviews because no structured catalog source exists. No catalog or content is fabricated. Provider/classification changes reset selection to Packages, preventing stale indexes with different tab counts. Existing horizontal chip scrolling and emerald styling remain. Photos already has content-sized layout with no forced gallery minimum height; no speculative spacing change was made.

Files changed in this follow-up: lib/core/helpers/provider_category_helper.dart, lib/features/customer/customer_search_screen.dart, lib/features/customer/provider_profile_screen.dart, test/features/customer/provider_discovery_test.dart and this document.

Validation: 21 focused tests passed across provider_discovery_test.dart, provider_review_card_test.dart and home_text_hierarchy_test.dart. Added rendered-card checks for one/three matches, finite card dimensions, image URL loading/fallback, immediate L/Le/Ler/Lerie typing, category plus text, clearing text while retaining category, a 360-pixel screen with simulated keyboard inset, stable query/subscription and selected-provider navigation. Guest authentication is mocked with currentUser=null. Profile widgets verify photographer/catering/florist/cake tabs, appropriate empty states and selection reset between providers. Changed-file Flutter analysis: no issues. The image-URL regression failed against the original layout and passed after the fix.

Remaining limits: Search still filters at most 50 loaded public profiles. No live Firebase provider read was validated in this follow-up, and no production data, rules, indexes or functions were modified. No commit, push, merge or deployment was performed. Existing local changes and generated-plugin files were preserved.

Realme C55 review: In Guest Mode search Catering Service and confirm all counted cards can be reached by scrolling; search L, Le, Ler and Lerie without Enter; clear text and combine category filters; check keyboard-open/closed scrolling, image loading/fallback and the selected profile route. Check photographer Portfolio, catering/cake Menu, florist Photos fallback, empty photo states and vertical spacing. Review at the device font scale. Stop here for real-device review.

## Final Explore Providers marketplace UI - 2026-10-18

Implemented a responsive two-column Explore grid using the existing public provider stream. Covers have a bounded 0.88 height-to-width ratio; ProviderBrandVisual retains separate, contained logo badges and neutral missing/failed-image fallbacks. Cards use two-line names, truncated locations/categories/prices, reserved name/rating space, actual approval badges and review data only when available. Prices are shown only when finite and positive. Rows scale with available width and accessibility text size; the grid builds cards lazily.

Search updates locally on every keystroke, including single letters, through matchesProviderDiscovery and compareProviderSearchRelevance. Existing keyword fields remain business name, service type and category. Filters expose existing category, event type, location and budget matching; no date or speculative availability filtering was added. Clearing the keyword keeps filters. One stable input stream is retained across typing and filter changes. The repository query, public visibility contract and 50-profile bound are unchanged.

### Shared navigation integration

The existing imperative Explore route previously covered CustomerMainScreen, including its bottom bar. Home now offers optional open/close callbacks, and CustomerMainScreen hosts Explore as a Home subpage inside its existing body stack. There is one existing _FeastaBottomNavigation instance, using all existing destination, guest-authentication and Plan handlers. Home stays mounted offstage while Explore is visible, with its tickers disabled. Explore's body does not extend behind navigation. SafeArea and Explore-only keyboard inset padding keep the bar accessible above the keyboard. The AppBar back button and Android Back return to Home; Back closes an open Plan layer first. Selecting Home closes Explore. Provider cards still push the existing profile route. Standalone Home use retains its imperative route fallback; the app's sole production Home constructor is in CustomerMainScreen. Home's layout and the separate Search screen were not changed by this work.

### Exact files changed in this pass

- lib/features/customer/customer_provider_collection_screen.dart
- lib/features/customer/customer_home_screen.dart (Explore callbacks and opening only)
- lib/features/customer/customer_main_screen.dart
- test/features/customer/explore_marketplace_test.dart (new)
- test/features/customer/provider_discovery_test.dart (extend existing fixture with location/rating/review arguments)
- docs/provider-discovery-review.md (this appended review)

### Validation

Changed-file Flutter analysis over the five Dart files: no issues.

43 focused tests passed across explore_marketplace_test.dart, provider_discovery_test.dart, provider_brand_visual_test.dart, search_relevance_test.dart, home_text_hierarchy_test.dart and provider_review_card_test.dart. Coverage includes a C55-representative 1080x2400 physical viewport at 3x logical scale, two columns, distinct real cover/logo URL rendering, failed/missing image fallbacks, long text at 1.3x and 2x scales, large review counts, live guest single-letter search, relevance ordering, combined filters and keyword-only clearing, one subscription, selected-provider routing, actual main-shell fixed navigation, focused keyboard-open scrolling, Plan/back handling, loading/empty/error/recovery states and overflow checks.

Final git diff --check: passed, with line-ending notices for pre-existing platform/generated files. No backend, rules, indexes, authentication, launcher/opening assets, profile tabs or transaction flows were edited in this pass. Existing commits, ongoing changes and the seven generated-plugin files were preserved. No commit, push, merge or deployment was performed.

### Remaining realme C55 review

- Open Home > Explore Providers and review the two-column balance, logo legibility, long names/locations, actual review/price data and image loading/fallbacks at the device's real font/display scale.
- In Guest Mode type a single letter, combine category/event/location/budget filters, clear only the keyword, and open the intended provider profile.
- Check fling scrolling with the keyboard open and closed, system gesture/three-button safe areas, fixed navigation, Plan toggle/back, AppBar/Android Back and Home selection.
- Check Messages, guest Bookings login and Login/Account with the existing authentication boundaries; inspect network interruption/recovery with real public Firestore data.
- Live Firebase reads and real-device performance were not validated by these widget tests. The actual C55 logical density may differ from the representative test viewport. Discovery remains limited to the existing 50-profile selection.

Implementation stops here for real-device review; no install or deployment was performed in this pass.
