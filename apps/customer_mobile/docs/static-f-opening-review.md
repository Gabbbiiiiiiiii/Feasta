# Static-F opening restoration

Supersedes the neutral-native-splash and compact-fan starting pose described in startup-presentation-correction-review.md.

The official assembled F now appears on the native splash and first decoded Flutter frame. Both use the original SVG rasterized for native platforms, centered at 128 logical pixels wide on #F7F8F8. Android light/dark Android 12 launch themes reference the F splash again; older Android launch backgrounds include the centered F bitmap. iOS launch images also match this size.

The existing 4200 ms Flutter timeline starts promptly after local artwork and first-frame readiness. No six-second hold or network-dependent native retention was added. The utensils begin at their exact assembled positions and full size, crossfade from the official F as separation begins, rotate along curved outward/return paths, reassemble, reveal the original easta lettering, hold the complete wordmark, and fade to the existing authorized destination.

StartupShell, Firebase/App Check initialization, authentication, account restoration, routing, recovery, emerald theme, reduced motion, and once-per-cold-launch ownership are unchanged. The opaque presentation still hides sign-in/restoration UI and waits for secure destination readiness before its final fade.

Validation: 47 focused Flutter tests passed (splash, native-to-Flutter first-frame readiness, authentication restoration and navigation). Asset export passed. All seven generated-plugin files match their pre-task SHA-256 hashes. Changed-file Flutter analysis passed with no issues; git diff --check passed (line-ending notices only).

Real-device review remains required: rebuild and fully stop/relaunch on realme C55; verify centered native F -> matching Flutter F -> outward utensils -> assembled F -> easta -> completed wordmark -> correct Home/guest destination. Repeat with a restored account, signed out, slow/offline startup, dark mode, and Remove animations enabled. Check OEM splash alignment and frame smoothness, which widget tests cannot establish. No build/install, commit, push, merge, or deployment performed.
