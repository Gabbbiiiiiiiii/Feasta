import 'dart:async';

import 'package:feasta/app/startup_shell.dart';
import 'package:feasta/features/splash/opening_animation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';

class _RasterBoundaryBinding extends AutomatedTestWidgetsFlutterBinding {
  late Completer<void> rasterized;

  @override
  Future<void> get waitUntilFirstFrameRasterized => rasterized.future;
}

class _CountingBundle extends CachingAssetBundle {
  final reads = <String, int>{};

  @override
  Future<ByteData> load(String key) {
    reads.update(key, (count) => count + 1, ifAbsent: () => 1);
    return rootBundle.load(key);
  }
}

void main() {
  final binding = _RasterBoundaryBinding();

  testWidgets(
    'decode once, await visible first frame, reuse artwork during flight',
    (tester) async {
      binding.rasterized = Completer<void>();
      final security = Completer<void>();
      var bootstrapCalls = 0;
      final bundle = _CountingBundle();
      final overlay = find.byKey(const ValueKey('feasta-opening-overlay'));
      Finder part(String name) => find.byKey(ValueKey('opening-$name'));
      await tester.pumpWidget(
        DefaultAssetBundle(
          bundle: bundle,
          child: StartupShell(
            initialize: () {
              bootstrapCalls++;
              return security.future;
            },
            appBuilder: (_) => const SizedBox(),
          ),
        ),
      );
      expect(binding.sendFramesToEngine, false);
      for (var i = 0; i < 100 && !binding.sendFramesToEngine; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
      }
      expect(binding.sendFramesToEngine, true);
      expect(find.byType(SvgPicture), findsNothing);
      final vectorReads = Map<String, int>.fromEntries(
        bundle.reads.entries.where((entry) => entry.key.endsWith('.svg.vec')),
      );
      expect(vectorReads.length, 5);
      expect(bundle.reads.keys.where((key) => key.endsWith('.svg')), isEmpty);
      expect(vectorReads.values, everyElement(1));
      final spoon = tester.widget<CustomPaint>(
        find.descendant(of: part('spoon'), matching: find.byType(CustomPaint)),
      );
      final fork = tester.widget<RawImage>(
        find.descendant(of: part('fork'), matching: find.byType(RawImage)),
      );
      expect(fork.image, isNotNull);
      final beforeFlight = Map<String, int>.from(bundle.reads);
      // Even with prepared artwork, no part of the timeline runs unseen.
      await tester.pump(const Duration(seconds: 2));
      expect(tester.widget<Opacity>(part('assembled-f')).opacity, 1);
      expect(
        tester.widget<Transform>(part('fork-motion')).transform.storage[12],
        0,
      );
      expect(bootstrapCalls, 0);
      binding.rasterized.complete();
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 16));
      expect(bootstrapCalls, 1);
      expect(tester.widget<Opacity>(part('assembled-f')).opacity, 0);
      expect(
        tester.widget<Transform>(part('fork-motion')).transform.storage[12],
        lessThan(0),
      );
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 100));
        expect(
          tester.widget<CustomPaint>(
            find.descendant(
              of: part('spoon'),
              matching: find.byType(CustomPaint),
            ),
          ),
          same(spoon),
        );
        expect(
          tester
              .widget<RawImage>(
                find.descendant(
                  of: part('fork'),
                  matching: find.byType(RawImage),
                ),
              )
              .image,
          same(fork.image),
        );
        expect(bundle.reads, beforeFlight);
        expect(find.byType(OpeningAnimation), findsOneWidget);
        expect(overlay, findsOneWidget);
      }
      await tester.pumpWidget(const SizedBox());
      security.complete();
    },
  );
}
