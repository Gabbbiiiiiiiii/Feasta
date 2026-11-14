# Single-F handoff and opening smoothness

This correction supersedes the initial-departure behavior in static-f-opening-review.md. It changes only opening presentation, optional diagnostics, and focused tests. Android launch resources, MainActivity, Firebase/App Check, Google authentication, authorization, navigation, and booking code are unchanged.

## Findings and correction

- Native Android light/dark Android 12 splash themes reference the official static F, as intended. Pre-Android-12 launch backgrounds also center it. Flutter paints the same centered 128 dp F before releasing its first frame. MainActivity has no custom splash retention or exit handler; required system/OEM splash behavior remains in place.
- The Flutter timeline previously waited until 0.10 of 4200 ms (420 ms) before departure. Its 0.10?0.14 crossfade also painted a stationary assembled F while utensils were already moving. That overlap can look like a duplicate F. Both sources are removed: t=0 paints only the assembled F; the next advancing frame paints only moving utensils. The initial outward easing now starts visibly without the former hold. Reassembly still blends only after the pieces reach their stationary final poses.
- One late-final controller belongs to the stable outer StartupShell opening. FeastaApp suppresses its own opening when hosted by that shell. Tests verify a single overlay/state/ticker through startup updates and no replay on navigation/resume. No second native activity or splash layer was added.
- Previously, every tick called setState on the whole opening, recreated artwork widgets, and could instantiate SvgPicture.asset while the explicit preload was still decoding the same SVGs. SVG fallback loading is removed. All five original SVGs are decoded during preparation; their CustomPaint widgets and fork image are reused. Repaint boundaries isolate static artwork and the underlying app. Utensils use translation/rotation transforms with fixed layout bounds. Only the overlay's animation builder updates on normal ticks; the outer state changes at readiness/recovery boundaries.
- Bundled artwork and a decoded starting frame still precede first-frame release. The controller waits for the first rasterization signal, then starts at zero. A test explicitly holds that signal for two simulated seconds and verifies the timeline does not run unseen, followed by movement on the next advancing 16 ms frame. There is no new timer or animation-start delay.
- Bootstrap still runs its existing asynchronous security sequence behind the opening. App construction/restoration may still compete for device CPU/platform resources; they were not moved, skipped, or disabled without device evidence. Source inspection establishes the intentional hold/overlap and redundant rendering work, not the remaining C55 CPU/GPU cost.

The existing 4.2-second sequence, original shapes/gradients, rightward lettering reveal, wordmark hold, secure Home/guest handoff, reduced motion, and recovery remain intact. No sign-in/restoration UI is uncovered during the opening. No native resources or logo assets were regenerated in this correction.

## Profile on the realme C55

Run from apps/customer_mobile with USB debugging enabled and the C55 connected:

```powershell
flutter devices
flutter run --profile -d YOUR_DEVICE_ID --dart-define=FEASTA_OPENING_DIAGNOSTICS=true
```

Use the existing project configuration and signing. Fully stop the process before each trial; hot reload and ordinary background/resume intentionally do not replay the opening. Repeat fresh launches signed out and with a restored account, with normal/slow connectivity, dark mode, and Remove animations enabled. Do not clear app data merely to replay it.

The opt-in console output and Dart timeline events start with FEASTA_OPENING. The phase markers separate local artwork preparation, first-frame rasterization/motion start, outward flight, return, reassembly, lettering, the deliberate completed-wordmark hold, and any wait for a secure destination. The summary reports frames sampled during the opening, UI/raster over-budget counts, worst build/raster times, late-vsync counts/worst overhead, and secure-wait count. Budget derives from the display refresh rate (about 16.67 ms at 60 Hz). Timing callbacks are batched, so the summary flushes one second after the opening; that diagnostic timer never delays Home. Timing collection is off by default and disabled in release builds.

Use the DevTools link printed by Flutter and its Performance view to inspect UI and raster frames and CPU work around the FEASTA opening events. High build time suggests Dart/build work; high raster time suggests painting/compositing; high vsync overhead can reveal scheduling stalls that build duration alone misses. A long waiting_for_secure_destination interval is a deliberate secure wait, not proof of animation jank. Console timing collection starts before handoff so it also covers the short opening if DevTools connects afterward. These counters are diagnostic indicators; use a device timeline for attribution and dropped-frame analysis. Avoid screen recording for the baseline performance pass, then record a separate visual pass for native alignment/ghosting.

Flutter recommends physical-device profile mode because debug JIT/checking overhead does not represent release smoothness: https://docs.flutter.dev/perf/ui-performance. Performance tools: https://docs.flutter.dev/tools/devtools/performance.

Native/OEM exit-animation behavior, actual C55 frame budgets, and final visual smoothness require this device review. No physical-device profile result is claimed here.

## Validation

50 focused tests passed across splash, account restoration, and secure navigation. Seven additional tests passed with diagnostics enabled, covering real artwork caching, secure holds, and diagnostic callback cleanup. Changed-file Flutter analysis passed with no issues. git diff --check passed (existing line-ending notices only). All seven generated-plugin files matched their pre-correction SHA-256 hashes. No commit, push, merge, deployment, build, or device installation performed.
