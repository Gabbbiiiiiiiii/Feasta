# Official branding and opening animation review

Implemented in the customer mobile app only. Existing authentication, Firebase bootstrap, App Check, authorization and booking logic are unchanged.

- `OpeningAnimation` wraps the navigator once through `MaterialApp.builder`, so route replacement cannot remove it. Its child mounts immediately, while the opaque opening layer blocks interaction and underlying semantics. No routes, timers for authentication, or lifecycle replay hooks are introduced.
- The 1800 ms sequence uses a uniform 417 x 159 design canvas: fork, spoon and knife are visible separately from the starting frame, then assemble in sequence, then a short crossfade to the reference F resolves component gradient differences. The extracted original lettering moves downward only after F assembly. The complete original wordmark is the final state, followed by a fade revealing the current authorized destination.
- Component coordinates follow the supplied README: fork (19.2391, 0), spoon (0, 52.0536), knife (78.8804, 0). The fork is the supplied transparent PNG; all supplied SVGs retain their original geometry and gradients.
- Reduced motion shows the static official wordmark for 350 ms after readiness, with no motion or fade. Loading/restoration and login placements use static official artwork. No recoloring, squashing, or looping logo animation remains.
- Native splash backgrounds and Android normal-window backgrounds match #F7F8F8 in light and dark configurations. Pre-Android-12 and iOS launches use the clean background; Android 12+ retains its required system splash icon using the official F. Launcher assets use the F with safe transparent padding; iOS icons have an opaque theme background.
- `flutter_svg` is the only new direct dependency. No existing packages were upgraded.

## Rebuilding native assets

Run from `apps/customer_mobile`:

```powershell
flutter test tool/generate_brand_assets.dart
dart run flutter_launcher_icons
dart run flutter_native_splash:create
```

The exporter rasterizes the supplied assembled F for native PNG requirements only. Flutter uses the original vectors. If regenerating splash resources, keep `NormalTheme`'s `android:windowBackground` set to `#F7F8F8` in all four `values*/styles.xml` files (the splash generator resets this to the platform default).

## Real-device review

Check cold launch on Android before and after Android 12, both system themes, and slower devices: native-to-Flutter handoff, utensil alignment, gradient crossfade, final logo, and 1.8-second Flutter sequence. Native bootstrap time is additional and remains governed by secure initialization. Verify launcher masks/cropping and Android animation-removal accessibility settings. Check first-run onboarding, signed-out browsing, restored customer accounts, Google Sign-In, sign-out, booking navigation and ordinary background/resume. The opening should appear only on a fresh app startup. iOS native assets require an iOS build/device check.

No commits, pushes, merges or deployments were performed.

## Opening visibility fix

Investigation found no custom Android splash retention: MainActivity is the standard FlutterActivity and no preserve/deferFirstFrame calls exist in app startup. Firebase and App Check still finish before runApp. The previous animation started in didChangeDependencies, before the engine first-frame handoff and before artwork readiness; the home-route placement could also be replaced by navigation. These were concrete visibility risks; the exact realme C55 native exit behavior has not been traced on a connected device.

The fixed timeline waits for the supplied SVGs to compile/cache, the fork image to decode, and Flutter's waitUntilFirstFrameRasterized. It then requests a frame showing the initial separated poses and starts the controller only after that frame completes. The 1800 ms animation duration is preserved explicitly; reduced motion is handled as a separate static wordmark presentation. The original final F and complete wordmark remain the authoritative assembled states. Authentication continues underneath the interaction-blocking overlay; the overlay never selects a destination or modifies authorization. No native splash configuration, generated-plugin files, backend or web code was changed for this fix.

Focused regressions cover a delayed presentation boundary, separated starting positions, movement, assembly before lettering, downward lettering, full-wordmark hold before reveal, startup child changes, navigator route replacement, fresh lifetime replay, no ordinary navigation/resume replay, reduced motion, and compact/wide viewports. For realme C55 review, fully stop and relaunch the app (hot reload and ordinary resume intentionally do not replay); check both normal and Remove animations accessibility settings.

Final validation for the visibility fix: 59 focused tests passed; analysis of all three changed Dart files found no issues; git diff --check passed. All seven generated-plugin files were verified byte-for-byte against their pre-fix SHA-256 hashes. Real-device handoff remains to be reviewed.
