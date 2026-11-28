import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:feasta/features/customer/widgets/provider_brand_visual.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'provider_discovery_test.dart' show provider;
import 'provider_profile_layout_test.dart' show LogoTestClient, waitForLogoFit;

Future<Uint8List> fixture(String kind) async {
  final width = kind == 'extreme-edge-art'
      ? 960
      : kind == 'lettering'
      ? 240
      : 120;
  const height = 120;
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  if (!kind.startsWith('transparent')) {
    canvas.drawRect(
      Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()),
      Paint()..color = const Color(0xffaaaaaa),
    );
  }
  if (kind == 'opaque-square-frame') {
    canvas.drawRect(
      const Rect.fromLTWH(0, 0, 120, 120),
      Paint()..color = const Color(0xfff6f8f7),
    );
    canvas.drawRect(
      const Rect.fromLTWH(1, 1, 118, 118),
      Paint()..color = const Color(0xffeaeceb),
    );
  }
  final paragraph =
      (ui.ParagraphBuilder(
              ui.ParagraphStyle(fontSize: kind == 'lettering' ? 28 : 20),
            )
            ..pushStyle(ui.TextStyle(color: Colors.black))
            ..addText(kind == 'lettering' ? 'LOGO TEXT' : 'LOGO'))
          .build()
        ..layout(ui.ParagraphConstraints(width: width.toDouble()));
  canvas.drawParagraph(paragraph, Offset(kind == 'lettering' ? 2 : 20, 45));
  if (kind.endsWith('edge-art')) {
    canvas.drawRect(
      const Rect.fromLTWH(0, 0, 12, 12),
      Paint()..color = Colors.red,
    );
    canvas.drawRect(
      Rect.fromLTWH(width - 12.0, 108, 12, 12),
      Paint()..color = Colors.red,
    );
  }
  final picture = recorder.endRecording();
  final image = await picture.toImage(width, height);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  picture.dispose();
  paragraph.dispose();
  return bytes!.buffer.asUint8List();
}

void main() {
  for (final kind in [
    'opaque-square',
    'opaque-square-frame',
    'transparent',
    'transparent-edge-art',
    'lettering',
    'edge-art',
    'extreme-edge-art',
  ]) {
    testWidgets('circular logo preserves $kind artwork at C55 size', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final bytes = (await tester.runAsync(() => fixture(kind)))!;
      debugNetworkImageHttpClientProvider = () => LogoTestClient(bytes);
      addTearDown(() {
        debugNetworkImageHttpClientProvider = null;
        PaintingBinding.instance.imageCache.clear();
      });
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: RepaintBoundary(
                key: const ValueKey('logo-visual'),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: ProviderLogoBadge(
                    provider: provider(logo: 'https://example.com/$kind.png'),
                    size: 80,
                    circular: true,
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await tester.pumpAndSettle();
      expect(
        tester.getSize(find.byType(ProviderLogoBadge)),
        const Size(80, 80),
      );
      expect(find.byType(ClipOval), findsOneWidget);
      await waitForLogoFit(tester);
      final image = tester.widget<RawImage>(find.byType(RawImage));
      expect(image.image, isNotNull);
      expect(tester.widget<Image>(find.byType(Image)).fit, BoxFit.contain);
      final mask = tester.getRect(find.byType(ClipOval));
      final artwork = tester.getRect(find.byType(Image));
      expect(
        artwork.width / artwork.height,
        closeTo(image.image!.width / image.image!.height, 0.001),
      );
      final pixels = (await tester.runAsync(
        () => image.image!.toByteData(format: ui.ImageByteFormat.rawRgba),
      ))!.buffer.asUint8List();
      final sourceWidth = image.image!.width;
      final sourceHeight = image.image!.height;
      var farthest = 0.0;
      var left = double.infinity, right = double.negativeInfinity;
      var top = double.infinity, bottom = double.negativeInfinity;
      for (var y = 0; y < sourceHeight; y++) {
        for (var x = 0; x < sourceWidth; x++) {
          final at = (y * sourceWidth + x) * 4;
          final black =
              pixels[at] < 32 && pixels[at + 1] < 32 && pixels[at + 2] < 32;
          final red =
              pixels[at] > 200 && pixels[at + 1] < 80 && pixels[at + 2] < 80;
          if (pixels[at + 3] == 0 || !(black || red)) continue;
          final point = Offset(
            artwork.left + (x + 0.5) * artwork.width / sourceWidth,
            artwork.top + (y + 0.5) * artwork.height / sourceHeight,
          );
          final distance = (point - mask.center).distance;
          if (distance > farthest) farthest = distance;
          if (point.dx < left) left = point.dx;
          if (point.dx > right) right = point.dx;
          if (point.dy < top) top = point.dy;
          if (point.dy > bottom) bottom = point.dy;
        }
      }
      // The same margin and centering apply to text, edge artwork and opaque or
      // transparent backgrounds. Test foreground pixels rather than blank source corners.
      expect(farthest, lessThanOrEqualTo(mask.width * 0.465));
      expect(farthest, greaterThan(mask.width * 0.42));
      expect((left + right) / 2, closeTo(mask.center.dx, 0.5));
      expect((top + bottom) / 2, closeTo(mask.center.dy, 0.5));
      await expectLater(
        find.byKey(const ValueKey('logo-visual')),
        matchesGoldenFile('goldens/circular_logo_$kind.png'),
      );
      expect(tester.takeException(), isNull);
      debugNetworkImageHttpClientProvider = null;
    });
  }
  for (final url in [null, 'https://example.com/failed.png']) {
    testWidgets('neutral circular fallback for $url', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: RepaintBoundary(
                key: const ValueKey('fallback-visual'),
                child: ProviderLogoBadge(
                  provider: provider(logo: url),
                  size: 80,
                  circular: true,
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(ClipOval), findsOneWidget);
      expect(find.byIcon(Icons.storefront_outlined), findsOneWidget);
      expect(
        tester.getSize(find.byType(ProviderLogoBadge)),
        const Size(80, 80),
      );
      expect(tester.takeException(), isNull);
      await expectLater(
        find.byKey(const ValueKey('fallback-visual')),
        matchesGoldenFile(
          'goldens/circular_logo_${url == null ? "missing" : "failed"}.png',
        ),
      );
    });
  }
}
