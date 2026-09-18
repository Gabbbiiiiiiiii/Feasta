import 'package:feasta/features/customer/account/application/customer_account_controller.dart';
import 'package:feasta/features/customer/account/domain/customer_account_management.dart';
import 'package:feasta/features/customer/account/presentation/customer_account_management_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{
      'feasta_customer_profile_preferences_v1':
          '{"streetAddress":"Main Street","barangay":"Barangay 1","city":"Ormoc","province":"Leyte","postalCode":"","preferredContactMethod":"in_app_message","useAsDefaultEventLocation":false}',
    });
  });

  testWidgets('shows editable fields without trusted account controls', (
    tester,
  ) async {
    final gateway = _AccountGateway();

    await tester.pumpWidget(_app(gateway: gateway));

    await tester.pumpAndSettle();

    expect(find.text('Account management'), findsOneWidget);

    expect(find.text('First name *'), findsOneWidget);

    final accountList = find.byType(ListView);

    expect(accountList, findsOneWidget);

    final defaultAddress = find.text('Default address');

    for (var i = 0; i < 10 && defaultAddress.evaluate().isEmpty; i++) {
      await tester.drag(accountList, const Offset(0, -300));

      await tester.pumpAndSettle();
    }

    expect(defaultAddress, findsOneWidget);

    final streetAddress = find.text('Street address *', findRichText: true);

    expect(streetAddress, findsOneWidget);

    expect(find.text('Role'), findsNothing);

    expect(find.text('Account status'), findsNothing);

    expect(find.text('Email verified'), findsNothing);

    final saveChanges = find.text('Save changes');

    for (var i = 0; i < 10 && saveChanges.evaluate().isEmpty; i++) {
      await tester.drag(accountList, const Offset(0, -300));

      await tester.pumpAndSettle();
    }

    expect(saveChanges, findsOneWidget);

    final saveButton = find.ancestor(
      of: saveChanges,
      matching: find.byType(ElevatedButton),
    );

    expect(saveButton, findsOneWidget);

    final button = tester.widget<ElevatedButton>(saveButton);

    expect(button.onPressed, isNotNull);

    await tester.ensureVisible(saveButton);
    await tester.tap(saveButton);

    await tester.pumpAndSettle();

    expect(gateway.profileUpdates, 1);
  });

  testWidgets('blocked account receives a clear unavailable presentation', (
    tester,
  ) async {
    await tester.pumpWidget(_app(gateway: _AccountGateway(), blocked: true));

    await tester.pumpAndSettle();

    expect(find.text('Account unavailable'), findsOneWidget);

    expect(find.text('Save changes'), findsNothing);
  });

  testWidgets('profile remains usable with large text scaling', (tester) async {
    await tester.pumpWidget(_app(gateway: _AccountGateway(), textScale: 2));

    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);

    expect(find.text('Account management'), findsOneWidget);
  });
}

Widget _app({
  required _AccountGateway gateway,
  bool blocked = false,
  double textScale = 1,
}) {
  final controller = CustomerAccountController(gateway);

  return MaterialApp(
    builder: (context, child) {
      return MediaQuery(
        data: MediaQuery.of(
          context,
        ).copyWith(textScaler: TextScaler.linear(textScale)),
        child: child!,
      );
    },
    home: CustomerAccountManagementScreen(
      controller: controller,
      accountLoader: () async {
        return (
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
        );
      },
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
