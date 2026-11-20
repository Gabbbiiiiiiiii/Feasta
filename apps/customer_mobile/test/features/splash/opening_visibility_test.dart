import 'dart:ui' as ui;
import 'dart:typed_data';

import 'package:feasta/features/splash/opening_animation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

class _Binding extends AutomatedTestWidgetsFlutterBinding {
  @override
  Future<void> get waitUntilFirstFrameRasterized async {}
}

void main() {
  _Binding();
  for (final reduced in [false, true]) {
    testWidgets(
      'real artwork paints before Home despite stalled frames; reduced=$reduced',
      (tester) async {
        final capture = GlobalKey();
        final overlay = find.byKey(const ValueKey('feasta-opening-overlay'));
        Finder part(String name) => find.byKey(ValueKey('opening-$name'));
        await tester.pumpWidget(
          RepaintBoundary(
            key: capture,
            child: MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQueryData(disableAnimations: reduced),
                child: OpeningAnimation(child: child!),
              ),
              home: const ColoredBox(color: Colors.red),
            ),
          ),
        );
        // Use production asset preparation, including the original compiled SVGs.
        for (var i = 0; i < 100; i++) {
          await tester.runAsync(
            () => Future<void>.delayed(const Duration(milliseconds: 20)),
          );
          await tester.pump();
          if (tester
                      .widget<Opacity>(
                        part(reduced ? 'wordmark' : 'assembled-f'),
                      )
                      .opacity ==
                  1 &&
              find
                  .descendant(
                    of: part('wordmark'),
                    matching: find.byType(CustomPaint),
                  )
                  .evaluate()
                  .isNotEmpty) {
            break;
          }
        }
        await tester.pump();

        Future<int> greenPixels(Rect rect) async {
          final boundary =
              capture.currentContext!.findRenderObject()!
                  as RenderRepaintBoundary;
          late ui.Image image;
          late ByteData data;
          await tester.runAsync(() async {
            image = await boundary.toImage();
            data = (await image.toByteData(
              format: ui.ImageByteFormat.rawRgba,
            ))!;
          });
          final bytes = data.buffer.asUint8List();
          var green = 0;
          var red = 0;
          for (var y = rect.top.ceil(); y < rect.bottom.floor(); y++) {
            for (var x = rect.left.ceil(); x < rect.right.floor(); x++) {
              final offset = (y * image.width + x) * 4;
              if (bytes[offset + 1] > bytes[offset] + 20 &&
                  bytes[offset + 1] > bytes[offset + 2]) {
                green++;
              }
              if (bytes[offset] > 240 && bytes[offset + 1] < 20) red++;
            }
          }
          image.dispose();
          expect(
            red,
            0,
            reason: 'Home must remain covered by the opaque opening',
          );
          return green;
        }

        if (!reduced) {
          // A single long frame models Home preparation blocking the UI thread.
          await tester.pump(const Duration(seconds: 10));
          expect(overlay, findsOneWidget);
          expect(tester.widget<Opacity>(part('lettering')).opacity, 1);
          expect(tester.widget<Opacity>(part('wordmark')).opacity, 0);
          final clip = find
              .ancestor(of: part('lettering'), matching: find.byType(ClipRect))
              .first;
          final clipRect = tester.getRect(clip);
          expect(
            await greenPixels(clipRect),
            greaterThan(50),
            reason: 'The revealed letters must actually paint inside the clip',
          );
          final motion = tester.widget<Transform>(part('lettering-motion'));
          expect(motion.transform.storage[12], lessThan(0));
          await tester.pump(); // Establish the restarted ticker's time origin.
          await tester.pump(const Duration(seconds: 10));
        }
        expect(overlay, findsOneWidget);
        expect(tester.widget<Opacity>(part('wordmark')).opacity, 1);
        final logo = tester.getRect(part('wordmark'));
        expect(logo.center, const Offset(400, 300));
        expect(logo.width, closeTo(417 * 96 / 177, .001));
        final letters = Rect.fromLTRB(
          logo.left + logo.width * 177 / 417,
          logo.top,
          logo.right,
          logo.bottom,
        );
        expect(await greenPixels(letters), greaterThan(300));
        // Every official glyph must paint, including the rightmost a.
        for (final bounds in [
          (177, 214),
          (214, 273),
          (273, 322),
          (322, 358),
          (358, 417),
        ]) {
          expect(
            await greenPixels(
              Rect.fromLTRB(
                logo.left + logo.width * bounds.$1 / 417,
                logo.top,
                logo.left + logo.width * bounds.$2 / 417,
                logo.bottom,
              ),
            ),
            greaterThan(30),
          );
        }
        expect(
          await greenPixels(
            Rect.fromLTRB(logo.left, logo.top, letters.left, logo.bottom),
          ),
          greaterThan(300),
        );
        // The existing brief hold must start after the full wordmark frame.
        await tester.pump(const Duration(milliseconds: 100));
        expect(overlay, findsOneWidget);
        expect(
          tester
              .widget<Opacity>(
                find
                    .ancestor(of: overlay, matching: find.byType(Opacity))
                    .first,
              )
              .opacity,
          1,
        );
        await tester.pumpAndSettle();
        expect(overlay, findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
