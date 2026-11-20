# Event map pin and Customize Event review

Date: 2026-10-18 (Asia/Manila)
Branch: feat/mobile-customer-parity
HEAD remains 8e71dc1. No commits, pushes, installs, data clearing, or deployments performed.

## Files changed by this task

- lib/features/customer/location_picker_screen.dart
- lib/features/customer/event_customization_screen.dart
- lib/shared/models/customer_address_model.dart
- test/features/customer/location_picker_selection_test.dart (new)
- test/features/customer/package_customization_revision_test.dart
- docs/event-map-pin-customization-review.md (this report)

Paths above are relative to apps/customer_mobile. Pre-existing changes and reports were retained. Maps keys, local.properties, manifests and native Maps configuration were not edited.

## Root cause and implementation

The old picker supplied no native GoogleMap markers. It drew an emerald Flutter icon at the full-screen center, behind the bottom panel on shorter viewports. IgnorePointer made it a visual overlay rather than a draggable marker. Camera movement selected a location and triggered reverse geocoding, while old address text remained visible.

The existing map now uses one standard Google Maps red marker with draggable enabled. onDragEnd and map onTap update the selection; camera panning has no selection callbacks. Native map padding reserves the top controls and the panel's maximum 55% viewport height, centering the initial/animated target within the exposed area. Floating controls are positioned above the panel. The map type preference and satellite toggle are preserved.

Pin movement immediately replaces old address details with a resolving message and the exact new coordinates. Reverse geocoding uses the existing MapsApiService. A shared request generation guards GPS, place details and reverse-geocoding results. Failure retains the pin coordinates and requests written address entry, without showing the previous address. The card now prioritizes the full address. Confirmation requires an explicitly selected, resolved valid location and is blocked while resolving, locating or saving. The default Ormoc camera does not confirm itself. Coordinate parsing no longer substitutes Ormoc coordinates when coordinates are missing; validity checks reject nonfinite/out-of-range values.

Customize Event has an emerald Choose on Map action below the city field, changing to View or Edit Map Location for a pinned address. It opens the same full-screen picker with the draft's initial address. A session-only mode returns confirmed results without writing to the saved address book. The draft retains the complete immutable address model, including coordinates, alongside city and written address. Direct edits to either field invalidate the pinned address. Existing manual entry also updates the session draft; its existing venue comparison clears coordinates when venue details change.

Opening the picker makes no changes to the draft. Only its returned confirmed result is applied. Cancel leaves the previous draft intact; reopening passes the confirmed model back as the initial pin. Back/Continue use the existing form snapshot, now including that model. No booking submission or payment was added.

## Validation

- 43 tests passed across location_picker_selection_test, location_action_panel_test, package_customization_revision_test, booking_preparation_flow_test and booking_preparation_test.
- 10 location selection tests passed again after final GPS accuracy/cancellation cleanup.
- Changed-file Flutter analysis: all five changed Dart files, no issues.
- git diff --check: passed.

Coverage includes native marker configuration, viewport padding, camera callbacks, dragging/tapping, stale and failed geocoding, search, GPS, late place details, exact confirmation result, coordinate validation, picker routing, draft retention, reopen/cancel, manual field invalidation, existing navigation/pricing/validation flows, and panel overflow at text scales 1.0, 1.3 and 2.0.

Tests replace the native map surface with a test widget and inspect the GoogleMap configuration/callbacks. They do not prove native rendering or gestures on a phone. The customization integration test simulates the picker return; the separate confirmation test exercises the actual confirmation action and returned coordinates.

## Realme C55 review required

1. Open Customize Event and tap Choose on Map; verify working satellite tiles and bright red pin above the panel.
2. Long-press and drag the native marker to a venue; tap a different map point. Check final pin, written address and city agree.
3. Pan/zoom without moving the pin; confirm selection remains unchanged.
4. Test venue search and GPS, including rapid changes and weak GPS accuracy warning.
5. Confirm, reopen, cancel an unconfirmed change, then navigate Continue/Back; verify the confirmed venue survives.
6. Edit the written address; verify Choose on Map returns and old coordinates are invalidated.
7. Verify search/close controls, map/satellite toggle, panel scrolling and confirmation remain usable with the phone keyboard and enlarged text.

Limitations: live satellite tiles, Android marker long-press/drag gestures, GPS permission behavior, actual geocoder accuracy and physical viewport positioning remain unverified on the device. A failed geocode preserves the pin in the picker; saving a different manual address intentionally clears its coordinates, requiring a fresh map selection to associate a pin. No automatic verification of manually typed addresses is added.
