import 'package:feasta/features/customer/account/application/customer_account_controller.dart';
import 'package:feasta/features/customer/account/domain/customer_account_management.dart';
import 'package:feasta/features/customer/account/presentation/customer_account_management_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('shows editable fields without trusted account controls', (
    tester,
  ) async {
    final gateway = _AccountGateway();
    await tester.pumpWidget(_app(gateway: gateway));
    await tester.pumpAndSettle();

    expect(find.text('Account management'), findsOneWidget);
    expect(find.text('First name *'), findsOneWidget);
    expect(find.text('Address'), findsOneWidget);
    expect(find.text('Role'), findsNothing);
    expect(find.text('Account status'), findsNothing);
    expect(find.text('Email verified'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('Save profile'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    final saveButton = find.ancestor(
      of: find.text('Save profile'),
      matching: find.byType(ElevatedButton),
    );
    tester.widget<ElevatedButton>(saveButton).onPressed!();
    await tester.pumpAndSettle();
    expect(gateway.profileUpdates, 1);
  });

  testWidgets('blocked account receives a clear unavailable presentation', (
    tester,
  ) async {
    await tester.pumpWidget(_app(gateway: _AccountGateway(), blocked: true));
    await tester.pumpAndSettle();

    expect(find.text('Account unavailable'), findsOneWidget);
    expect(find.text('Save profile'), findsNothing);
  });

  testWidgets('profile remains usable with large text scaling', (tester) async {
    await tester.pumpWidget(_app(gateway: _AccountGateway(), textScale: 2));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Profile'), findsOneWidget);
  });
}

Widget _app({
  required _AccountGateway gateway,
  bool blocked = false,
  double textScale = 1,
}) {
  final controller = CustomerAccountController(gateway);
  return MaterialApp(
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(textScale)),
      child: child!,
    ),
    home: CustomerAccountManagementScreen(
      controller: controller,
      accountLoader: () async => (
        UserModel(
          id: 'customer-one',
          uid: 'customer-one',
          firstName: 'Customer',
          lastName: 'One',
          email: 'customer@example.test',
          phoneNumber: '+639171234567',
          role: 'customer',
          isEmailVerified: true,
          isPhoneVerified: true,
          isActive: !blocked,
          isBlocked: blocked,
          accountStatus: blocked ? 'blocked' : 'active',
        ),
        CustomerModel(
          id: 'customer-one',
          userId: 'customer-one',
          firstName: 'Customer',
          lastName: 'One',
          email: 'customer@example.test',
          phoneNumber: '+639171234567',
          address: 'Main Street',
          city: 'Ormoc',
          province: 'Leyte',
          totalBookings: 0,
          completedBookings: 0,
          cancelledBookings: 0,
          isActive: !blocked,
        ),
      ),
    ),
  );
}

class _AccountGateway implements CustomerAccountGateway {
  int profileUpdates = 0;

  @override
  bool get supportsPasswordChanges => true;

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {}

  @override
  Future<void> deactivate({String? currentPassword, String? reason}) async {}

  @override
  Future<void> requestEmailUpdate({
    required String currentPassword,
    required String newEmail,
  }) async {}

  @override
  Future<void> revokeAllSessions({String? currentPassword}) async {}

  @override
  Future<void> updatePreferences(
    CustomerPrivacyPreferences preferences,
  ) async {}

  @override
  Future<void> updateProfile(CustomerProfileUpdate update) async {
    profileUpdates += 1;
  }
}
