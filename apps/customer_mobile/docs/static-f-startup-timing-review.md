# C55 static-F startup measurement and correction

Measured on the connected realme C55 (RMX3710), Android 14/API 34, on 2026-10-17. Both comparison builds use Flutter profile mode with FEASTA_OPENING_DIAGNOSTICS=true. The user's approximate three-second visual observation was not substituted for a measured baseline.

## Small focused correction

1. Precompile the five supplied SVGs with the same compiler/options flutter_svg previously ran at startup. The opening now reads the resulting .svg.vec assets instead of compiling XML/path data in runtime isolates. Pixel-for-pixel tests confirm unchanged shapes, gradients, dimensions, and alignment. The original SVGs and all existing PNG branding remain unchanged. These dependencies were already locked; only their direct/dev classification changed, not their versions.
2. Start the existing secure bootstrap immediately after the first rasterized Flutter frame, instead of on the first deferred widget build. Dart-triggered Firebase/App Check initialization no longer begins during local artwork preparation. The app and its authentication scope are still constructed only after the entire bootstrap succeeds. Firebase initialization -> project validation -> App Check activation -> optional emulator setup remains awaited in that order. No protected app is mounted before that boundary.

No new splash timer or artificial hold was added. The 96 dp F / approximately 226 dp wordmark, original background, exact 4200 ms controller, choreography, reduced-motion presentation, single overlay/controller, and once-per-cold-launch behavior are unchanged. Native logo resources and Android's system splash behavior were not changed. Disposal before artwork readiness releases the frame deferral without starting bootstrap.

## Measured before/after

Three repeat cold-process launches per build, using force-stop between trials and preserving app/account data. Android/system/APK caches were warm in both comparison sets. The final after build was rebuilt from the verified source and installed in place; installation launches/warm-up samples are retained separately. The final APK remains installed for manual review.

| Stage (milliseconds) | Before median | After median |
|---|---:|---:|
| Android launch to first draw | 4638.0 | 4170.0 |
| Process start to activity onCreate | 1470.0 | 1395.0 |
| Activity onCreate to engine configure (setup proxy) | 705.0 | 453.0 |
| Synchronous plugin registration | 184.0 | 178.0 |
| Activity start to Flutter UI displayed callback | 2138.0 | 1534.0 |
| Dart main to opening preparation | 14.4 | 15.2 |
| All opening artwork ready | 711.5 | 462.8 |
| Slowest vector load/compile/decode | 709.7 | 21.5 |
| Fork image precache | 703.7 | 462.3 |
| Artwork ready to prepared frame built | 17.8 | 18.7 |
| First frame allowed to rasterization/controller start | 68.6 | 56.1 |
| Dart main to animation controller start | 789.6 | 557.9 |
| Firebase initialization (background) | 1653.0 | 587.3 |
| App Check activation (background) | 46.3 | 52.9 |

| Build / trial | Android first draw (ms) | Artwork ready (ms) | Dart main to motion start (ms) |
|---|---:|---:|---:|
| Before 1 | 4638 | 545.5 | 652.6 |
| Before 2 | 4401 | 711.5 | 789.6 |
| Before 3 | 5667 | 1186.0 | 1303.7 |
| After 1 | 4652 | 458.4 | 557.9 |
| After 2 | 4170 | 462.8 | 544.1 |
| After 3 | 4005 | 496.4 | 586.4 |

These are stage durations, not additive slices of a single stopwatch: security and rendering overlap, vector loads run concurrently, and native and Dart clocks have different origins. Android TotalTime is an OS first-draw/startup proxy, not an optical measurement of how long the F is visible. The UI-displayed callback is the engine's first Flutter UI callback, not proof that the compositor/system exit animation has finished. Controller start follows first rasterization and tests verify movement on the next advancing frame; no fixed static segment exists in the controller timeline.

## What the timings establish

The previous all-artwork gate included runtime SVG compilation. Removing that work reduced the slowest vector stage from roughly 710 ms to roughly 20 ms. A compiled-only control run still waited roughly half a second for the first fork bitmap; this prevented attributing the whole delay to SVG parsing. Deferring secure platform initialization until after the visible first frame reduces contention while preserving the security gate. The remaining image-precache cost is reported explicitly, rather than hidden behind a different loading surface.

Native startup remains substantial before Dart can draw: process/application/provider work precedes Activity.onCreate, followed by activity/engine setup and plugin registration. The onCreate-to-configure marker is an engine/setup proxy; it does not isolate every internal VM or ContentProvider operation. The remaining native phase and first-image pipeline were not bypassed or replaced by approximate artwork.

**The full cold-launch 0.5?1 second target was not achieved on this C55.** The final repeat-run Dart-entry-to-controller time is about 0.56 seconds, but Android first draw is still about 4.17 seconds in these measurements. Native/process work already exceeds one second in this device session. This change shortens avoidable Flutter preparation; it does not claim to eliminate Android/engine startup. Small sample size, caching, background work, thermals, and profile instrumentation affect the values. Do not interpret the user's debug-mode video as a release benchmark, or credit this code for all native timing variation.

Initial post-install launches were much slower (one final-package launch returned no Android TotalTime and took about 2.1 seconds from Dart entry to controller start). Those records are retained and are not mixed into repeat-launch medians. No samples from the final three-run comparison were discarded. The first intermediate scheduling measurements also remain available, rather than being overwritten.

## Evidence and repeat procedure

- startup-c55-before.json: three measured baseline repeat launches, with sanitized native/Dart stage markers.
- startup-c55-precompiled-only.json: compiler-only control, including its slow post-install launch.
- startup-c55-scheduled.json: initial first-frame scheduling experiment, including its post-install launch.
- startup-c55-final-install-and-warmup.json: final APK installation and warm-up launches, including the slow/incomplete Android TotalTime result.
- startup-c55-after.json: final three measured repeat launches.

From apps/customer_mobile, rebuild with the existing project/signing configuration:

```powershell
flutter build apk --profile --no-pub --dart-define=FEASTA_OPENING_DIAGNOSTICS=true
adb -s YOUR_DEVICE_ID install -r -t build/app/outputs/flutter-apk/app-profile.apk
python tool/measure_android_startup.py --device YOUR_DEVICE_ID --output docs/my-startup-timings.json --trials 3
```

Allow installation activity to settle and record initial launches separately when comparing repeat runs. The capture tool force-stops only FEASTA, never clears app data, and reads fixed FEASTA_STARTUP / FEASTA_OPENING markers live to avoid logcat ring-buffer loss. It never exports raw logcat or account/error/token data. Native process/activity/plugin/UI markers use uptime; the Dart clock link supplies a round-trip window for correlation, not a falsely exact shared epoch. Diagnostics remain opt-in in debug/profile and disabled by Dart release constants.

Regenerate vector derivatives after a source-logo edit:

```powershell
dart run tool/compile_opening_vectors.dart
```

## Validation and remaining review

- 60 focused Flutter tests passed: first-frame readiness, compiled artwork freshness and pixel equality, immediate motion, 4.2-second sequence, 96 dp native alignment, reduced motion, disposal, secure Firebase/App Check gating, restoration/recovery, Home/guest handoff and navigation.
- 10 tests passed with diagnostics enabled, including sanitized timing output and lifecycle cleanup.
- Changed-file Flutter analysis passed with no issues; profile APK builds succeeded.
- All seven pre-existing generated-plugin files match their pre-task SHA-256 hashes.
- git diff --check passed (existing line-ending notices only).

The connected phone was updated in place and used for timing measurements; it was never uninstalled or cleared. Manual C55 review still needs to confirm the perceived native-to-Flutter transition and full sequence, especially with a restored account, slow connectivity, dark mode and Remove animations enabled. Visual smoothness and OEM system-splash behavior are not established by these timestamps alone. No backend/web/configuration changes, commits, pushes, merges or deployments were made.

## Exact files changed in this task

Paths are relative to apps/customer_mobile and compared against the existing working tree at task start.

- `android/app/src/main/kotlin/com/example/feasta/MainActivity.kt`
- `assets/branding/feasta_assembled_f.svg.vec`
- `assets/branding/feasta_easta_only_aligned.svg.vec`
- `assets/branding/feasta_full_wordmark.svg.vec`
- `assets/branding/feasta_knife.svg.vec`
- `assets/branding/feasta_spoon.svg.vec`
- `docs/startup-c55-after.json`
- `docs/startup-c55-before.json`
- `docs/startup-c55-final-install-and-warmup.json`
- `docs/startup-c55-precompiled-only.json`
- `docs/startup-c55-scheduled.json`
- `docs/static-f-startup-timing-review.md`
- `lib/app/bootstrap.dart`
- `lib/app/startup_shell.dart`
- `lib/core/utils/startup_timings.dart`
- `lib/features/splash/opening_animation.dart`
- `lib/main.dart`
- `pubspec.lock`
- `pubspec.yaml`
- `test/core/utils/startup_timings_test.dart`
- `test/features/splash/compiled_opening_artwork_test.dart`
- `test/features/splash/opening_artwork_cache_test.dart`
- `test/features/splash/startup_shell_test.dart`
- `tool/compile_opening_vectors.dart`
- `tool/measure_android_startup.py`
