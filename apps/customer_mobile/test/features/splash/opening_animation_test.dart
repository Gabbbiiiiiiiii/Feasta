import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:feasta/features/splash/opening_animation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> advance(WidgetTester tester, Duration duration) async {
  var remaining = duration.inMicroseconds;
  while (remaining > 0) {
    final step = remaining > 1000 ? 1000 : remaining;
    await tester.pump(Duration(microseconds: step));
    remaining -= step;
  }
}

void main() {
  final overlay = find.byKey(const ValueKey('feasta-opening-overlay'));
  Finder part(String name) => find.byKey(ValueKey('opening-$name'));
  Offset position(WidgetTester tester, String name) {
    final placed = tester.widget<Positioned>(part(name));
    final motion = tester.widget<Transform>(part('$name-motion')).transform;
    return Offset(
      placed.left! + motion.storage[12],
      placed.top! + motion.storage[13],
    );
  }

  double opacity(WidgetTester tester, String name) =>
      tester.widget<Opacity>(part(name)).opacity;

  Widget app({
    bool reduced = false,
    Widget? child,
    Future<void>? ready,
    GlobalKey<NavigatorState>? navigatorKey,
  }) => MaterialApp(
    navigatorKey: navigatorKey,
    builder: (context, navigator) => MediaQuery(
      data: MediaQueryData(disableAnimations: reduced),
      child: OpeningAnimation(
        presentationReady: ready ?? Future<void>.value(),
        child: navigator!,
      ),
    ),
    home: child ?? const Scaffold(body: Text('Authorized destination')),
  );

  Future<void> start(WidgetTester tester, Widget widget) async {
    await tester.pumpWidget(widget);
    await tester.pump();
    await tester.pump();
  }

  for (final reduced in [false, true]) {
    testWidgets(
      'destination preparation waits for reassembly; reduced=$reduced',
      (tester) async {
        var destinationBuilds = 0;
        await start(
          tester,
          app(
            reduced: reduced,
            child: Builder(
              builder: (context) {
                if (!OpeningDestination.shouldPrepare(context)) {
                  return const SizedBox.shrink();
                }
                destinationBuilds++;
                return const Text('Prepared destination');
              },
            ),
          ),
        );
        expect(destinationBuilds, reduced ? 1 : 0);
        await advance(tester, Duration(milliseconds: reduced ? 10 : 2500));
        expect(destinationBuilds, reduced ? 1 : 0);
        if (!reduced) {
          await advance(tester, const Duration(milliseconds: 200));
          expect(destinationBuilds, 1);
          expect(overlay, findsOneWidget);
        }
        await tester.pumpAndSettle();
        expect(destinationBuilds, 1);
        expect(find.text('Prepared destination'), findsOneWidget);
        expect(overlay, findsNothing);
      },
    );
  }

  testWidgets(
    'fresh launch waits for presentation, showing the official static F',
    (tester) async {
      final ready = Completer<void>();
      await tester.pumpWidget(app(ready: ready.future));
      final fork = tester.widget<Positioned>(part('fork'));
      final spoon = tester.widget<Positioned>(part('spoon'));
      final knife = tester.widget<Positioned>(part('knife'));
      expect(fork.top, 0);
      expect(spoon.top, closeTo(52.0536, .0001));
      expect(knife.top, 0);
      expect(opacity(tester, 'assembled-f'), 1);
      final logo = tester.getRect(part('assembled-f'));
      expect(logo.width, closeTo(96, .001));
      expect(logo.center, const Offset(400, 300));
      expect(opacity(tester, 'lettering'), 0);
      expect(opacity(tester, 'wordmark'), 0);
      await advance(tester, const Duration(seconds: 5));
      expect(tester.widget<Positioned>(part('fork')).top, fork.top);
      expect(overlay, findsOneWidget);
      ready.complete();
      await tester.pump();
      await tester.pump();
      await tester.pump();
      await advance(tester, const Duration(milliseconds: 1000));
      expect(position(tester, 'fork').dy, lessThan(fork.top!));
      expect(opacity(tester, 'lettering'), 0);
      expect(opacity(tester, 'assembled-f'), 0);
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
      // A new app lifetime gets the opening again.
      await tester.pumpWidget(const SizedBox());
      await start(tester, app());
      expect(overlay, findsOneWidget);
      expect(opacity(tester, 'wordmark'), 0);
      await tester.pumpAndSettle();
    },
  );

  testWidgets('handoff moves on the first tick with no overlapping static F', (
    tester,
  ) async {
    await start(tester, app());
    final state = tester.state(find.byType(OpeningAnimation));
    final initial = position(tester, 'fork');
    expect(opacity(tester, 'assembled-f'), 1);
    expect(opacity(tester, 'utensils'), 0);
    for (final elapsed in [16, 32, 200, 220, 80, 200]) {
      await advance(tester, Duration(milliseconds: elapsed));
      expect(position(tester, 'fork'), isNot(initial));
      expect(opacity(tester, 'assembled-f'), 0);
      expect(opacity(tester, 'utensils'), 1);
      expect(find.byType(OpeningAnimation), findsOneWidget);
      expect(tester.state(find.byType(OpeningAnimation)), same(state));
      expect(overlay, findsOneWidget);
      expect(tester.binding.transientCallbackCount, 1);
    }
    // The 4.2s timeline also presents its two checkpoint frames.
    await advance(tester, const Duration(milliseconds: 3400));
    expect(overlay, findsOneWidget);
    await advance(tester, const Duration(milliseconds: 60));
    expect(overlay, findsNothing);
    expect(find.text('Authorized destination'), findsOneWidget);
  });

  testWidgets(
    'native splash artwork and Flutter first F share centered 96 dp bounds',
    (tester) async {
      await start(tester, app());
      final flutterF = tester.getRect(part('assembled-f'));
      expect(flutterF.width, closeTo(96, .001));
      expect(flutterF.height, closeTo(96 * 159 / 177, .001));
      expect(flutterF.center, const Offset(400, 300));
      await tester.runAsync(() async {
        for (final entry in {
          'drawable-mdpi/splash.png': 128,
          'drawable-mdpi/android12splash.png': 288,
          'drawable-night-mdpi/android12splash.png': 288,
        }.entries) {
          final bytes = File(
            'android/app/src/main/res/${entry.key}',
          ).readAsBytesSync();
          final codec = await ui.instantiateImageCodec(bytes);
          final frame = await codec.getNextFrame();
          expect(frame.image.width, entry.value);
          expect(frame.image.height, entry.value);
          final pixels = (await frame.image.toByteData())!.buffer.asUint8List();
          var left = frame.image.width;
          var right = -1;
          var top = frame.image.height;
          var bottom = -1;
          for (var y = 0; y < frame.image.height; y++) {
            for (var x = 0; x < frame.image.width; x++) {
              if (pixels[(y * frame.image.width + x) * 4 + 3] < 128) continue;
              if (x < left) left = x;
              if (x > right) right = x;
              if (y < top) top = y;
              if (y > bottom) bottom = y;
            }
          }
          expect(right - left + 1, closeTo(flutterF.width, 1));
          expect(bottom - top + 1, closeTo(flutterF.height, 1));
          expect((left + right + 1) / 2, closeTo(entry.value / 2, .5));
          expect((top + bottom + 1) / 2, closeTo(entry.value / 2, .5));
          frame.image.dispose();
          codec.dispose();
        }
      });
      for (final mode in ['values-v31', 'values-night-v31']) {
        final xml = File(
          'android/app/src/main/res/$mode/styles.xml',
        ).readAsStringSync();
        expect(
          xml,
          contains('windowSplashScreenAnimatedIcon">@drawable/android12splash'),
        );
      }
      for (final folder in ['drawable', 'drawable-v21']) {
        final xml = File(
          'android/app/src/main/res/$folder/launch_background.xml',
        ).readAsStringSync();
        expect(
          xml,
          contains('android:gravity="center" android:src="@drawable/splash"'),
        );
      }
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'assembly precedes lettering, then official wordmark holds before reveal',
    (tester) async {
      await start(tester, app());
      await advance(tester, const Duration(milliseconds: 2500));
      expect(position(tester, 'fork').dx, closeTo(19.2391, .0001));
      expect(position(tester, 'spoon').dy, closeTo(52.0536, .0001));
      expect(opacity(tester, 'lettering'), 0);
      await advance(tester, const Duration(milliseconds: 200));
      expect(opacity(tester, 'assembled-f'), 1);
      expect(opacity(tester, 'lettering'), 0);
      expect(part('fork'), findsNothing);
      await advance(tester, const Duration(milliseconds: 400));
      expect(opacity(tester, 'lettering'), greaterThan(0));
      expect(opacity(tester, 'wordmark'), 0);
      final letteringPosition = tester.widget<Positioned>(
        find
            .ancestor(of: part('lettering'), matching: find.byType(Positioned))
            .first,
      );
      expect(letteringPosition.left, -159);
      final letteringMotion = tester.widget<Transform>(
        part('lettering-motion'),
      );
      expect(letteringMotion.transform.storage[12], lessThan(0));
      await advance(tester, const Duration(milliseconds: 650));
      expect(opacity(tester, 'wordmark'), 1);
      expect(overlay, findsOneWidget);
      expect(
        tester
            .widget<Opacity>(
              find.ancestor(of: overlay, matching: find.byType(Opacity)).first,
            )
            .opacity,
        1,
      );
      await advance(tester, const Duration(milliseconds: 120));
      expect(opacity(tester, 'wordmark'), 1);
      expect(overlay, findsOneWidget);
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
    },
  );

  testWidgets('utensils separate with rotation then return to exact F poses', (
    tester,
  ) async {
    await start(tester, app());
    double rotation(String name) => tester
        .widget<Transform>(
          find
              .descendant(of: part(name), matching: find.byType(Transform))
              .last,
        )
        .transform
        .storage[0];
    expect(rotation('fork'), 1);
    await advance(tester, const Duration(milliseconds: 1428));
    expect(position(tester, 'fork').dx, closeTo(-72, .001));
    expect(position(tester, 'spoon').dy, closeTo(175.5, .001));
    expect(position(tester, 'knife').dx, closeTo(180.5, .001));
    expect(rotation('fork'), lessThan(0));
    expect(opacity(tester, 'assembled-f'), 0);
    await advance(tester, const Duration(milliseconds: 1050));
    expect(position(tester, 'fork').dx, closeTo(19.2391, .0001));
    expect(position(tester, 'spoon').dy, closeTo(52.0536, .0001));
    expect(position(tester, 'knife').dx, closeTo(78.8804, .0001));
    expect(rotation('fork'), closeTo(1, .0001));
    expect(opacity(tester, 'lettering'), 0);
    await tester.pumpAndSettle();
  });

  testWidgets('flight and lettering reuse layout subtrees between ticks', (
    tester,
  ) async {
    await start(tester, app());
    final forkLayout = tester.widget<Positioned>(part('fork'));
    final initial = position(tester, 'fork');
    for (var frame = 0; frame < 20; frame++) {
      await advance(tester, const Duration(milliseconds: 16));
      expect(tester.widget<Positioned>(part('fork')), same(forkLayout));
      expect(position(tester, 'fork'), isNot(initial));
    }
    await advance(tester, const Duration(milliseconds: 2700));
    final letteringLayoutFinder = find
        .ancestor(of: part('lettering'), matching: find.byType(Positioned))
        .first;
    final letteringLayout = tester.widget<Positioned>(letteringLayoutFinder);
    final initialTranslation = tester
        .widget<Transform>(part('lettering-motion'))
        .transform
        .storage[12];
    for (var frame = 0; frame < 10; frame++) {
      await advance(tester, const Duration(milliseconds: 16));
      expect(
        tester.widget<Positioned>(letteringLayoutFinder),
        same(letteringLayout),
      );
    }
    expect(
      tester.widget<Transform>(part('lettering-motion')).transform.storage[12],
      isNot(initialTranslation),
    );
    await tester.pumpAndSettle();
  });

  testWidgets(
    'destination stays mounted but paints only during wordmark hold',
    (tester) async {
      var builds = 0;
      var paints = 0;
      await start(
        tester,
        app(
          child: Builder(
            builder: (context) {
              builds++;
              return CustomPaint(painter: _PaintProbe(() => paints++));
            },
          ),
        ),
      );
      expect(builds, greaterThan(0));
      expect(paints, 0);
      await advance(tester, const Duration(milliseconds: 3600));
      expect(paints, 0);
      await advance(tester, const Duration(milliseconds: 100));
      expect(paints, greaterThan(0));
      expect(opacity(tester, 'wordmark'), 1);
      expect(
        tester
            .widget<Opacity>(
              find.ancestor(of: overlay, matching: find.byType(Opacity)).first,
            )
            .opacity,
        1,
      );
      await tester.pumpAndSettle();
    },
  );

  testWidgets(
    'startup changes and route replacement cannot dismiss opening or replay it',
    (tester) async {
      final navigator = GlobalKey<NavigatorState>();
      final startup = ValueNotifier<String>('Restoring account');
      addTearDown(startup.dispose);
      await start(
        tester,
        app(
          navigatorKey: navigator,
          child: ValueListenableBuilder<String>(
            valueListenable: startup,
            builder: (_, value, _) => Scaffold(body: Text(value)),
          ),
        ),
      );
      await advance(tester, const Duration(milliseconds: 1000));
      startup.value = 'Guest authorized';
      await tester.pump();
      expect(overlay, findsOneWidget);
      navigator.currentState!.pushReplacement(
        MaterialPageRoute<void>(
          builder: (_) =>
              const Scaffold(body: Text('Current authorized route')),
        ),
      );
      await advance(tester, const Duration(milliseconds: 400));
      expect(overlay, findsOneWidget);
      expect(opacity(tester, 'wordmark'), 0);
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
      expect(find.text('Current authorized route'), findsOneWidget);
      navigator.currentState!.push(
        MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('Login or sign out')),
        ),
      );
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
    },
  );

  testWidgets(
    'reduced motion presents static official wordmark before revealing app',
    (tester) async {
      await start(tester, app(reduced: true));
      expect(overlay, findsOneWidget);
      expect(part('fork'), findsNothing);
      expect(opacity(tester, 'wordmark'), 1);
      expect(
        tester.getRect(part('wordmark')).width,
        closeTo(417 * 96 / 177, .001),
      );
      expect(tester.getRect(part('wordmark')).center, const Offset(400, 300));
      await advance(tester, const Duration(milliseconds: 200));
      expect(opacity(tester, 'wordmark'), 1);
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
    },
  );

  testWidgets('opening fits compact and wide Android viewports', (
    tester,
  ) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    for (final size in [const Size(320, 568), const Size(800, 1280)]) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      await start(tester, app());
      await advance(tester, const Duration(milliseconds: 650));
      expect(tester.getRect(part('assembled-f')).width, closeTo(96, .001));
      expect(
        tester.getRect(part('wordmark')).width,
        closeTo(417 * 96 / 177, .001),
      );
      expect(tester.takeException(), isNull);
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
    }
  });
}

class _PaintProbe extends CustomPainter {
  _PaintProbe(this.onPaint);
  final VoidCallback onPaint;
  @override
  void paint(Canvas canvas, Size size) => onPaint();
  @override
  bool shouldRepaint(_PaintProbe oldDelegate) => false;
}
