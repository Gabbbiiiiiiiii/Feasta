import 'dart:async';

import 'package:feasta/shared/widgets/feasta_brand.dart';
import 'package:flutter_svg/flutter_svg.dart';

import 'package:feasta/app/router/customer_route_guard.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/application/customer_auth_scope.dart';
import 'package:feasta/features/authentication/data/repositories/customer_auth_state_repository.dart';
import 'package:feasta/features/presentation/widgets/customer_login_modal.dart';
import 'package:feasta/features/authentication/presentation/authentication_gate.dart';
import 'package:flutter/material.dart';
import 'package:feasta/core/theme/app_colors.dart';
import 'package:feasta/features/authentication/domain/customer_login.dart';
import 'package:feasta/features/authentication/presentation/authentication_loading.dart';
import 'package:flutter_test/flutter_test.dart';

import 'customer_auth_controller_test.dart' show identity;
import 'customer_auth_navigation_test.dart'
    show NavigationRepository, NavigationGateway;

void main() {
  for (final width in [280.0, 360.0, 390.0]) {
    testWidgets(
      'authentication modal keeps compact official wordmark at $width',
      (tester) async {
        tester.view.physicalSize = Size(width, 640);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final repository = NavigationRepository();
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () => showCustomerLoginModal(
                    context,
                    loginGateway: NavigationGateway(repository),
                  ),
                  child: const Text('Open login'),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Open login'));
        await tester.pumpAndSettle();
        final brand = find.byType(FeastaBrand);
        expect(tester.widget<FeastaBrand>(brand).width, 140);
        final bounds = tester.getRect(brand);
        expect(bounds.width, closeTo(140, 0.1));
        expect(bounds.height, closeTo(140 * 159 / 417, 0.1));
        expect(bounds.center.dx, closeTo(width / 2, 0.1));
        expect(
          bounds.bottom,
          lessThan(tester.getRect(find.text('Log in or sign up')).top),
        );
        final svg = tester.widget<SvgPicture>(
          find.descendant(of: brand, matching: find.byType(SvgPicture)),
        );
        expect(
          (svg.bytesLoader as SvgAssetLoader).assetName,
          'assets/branding/feasta_full_wordmark.svg',
        );
        expect(svg.semanticsLabel, 'FEASTA logo');
        await tester.ensureVisible(find.text('Create account'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
        await repository.close();
      },
    );
  }

  for (final cancelled in [false, true]) {
    testWidgets(
      'Google picker keeps the same cream sheet, cancelled=$cancelled',
      (tester) async {
        final repository = NavigationRepository();
        final authorization = Completer<CustomerAccountLoadResult>();
        repository.pendingBootstrap = authorization;
        final gateway = PendingModalGateway(repository)
          ..holdCredentials = !cancelled;
        final controller = CustomerAuthenticationController(
          repository: repository,
        )..start();
        repository.emitAuth(null);
        var completions = 0;
        bool? result;
        await tester.pumpWidget(
          CustomerAuthenticationScope(
            controller: controller,
            child: MaterialApp(
              home: AuthenticationGate(
                controller: controller,
                publicBuilder: (context, _) => Scaffold(
                  body: TextButton(
                    child: const Text('Guest Account'),
                    onPressed: () async {
                      result = await showCustomerLoginModal(
                        context,
                        intendedLocation: CustomerAppLocations.account,
                        loginGateway: gateway,
                      );
                      completions++;
                    },
                  ),
                ),
                customerBuilder: (_, controller) => Scaffold(
                  body: Text('Home: ${controller.intendedLocation}'),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Guest Account'));
        await tester.pumpAndSettle();
        final surfaceFinder = find.byKey(
          const Key('customer-login-sheet-surface'),
        );
        final surface = tester.renderObject(surfaceFinder);
        final bounds = tester.getRect(surfaceFinder);
        expect(
          tester.widget<Material>(surfaceFinder).color,
          AppColors.background,
        );
        await tester.ensureVisible(
          find.byKey(const Key('google-login-button')),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('google-login-button')));
        await tester.pump();
        expect(tester.renderObject(surfaceFinder), same(surface));
        expect(tester.getRect(surfaceFinder), bounds);
        expect(find.byType(AuthenticationLoading), findsNothing);
        expect(
          find.descendant(
            of: surfaceFinder,
            matching: find.text('Signing in...'),
          ),
          findsNothing,
        );
        if (cancelled) {
          gateway.release.completeError(
            const CustomerLoginException(CustomerLoginFailureKind.cancelled),
          );
          await tester.pumpAndSettle();
          expect(find.byType(AuthenticationLoading), findsNothing);
          expect(find.text('Google sign-in was cancelled.'), findsNothing);
          expect(find.byKey(const Key('google-login-button')), findsOneWidget);
          expect(controller.currentIdentity, isNull);
          expect(tester.renderObject(surfaceFinder), same(surface));
          expect(completions, 0);
          await tester.binding.handlePopRoute();
          await tester.pumpAndSettle();
          authorization.complete(repository.result);
          expect(result, false);
        } else {
          gateway.release.complete();
          await tester.pump();
          expect(controller.currentIdentity, isNull);
          expect(find.byType(AuthenticationLoading), findsOneWidget);
          await tester.binding.handlePopRoute();
          await tester.drag(surfaceFinder, const Offset(0, 500));
          await tester.pump();
          expect(completions, 0);
          gateway.credentials.complete();
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 200));
          expect(completions, 0);
          expect(tester.renderObject(surfaceFinder), same(surface));
          expect(find.byType(AuthenticationLoading), findsOneWidget);
          expect(
            find.byKey(const ValueKey('authentication-loading')),
            findsNothing,
          );
          expect(find.text('Sign out and browse'), findsNothing);
          expect(find.text('Guest Account'), findsOneWidget);
          await tester.binding.handlePopRoute();
          await tester.drag(surfaceFinder, const Offset(0, 500));
          await tester.pump(const Duration(seconds: 10));
          expect(completions, 0);
          expect(find.byType(AuthenticationLoading), findsOneWidget);
          authorization.complete(repository.result);
          await tester.pumpAndSettle();
          expect(result, true);
          expect(find.text('Home: /customer'), findsOneWidget);
          expect(find.byType(AuthenticationLoading), findsNothing);
          expect(surfaceFinder, findsNothing);
        }
        expect(completions, 1);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
        controller.dispose();
        await repository.close();
      },
    );
  }

  for (final google in [false, true]) {
    testWidgets(
      'pending ${google ? "Google" : "email"} credentials block dismissal',
      (tester) async {
        final repository = NavigationRepository();
        final gateway = PendingModalGateway(repository);
        final controller = CustomerAuthenticationController(
          repository: repository,
        )..start();
        repository.emitAuth(null);
        var completions = 0;
        await tester.pumpWidget(
          CustomerAuthenticationScope(
            controller: controller,
            child: MaterialApp(
              home: Scaffold(
                body: Builder(
                  builder: (context) => TextButton(
                    child: const Text('Login'),
                    onPressed: () async {
                      expect(
                        await showCustomerLoginModal(
                          context,
                          loginGateway: gateway,
                        ),
                        false,
                      );
                      completions++;
                    },
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Login'));
        await tester.pumpAndSettle();
        if (!google) {
          await tester.enterText(find.byType(TextField).at(0), 'a@b.com');
          await tester.enterText(find.byType(TextField).at(1), 'secret1');
        }
        final button = find.byKey(
          Key(google ? 'google-login-button' : 'email-login-button'),
        );
        await tester.ensureVisible(button);
        await tester.pumpAndSettle();
        await tester.tap(button);
        await tester.pump();
        expect(
          find.byType(AuthenticationLoading),
          google ? findsNothing : findsOneWidget,
        );
        expect(
          find.text('Signing in...'),
          google ? findsNothing : findsOneWidget,
        );
        if (google) {
          await tester.binding.handlePopRoute();
          await tester.pump();
          expect(completions, 0);
          gateway.release.completeError(
            const CustomerLoginException(CustomerLoginFailureKind.cancelled),
          );
          await tester.pumpAndSettle();
          await tester.binding.handlePopRoute();
          await tester.pumpAndSettle();
          expect(completions, 1);
          await tester.pumpWidget(const SizedBox());
          controller.dispose();
          await repository.close();
          return;
        }
        await tester.binding.handlePopRoute();
        await tester.pump();
        expect(completions, 0);
        await tester.drag(
          find.byKey(const Key('customer-login-sheet-surface')),
          const Offset(0, 500),
        );
        await tester.pump();
        expect(completions, 0);
        gateway.release.completeError(
          const CustomerLoginException(CustomerLoginFailureKind.network),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byType(AuthenticationLoading), findsNothing);
        expect(completions, 0);
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(completions, 1);
        await tester.pumpWidget(const SizedBox());
        controller.dispose();
        await repository.close();
      },
    );
  }

  for (final action in ['retry', 'cancel']) {
    testWidgets('DNS failure exhausts retries, then $action works', (
      tester,
    ) async {
      final repository = OfflineLoginRepository();
      final controller = CustomerAuthenticationController(
        repository: repository,
      )..start();
      repository.emitAuth(null);
      bool? result;
      var completions = 0;
      await tester.pumpWidget(
        CustomerAuthenticationScope(
          controller: controller,
          child: MaterialApp(
            home: AuthenticationGate(
              controller: controller,
              publicBuilder: (context, _) => Scaffold(
                body: TextButton(
                  child: const Text('Open Account login'),
                  onPressed: () async {
                    result = await showCustomerLoginModal(
                      context,
                      intendedLocation: CustomerAppLocations.account,
                      loginGateway: NavigationGateway(repository),
                    );
                    completions++;
                  },
                ),
              ),
              customerBuilder: (_, controller) => Scaffold(
                body: Text('Authorized: ${controller.intendedLocation}'),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Open Account login'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('google-login-button')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('google-login-button')));
      await tester.pumpAndSettle();
      expect(repository.attempts, 3);
      expect(repository.currentIdentity?.uid, identity.uid);
      expect(result, isNull);
      expect(completions, 0);
      expect(find.byKey(const Key('finishing-sign-in-dialog')), findsNothing);
      expect(find.text('Unable to connect'), findsOneWidget);
      expect(
        find.byKey(const Key('customer-login-sheet-surface')),
        findsOneWidget,
      );
      repository.emitToken(identity);
      await tester.pumpAndSettle();
      expect(repository.attempts, 3);
      if (action == 'retry') {
        repository.offline = false;
        await tester.tap(find.text('Retry sign-in'));
        await tester.pumpAndSettle();
        expect(find.text('Authorized: /customer'), findsOneWidget);
        expect(repository.attempts, 4);
        expect(repository.signOutCount, 0);
      } else {
        await tester.tap(find.text('Back'));
        await tester.pumpAndSettle();
        expect(result, false);
        expect(repository.currentIdentity?.uid, identity.uid);
        expect(repository.signOutCount, 0);
      }
      expect(completions, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
      await repository.close();
    });
  }

  for (final scenario in [
    'success',
    'queued',
    'transient',
    'denied',
    'cancel',
    'signOut',
  ]) {
    testWidgets('login sheet handles $scenario without stale navigation', (
      tester,
    ) async {
      if (scenario == 'queued') {
        tester.view.physicalSize = const Size(320, 640);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
      }
      final repository = NavigationRepository();
      final pending = Completer<CustomerAccountLoadResult>();
      repository.pendingBootstrap = pending;
      final controller = CustomerAuthenticationController(
        repository: repository,
      )..start();
      repository.emitAuth(null);
      bool? result;
      var completions = 0;
      await tester.pumpWidget(
        CustomerAuthenticationScope(
          controller: controller,
          child: MaterialApp(
            home: Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () async {
                    result = await showCustomerLoginModal(
                      context,
                      intendedLocation: CustomerAppLocations.account,
                      loginGateway: NavigationGateway(repository),
                    );
                    completions++;
                  },
                  child: const Text('Open login'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open login'));
      await tester.pumpAndSettle();
      if (scenario == 'cancel') {
        await tester.tap(find.byTooltip('Close'));
        await tester.pumpAndSettle();
        repository.emitAuth(identity);
        await tester.pump();
      } else {
        final fields = find.byType(TextField);
        await tester.enterText(fields.at(0), 'customer@feasta.test');
        await tester.enterText(fields.at(1), 'Password123!');
        await tester.ensureVisible(find.byKey(const Key('email-login-button')));
        await tester.tap(find.byKey(const Key('email-login-button')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
        expect(find.text('Signing in...'), findsOneWidget);
        expect(completions, 0);
        final dialog = tester.getRect(
          find.byKey(const Key('finishing-sign-in-dialog')),
        );
        expect(dialog.width, greaterThan(100));
        expect(dialog.width, lessThanOrEqualTo(360));
        expect(dialog.height, lessThan(240));
        final surface = tester.getRect(
          find.byKey(const Key('customer-login-sheet-surface')),
        );
        expect(dialog.center.dx, closeTo(surface.center.dx, 1));
        expect(dialog.center.dy, closeTo(surface.center.dy, 1));
        await tester.pump(const Duration(seconds: 2));
        expect(completions, 0);
      }
      Completer<CustomerAccountLoadResult>? queued;
      if (scenario == 'queued') {
        repository.emitToken(
          identity,
        ); // Initial Firebase session replay coalesces.
        queued = Completer<CustomerAccountLoadResult>();
        repository.emitToken(identity);
        await tester.pump();
      }
      repository.pendingBootstrap = queued;
      if (scenario == 'denied' || scenario == 'transient') {
        pending.completeError(
          CustomerAuthLoadFailure(
            scenario == 'denied'
                ? CustomerAuthLoadFailureKind.accountAccess
                : CustomerAuthLoadFailureKind.network,
          ),
        );
      } else {
        if (scenario == 'signOut') await controller.signOut();
        pending.complete(repository.result);
      }
      if (queued != null) {
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 50));
        expect(completions, 0);
        expect(find.text('Signing in...'), findsOneWidget);
        repository.pendingBootstrap = null;
        queued.complete(repository.result);
      }
      await tester.pumpAndSettle();
      if (scenario == 'denied') {
        expect(completions, 0);
        expect(
          find.text('Account access could not be completed'),
          findsOneWidget,
        );
        await tester.tap(find.text('Back'));
        await tester.pumpAndSettle();
      }
      expect(completions, 1);
      expect(
        result,
        scenario == 'success' ||
            scenario == 'transient' ||
            scenario == 'queued',
      );
      expect(find.text('Open login'), findsOneWidget);
      expect(tester.takeException(), isNull);
      if (scenario == 'denied') expect(repository.listenerCount, 0);
      if (scenario == 'success' ||
          scenario == 'transient' ||
          scenario == 'queued') {
        expect(controller.intendedLocation, CustomerAppLocations.customer);
      }
      await tester.pumpWidget(const SizedBox());
      controller.dispose();
      await repository.close();
    });
  }
}

class OfflineLoginRepository extends NavigationRepository {
  bool offline = true;
  int attempts = 0;
  @override
  Future<CustomerAccountLoadResult> loadAccount({
    required CustomerAuthIdentity identity,
    required bool forceTokenRefresh,
  }) async {
    attempts++;
    if (offline) {
      // syncUserAuthState unavailable / Failed to resolve name maps to network.
      throw const CustomerAuthLoadFailure(CustomerAuthLoadFailureKind.network);
    }
    return super.loadAccount(
      identity: identity,
      forceTokenRefresh: forceTokenRefresh,
    );
  }
}

class PendingModalGateway extends NavigationGateway
    implements PhasedGoogleLoginGateway {
  PendingModalGateway(super.repository);
  final release = Completer<void>();
  bool holdCredentials = false;
  final credentials = Completer<void>();
  @override
  Future<CustomerLoginResult> signInWithGooglePhased({
    required void Function() onAccountSelected,
  }) async {
    await release.future;
    onAccountSelected();
    if (holdCredentials) await credentials.future;
    return super.signInWithGoogle();
  }

  @override
  Future<CustomerLoginResult> signInWithGoogle() async {
    await release.future;
    return super.signInWithGoogle();
  }
}
