# Launcher F padding adjustment

The preceding startup task was completed and validated before this adjustment. This change uniformly reduces only the white launcher F's width and height by 12%, keeping it centered on the unchanged emerald background.

Legacy Android and iOS source widths: 640 -> 563.2 pixels on the 1024-pixel canvas (62.5% -> 55% of the tile width). Android adaptive foreground source width: 464 -> 408.32 pixels, with its existing safe-zone padding and zero extra inset retained. Original F paths and background colors, gradient, corner treatment, and platform masks are preserved.

Android launcher variants and the complete iOS icon catalog were regenerated. The generator also re-exported its splash PNG sources deterministically; hashes confirm that those files did not change. Opening source, startup/security code, compiled opening vectors, native splash resources, 96 dp opening size, and 4200 ms choreography are byte-for-byte unchanged by this adjustment. All seven generated-plugin files match their pre-adjustment hashes, and all unrelated local changes are preserved.

Validation: source export and all 10 focused branding/opening tests passed. Changed-file analysis and git diff --check are recorded in the task result. No commit or push performed. Generated icon assets need a rebuilt/updated app and launcher refresh for physical-device review; this launcher-only adjustment was not installed on the phone.

## Exact changed files

Paths below are relative to apps/customer_mobile, compared with the working tree at the start of this adjustment.

- `android/app/src/main/res/drawable-hdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/drawable-mdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/drawable-xhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/drawable-xxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png`
- `android/app/src/main/res/mipmap-hdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-mdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png`
- `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png`
- `assets/branding/feasta_android_icon.png`
- `assets/branding/feasta_icon_foreground.png`
- `assets/branding/feasta_native_icon.png`
- `docs/launcher-icon-padding-review.md`
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
- `tool/generate_brand_assets.dart`
