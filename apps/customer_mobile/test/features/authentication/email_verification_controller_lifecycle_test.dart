import 'dart:async';

import 'package:feasta/features/authentication/application/email_verification_controller.dart';
import 'package:feasta/features/authentication/domain/account_recovery.dart';
import 'package:flutter_test/flutter_test.dart';

class PendingGateway implements EmailVerificationGateway {
  final check = Completer<bool>();
  final send = Completer<void>();
  int calls = 0;
  @override
  Future<bool> refreshVerification() {
    calls++;
    return check.future;
  }

  @override
  Future<void> resendVerification() {
    calls++;
    return send.future;
  }

  @override
  Future<void> logout() async {}
}

void main() {
  testWidgets('cooldown tick preserves pending check and prevents duplicates', (
    tester,
  ) async {
    final gateway = PendingGateway();
    final controller = EmailVerificationController(gateway: gateway);
    final resend = controller.resend();
    gateway.send.complete();
    await resend;
    final check = controller.refresh();
    await tester.pump(const Duration(seconds: 1));
    expect(controller.state.isRefreshing, isTrue);
    expect(await controller.refresh(), isFalse);
    expect(gateway.calls, 2);
    controller.dispose();
    gateway.check.complete(true);
    expect(await check, isFalse);
  });
  for (final resend in [false, true]) {
    for (final outcome in ['success', 'typed error', 'unexpected error']) {
      testWidgets(
        'late ${resend ? 'resend' : 'check'} $outcome leaves disposed state unchanged and creates no timer',
        (tester) async {
          final gateway = PendingGateway();
          final controller = EmailVerificationController(gateway: gateway);
          var notifications = 0;
          controller.addListener(() => notifications++);
          final Future<Object?> operation = resend
              ? controller.resend()
              : controller.refresh();
          final pendingState = controller.state;
          controller.dispose();
          if (outcome == 'success') {
            if (resend) {
              gateway.send.complete();
            } else {
              gateway.check.complete(true);
            }
          } else {
            final error = outcome == 'typed error'
                ? const AccountRecoveryException(
                    AccountRecoveryFailureKind.network,
                  )
                : StateError('test error');
            if (resend) {
              gateway.send.completeError(error);
            } else {
              gateway.check.completeError(error);
            }
          }
          final result = await operation;
          if (!resend) expect(result, isFalse);
          await tester.pump(const Duration(minutes: 2));
          expect(controller.state, same(pendingState));
          expect(notifications, 1);
          expect(tester.takeException(), isNull);
          await controller.resend();
          expect(await controller.refresh(), isFalse);
          expect(gateway.calls, 1);
          // testWidgets also fails if late completion leaves a periodic timer.
        },
      );
    }
  }

  testWidgets('existing cooldown timer is canceled at disposal', (
    tester,
  ) async {
    final gateway = PendingGateway();
    final controller = EmailVerificationController(gateway: gateway);
    final operation = controller.resend();
    gateway.send.complete();
    await operation;
    expect(controller.state.cooldownSeconds, greaterThan(0));
    final state = controller.state;
    controller.dispose();
    await tester.pump(const Duration(seconds: 2));
    expect(controller.state, same(state));
    expect(tester.takeException(), isNull);
  });

  for (final resend in [false, true]) {
    test(
      'active ${resend ? 'resend' : 'check'} still reports network errors',
      () async {
        final gateway = PendingGateway();
        final controller = EmailVerificationController(gateway: gateway);
        final Future<Object?> operation = resend
            ? controller.resend()
            : controller.refresh();
        const error = AccountRecoveryException(
          AccountRecoveryFailureKind.network,
        );
        if (resend) {
          gateway.send.completeError(error);
        } else {
          gateway.check.completeError(error);
        }
        await operation;
        expect(controller.state.error, contains('internet connection'));
        expect(controller.state.isRefreshing, isFalse);
        expect(controller.state.isResending, isFalse);
        controller.dispose();
      },
    );
  }
}
