# Phase 1 review ? 2026-10-18

Implemented in the original customer mobile application on feat/mobile-customer-parity. Phase 2 is deliberately pending realme C55 review and explicit approval.

## Exact files changed for this task

- lib/features/customer/provider_profile_screen.dart
- lib/features/customer/widgets/provider_brand_visual.dart
- lib/features/customer/location_picker_screen.dart
- lib/features/customer/customer_main_screen.dart
- test/features/customer/provider_discovery_test.dart
- test/features/customer/explore_marketplace_test.dart
- test/features/customer/location_action_panel_test.dart (new)
- docs/provider-profile-location-phase1-review.md (this report)

## Profile

Real public cover URL uses proportional BoxFit.cover; absent/failed covers retain neutral fallbacks. White information card overlaps the hero, with a circular contained logo overlapping the card edge. Circular logo padding preserves square artwork inside the circle; source files and marketplace logo styling are preserved. Verification uses the existing isApproved contract with an inline WidgetSpan beside the business name. Reviews use existing provider aggregates only when reviewCount is positive; otherwise show No reviews yet. Location uses a pin without a redundant label. Book Now appears left, Chat right at ordinary phone widths; very narrow layouts or text scaling above 1.6 use a primary-first vertical fallback. Existing guarded action handlers, favorites, streams and category tabs remain. Package empty states use category-aware existing icons and content-sized layout. Photo empty states use No photos available yet.

The earlier reference screenshots were not attached in this session; implementation follows the written composition and requires visual comparison on the C55.

## Map investigation and blocker

Existing integration is google_maps_flutter, with a native GoogleMap, initial camera at the stored address, pan/zoom callbacks and center pin overlay. Android has INTERNET, coarse/fine location permissions, hardware acceleration and adjustResize. Current-location access remains explicitly initiated through the existing permission-aware service. Search, place details and reverse geocoding use existing Firebase callable services in asia-southeast1, separately from native map tiles.

android/app/build.gradle.kts reads MAPS_API_KEY solely from android/local.properties, defaulting to an empty string; AndroidManifest.xml substitutes it into com.google.android.geo.API_KEY. Local inspection confirmed no nonempty MAPS_API_KEY entry. This is a confirmed local build configuration blocker for Google map tiles. The pin is a Flutter overlay and can appear even when native map tiles fail. No key value was logged, and no credential, billing, SDK, dependency, security or backend setting was changed.

ADB detects the connected realme C55. Retained logcat filtered to Google Maps Android API contained no diagnostic entries. Therefore the exact authorization/billing status of the already-installed APK is not established; the missing local build key must not be presented as proof of that APK's configuration. No app install, data clearing or automated device interaction was performed. Map loading still requires an authorized existing Google Maps Android configuration and device verification; do not introduce a replacement service.

## Location panel and consistency

Overflow source: fixed 40% screen height, non-scrollable content, Expanded confirmation footer and duplicate safe-area bottom padding. Replaced with content-sized, scrollable content capped at 55% screen height, one SafeArea and naturally sized buttons. Manual address entry is always accessible, including when the native map is blank. Keyboard resizing keeps search within available screen space; existing bottom-panel hiding while typing remains.

Camera movement invalidates stale reverse-geocode requests immediately. Each request captures its coordinates, preventing an older address from being combined with a newer pin. Confirmation is disabled during resolution or an error; manual entry remains available. Editing an address synchronizes cameraTarget and animates the map, preventing confirmation from overwriting edited coordinates with the previous camera target. Existing local address storage and Ormoc/manual validation remain; no booking is created.

## Shared navigation

Removed Explore-only padding equal to keyboard height. CustomerMainScreen now sets its existing bottomNavigationBar to null whenever current viewInsets.bottom is positive. Keyboard dismissal reconstructs the same navigation component with the retained destination/Plan state and SafeArea. No second bar or route changes were introduced. This applies equally to guest and authenticated shell states.

## Validation

Focused suite: 37 tests passed across provider_discovery_test.dart, explore_marketplace_test.dart, provider_brand_visual_test.dart and location_action_panel_test.dart. New regressions cover long profile identity/location at 360 logical pixels and 1.0/1.3/2.0 text scale; ordinary side-by-side action placement; shared navigation absent during keyboard-open scrolling and restored afterward; category tabs; manual entry and error-disabled confirmation in a scrollable panel with bottom safe area at 1.0/1.3/2.0 scales. Existing coverage verifies real cover/logo URL wiring and image failures, guest discovery and category switching. Widget tests do not prove live image content, native map rendering, deployed callable behavior or physical-device performance.

Changed-file Flutter analysis: no issues after correcting lint findings. git diff --check: passed, with line-ending notices for pre-existing platform files.

## Remaining C55 review / stop point

Review the hero/card/avatar composition against the reference screenshot, real provider images, verification/rating data, long text, side-by-side actions, guest login prompts and category tabs. Verify keyboard open/dismiss on Explore and other shell tabs, scrolling and Android navigation safe areas. After authorized map configuration is available, verify map tiles, pan/zoom, current-location permission grant/denial, search/reverse-geocode errors, manual fallback, Ormoc validation, edited address coordinates, persistence after navigation and bottom-panel scrolling at enlarged device font sizes.

Existing local platform/branding changes, generated-plugin files, diagnostic reports and commits were preserved. No commit, push, merge, deploy, Firebase record write, rule/function edit or Phase 2 implementation was performed.


## Circular avatar and compact identity correction - 2026-10-18

Confirmed root cause: the avatar was translated upward by 24 pixels inside FeastaCard. FeastaCard builds a Card with Clip.antiAlias, so the portion outside its rounded outline was clipped. A second translation moved the entire card above its separate sliver allocation. Transforms only change painting, leaving the avatar's original height reserved in the Column; the provider name therefore remained below the avatar with unnecessary space. The hero did not need a different image or extra blank padding.

The cover and information section now share one header sliver with an explicit Stack paint order. The cover paints first, then the information section. Inside that section the rounded card background is a positioned sibling behind the content, rather than an ancestor clipping the avatar. Both stacks use Clip.none. The entire 80-pixel avatar is inside the header's allocated bounds and crosses both the card's top and the cover's bottom. No upward Transform remains. The card starts 24 pixels below the avatar top; the name and category occupy an Expanded column beside it. The provider title uses the existing 22-pixel section-title style to keep that narrower column readable and compact. Long names wrap and the card grows with content, including accessibility text scaling.

The circular badge already insets the actual contained image within its white outer circle. Its previous inner circular clip could additionally crop corners of square artwork; circular badges now use an unclipped rectangular inner image area. Marketplace rectangular badges retain their existing rounded clipping. Actual cover/logo URLs, neutral fallbacks, border/shadow and proportional fitting remain. No synthetic test artwork is used by the application.

Exact files changed in this correction (relative to apps/customer_mobile):

- lib/features/customer/provider_profile_screen.dart
- lib/features/customer/widgets/provider_brand_visual.dart
- test/features/customer/provider_profile_layout_test.dart (new)
- test/features/customer/goldens/profile_square_1.0.png (new)
- test/features/customer/goldens/profile_square_1.3.png (new)
- test/features/customer/goldens/profile_square_2.0.png (new)
- test/features/customer/goldens/profile_rectangle_1.0.png (new)
- test/features/customer/goldens/profile_rectangle_1.3.png (new)
- test/features/customer/goldens/profile_rectangle_2.0.png (new)
- docs/provider-profile-location-phase1-review.md (this appended entry)

Validation: 43 focused tests passed across provider_profile_layout_test.dart, provider_brand_visual_test.dart, provider_discovery_test.dart, explore_marketplace_test.dart and location_action_panel_test.dart. Six new visual comparisons use deterministic decoded square (120x120) and rectangular (240x80) image fixtures at 1.0, 1.3 and 2.0 text scale on a representative C55 1080x2400 physical viewport at 3x density. Assertions cover overlap across both boundaries, header allocation, unclipped stacks, absence of a Card ancestor around the avatar, adjacent name/category geometry, contained image fitting, decoded dimensions, zero inner clipping radius, actual URL wiring, actual review summary, guest Chat login prompt and photography tabs. Existing tests cover missing/failed imagery, long provider names/locations, category switching and retained location/navigation behavior. Goldens were generated, visually inspected at normal scale, then passed in comparison mode. They use Flutter's deterministic test font and synthetic artwork to catch geometry/paint regressions; they are not photographs or a substitute for device typography review.

Changed-file analysis: no issues. git diff --check: passed (pre-existing platform files emit line-ending notices). No location-picker, shared-navigation, auth, backend, booking/payment, opening-animation or branding code was changed in this correction. Existing work was preserved. No install, commit, push, merge or deployment was performed.

The third screenshot was not attached in this session, so the written composition guides this correction. Remaining realme C55 review: Lerie's Photo and SB with their real cover/logo data, complete circumference and lettering, compact name/category alignment, long text and font/display scales, Back/Favorite, guest protected actions, side-by-side ordinary-scale actions and tabs while scrolling. Phase 2 remains stopped until explicit approval.


## Adaptive circular logo presentation - 2026-10-18

Root cause: the circular shell contained a rectangular, uncropped image with a fixed 15% inset on every side. Opaque square backgrounds therefore remained visibly square, and padding already present in uploaded images made central artwork appear especially small. The clipping correction above remains intact; no profile layout change was required.

Implementation: only the circular branch of ProviderLogoBadge changes. Its existing outer dimensions, position, border and shadow remain. A ClipOval masks the image inside a small white rim. The existing NetworkImage cache supplies decoded image data for conservative fitting; there are no provider-name exceptions, provider settings, new dependencies or additional backend endpoints. For square images up to 2048x2048, the fitter inspects all pixels to determine whether the area outside a protected central circle is uniform opaque background or fully transparent. It tolerates small compression noise and a one-pixel slightly lighter export frame on a near-white background. If safe, it uses a bounded display zoom through inspected background-only margins, retaining an 8%-of-source-radius margin around the foreground and limiting zoom to 2x. The original uploaded file and its background are never edited, recolored or removed. Central transparent artwork receives the same safety check. Unknown/nonuniform backgrounds, edge artwork, rectangular images, very large images or failed inspection use a mathematically inscribed rectangle with BoxFit.contain. This gives wide lettering more usable width while preserving every source corner. Missing/failed images use the existing neutral storefront icon inside the circular mask. Stream listeners detach on URL changes/disposal; stale inspection results cannot update a different logo.

Real provider verification: performed a read-only Firestore runQuery using the existing approved/publiclyVisible/isActive/not-suspended/not-deleted filters, selecting businessName, logoUrl and coverImageUrl. Retrieved only the four requested matching public image references, then downloaded their unchanged logo bytes to the local temporary review folder. No authentication bypass, Firebase record change, uploaded-artwork change or production write occurred. Tokenized image URLs and source image files were not added to the repository.

- Sophie's Shot: actual 1200x1200 gray-background camera image. Its one-pixel lighter export edge is accepted; background-only display zoom is approximately 1.94x. The gray background now fills a circle, with a much larger complete camera mark.
- Lerie's Photo: actual 980x980 white-background camera. Safe display zoom is approximately 1.37x; complete camera mark remains visible.
- JS Catering: actual 2816x1536 image with extensive lettering. It remains fully contained, with approximately 63.2x34.5 logical pixels inside the 72-pixel image mask of the 80-pixel avatar.
- SB: actual 500x500 image with a translucent gradient and script artwork. This is not a uniform removable corner region; full-image containment is retained (approximately 50.9x50.9 logical pixels), preserving the uploaded gradient and lettering.

Image-specific limits: rectangular or nonuniform-background logos can still show rectangular image boundaries when preserving the complete source requires it. SB is such a case. The fitter does not infer which gradient/photo details are expendable, detect text semantically or remove backgrounds. Small source lettering can remain small in an 80-pixel avatar. Images larger than the inspection limit take the conservative containment path. Very low-contrast detail indistinguishable from the background tolerance cannot be classified semantically. Physical C55 performance and live network loading still require device review.

Exact files changed for this refinement (relative to apps/customer_mobile):

- lib/features/customer/widgets/provider_brand_visual.dart
- test/features/customer/provider_profile_layout_test.dart
- test/features/customer/circular_provider_logo_test.dart (new)
- test/features/customer/real_provider_logo_review_test.dart (new, optional local image directory)
- docs/provider-profile-location-phase1-review.md (this appended section)
- test/features/customer/goldens/profile_square_1.0.png
- test/features/customer/goldens/profile_square_1.3.png
- test/features/customer/goldens/profile_square_2.0.png
- test/features/customer/goldens/profile_rectangle_1.0.png
- test/features/customer/goldens/profile_rectangle_1.3.png
- test/features/customer/goldens/profile_rectangle_2.0.png
- test/features/customer/goldens/circular_logo_opaque-square.png (new)
- test/features/customer/goldens/circular_logo_opaque-square-frame.png (new)
- test/features/customer/goldens/circular_logo_transparent.png (new)
- test/features/customer/goldens/circular_logo_transparent-edge-art.png (new)
- test/features/customer/goldens/circular_logo_lettering.png (new)
- test/features/customer/goldens/circular_logo_edge-art.png (new)
- test/features/customer/goldens/circular_logo_missing.png (new)
- test/features/customer/goldens/circular_logo_failed.png (new)

Local real-image previews: C:/Users/Pia/AppData/Local/Temp/feasta-logo-review/real-logo-0.png (Sophie), real-logo-1.png (Lerie), real-logo-2.png (JS Catering), real-logo-3.png (SB). The optional real-provider test uses FEASTA_LOGO_REVIEW_DIR pointing at this folder. It is skipped when those local downloads are unavailable, so the standard suite does not depend on production/network access. Synthetic fixtures and committed-style golden baselines are deterministic and use no uploaded provider art.

Validation: 55 focused tests passed in golden comparison mode, including all four actual-provider local image checks. Changed-file Flutter analysis: no issues. git diff --check: passed, with line-ending notices for pre-existing platform files. Coverage includes opaque square backgrounds and export frames, transparent central/edge artwork, rectangular lettering, missing/failed URLs, unchanged avatar dimensions, complete containment where needed, real decoded logo files, C55-representative sizing and existing cover/card boundary assertions at 1.0/1.3/2.0 text scales. Existing Explore logo, profile actions/category tabs, location-picker and keyboard-navigation regressions are included.

No profile hero/card/name/rating/action/tab layout, Explore card logo behavior, opening animation, Firebase rules, booking/payment logic or navigation code was changed. All prior local changes were preserved. No install, commit, push, merge, deploy or Phase 2 work was performed. Stop for C55 review of Sophie's Shot, Lerie's Photo, SB and JS Catering with live images and the device's real display/font scale.


## One fitting rule for circular profile logos - 2026-10-18

This section supersedes the fitting strategy in the preceding entry. The earlier fitter enlarged qualifying square images but contained complete rectangular/unknown images. JS Catering's 2816x1536 source was therefore measured by its large cream background rather than the size of its lettering/design, leaving it much smaller than the other marks.

Current rule, applied to every circular profile logo: determine the artwork bounds, center those bounds on the circle, and scale uniformly so the farthest complete artwork pixel reaches 92% of the inner circle radius. The remaining 8% is a consistent radial safety margin, in addition to the existing white rim. There is no square-versus-rectangular sizing branch, source-center bias, per-provider override or special extreme-aspect-ratio scale. Uploaded files, proportions and backgrounds are not edited. Only displayed background space beyond the mask can be cropped.

Bounds detection recognizes a coherent opaque border palette or completely transparent border. A narrow range of light background shades accommodates images such as JS Catering's cream textured background; inner corner samples accommodate thin export frames without mistaking edge lettering for background. All remaining source pixels contribute to the artwork bounds and radius. Pixel inspection runs through Flutter compute off the UI isolate. If a background cannot be confidently separated, decoding/inspection fails or the source exceeds 8 megapixels, the bounds are the complete source rectangle. The identical centering/scaling/margin rule still applies to those bounds. This conservative bounds fallback is the only limited exception; it preserves source content, including translucent gradients such as SB's. It does not guarantee semantic recognition of very low-contrast detail in a background-colored region. Extreme wide logos retain all lettering, but naturally have less vertical height than compact marks in the same fixed avatar.

Actual-logo checks use the unchanged public image downloads from the previous review, not substitutes or generated provider artwork. Real previews were regenerated and inspected for Sophie's Shot, Lerie's Photo, JS Catering and SB. JS Catering's source now renders approximately 136.5x74.5 logical pixels behind the 72-pixel mask, instead of the former 63.2x34.5 complete-image presentation. Its cream margins extend beyond the mask while the lettering and design fit inside it. Sophie's Shot and Lerie's Photo also use detected-artwork bounds. SB's translucent/nonuniform border takes complete-image bounds and preserves its gradient/lettering. No provider names or IDs appear in the application fitting logic.

Validation: 56 focused tests passed in golden comparison mode, including the four actual-logo checks and an added 8:1 aspect-ratio regression. Synthetic tests inspect the positions of visible black/red artwork pixels to verify shared centering, a common radial margin, no distortion and no clipped lettering/edge artwork on opaque and transparent backgrounds. Existing C55-sized profile goldens at 1.0/1.3/2.0 text scales retain cover/card avatar-boundary checks, guest actions and tabs. Existing Explore image rendering, location-panel and keyboard-navigation tests also pass. Changed-file Flutter analysis: no issues. git diff --check: passed, with line-ending notices for existing platform files.

Exact files changed in this correction (relative to apps/customer_mobile):

- lib/features/customer/widgets/provider_brand_visual.dart
- test/features/customer/circular_provider_logo_test.dart
- test/features/customer/provider_profile_layout_test.dart
- test/features/customer/real_provider_logo_review_test.dart
- docs/provider-profile-location-phase1-review.md (this appended section)
- test/features/customer/goldens/circular_logo_opaque-square.png
- test/features/customer/goldens/circular_logo_opaque-square-frame.png
- test/features/customer/goldens/circular_logo_transparent.png
- test/features/customer/goldens/circular_logo_transparent-edge-art.png
- test/features/customer/goldens/circular_logo_lettering.png
- test/features/customer/goldens/circular_logo_edge-art.png
- test/features/customer/goldens/circular_logo_extreme-edge-art.png (new)
- test/features/customer/goldens/profile_square_1.0.png
- test/features/customer/goldens/profile_square_1.3.png
- test/features/customer/goldens/profile_square_2.0.png
- test/features/customer/goldens/profile_rectangle_1.0.png
- test/features/customer/goldens/profile_rectangle_1.3.png
- test/features/customer/goldens/profile_rectangle_2.0.png

The four local real-logo preview PNGs were also refreshed in C:/Users/Pia/AppData/Local/Temp/feasta-logo-review. Uploaded source bytes and tokenized URLs remain outside the repository. The optional real-image test requires FEASTA_LOGO_REVIEW_DIR pointing there; the ordinary synthetic suite remains independent of network/production access.

Scope: circular Provider Profile logos only. Explore's separate rounded rectangular badge path is unchanged. Avatar dimensions/position, hero, information card, name alignment, actions, tabs, guest/auth behavior, location picker and all earlier Phase 1 work remain intact. No backend, Firebase rules, map configuration, branding or unrelated UI changes. No commit, push, merge, deploy, device installation or Phase 2 work. Stop for another realme C55 review of live logos and device rendering/performance.
