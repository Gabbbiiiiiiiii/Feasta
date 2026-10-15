import 'dart:async';

import 'package:feasta/features/customer/account/application/customer_account_controller.dart';
import 'package:feasta/features/customer/account/domain/customer_account_management.dart';
import 'package:feasta/features/customer/account/presentation/customer_account_management_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  SharedPreferences.setMockInitialValues(<String, Object>{
    'feasta_customer_profile_preferences_v1':
        '{"streetAddress":"Main Street","barangay":"Barangay 1","city":"Ormoc","province":"Leyte","postalCode":"6541","preferredContactMethod":"in_app_message","useAsDefaultEventLocation":false}',
  });
  testWidgets('shows editable fields without trusted account controls', (
    tester,
  ) async {
    final gateway = _AccountGateway();
    await tester.pumpWidget(_app(gateway: gateway));
    await tester.pump();
    await tester.pump();

    expect(find.text('Account management'), findsOneWidget);
    expect(find.text('First name *'), findsOneWidget);
    expect(find.text('Last name *'), findsOneWidget);
    expect(find.text('Role'), findsNothing);
    expect(find.text('Account status'), findsNothing);
    expect(find.text('Email verified'), findsNothing);
    final accountList = find.byType(ListView);
    expect(accountList, findsOneWidget);

    for (var attempt = 0; attempt < 10; attempt++) {
      if (find.text('Save changes').evaluate().isNotEmpty) {
        break;
      }

      await tester.drag(accountList, const Offset(0, -300));
      await tester.pump();
    }

    expect(find.text('Save changes'), findsOneWidget);
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();
    expect(gateway.profileUpdates, 1);
  });

  testWidgets('blocked account receives a clear unavailable presentation', (
    tester,
  ) async {
    await tester.pumpWidget(_app(gateway: _AccountGateway(), blocked: true));
    await tester.pump();
    await tester.pump();

    expect(find.text('Account unavailable'), findsOneWidget);
    expect(find.text('Save changes'), findsNothing);
  });

  testWidgets('profile remains usable with large text scaling', (tester) async {
    await tester.pumpWidget(_app(gateway: _AccountGateway(), textScale: 2));
    await tester.pump();
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('Personal information'), findsOneWidget);
  });

  for (final partial in [false, true]) {
    testWidgets(
      'password ${partial ? 'partial result' : 'success'} returns to root with an accurate notice',
      (tester) async {
        final gateway = _AccountGateway();
        if (partial) {
          gateway.passwordError = const CustomerPasswordChangeException(
            sessionsRevoked: false,
            signedOut: true,
          );
        }
        await tester.pumpWidget(_app(gateway: gateway, routed: true));
        await tester.tap(find.text('Open account'));
        await tester.pumpAndSettle();
        await _submitPassword(tester);
        await tester.pumpAndSettle();
        expect(find.text('Open account'), findsOneWidget);
        expect(gateway.passwordChanges, 1);
        expect(
          find.textContaining(
            partial
                ? 'could not be confirmed'
                : 'Sign in with your new password',
          ),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets('failed local logout offers cleanup retry without credentials', (
    tester,
  ) async {
    final gateway = _AccountGateway()
      ..passwordError = const CustomerPasswordChangeException(
        sessionsRevoked: true,
        signedOut: false,
      );
    await tester.pumpWidget(_app(gateway: gateway));
    await tester.pumpAndSettle();
    await _submitPassword(tester);
    await tester.pumpAndSettle();
    expect(find.text('Retry sign-out'), findsOneWidget);
    gateway.passwordError = null;
    await tester.tap(find.text('Retry sign-out'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(gateway.passwordChanges, 1);
    expect(gateway.cleanupCalls, 1);
    expect(gateway.cleanupPassword, isNull);
  });

  testWidgets(
    'restored uncertain recovery shows guidance and asks only for current credentials',
    (tester) async {
      final gateway = _AccountGateway()
        ..restoredIssue = const CustomerPasswordChangeException(
          sessionsRevoked: false,
          signedOut: false,
          updateOutcomeUncertain: true,
          requiresReauthentication: true,
        );
      await tester.pumpWidget(_app(gateway: gateway));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Retry sign-out'),
        400,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.textContaining('It may have changed'), findsOneWidget);
      await tester.ensureVisible(find.text('Retry sign-out'));
      await tester.drag(find.byType(ListView), const Offset(0, -250));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Retry sign-out'));
      await tester.pumpAndSettle();
      final fields = find.descendant(
        of: find.byType(AlertDialog),
        matching: find.byType(TextField),
      );
      expect(fields, findsOneWidget);
      await tester.enterText(fields, 'current-working-password');
      await tester.tap(find.text('Confirm identity'));
      await tester.pumpAndSettle();
      expect(gateway.passwordChanges, 0);
      expect(gateway.cleanupCalls, 1);
      expect(gateway.cleanupPassword, 'current-working-password');
      expect(find.textContaining('Session cleanup completed'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'completion after account route closes has no stale-context error',
    (tester) async {
      final barrier = Completer<void>();
      final gateway = _AccountGateway()
        ..passwordOperation = () => barrier.future;
      await tester.pumpWidget(_app(gateway: gateway, routed: true));
      await tester.tap(find.text('Open account'));
      await tester.pumpAndSettle();
      await _submitPassword(tester);
      await tester.pump(const Duration(milliseconds: 500));
      final navigator = tester.state<NavigatorState>(
        find.byType(Navigator).first,
      );
      navigator.pop();
      await tester.pumpAndSettle();
      barrier.complete();
      await tester.pumpAndSettle();
      expect(find.text('Open account'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

Future<void> _submitPassword(WidgetTester tester) async {
  await tester.scrollUntilVisible(
    find.text('Change password'),
    400,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(find.text('Change password'));
  await tester.pumpAndSettle();
  final fields = find.descendant(
    of: find.byType(AlertDialog),
    matching: find.byType(TextField),
  );
  await tester.enterText(fields.at(0), 'old-test-password');
  await tester.enterText(fields.at(1), 'new-test-password');
  await tester.tap(find.text('Continue'));
}

Widget _app({
  required _AccountGateway gateway,
  bool blocked = false,
  double textScale = 1,
  bool routed = false,
}) {
  final controller = CustomerAccountController(gateway);
  return MaterialApp(
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(
        context,
      ).copyWith(textScaler: TextScaler.linear(textScale)),
      child: child!,
    ),
    home: Builder(
      builder: (context) {
        final account = CustomerAccountManagementScreen(
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
        );
        if (!routed) return account;
        return Scaffold(
          body: TextButton(
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute<void>(builder: (_) => account)),
            child: const Text('Open account'),
          ),
        );
      },
    ),
  );
}

class _AccountGateway
    implements CustomerAccountGateway, CustomerPasswordRecoveryGateway {
  int profileUpdates = 0;
  int passwordChanges = 0;
  CustomerAccountException? passwordError;
  Future<void> Function()? passwordOperation;
  String? lastCurrentPassword;
  String? lastNewPassword;
  CustomerPasswordChangeException? restoredIssue;
  String? cleanupPassword;
  int cleanupCalls = 0;
  @override
  Future<CustomerPasswordChangeException?> loadPasswordRecovery() async =>
      restoredIssue;
  @override
  Future<void> resumePasswordCleanup({String? currentPassword}) async {
    cleanupCalls++;
    cleanupPassword = currentPassword;
    if (passwordError != null) throw passwordError!;
    restoredIssue = null;
  }

  @override
  bool get supportsPasswordChanges => true;

  @override
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    passwordChanges++;
    lastCurrentPassword = currentPassword;
    lastNewPassword = newPassword;
    if (passwordOperation != null) await passwordOperation!();
    if (passwordError != null) throw passwordError!;
  }

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
