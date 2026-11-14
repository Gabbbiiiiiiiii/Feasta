import 'dart:async';

import 'package:feasta/app/app.dart';
import 'package:feasta/app/startup_shell.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/application/customer_auth_scope.dart';
import 'package:feasta/features/authentication/data/repositories/customer_auth_state_repository.dart';
import 'package:feasta/features/authentication/domain/auth_account_state.dart';
import 'package:feasta/features/authentication/presentation/authentication_gate.dart';
import 'package:feasta/features/onboarding/onboarding_screen.dart';
import 'package:feasta/features/splash/opening_animation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../authentication/authentication_gate_widget_test.dart'
    show WidgetFakeRepository, widgetIdentity;
import '../authentication/authentication_restoration_test.dart'
    show StuckRepository;

void main() {
  final overlay = find.byKey(const ValueKey('feasta-opening-overlay'));

  testWidgets(
    'first engine frame is released only with the decoded official static F',
    (tester) async {
      final security = Completer<void>();
      await tester.pumpWidget(
        StartupShell(
          initialize: () => security.future,
          appBuilder: (_) => const SizedBox(),
        ),
      );
      expect(tester.binding.sendFramesToEngine, false);
      for (var i = 0; i < 100 && !tester.binding.sendFramesToEngine; i++) {
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await tester.pump();
      }
      expect(tester.binding.sendFramesToEngine, true);
      for (final name in ['spoon', 'knife']) {
        final utensil = find.byKey(ValueKey('opening-$name'));
        expect(
          find.descendant(of: utensil, matching: find.byType(CustomPaint)),
          findsOneWidget,
        );
      }
      final fork = find.byKey(const ValueKey('opening-fork'));
      final image = tester.widget<RawImage>(
        find.descendant(of: fork, matching: find.byType(RawImage)),
      );
      expect(image.image, isNotNull);
      expect(
        tester
            .widget<Opacity>(find.byKey(const ValueKey('opening-assembled-f')))
            .opacity,
        1,
      );
      expect(
        tester
            .widget<Opacity>(find.byKey(const ValueKey('opening-wordmark')))
            .opacity,
        0,
      );
      security.complete();
      await tester.pump();
      await tester.pumpWidget(const SizedBox());
    },
  );

  for (final guest in [false, true]) {
    testWidgets(
      'real authorization gate hands off directly to ${guest ? 'guest' : 'Home'}',
      (tester) async {
        final repository = StuckRepository();
        final controller = CustomerAuthenticationController(
          repository: repository,
        )..start();
        StartupPresentation? presentation;
        void report() => presentation?.update(
          ready:
              controller.state.failure != null ||
              controller.state.gate.kind != AuthenticationGateKind.loading,
          browse: controller.signOut,
        );
        controller.addListener(report);
        await tester.pumpWidget(
          StartupShell(
            initialize: () async {},
            presentationReady: Future<void>.value(),
            appBuilder: (value) {
              presentation = value;
              return CustomerAuthenticationScope(
                controller: controller,
                child: MaterialApp(
                  home: AuthenticationGate(
                    controller: controller,
                    publicBuilder: (_, _) =>
                        const Scaffold(body: Text('Guest landing')),
                    customerBuilder: (_, _) =>
                        const Scaffold(body: Text('Authorized Home')),
                  ),
                ),
              );
            },
          ),
        );
        await tester.pump();
        await tester.pump();
        repository.emitAuth(guest ? null : widgetIdentity);
        await tester.pump();
        await tester.pumpAndSettle();
        if (!guest) {
          expect(overlay, findsOneWidget);
          expect(find.text('Authorized Home'), findsNothing);
          expect(find.text('Getting things ready…'), findsNothing);
        }
        // Complete only through the real controller and gate; the shell does not authorize.
        repository.load.complete(
          const CustomerAccountLoadResult(
            identity: widgetIdentity,
            userProfile: AuthenticationUserProfileInput(
              role: 'customer',
              accountStatus: 'active',
              isActive: true,
              isBlocked: false,
              isPhoneVerified: true,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(overlay, findsNothing);
        expect(
          find.text(guest ? 'Guest landing' : 'Authorized Home'),
          findsOneWidget,
        );
        expect(find.text('Signing in...'), findsNothing);
        expect(find.text('Sign out and browse'), findsNothing);
        await tester.pumpWidget(const SizedBox());
        controller.removeListener(report);
        controller.dispose();
        await repository.close();
      },
    );
  }

  testWidgets(
    'production FeastaApp readiness reveals genuine recovery, not restoration UI',
    (tester) async {
      SharedPreferences.setMockInitialValues({
        OnboardingScreen.seenOnboardingKey: true,
      });
      final repository = WidgetFakeRepository()
        ..nextFailure = const CustomerAuthLoadFailure(
          CustomerAuthLoadFailureKind.accountAccess,
        );
      final controller = CustomerAuthenticationController(
        repository: repository,
      );
      await tester.pumpWidget(
        StartupShell(
          initialize: () async {},
          presentationReady: Future<void>.value(),
          appBuilder: (presentation) => FeastaApp(
            authenticationController: controller,
            startupPresentation: presentation,
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
      repository.emitAuth(widgetIdentity);
      await tester.pump();
      expect(overlay, findsOneWidget);
      expect(find.byType(OpeningAnimation), findsOneWidget);
      // Restoration has already reached its real failure while the expensive
      // destination is still absent during the opening flight.
      expect(
        controller.state.failure,
        CustomerAuthenticationFailureKind.accountAccess,
      );
      expect(find.byType(AuthenticationGate), findsNothing);
      await tester.pumpAndSettle();
      expect(overlay, findsNothing);
      expect(
        find.text('Account access could not be completed'),
        findsOneWidget,
      );
      expect(find.text('Try again'), findsOneWidget);
      expect(find.text('Signing in...'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
      await repository.close();
    },
  );
}
