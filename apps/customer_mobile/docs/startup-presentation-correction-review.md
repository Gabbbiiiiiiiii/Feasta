# Startup presentation correction — realme C55 review

This supersedes the startup-order and native-splash statements in the earlier mobile branding review. The 4.2-second reference choreography remains unchanged.

## Sources of the unwanted startup presentation

- Android 12+ light and dark LaunchTheme both referenced `@drawable/android12splash`, whose existing density-specific PNGs contain the completed F. The Android launcher can also show its own entry animation using the launcher icon.
- `main()` awaited all of `bootstrap()` before calling `runApp()`. Firebase initialization, Firebase project validation, App Check activation, and emulator setup therefore extended the lifetime of the native static F. The reported six seconds is device observation, not a new instrumented timing measurement.
- Pre-Android-12 `drawable/launch_background.xml` and `drawable-v21/launch_background.xml` already contain only the neutral background bitmap. NormalTheme already uses #F7F8F8 in all configurations. No custom native splash retention or extra splash activity was found.
- Flutter's `SplashScreen` is a static complete wordmark used by onboarding preference loading and the no-identity restoration state. `AuthenticationGate` can also show its restoration indicator and recovery action. Those widgets remain functional, but are now covered until the initial destination or a genuine recovery state is ready.
- The opening's assembled F and full wordmark have zero opacity at the normal-motion starting pose. They were not the source of the initial native F. The old handoff did not wait for restoration, which could reveal a second loading presentation.

## Resulting sequence

`main()` mounts `StartupShell` immediately. The shell begins the existing bootstrap operation after its first widget build; it does not create `FeastaApp`, its Firebase repository, or its authentication controller until bootstrap succeeds. The Firebase -> project validation -> App Check -> emulator setup order is unchanged in `bootstrap.dart`.

Only bundled artwork preparation defers the first engine frame. Original vectors are decoded into pictures and the fork bitmap is precached; the compact fan is painted before the deferred frame is released. The animation then waits for first-frame rasterization and starts its unchanged 4200 ms timeline at zero. Security/network initialization does not gate that first frame or the animation. Picture resources are disposed with the opening.

Android 12+ themes now use a dedicated transparent vector splash drawable on #F7F8F8. Launcher resources and the manifest launcher reference are unchanged. The old F splash PNGs are no longer referenced by the launch themes. The generator configuration uses a separate transparent PNG, keeping regeneration neutral without changing the launcher artwork. No system splash retention, replacement activity, window-transparency trick, or exit-animation override was added. Android's mandatory enter animation remains system-controlled, so an OEM/launcher may still briefly show the proper launcher icon during that system transition. See [Android splash-screen customization and system-controlled enter animation](https://developer.android.com/develop/ui/views/launch/splash-screen).

The outer shell owns a stable presentation above the existing app navigator and authentication scope. `FeastaApp` reports only presentation readiness; its authentication gate, authorization, route decisions, modal Google sign-in, and sign-out implementations are unchanged. Onboarding preference resolution is included in readiness, preserving first-run onboarding. The inner app suppresses its own opening when hosted by the shell, preventing duplicate animations. Hidden child tickers are disabled while the shell is opaque; restoration futures, streams, and security work continue.

When ready, the normal wordmark hold and fade hand off directly to the existing destination. When pending, the opening pauses at the completed wordmark before its fade and shows “Getting things ready…”. It resumes only the final fade when readiness arrives. After fifteen seconds in continuation, restart guidance and the existing sign-out-to-guest action are available. Selecting that action never grants protected access: the existing controller and gate must resolve it. Authentication failures release the cover to their existing retry/recovery screens. Bootstrap failure or a 45-second bootstrap timeout shows the existing secure-startup restart guidance after the animation; late completion cannot construct the app after timeout.

Reduced motion retains the static official wordmark presentation, with no utensil movement or fade. Neither ordinary navigation nor background/resume recreates the shell or replays the opening.

## Validation

- 66 focused Flutter tests passed: opening sequence, decoded first-frame artwork, slow artwork/security startup, no pre-animation static F, opaque continuation and blocked underlying semantics, real authentication-gate customer/guest handoff, production app recovery handoff, bootstrap failure/timeout and late completion, reduced motion, navigation/resume, authentication restoration, protected navigation, and the intentional Google sign-in modal.
- Changed-file Flutter analysis passed with no issues.
- `git diff --check` passed (existing line-ending notices only).
- Native XML references and neutral launch backgrounds validated; launcher manifest reference preserved.
- All seven generated-plugin files matched their pre-task SHA-256 hashes.

No authentication, App Check, sign-in/sign-out implementation, protected route, booking, profile, web, or backend logic was edited. Existing local changes and supplied logo artwork were preserved. No commit, push, merge, or deployment was performed.

## Real-device review

Fully stop and relaunch the rebuilt Android app; hot reload and ordinary resume intentionally do not replay. On realme C55, check neutral native surface -> compact fan as the first app-controlled branding -> full reference choreography -> direct customer Home or guest landing. Repeat signed out, with a restored customer session, on a slow/offline connection, in dark system mode, and with Remove animations enabled. Verify the continuation remains opaque, delayed recovery is reachable, genuine errors show after opening, and intentional Google sign-in still shows its inline indicator. Check Android's OEM launch transition separately from the Flutter sequence. Native packaging, OEM splash behavior, and frame smoothness remain device checks; no Android build/install was performed here.
