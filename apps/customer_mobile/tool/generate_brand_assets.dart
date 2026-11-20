// Run with: flutter test tool/generate_brand_assets.dart
// Derives native PNGs from the supplied official F; never redraws its paths.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> exportPng(
  String name,
  int size,
  void Function(ui.Canvas) draw,
) async {
  final recorder = ui.PictureRecorder();
  draw(ui.Canvas(recorder));
  final picture = recorder.endRecording();
  final image = await picture.toImage(size, size);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  File(
    'assets/branding/$name.png',
  ).writeAsBytesSync(bytes!.buffer.asUint8List());
  image.dispose();
  picture.dispose();
}

void main() {
  test('export official F for launcher icons and matched native splashes', () async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final info = await vg.loadPicture(
      const SvgAssetLoader('assets/branding/feasta_assembled_f.svg'),
      null,
    );
    void mark(
      ui.Canvas canvas,
      double side,
      double width, {
      bool white = false,
    }) {
      final height = width * 159 / 177;
      canvas.save();
      canvas.translate((side - width) / 2, (side - height) / 2);
      canvas.scale(width / 177);
      if (white) {
        canvas.saveLayer(
          const ui.Rect.fromLTWH(0, 0, 177, 159),
          ui.Paint()
            ..colorFilter = const ui.ColorFilter.mode(
              ui.Color(0xFFFFFFFF),
              ui.BlendMode.srcIn,
            ),
        );
      }
      canvas.drawPicture(info.picture);
      if (white) canvas.restore();
      canvas.restore();
    }

    void background(ui.Canvas canvas, {bool rounded = false}) {
      const rect = ui.Rect.fromLTWH(0, 0, 1024, 1024);
      canvas.drawRRect(
        ui.RRect.fromRectAndRadius(rect, ui.Radius.circular(rounded ? 224 : 0)),
        ui.Paint()
          ..shader = ui.Gradient.linear(
            ui.Offset.zero,
            const ui.Offset(1024, 1024),
            const [
              ui.Color(0xFF10492E),
              ui.Color(0xFF093B26),
              ui.Color(0xFF073520),
            ],
            const [0, .55, 1],
          ),
      );
    }

    // Give the launcher mark 12% more linear breathing room; splash scale is independent.
    const launcherMarkScale = 0.88;

    // iOS supplies the platform corner mask, so its source must be full bleed.
    await exportPng('feasta_native_icon', 1024, (canvas) {
      background(canvas);
      mark(canvas, 1024, 640 * launcherMarkScale, white: true);
    });
    // Legacy Android launchers receive an explicitly rounded emerald tile.
    await exportPng('feasta_android_icon', 1024, (canvas) {
      background(canvas, rounded: true);
      mark(canvas, 1024, 640 * launcherMarkScale, white: true);
    });
    await exportPng('feasta_icon_background', 1024, background);
    // Full adaptive layers: no second inset. The F fits the 66/108 safe circle.
    await exportPng('feasta_icon_foreground', 1024, (canvas) {
      mark(canvas, 1024, 464 * launcherMarkScale, white: true);
    });

    // Keep splash colors original. Only launcher artwork uses the white F.
    // Both native splash surfaces match Flutter's smaller 96 dp opening F.
    for (final entry in {
      'feasta_static_splash': 128,
      'feasta_android12_splash': 288,
    }.entries) {
      await exportPng(entry.key, entry.value * 4, (canvas) {
        canvas.scale(4);
        mark(canvas, entry.value.toDouble(), 96);
      });
    }
    info.picture.dispose();
  });
}
