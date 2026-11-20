# Phase 2 UI, pricing and Maps refinement - 2026-10-18

Work is on `feat/mobile-customer-parity`. Existing local commits, uncommitted work, seven generated-plugin files and previous reports were retained. No commit, push, merge, deployment, booking submission or payment was performed.

## Organization and reference

Previously Customize Event put schedule, address, service tier, theme, inclusion checklists, three add-on sources, requests and repeated prices in one long form. Review repeated provider/package details, rendered separate cards for empty categories and appended ungrouped inclusion paragraphs.

The existing screen now shows Event Details, Customize Package and Event Services as three selectable steps, followed by the existing preparation-only Review Event route. Continue and Back use the same state and account/provider/package-scoped session draft. The current step is also retained in that draft. Compact progress chips allow direct editing; final validation and fresh package/add-on eligibility checks still gate review. Required event details and optional services are labeled. Entered fields and selections survive step changes and returning from review. The footer stays outside the scroll area and hides while the keyboard is open.

The package summary is smaller and no longer repeats the potentially misleading base package price. The price card and sticky estimate share the same estimate text/calculation. Review groups provider/package, event details, selected customization, additional services and the price summary. Included foods, decorations, furniture and services use wrapping chips. Empty add-on categories become one small message. Review only offers editing; its submission guard remains in place. The separate legacy submission mode retains its existing behavior.

The request's four-step structure and local web implementation/contracts were used as references. Only the pasted request was available in this attachment; `WEB.pdf` and the described mobile screenshots were not present. Exact visual comparison against those files remains outstanding.

## Confirmed pricing contract

- `functions/src/bookings/booking-package-offer.ts` resolves ordinary packages from their stored price and service-tier packages from `selectedOption.price`. A selected tier REPLACES the base package price.
- `apps/web/src/lib/customer/bookings/booking-customization-selection.ts` reads `displayedServicePrice` from the selected tier. The mobile preparation helper already follows the replacement rule and was retained.
- Estimate = selected tier price, or ordinary package price when there are no tiers, plus selected published flat add-on prices. There is no base-plus-tier charge, guest multiplier, invented fee, tax, deposit or discount.
- No tier selected is an incomplete selection: "Choose a service to see your estimate". A selected tier/package/add-on with missing, negative or nonfinite pricing prevents a numeric estimate. Explicit numeric zero remains valid.
- Customer-arranged services and special requests have unconfirmed costs, excluded from the known estimate. A single confirmation caveat replaces repeated explanations. The malformed question-mark separator has been removed.

The price summary names the package and selected service, lists selected add-ons and their published/unknown prices, and uses the same total text in customization and its footer. Review calls the same price component/helper after fresh data revalidation.

## Package images

Existing public `imageUrls`/legacy `imageUrl` mapping is preserved. Actual URLs still load through the existing network-image path. Missing images use a neutral 112-pixel hero; failed remote images now collapse to the same compact height. Valid images use a 220-pixel hero. A changed image URL resets the failure state. No photography or provider data was invented. Real production image accessibility was not probed using new production data reads.

## Maps evidence and safe fallback

Read-only ADB checks found the realme C55 (RMX3710). Before this task's build, the installed `com.example.feasta` APK matched the local `app-profile.apk` SHA-256 exactly. Its last update was October 18 at 17:47:37 device time. Sanitized manifest inspection confirmed that `com.google.android.geo.API_KEY` metadata was present with an EMPTY value. Current `android/local.properties` has no Maps key entry. This establishes a missing-key failure in the actual installed test APK, not just an assumption about a local file.

Gradle loads `MAPS_API_KEY` from `android/local.properties`, defaults to an empty string and sets `manifestPlaceholders["MAPS_API_KEY"]`. `AndroidManifest.xml` passes that placeholder to `com.google.android.geo.API_KEY`. No key was printed, created, hardcoded or changed. The inspected logcat tail contained no matching Maps authorization/billing/renderer diagnostics. The device was outside FEASTA during inspection, so live tile rendering was not established. Missing credentials do not establish whether additional restriction, API-enable­ment, billing, network or renderer problems exist.

A small Android method channel now reports only whether the installed manifest contains a nonblank key. Flutter avoids creating a native map when that check is false or unavailable and presents explicit manual-address guidance. Key presence is not treated as proof that tiles loaded or authorization succeeded. The location panel provides manual entry and blank-tile guidance even with a configured map, and confirmation requires a successfully resolved pin rather than default city coordinates. The Flutter map API does not provide authoritative tile-authorization status; runtime failures after a nonempty key still require device/log verification.

Manual venue changes now clear coordinates to the model's existing zero/unknown representation. Coordinates are retained only when the structured venue fields are unchanged and the original address has coordinates. Manual edit invalidates pending reverse-geocoding responses and returns the manual result directly, preventing a later camera result from replacing it. Existing Ormoc validation remains in place. Booking preparation continues to carry address text using the existing contract.

## Authorized Maps setup still required

Maps itself is not fixed: an authorized key and Cloud project configuration are required. This portion stops before credential, billing or external configuration changes, as requested.

1. An authorized project owner should open the intended project's Google Cloud Console and verify Maps SDK for Android is enabled and billing is correctly linked/active. Obtain approval before enabling APIs, billing or changing Console configuration.
2. Use an authorized Android Maps key restricted to Maps SDK for Android and the Android application `com.example.feasta`. Authorize the actual signing-certificate SHA-1 for the test APK. The profile APK inspected here is signed with `A7:59:35:33:98:05:12:B9:C5:11:20:A2:84:A5:9A:29:2D:5E:42:E7`. Recheck the artifact certificate if signing changes; production/Play signing is a separate certificate.
3. Privately place the authorized key under `MAPS_API_KEY` in untracked `apps/customer_mobile/android/local.properties`. Do not paste it into chat or commit it. Firebase configuration keys are not evidence of Maps authorization and must not be substituted by assumption.
4. Rebuild the APK, inspect only whether the manifest key is nonempty, and install in place with ADB `install -r -t`. Do not uninstall or clear application data. Reproduce the picker and inspect sanitized Maps SDK logs: authorization failures require checking key/API/package/SHA-1 restrictions; billing/API errors require the owner; network and renderer failures require separate device evidence.
5. Confirm actual visible tiles and selected-address behavior, then test manual entry again. The callable-backed Places/reverse-geocoding service is separate from native tile rendering; do not expose a backend web-service credential in the app.

Cloud settings could not be confirmed from authorized local information. No Cloud Console settings, Firebase data, rules, indexes, functions, authentication or App Check configuration were changed. Official setup/security reference: [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices) and [Google Maps Platform FAQ](https://developers.google.com/maps/faq).

## Files changed by this refinement

Paths relative to `apps/customer_mobile`:

- `android/app/src/main/kotlin/com/example/feasta/MainActivity.kt`
- `lib/features/customer/event_customization_screen.dart`
- `lib/features/customer/booking_summary_screen.dart`
- `lib/features/customer/widgets/booking_preparation_price.dart`
- `lib/features/customer/package_details_screen.dart`
- `lib/features/customer/location_picker_screen.dart`
- `lib/features/customer/manual_address_screen.dart`
- `test/features/customer/booking_preparation_flow_test.dart`
- `test/features/customer/phase2_refinement_test.dart` (new)
- `docs/phase2-ui-pricing-maps-review.md` (new)

## Validation and handoff

All 73 focused tests passed across booking_preparation_test, booking_preparation_flow_test, phase2_refinement_test, location_action_panel_test, provider_profile_layout_test, circular_provider_logo_test, provider_discovery_test and explore_marketplace_test. Changed-file analysis of all eight Dart source/test files reports no issues. `git diff --check` passed; Git emitted only pre-existing platform/generated-file line-ending notices. The final `flutter build apk --profile --no-pub` succeeded, including the Kotlin method channel. Existing Kotlin Gradle Plugin migration warnings remain unrelated to this change.

Tests use local fixtures/mocks and perform no production booking writes. Existing provider-profile layout, circular-logo, discovery and Explore tests are included alongside booking preparation, image failure, price replacement/unknown add-ons, step persistence, keyboard, review content and native-map/manual-address regressions. Test harness failures encountered during development (new step navigation, Firebase initialization and scrolling the edit-form save action fully into view) were corrected; the final suite passes.

Review APK: `build/app/outputs/flutter-apk/app-profile.apk` (103.5 MB). It includes the explicit missing-key/manual fallback; it does not contain an authorized Maps key. It has not been installed over the current app. No real-device visual approval is claimed.

Final APK manifest inspection confirms the Maps key is still empty. SHA-256: `17935f36acfdbf45e752ca8601a7d0ef2bf6ecaee6d8b5802dcf393e4a0f6262`.

No new backend handoff is required for this UI. Existing future-submission handoffs in `package-selection-preparation-phase2-review.md` remain: current agreements/policy acknowledgments, stable request IDs, service/theme payload integration, server-authoritative availability and payment terms. This change does not activate submission.

Realme visual review is still needed for all three customization steps and grouped Review, real package images/tier/add-on data, Back/edit/reselect, keyboard and enlarged fonts, manual venue edits, and the unavailable-map screen. A final profile APK is prepared locally; the currently installed app has not been replaced or its data cleared. Live Maps review remains blocked on authorized configuration. Compare with `WEB.pdf` and screenshots when supplied.
