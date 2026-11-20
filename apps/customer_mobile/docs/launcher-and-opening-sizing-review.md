# Launcher icon and smaller opening review

Implemented directly in the original apps/customer_mobile project.

## Launcher

The official F paths are preserved and recolored white only in derived launcher artwork. A subtle #10492E -> #093B26 -> #073520 emerald gradient gives the tile depth. The white mark occupies 62.5% of the legacy/iOS source width. Legacy Android has rounded corners; modern Android receives full adaptive background/foreground layers and its launcher supplies the mask. The adaptive F stays within the 66/108 safe circle, with the old second 16% inset removed. iOS icons are full bleed and opaque, allowing iOS to apply its own corner mask. All configured Android density variants and iOS catalog sizes were regenerated. Original gradient SVGs and animation component assets are unchanged.

## Opening size

The entire opening artwork is 25% smaller: the F is 96 logical pixels wide instead of 128, and the full 417:177 wordmark is approximately 226.17 pixels wide instead of 301.56. Native Android light/dark and iOS startup images match the smaller first Flutter F. The same uniform scale applies to utensil paths, outward motion, reassembly, lettering, and reduced motion. The 4.2-second sequence, immediate first movement after rasterization, secure restoration/recovery, and once-per-cold-launch ownership are unchanged.

The asset generator exports launcher and splash artwork separately, so the white-on-emerald launcher does not change the original green-on-light opening colors.

## Validation

All 21 focused branding/opening tests passed, including native-to-Flutter 96 dp continuity, immediate movement, the complete utensil/lettering sequence, single opening ownership, Home/guest handoff, reduced motion, adaptive icon safe-zone checks, and iOS catalog dimensions/opacity. Changed-file Flutter analysis passed with no issues. git diff --check passed (existing line-ending notices only). The source asset export also passed. All seven generated-plugin files match their pre-task SHA-256 hashes. Existing unrelated native configuration, launch-screen constraints, authentication, navigation, App Check, backend/web, and Firebase configuration were preserved. No commit, push, merge, deployment, app build, or device installation performed.

## Device review

Rebuild/install the actual app and check the realme C55 home-screen icon at normal size, in a folder, and with the launcher's available icon shapes. Legacy Android rounded corners and adaptive masks should both remain clean with no clipped F. Launcher caches may retain old artwork until the launcher refreshes. Verify iOS app-icon appearance in an iOS build as well.

Fully stop and relaunch for the opening: confirm the smaller native F matches Flutter without a size jump, utensils/lettering stay centered, and the complete wordmark hands off to the appropriate Home. Repeat signed out, with a restored session, dark mode, reduced motion, and a slow connection. Physical-device smoothness and OEM/native handoff still need review; no such result is claimed here.

## Exact files changed in this task

All paths below are relative to apps/customer_mobile. This list compares file contents with the working tree before this task, including pre-existing untracked files; it is not a list of all local git modifications.

Total: 67 files.

- `android/app/src/main/res/drawable-hdpi/android12splash.png`
- `android/app/src/main/res/drawable-hdpi/ic_launcher_background.png` (new)
- `android/app/src/main/res/drawable-hdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/drawable-hdpi/splash.png`
- `android/app/src/main/res/drawable-mdpi/android12splash.png`
- `android/app/src/main/res/drawable-mdpi/ic_launcher_background.png` (new)
- `android/app/src/main/res/drawable-mdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/drawable-mdpi/splash.png`
- `android/app/src/main/res/drawable-night-hdpi/android12splash.png`
- `android/app/src/main/res/drawable-night-mdpi/android12splash.png`
- `android/app/src/main/res/drawable-night-xhdpi/android12splash.png`
- `android/app/src/main/res/drawable-night-xxhdpi/android12splash.png`
- `android/app/src/main/res/drawable-night-xxxhdpi/android12splash.png`
- `android/app/src/main/res/drawable-xhdpi/android12splash.png`
- `android/app/src/main/res/drawable-xhdpi/ic_launcher_background.png` (new)
- `android/app/src/main/res/drawable-xhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/drawable-xhdpi/splash.png`
- `android/app/src/main/res/drawable-xxhdpi/android12splash.png`
- `android/app/src/main/res/drawable-xxhdpi/ic_launcher_background.png` (new)
- `android/app/src/main/res/drawable-xxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/drawable-xxhdpi/splash.png`
- `android/app/src/main/res/drawable-xxxhdpi/android12splash.png`
- `android/app/src/main/res/drawable-xxxhdpi/ic_launcher_background.png` (new)
- `android/app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/drawable-xxxhdpi/splash.png`
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- `assets/branding/feasta_android12_splash.png`
- `assets/branding/feasta_android_icon.png` (new)
- `assets/branding/feasta_icon_background.png` (new)
- `assets/branding/feasta_icon_foreground.png` (new)
- `assets/branding/feasta_native_icon.png`
- `assets/branding/feasta_static_splash.png`
- `docs/launcher-and-opening-sizing-review.md` (new)
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-50x50@1x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-50x50@2x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-57x57@1x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-57x57@2x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-72x72@1x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-72x72@2x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png`
- `ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png`
- `ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png`
- `ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png`
- `ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png`
- `lib/features/splash/opening_animation.dart`
- `pubspec.yaml`
- `test/features/splash/branding_assets_test.dart` (new)
- `test/features/splash/opening_animation_test.dart`
- `tool/generate_brand_assets.dart`
