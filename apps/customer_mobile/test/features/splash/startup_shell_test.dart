import 'dart:async';

import 'package:feasta/app/startup_shell.dart';
import 'package:feasta/features/splash/opening_animation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final overlay = find.byKey(const ValueKey('feasta-opening-overlay'));
  Finder part(String name) => find.byKey(ValueKey('opening-$name'));

  Future<void> mount(WidgetTester tester, Widget widget) async {
    await tester.pumpWidget(widget);
    await tester.pump();
    await tester.pump();
  }

  testWidgets(
    'first Flutter presentation is static F while security initializes',
    (tester) async {
      final security = Completer<void>();
      final artwork = Completer<void>();
      var appBuilt = false;
      await tester.pumpWidget(
        StartupShell(
          initialize: () => security.future,
          presentationReady: artwork.future,
          appBuilder: (_) {
            appBuilt = true;
            return const Text('Authorized Home');
          },
        ),
      );
      for (final name in ['fork', 'knife', 'spoon']) {
        expect(part(name), findsOneWidget);
      }
      expect(tester.widget<Opacity>(part('assembled-f')).opacity, 1);
      expect(tester.widget<Opacity>(part('wordmark')).opacity, 0);
      expect(appBuilt, false);
      final fork = tester.widget<Positioned>(part('fork'));
      await tester.pump(const Duration(seconds: 6));
      expect(tester.widget<Positioned>(part('fork')).left, fork.left);
      expect(tester.widget<Opacity>(part('assembled-f')).opacity, 1);
      artwork.complete();
      await tester.pump();
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 1000));
      expect(
        tester.widget<Transform>(part('fork-motion')).transform.storage[12],
        lessThan(0),
      );
      expect(appBuilt, false);
      await tester.pumpAndSettle();
      expect(find.text('Getting things ready…'), findsNothing);
      expect(overlay, findsOneWidget);
      security.complete();
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'animation starts during Firebase work; app waits for App Check too',
    (tester) async {
      final firebase = Completer<void>();
      final appCheck = Completer<void>();
      var appCheckStarted = false;
      var appBuilt = false;
      late StartupPresentation presentation;
      await mount(
        tester,
        StartupShell(
          initialize: () async {
            await firebase.future;
            appCheckStarted = true;
            await appCheck.future;
          },
          presentationReady: Future<void>.value(),
          appBuilder: (value) {
            appBuilt = true;
            presentation = value;
            return const Scaffold(body: Text('Authorized Home'));
          },
        ),
      );
      await tester.pump(const Duration(milliseconds: 16));
      expect(tester.widget<Opacity>(part('assembled-f')).opacity, 0);
      expect(appBuilt, false);
      expect(appCheckStarted, false);
      firebase.complete();
      await tester.pump();
      expect(appCheckStarted, true);
      expect(appBuilt, false);
      await tester.pump(const Duration(milliseconds: 500));
      expect(overlay, findsOneWidget);
      expect(appBuilt, false);
      appCheck.complete();
      await tester.pump();
      expect(appBuilt, true);
      expect(overlay, findsOneWidget);
      presentation.update(ready: true);
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
      expect(find.text('Authorized Home'), findsOneWidget);
    },
  );

  testWidgets(
    'disposing before artwork readiness never starts secure bootstrap',
    (tester) async {
      final artwork = Completer<void>();
      var bootstrapCalls = 0;
      await tester.pumpWidget(
        StartupShell(
          initialize: () async {
            bootstrapCalls++;
          },
          presentationReady: artwork.future,
          appBuilder: (_) => const Text('Protected Home'),
        ),
      );
      await tester.pumpWidget(const SizedBox());
      artwork.complete();
      await tester.pump();
      expect(bootstrapCalls, 0);
    },
  );

  for (final reduced in [false, true]) {
    testWidgets(
      'pending restoration stays opaque, then hands off; reduced=$reduced',
      (tester) async {
        final readiness = ValueNotifier<bool>(false);
        addTearDown(readiness.dispose);
        final semantics = tester.ensureSemantics();

        await mount(
          tester,
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(disableAnimations: reduced),
              child: ValueListenableBuilder<bool>(
                valueListenable: readiness,
                builder: (_, ready, _) => OpeningAnimation(
                  presentationReady: Future<void>.value(),
                  destinationReady: ready,
                  child: child!,
                ),
              ),
            ),
            home: const Scaffold(
              body: Column(
                children: [
                  Text('Signing in...'),
                  Text('Sign out and browse'),
                  Text('Authorized Home'),
                ],
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(overlay, findsOneWidget);
        expect(tester.widget<Opacity>(part('wordmark')).opacity, 1);
        expect(find.text('Getting things ready…'), findsNothing);
        expect(find.bySemanticsLabel('Signing in...'), findsNothing);
        expect(find.bySemanticsLabel('Sign out and browse'), findsNothing);
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
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.inactive,
        );
        tester.binding.handleAppLifecycleStateChanged(
          AppLifecycleState.resumed,
        );
        await tester.pump();
        expect(part('fork'), findsNothing);
        readiness.value = true;
        await tester.pumpAndSettle();
        expect(overlay, findsNothing);
        expect(find.text('Authorized Home'), findsOneWidget);
        semantics.dispose();
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets(
    'slow restoration offers existing guest recovery without bypass',
    (tester) async {
      var browseCalls = 0;
      late StartupPresentation presentation;
      await mount(
        tester,
        StartupShell(
          initialize: () async {},
          presentationReady: Future<void>.value(),
          appBuilder: (value) {
            presentation = value;
            WidgetsBinding.instance.addPostFrameCallback(
              (_) => value.update(
                ready: false,
                browse: () {
                  browseCalls++;
                },
              ),
            );
            return const Scaffold(body: Text('Protected Home'));
          },
        ),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 16));
      expect(find.text('Browse as guest'), findsOneWidget);
      await tester.tap(find.text('Browse as guest'));
      await tester.pump();
      expect(browseCalls, 1);
      expect(overlay, findsOneWidget);
      expect(presentation.ready, false);
      presentation.update(ready: true);
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'genuine security failure appears after opening and never constructs app',
    (tester) async {
      var appBuilt = false;
      await mount(
        tester,
        StartupShell(
          initialize: () async =>
              throw StateError('Security initialization failed'),
          presentationReady: Future<void>.value(),
          appBuilder: (_) {
            appBuilt = true;
            return const Text('Protected Home');
          },
        ),
      );
      expect(overlay, findsOneWidget);
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
      expect(find.textContaining('could not start securely'), findsOneWidget);
      expect(appBuilt, false);
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'stalled security initialization fails closed with restart guidance',
    (tester) async {
      final security = Completer<void>();
      var appBuilt = false;
      await mount(
        tester,
        StartupShell(
          initialize: () => security.future,
          presentationReady: Future<void>.value(),
          appBuilder: (_) {
            appBuilt = true;
            return const Text('Protected Home');
          },
        ),
      );
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 46));
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
      expect(find.textContaining('could not start securely'), findsOneWidget);
      security.complete();
      await tester.pump();
      expect(appBuilt, false);
      await tester.pumpWidget(const SizedBox());
    },
  );
}
