import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
// ignore: depend_on_referenced_packages, implementation_imports
import 'package:cloud_functions_platform_interface/src/pigeon/messages.pigeon.dart'
    as functions_host;
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_refund_policy_review_screen.dart';
import 'package:feasta/features/authentication/data/repositories/feasta_repository.dart';
import 'package:feasta/shared/models/booking_agreement.dart';
import 'package:feasta/shared/models/booking_refund_policy.dart';
import 'booking_agreement_fixtures.dart';
import 'booking_refund_policy_test.dart' show refundResponse, refundFixture;
import 'booking_preparation_flow_test.dart' show PreparationAuth;
import 'provider_discovery_test.dart' show GuestAuth;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  setUp(() => GuestAuth.signedIn = true);
  tearDown(() => GuestAuth.signedIn = false);
  test('repository uses exact disclosure transport region and timeout', () async {
    const channel = BasicMessageChannel<Object?>(
      'dev.flutter.pigeon.cloud_functions_platform_interface.CloudFunctionsHostApi.call',
      functions_host.CloudFunctionsHostApi.pigeonChannelCodec,
    );
    final calls = <Map>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockDecodedMessageHandler<Object?>(channel, (message) async {
          calls.add((message as List).single as Map);
          return [refundResponse()];
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockDecodedMessageHandler<Object?>(channel, null),
    );
    final request = BookingAgreementRequest(
      agreementSelection(addons: [marketplaceFixture()]),
      'review_request',
    );
    await FeastaRepository().getBookingRefundPolicyDisclosures(request);
    expect(calls.single['functionName'], 'getBookingRefundPolicyDisclosures');
    expect(calls.single['region'], 'asia-southeast1');
    expect(calls.single['timeout'], 30000);
    expect(calls.single['parameters'], refundDisclosureRequest(request));
    GuestAuth.signedIn = false;
    await expectLater(
      FeastaRepository().getBookingRefundPolicyDisclosures(request),
      throwsA(isA<RefundReviewFailure>()),
    );
    expect(calls.length, 1);
  });
  testWidgets(
    'provider controls start unchecked; refresh failure removes consent',
    (tester) async {
      var fail = false;
      await tester.pumpWidget(
        MaterialApp(
          home: BookingRefundPolicyReviewScreen(
            selection: agreementSelection(addons: [marketplaceFixture()]),
            resolveProviders: fixtureProviders,
            loader: (_) async {
              if (fail) {
                throw const RefundReviewFailure('Retry current policies.');
              }
              return RefundDisclosures.fromJson(
                refundResponse(
                  policies: [
                    refundFixture(),
                    refundFixture(provider: 'provider_456'),
                  ],
                ),
              );
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      final first = find.byKey(const ValueKey('refund-provider_123'));
      expect(tester.widget<CheckboxListTile>(first).value, false);
      await tester.ensureVisible(first);
      await tester.tap(first);
      await tester.pump();
      expect(tester.widget<CheckboxListTile>(first).value, true);
      final second = find.byKey(const ValueKey('refund-provider_456'));
      await tester.scrollUntilVisible(second, 250);
      expect(tester.widget<CheckboxListTile>(second).value, false);
      await tester.tap(second);
      await tester.pump();
      final reload = find.text('Reload current refund policies');
      await tester.scrollUntilVisible(reload, 250);
      fail = true;
      await tester.tap(reload);
      await tester.pumpAndSettle();
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(find.text('Retry current policies.'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}
