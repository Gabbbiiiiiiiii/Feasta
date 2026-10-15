import 'package:feasta/core/helpers/auth_guard.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/authentication/application/customer_auth_scope.dart';
import 'package:feasta/features/authentication/data/repositories/customer_auth_state_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'customer_auth_controller_test.dart'
    show FakeCustomerAuthStateRepository, identity;

void main() {
  for (final failure in [
    null,
    CustomerAuthLoadFailureKind.consentRequired,
    CustomerAuthLoadFailureKind.accountAccess,
  ]) {
    testWidgets('protected action waits for bootstrap: $failure', (
      tester,
    ) async {
      final repository = FakeCustomerAuthStateRepository(
        loadDelay: const Duration(milliseconds: 40),
      );
      repository.emitAuth(identity);
      if (failure != null) {
        repository.nextFailure = CustomerAuthLoadFailure(failure);
      }
      final controller = CustomerAuthenticationController(
        repository: repository,
      );
      bool? allowed;
      await tester.pumpWidget(
        CustomerAuthenticationScope(
          controller: controller,
          child: MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () async {
                    allowed = await requireLogin(
                      context,
                      intendedLocation: '/bookings',
                    );
                  },
                  child: const Text('Protected action'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Protected action'));
      expect(allowed, isNull);
      expect(repository.listenerCount, 0);
      await tester.pump(const Duration(milliseconds: 60));
      expect(allowed, failure == null);
      expect(controller.intendedLocation, '/bookings');
      controller.dispose();
      await repository.close();
    });
  }
}
