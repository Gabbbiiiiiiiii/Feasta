# C55 opening performance review — 2026-10-17

Implemented directly in the original customer_mobile project. The finalized launcher assets, opening artwork, 96 dp F, approximately 226 dp wordmark, emerald branding and 4200 ms choreography are unchanged.

## Findings and focused changes

* The opening's root AnimatedBuilder reconstructed the overlay tree on every tick. Its own widget-construction callback was small, so it was **not** the explanation for the entire reported 195 ms UI frame. It nevertheless forced repeated descendant updates. Stable child subtrees now sit below small transform/opacity builders. Only lifecycle, destination and visual-stage changes rebuild the overlay. One controller and one overlay remain.
* The lettering's Positioned.left changed every frame, requesting Stack layout. Its fixed layout bounds now remain unchanged; an equivalent translation applies the exact original reveal and overshoot in paint coordinates. Utensil paths, rotations, clipping, compositing order and opacity curves are unchanged.
* Home was painted behind the fully opaque opening. The detailed trace includes Home's initial build (41.9 ms), expensive initial layout (394.5 ms at the framework LAYOUT level), image-filter render work and Vulkan pipeline creation (maximum 368.3 ms). These are inclusive, instrumented events, not independent additive frame costs. The destination now stays mounted and laid out inside Offstage during flight; painting starts at progress .88, during the existing full-wordmark hold, before the .94 fade. Restoration, subscriptions and authorization continue. No timer or artificial waiting was introduced.
* Runtime SVG parsing is already absent: the five precompiled vectors load once before motion. The repeat-run slowest vector stage was about 21 ms before this change. The fork's first image precache was about 423 ms and dominates artwork readiness. This measures the image pipeline including loading/codec readiness, not pure PNG decoding. Engine tracing also records default-font-manager setup (588 ms), Impeller context creation (213 ms) and a texture upload (406 ms) in the detailed startup capture. These overlap and do not prove that any single one exclusively caused the fork wait.
* Native/process and engine startup account for substantial variation before Dart can animate. Firebase and App Check begin after the first rasterized frame, so their Dart initialization is not holding the initial static F. They can compete with subsequent motion. Their ordering and the secure application-construction boundary were left intact.

## Physical-device measurements

Connected realme C55 / RMX3710, Android 14, profile mode, opt-in diagnostics, 90 Hz budget of 11.11 ms. Each build was installed in place, retaining app/account data. Trial 1 is the first post-install launch and is kept separately in each JSON; trials 2–4 are repeat **cold-process** launches using force-stop, with OS/APK caches retained. No device-wide cache, thermal or background-process controls were imposed. Small sequential samples support a measured improvement, not a guaranteed frame-rate claim.

| Repeat trial | Before Android first draw ms | Before over-budget / frames | Final Android first draw ms | Final over-budget / frames |
|---|---:|---:|---:|---:|
| 2 | 6528 | 115 / 160 | 4330 | 79 / 160 |
| 3 | 3850 | 129 / 152 | 3691 | 51 / 190 |
| 4 | 4600 | 127 / 151 | 3878 | 71 / 167 |

| Metric | Before | Final |
|---|---:|---:|
| Over-budget frames, pooled | 371 / 463 (80.1%) | 201 / 517 (38.9%) |
| Median worst UI frame ms | 310.60 | 255.65 |
| Median worst raster frame ms | 147.66 | 104.92 |
| Median overlay tree constructions / launch | 154 | 9 |
| Median summed overlay construction callback time ms | 17.07 | 0.68 |

The intermediate transform-only experiment is retained: 344 / 467 over-budget frames (73.7%). It reduced overlay work but did not sufficiently address hidden destination painting. Callback construction timing excludes the framework's descendant build/layout work; it must not be presented as the whole UI frame time.

| Separate stage, repeat-run median ms | Before | Final |
|---|---:|---:|
| Android am start -W TotalTime / first-draw proxy | 4600 | 3878 |
| Process start to Activity.onCreate | 1479 | 1372 |
| onCreate to engine configuration / setup proxy | 568 | 461 |
| Synchronous plugin registration | 153 | 144 |
| Activity clock origin to Flutter UI displayed | 1636 | 1442 |
| Dart main to decoded artwork | 442.1 | 412.6 |
| Opening preparation itself | 423.6 | 402.9 |
| Fork image precache | 423.1 | 402.4 |
| Slowest vector load | 21.0 | 18.6 |
| Artwork decoded to prepared Flutter frame built | 19.1 | 15.1 |
| First frame allowed to raster/controller start | 42.7 | 35.4 |
| Dart main to motion controller start | 544.0 | 498.0 |
| Firebase initialization, concurrent with motion | 706.0 | 735.9 |
| App Check activation, concurrent with motion | 54.9 | 55.1 |

Native and Dart clocks have different origins; use each stage's own differences. Stages overlap and medians are not additive. TotalTime is not an optical measurement of static-F visibility. Android's system splash/exit compositor is outside the Dart controller. The native constructor/onCreate/configuration markers do not isolate every internal engine, provider or VM operation. No native startup code was changed in this task; **do not attribute the native timing improvement or the small artwork timing variation solely to the renderer change**.

The post-install baseline took 9765 ms to first draw, with fork precache 2037 ms; the final post-install launch took 7909 ms. These outliers remain in the raw files and were excluded equally from the repeat-run comparison. The user's earlier 36/186, 195 ms UI and 102 ms raster measurements are historical context, not the controlled baseline for this comparison.

## Remaining stalls

This is an improvement, not a complete elimination of jank or native launch delay. The final engine trace, separated from quantitative trials, still records a 212.9 ms layout span approximately 715 ms into motion, another 101.2 ms layout at 1335 ms, and 35 ms GC events. The largest raster span is 82.2 ms at 3723 ms into motion, when destination painting is intentionally warmed during the existing wordmark hold. Initial Home layout still runs during restoration; Offstage suppresses paint, not layout. Changing Home layout or delaying its construction would require a separate, carefully scoped change. No security or navigation shortcut was taken to conceal these costs.

There is no deliberate pre-motion static hold, repeated artwork load or advancing animation behind an unrendered initial frame. The 0.5–1 second total native-launch target is not achieved. Further per-provider/native profiling would be needed to attribute all pre-Activity variance; aggregate stage timings cannot establish an exclusive cause for every variable cold start.

## Diagnostics and reproduction

Normal quantitative run, from this app directory with the phone unlocked, same refresh rate and similar temperature/background load:

```powershell
flutter build apk --profile --dart-define=FEASTA_OPENING_DIAGNOSTICS=true
adb -s J7NZEAUKJNK7NJ5H install -r -t build/app/outputs/flutter-apk/app-profile.apk
python tool/measure_android_startup.py --device J7NZEAUKJNK7NJ5H --trials 4 --output docs/c55-review-timings.json
```

Keep the post-install trial separate. Compare UI/raster times and vsync delays against the actual reported refresh-rate budget; frame counts vary when frames are dropped. Diagnostics exclude secure-destination waits from active-animation frame totals. No debug-mode measurements were used as release evidence.

For framework cause analysis, rebuild with both `--dart-define=FEASTA_OPENING_DIAGNOSTICS=true` and `--dart-define=FEASTA_DETAILED_OPENING_TRACE=true`, install in place, then run:

```powershell
python tool/trace_opening.py --device J7NZEAUKJNK7NJ5H --output docs/c55-review-trace.json
```

The tool enables the engine's startup timeline through its supported activity intent flags, connects locally to the authenticated profile VM service, and removes its temporary port forward. It saves aggregate type/engine event names, numeric durations and motion-relative offsets; VM URLs and event arguments are not persisted. Detailed build/layout/paint tracing adds overhead: use it for attribution, **not** for normal before/after frame comparisons. The ordinary profile build can also produce engine-level motion attribution without detailed framework tracking. Intent flags are defined in the [Flutter Android embedding source](https://raw.githubusercontent.com/flutter/flutter/3.44.0/engine/src/flutter/shell/platform/android/io/flutter/embedding/engine/FlutterShellArgs.java).

## Validation and modified files

31 focused tests pass: full sequence, immediate first tick, native/Flutter 96 dp alignment, compact/wide layouts, stable layout objects during flight/reveal, destination mounted without painting during flight, artwork decoded once, vector pixel parity, reduced motion, one controller/overlay, no replay, Home/guest handoff and fail-closed initialization/recovery. A separate diagnostic-enabled run with detailed trace flags passed all 19 selected opening/startup/timing tests. Changed-file Flutter analysis passes; git diff --check passes.

Files changed in this task:

* lib/features/splash/opening_animation.dart
* lib/features/splash/opening_diagnostics.dart
* lib/core/utils/startup_timings.dart
* test/features/splash/opening_animation_test.dart
* tool/trace_opening.py
* docs/opening-c55-profile-before.json
* docs/opening-c55-profile-transform-only.json
* docs/opening-c55-profile-after.json
* docs/opening-c55-detailed-before.json
* docs/opening-c55-engine-after.json
* docs/opening-performance-review.md

All other pre-existing files were compared with their task-start SHA-256 hashes, including launcher/splash/artwork and the seven generated-plugin files. Build-generated local.properties was restored byte-for-byte. No authentication, App Check, navigation, Firebase/backend/web configuration or launcher changes were made. No commits, pushes, merges or deployments.

The final ordinary profile APK is installed on the connected C55, retaining app data. Stop here for visual real-device review: cold-launch several times, confirm native F continuity and exact sequence, inspect utensil flight and the final wordmark-to-Home fade, then repeat with Android reduced motion. Residual stalls and native wait should be assessed explicitly; this report does not claim they are solved.
