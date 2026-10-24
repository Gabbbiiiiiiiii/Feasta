import 'dart:async';
import 'package:feasta/core/theme/app_theme.dart';
import 'package:feasta/features/authentication/presentation/authentication_loading.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/data/repositories/customer_auth_state_repository.dart';
import 'package:feasta/features/authentication/presentation/authentication_gate.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'authentication_gate_widget_test.dart'
    show WidgetFakeRepository, widgetIdentity;

class StuckRepository extends WidgetFakeRepository {
  final load = Completer<CustomerAccountLoadResult>();
  Completer<void>? signOutRelease;
  int signOutCalls = 0;
  @override
  Future<CustomerAccountLoadResult> loadAccount({
    required CustomerAuthIdentity identity,
    required bool forceTokenRefresh,
  }) => load.future;
  @override
  Future<void> signOut() async {
    signOutCalls++;
    await signOutRelease?.future;
    await super.signOut();
  }
}

Future<CustomerAuthenticationController> mount(
  WidgetTester tester,
  StuckRepository repository, {
  bool large = false,
}) async {
  final controller = CustomerAuthenticationController(repository: repository)
    ..start();
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      builder: large
          ? (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: const TextScaler.linear(2)),
              child: child!,
            )
          : null,
      home: AuthenticationGate(
        controller: controller,
        publicBuilder: (_, _) => const Scaffold(body: Text('Guest browsing')),
      ),
    ),
  );
  repository.emitAuth(widgetIdentity);
  await tester.pump();
  await tester.pump();
  return controller;
}

void main() {
  testWidgets('sign-out timeout clears loading without claiming success', (
    tester,
  ) async {
    final repository = StuckRepository()..signOutRelease = Completer<void>();
    final controller = await mount(tester, repository);
    unawaited(controller.signOut());
    await tester.pump();
    expect(find.text('Signing out...'), findsOneWidget);
    await controller.signOut();
    expect(repository.signOutCalls, 1);
    await tester.pump(const Duration(seconds: 16));
    await tester.pumpAndSettle();
    expect(find.byType(AuthenticationLoading), findsNothing);
    expect(find.text('Guest browsing'), findsNothing);
    expect(controller.currentIdentity, isNotNull);
    expect(controller.state.failure, CustomerAuthenticationFailureKind.server);
    // A late successful local sign-out is still handled as an identity change.
    repository.signOutRelease!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Guest browsing'), findsOneWidget);
    repository.load.complete(
      CustomerAccountLoadResult(identity: widgetIdentity, userProfile: null),
    );
    await tester.pumpAndSettle();
    controller.dispose();
    await repository.close();
  });

  testWidgets(
    'stuck restoration has a clear sign-out action and safely ignores late loads',
    (tester) async {
      final repository = StuckRepository()..signOutRelease = Completer<void>();
      final controller = await mount(tester, repository);
      expect(find.text('Signing in...'), findsOneWidget);
      expect(find.byType(AuthenticationLoading), findsOneWidget);
      expect(find.text('Cancel sign-in'), findsNothing);
      final action = find.byKey(const Key('restoration-sign-out'));
      await tester.ensureVisible(action);
      await tester.tap(action);
      await tester.pump();
      expect(find.text('Signing out...'), findsOneWidget);
      expect(find.byType(AuthenticationLoading), findsOneWidget);
      await controller.signOut();
      expect(repository.signOutCalls, 1);
      expect(controller.intendedLocation, '/browse');
      repository.signOutRelease!.complete();
      await tester.pumpAndSettle();
      expect(find.text('Guest browsing'), findsOneWidget);
      repository.load.complete(
        CustomerAccountLoadResult(identity: widgetIdentity, userProfile: null),
      );
      await tester.pumpAndSettle();
      expect(find.text('Guest browsing'), findsOneWidget);
      controller.dispose();
      await repository.close();
    },
  );
  testWidgets('restoration recovery scrolls on small screens with large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final repository = StuckRepository();
    final controller = await mount(tester, repository, large: true);
    final action = find.byKey(const Key('restoration-sign-out'));
    await tester.ensureVisible(action);
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(find.text('Guest browsing'), findsOneWidget);
    expect(tester.takeException(), isNull);
    controller.dispose();
    repository.load.complete(
      CustomerAccountLoadResult(identity: widgetIdentity, userProfile: null),
    );
    await repository.close();
  });
}
