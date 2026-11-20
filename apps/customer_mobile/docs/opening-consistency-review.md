# Opening consistency review — 2026-10-17

Physical device: realme C55 / RMX3710, Android 14, profile mode, opt-in FEASTA_OPENING_DIAGNOSTICS, reported 90 Hz / 11.11 ms budget. No app data was cleared. Each instrumented set includes the first post-install launch (trial 1) and five repeated cold-process launches (trials 2–6). Post-install results are retained separately in comparisons, not discarded. OS/APK caches remain warm; temperature and unrelated device workload are uncontrolled. These measurements cannot establish release performance or guaranteed smoothness.

## Evidence and changes

The initial installed build emitted no diagnostic markers. Its five launches are retained in `opening-consistency-c55-uninstrumented.json`; they are not an instrumented baseline. A freshly built profile baseline was then installed in place. Its Dart compilation completed before the source edits; the baseline APK is retained locally as `build/app/outputs/flutter-apk/opening-consistency-baseline.apk`, SHA-256 `42B6BC20011F54361BD9BB687E3ADE2D2CBFD6F383D7B9EC3000CA900E0EE6C2`.

Existing compiled vectors, one-time artwork preparation, single controller, and first-frame-before-Firebase scheduling were already present. Repeating these changes would not address the remaining stalls. Baseline process-to-Activity time is 1322–1591 ms; Activity/engine setup and plugin registration add further time before Dart presentation. Dart main to `preparing` is only 13.6–22.4 ms. Fork precache is 371.9–514.0 ms, versus much shorter compiled-vector decoding. These stages establish substantial native/engine and first-image-pipeline costs before controller motion. They do not isolate every ContentProvider, VM, GPU upload, or OEM splash operation. Firebase/App Check start after the first rasterized frame, so their Dart initialization does not gate the initial native static F; they can still contend with later frames.

The existing offstage Home prevented painting, but did not prevent construction or layout. Earlier retained engine traces recorded 213 ms and 101 ms layout spans during utensil motion. This task defers mounting `AuthenticationGate` and its destination widgets until the existing reassembly boundary (progress 0.62). The authentication controller, Firebase/App Check boundary, restoration, authorization, onboarding preference loading, readiness reporting and recovery continue independently. The existing paint suppression remains until progress 0.88, and tickers remain suppressed until release. The gate reads the current controller state when mounted; no earlier authorization result is cached or bypassed. The new inherited presentation signal defaults to immediate preparation outside an opening.

An intermediate candidate mounted the destination at 0.88. Its 133–253 ms initial builds competed with the final fade; repeat-launch fade markers were only 1–203 ms. That candidate was rejected. All six captures remain in `opening-consistency-c55-late-preparation.json`. The final candidate prepares layout at 0.62, after utensil motion and before lettering, without changing controller timing, artwork, transforms or alpha curves.

No fixed wait, extra controller, repeated bootstrap, authentication screen, security shortcut, launcher/branding change or asset replacement was introduced. The controller remains 4200 ms; reduced motion, the branded secure-restoration hold and accessible guest/restart recovery remain intact. The sequence remains static F → separate/fly/rotate → reassemble → easta → full logo → destination. The opening still mounts once above navigation.

Diagnostics now separate UI and raster over-budget counts and record first Flutter and first motion raster completion, plus destination initial build markers. The final motion marker requires positive controller progress, excluding a possible zero-progress ticker frame. The first reassembly-preparation capture, before that diagnostic refinement, remains in `opening-consistency-c55-reassembly-preparation.json`; its scheduling is identical to the final build. `tool/summarize_opening.py` preserves missing measurements as null and computes stage differences and bounded native/Dart clock correlations from sanitized markers.

## Measurement limits

`am start -W` TotalTime is Android's launch-to-first-draw proxy, not an optical static-splash duration. `onFlutterUiDisplayed` is another first-presentation proxy, not a compositor-exit or physical-display measurement. Native process time includes work before Activity; Activity-to-configure is an engine/setup proxy, not an isolated VM measurement.

For the final build, launch-to-motion proxy = Android TotalTime + (first motion raster − first Flutter raster). Activity-onCreate-to-motion is reported as a clock-correlation interval because the method-channel response may be delayed. Baseline only has controller-start bounds; the new raster marker was unavailable there. No exact activity-launch-to-visible-motion or optical splash time is claimed. First-motion raster is completion of the frame containing the first positive-progress tick, rather than proof of physical scanout. The intervals and raw timestamps remain in the summaries for review.

Animation wall time runs from controller start to opening completion; it includes real scheduling stalls and any secure wait. Frame summaries exclude secure-wait intervals, as before. Destination initial build is a UI build/layout submission proxy; it excludes asynchronous images and raster completion. Fade duration is measured from phase markers, which can themselves arrive late during a stall. Destination may be onboarding, recovery or Home according to the unchanged gate; these captures do not export account state.

## Reproduce

From `C:\Users\Pia\feasta-fresh\apps\customer_mobile`, with the phone unlocked and comparable refresh rate, temperature and background load:

```powershell
flutter build apk --profile --no-pub --dart-define=FEASTA_OPENING_DIAGNOSTICS=true
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb -s J7NZEAUKJNK7NJ5H install -r -t build/app/outputs/flutter-apk/app-profile.apk
python tool/measure_android_startup.py --device J7NZEAUKJNK7NJ5H --trials 6 --observe-seconds 10 --output docs/my-opening-capture.json
python tool/summarize_opening.py docs/my-opening-capture.json --output docs/my-opening-summary.json
```

Keep trial 1 separate when comparing repeat launches. Capture longer with `--observe-seconds 60` for delayed restoration. Do not clear account data to obtain favorable numbers. The existing trace tool can collect sanitized aggregate attribution in a separate run; detailed instrumentation changes overhead and should not be mixed with ordinary quantitative trials.

## Scope and review

Only this task's six Dart source/test files, the new summary script, review and capture artifacts were changed. Native activity, Android configuration, web, backend, production configuration, artwork, icons, typography and Login/Sign-Up branding were not changed by this task. All pre-existing local changes were preserved. The seven generated-plugin hashes match their task-start values. Nothing was committed, pushed, merged or deployed.

Manual device review remains required for native-to-Flutter visual alignment, perceived static-F duration, restored account, slow connectivity, dark mode, reduced motion and recovery. Device timing and widget tests do not prove optical continuity or consistent smoothness.

## Final measured comparison

Final installed APK SHA-256: `175CA12D898D66FCE7BB4E870DC4C684FF5889FD5E7F116C12BB28E28FDD9309`. Final capture has one post-install trial plus five repeat launches. Repeat trial 2 returned no Android TotalTime and did not complete inside the 10-second observation after am start returned. That record is retained with null completion/frame fields. Two additional cold launches on the same installed build, with 30-second observations and no intervening installation, are in `opening-consistency-c55-after-long-observation.json`. There are seven final repeat attempts, six with complete metrics. Supplemental trial 1 is a repeat launch, not another post-install trial.

**Consistent smoothness is not established.** The final stalled repeat decoded artwork at 208.0 ms after Dart main but did not reach the prepared-frame callback until 5931.7 ms: a 5723.7 ms gap before motion. Controller start was 6449.3 ms after Dart main; first positive-progress raster was 6579.5 ms. Clock correlation bounds place that raster 8416.1-8642.8 ms after Activity.onCreate. This delay is outside controller choreography and outside Firebase/App Check initialization, which started afterward. The present markers locate the stall in frame preparation/scheduling but cannot distinguish lifecycle suppression, CPU scheduling, engine/platform blockage or OEM presentation internals. No timer or security bypass was added to mask it. A native/engine/lifecycle trace during that failure is still needed.

The final post-install launch also stalled: animation wall time was 5159 ms and the fade phase was skipped (0 ms between markers). This outlier remains in A1, outside the repeat-run comparison. Final complete repeat launches preserve roughly 4.2-second animation wall time and the existing fade, but large UI/raster outliers and inconsistent over-budget counts remain. The change prevents destination construction during utensil flight; it does not remove destination cost or establish an improvement in worst-case startup consistency. Native stages also became faster in several final trials without native source changes. Do not credit that variation to Dart scheduling.

Milliseconds below are median (min-max; available records/attempts). Missing failures are retained, not imputed or counted as fast launches. Baseline is five repeats; final is seven repeats including the incomplete failure.

| Metric | Baseline repeats | Final repeats |
|---|---:|---:|
| Android first draw / static-splash proxy | 4336.0 (4239.0-4730.0; n=5/5) | 2209.5 (1946.0-2630.0; n=6/7) |
| Process -> Activity | 1423.0 (1322.0-1591.0; n=5/5) | 1127.0 (1021.0-2265.0; n=7/7) |
| Activity -> engine configuration | 445.0 (419.0-538.0; n=5/5) | 233.0 (192.0-1113.0; n=7/7) |
| Plugin registration | 174.0 (153.0-225.0; n=5/5) | 104.0 (97.0-266.0; n=7/7) |
| Activity -> first Flutter UI proxy | 1472.0 (1311.0-1673.0; n=5/5) | 743.0 (632.0-8276.0; n=7/7) |
| Dart main -> preparation | 15.5 (13.6-22.4; n=5/5) | 7.2 (6.6-18.3; n=7/7) |
| Fork precache | 408.5 (371.9-514.0; n=5/5) | 177.0 (156.3-277.0; n=7/7) |
| Slowest compiled vector | 22.8 (12.8-27.3; n=5/5) | 8.4 (8.0-33.9; n=7/7) |
| Artwork decoded -> prepared frame | 17.4 (10.2-19.2; n=5/5) | 10.2 (8.4-5723.7; n=7/7) |
| Allow first frame -> controller | 52.7 (35.4-100.7; n=5/5) | 36.6 (16.5-517.5; n=7/7) |
| Dart main -> controller | 494.0 (440.0-621.9; n=5/5) | 246.3 (194.5-6449.3; n=7/7) |
| Dart main -> first positive-progress raster | unavailable | 362.1 (271.5-6579.5; n=7/7) |
| Firebase initialization | 572.7 (416.0-891.8; n=5/5) | 289.7 (194.3-404.4; n=7/7) |
| App Check activation | 57.0 (28.6-86.8; n=5/5) | 32.5 (28.9-61.6; n=7/7) |
| Destination initial build | unavailable | 131.8 (109.6-173.6; n=6/7) |
| Animation wall time | 4236.0 (4196.0-4246.0; n=5/5) | 4211.5 (4203.0-4266.0; n=6/7) |
| Destination fade | 266.0 (233.0-271.0; n=5/5) | 258.0 (250.0-268.0; n=6/7) |
| Worst UI frame | 226.0 (137.6-289.0; n=5/5) | 131.8 (109.6-173.6; n=6/7) |
| Worst raster frame | 112.5 (85.7-162.9; n=5/5) | 54.4 (44.6-63.2; n=6/7) |

Per-launch timing. A2 is the stalled repeat with an incomplete capture, not a discarded warm-up or evidence of an application crash. A1 is post-install; L1/L2 are supplemental repeats. Activity-to-motion bounds use positive-progress raster in this table. Android launch-to-motion remains a first-draw proxy. Exact static-F visibility remains unmeasured.

| Trial | Android first draw ms | Launch -> motion proxy ms | Activity -> motion bounds ms | Animation ms | Destination build / fade ms |
|---|---:|---:|---:|---:|---:|
| A1 | 8523.0 | 9019.7 | 5591.6-6707.6 | 5159.0 | 355.6 / 0.0 |
| A2 | missing | missing | 8416.1-8642.8 | missing | missing / missing |
| A3 | 2630.0 | 2750.1 | 984.9-1260.5 | 4266.0 | 159.2 / 250.0 |
| A4 | 2466.0 | 2513.8 | 906.7-1217.8 | 4203.0 | 138.6 / 267.0 |
| A5 | 2242.0 | 2401.2 | 857.8-1053.9 | 4213.0 | 118.9 / 250.0 |
| A6 | 2082.0 | 2164.2 | 784.2-974.6 | 4207.0 | 109.6 / 250.0 |
| L1 | 2177.0 | 2279.0 | 822.4-1001.5 | 4210.0 | 173.6 / 266.0 |
| L2 | 1946.0 | 2033.5 | 712.9-888.6 | 4221.0 | 124.9 / 268.0 |

| Trial | Frames | Either over budget | UI over budget | Raster over budget | Worst UI / raster ms | Budget ms |
|---|---:|---:|---:|---:|---:|---:|
| A1 | 91.0 | 58.0 | 4.0 | 58.0 | 355.2 / 331.4 | 11.1 |
| A2 | missing | missing | missing | missing | missing / missing | missing |
| A3 | 204.0 | 20.0 | 4.0 | 19.0 | 159.2 / 62.8 | 11.1 |
| A4 | 219.0 | 140.0 | 3.0 | 138.0 | 138.5 / 63.2 | 11.1 |
| A5 | 222.0 | 15.0 | 3.0 | 13.0 | 118.8 / 58.1 | 11.1 |
| A6 | 221.0 | 15.0 | 3.0 | 14.0 | 109.6 / 44.6 | 11.1 |
| L1 | 222.0 | 30.0 | 4.0 | 27.0 | 173.6 / 50.7 | 11.1 |
| L2 | 231.0 | 8.0 | 4.0 | 5.0 | 125.1 / 44.7 | 11.1 |

Baseline complete repeats: 296/857 frames over budget (34.5%), with all five summaries present.

Final complete repeat records: 228/1319 frames over budget (17.3%). This excludes the missing frame summary numerically, while retaining its failed launch in the record and discussion.

## Validation completed

- 64 focused Flutter tests passed in the final clean suite (opening assets/cache, exact sequence/size, reduced motion, destination scheduling, startup disposal/failure, restoration, consent and protected navigation).
- 17 diagnostics-enabled tests passed after the positive-progress marker refinement.
- Changed-file analysis passed for all six Dart files; final profile APK built and installed in place.
- Seven generated-plugin hashes remained unchanged; git diff --check passed with existing line-ending warnings.
- No optical/device interaction review or delayed-account network benchmark was claimed. Stop here for real-device review; the startup inconsistency remains unresolved at the Android/engine frame-scheduling level.
