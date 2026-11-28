import 'package:feasta/shared/models/event_customization_data.dart';
import 'dart:async';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
// ignore: depend_on_referenced_packages, implementation_imports
import 'package:cloud_functions_platform_interface/src/pigeon/messages.pigeon.dart'
    as host;
import 'package:feasta/features/authentication/data/repositories/feasta_repository.dart';
import 'package:feasta/shared/models/customer_availability.dart';
import 'booking_preparation_flow_test.dart' show PreparationAuth, reviewData;
import 'provider_discovery_test.dart' show GuestAuth;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = BasicMessageChannel<Object?>(
    'dev.flutter.pigeon.cloud_functions_platform_interface.CloudFunctionsHostApi.call',
    host.CloudFunctionsHostApi.pigeonChannelCodec,
  );
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  setUp(() {
    GuestAuth.signedIn = true;
    PreparationAuth.owner = 'customer-1';
  });
  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockDecodedMessageHandler<Object?>(channel, null);
  });
  Map<String, dynamic> result([bool available = true]) => {
    'results': [
      {
        'providerId': 'caterer-1',
        'available': available,
        'reasonCode': available ? null : 'BLOCKED_DATE',
        'message': available
            ? 'Available for your selected event.'
            : 'Not available on this date.',
      },
    ],
  };
  Future<CustomerAvailability> check() =>
      FeastaRepository().checkProviderAvailability(
        providerId: 'caterer-1',
        packageId: 'package-1',
        customization: reviewData(),
      );
  void respond(FutureOr<Object?> Function(Map args) handler) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockDecodedMessageHandler<Object?>(
          channel,
          (value) async => handler((value as List).single as Map),
        );
  }

  test(
    'secured callable gets exact six fields with canonical times and calendar date',
    () async {
      respond((args) {
        expect(args['functionName'], 'checkCustomerProviderAvailability');
        expect(args['region'], 'asia-southeast1');
        final input = args['parameters'] as Map;
        final c = reviewData();
        expect(input, CustomerAvailability.request('package-1', c));
        expect(input.keys.toSet(), {
          'packageId',
          'addonIds',
          'eventDate',
          'eventTime',
          'eventEndTime',
          'guestCount',
        });
        expect(input['eventTime'], matches(RegExp(r'^\d{2}:\d{2}$')));
        return [result()];
      });
      final value = await check();
      expect(
        value.permits('customer-1', 'package-1', 'caterer-1', reviewData()),
        isTrue,
      );
    },
  );
  test('unavailable date preserves server reason and blocks', () async {
    respond((_) => [result(false)]);
    final value = await check();
    expect(value.available, isFalse);
    expect(value.message, 'Not available on this date.');
    expect(
      value.permits('customer-1', 'package-1', 'caterer-1', reviewData()),
      isFalse,
    );
  });
  for (final code in [
    'failed-precondition',
    'permission-denied',
    'unauthenticated',
    'resource-exhausted',
  ]) {
    test('backend $code including missing package fails closed', () async {
      respond((_) => [code, 'Booking options unavailable.', null]);
      await expectLater(check(), throwsA(anything));
    });
  }
  for (final value in [
    null,
    true,
    {},
    {'results': []},
    {
      'results': [true],
    },
    {
      'results': [
        {
          'providerId': 'foreign',
          'available': true,
          'reasonCode': null,
          'message': 'Available',
        },
      ],
    },
  ]) {
    test('malformed or incomplete result $value fails closed', () async {
      respond((_) => [value]);
      await expectLater(check(), throwsA(anything));
    });
  }
  test('authentication loss during callable discards success', () async {
    respond((_) {
      GuestAuth.signedIn = false;
      return [result()];
    });
    await expectLater(check(), throwsStateError);
  });
  test('no authentication never invokes callable', () async {
    GuestAuth.signedIn = false;
    respond((_) {
      fail('Unauthorized callable');
    });
    await expectLater(check(), throwsA(anything));
  });
  test('add-on IDs are sent and every distinct provider must authorize', () {
    final c = reviewData();
    c.selectedAddOns.addAll([
      {
        'addonId': 'addon_123',
        'providerId': 'caterer-1',
        'source': 'catering_provider',
      },
      {
        'addonId': 'addon_456',
        'providerId': 'provider_456',
        'source': 'feasta_addon_provider',
      },
    ]);
    expect(CustomerAvailability.request('package-1', c)['addonIds'], [
      'addon_123',
      'addon_456',
    ]);
    expect(
      () => CustomerAvailability.parse(
        result(),
        uid: 'customer-1',
        packageId: 'package-1',
        providerId: 'caterer-1',
        customization: c,
      ),
      throwsFormatException,
    );
    final response = result();
    (response['results'] as List).add({
      'providerId': 'provider_456',
      'available': false,
      'reasonCode': 'MAX_EVENTS_REACHED',
      'message': 'Already fully booked for this date.',
    });
    final value = CustomerAvailability.parse(
      response,
      uid: 'customer-1',
      packageId: 'package-1',
      providerId: 'caterer-1',
      customization: c,
    );
    expect(value.available, isFalse);
    expect(value.message, contains('Already fully booked'));
  });
  test('mutated inclusions invalidate an authorized result', () {
    final c = reviewData();
    final value = CustomerAvailability.parse(
      result(),
      uid: 'customer-1',
      packageId: 'package-1',
      providerId: 'caterer-1',
      customization: c,
    );
    c.selectedFoods.add('Changed menu');
    expect(value.permits('customer-1', 'package-1', 'caterer-1', c), isFalse);
  });
  test('duplicate provider results cannot authorize progression', () {
    final response = result();
    (response['results'] as List).add((response['results'] as List).first);
    expect(
      () => CustomerAvailability.parse(
        response,
        uid: 'customer-1',
        packageId: 'package-1',
        providerId: 'caterer-1',
        customization: reviewData(),
      ),
      throwsFormatException,
    );
  });
  test('stale result and different customer or package block progression', () {
    final stale = CustomerAvailability.parse(
      result(),
      uid: 'customer-1',
      packageId: 'package-1',
      providerId: 'caterer-1',
      customization: reviewData(),
      checkedAt: DateTime.now().subtract(const Duration(minutes: 6)),
    );
    expect(
      stale.permits('customer-1', 'package-1', 'caterer-1', reviewData()),
      isFalse,
    );
    final fresh = CustomerAvailability.parse(
      result(),
      uid: 'customer-1',
      packageId: 'package-1',
      providerId: 'caterer-1',
      customization: reviewData(),
    );
    expect(
      fresh.permits('customer-2', 'package-1', 'caterer-1', reviewData()),
      isFalse,
    );
    expect(
      fresh.permits('customer-1', 'package-2', 'caterer-1', reviewData()),
      isFalse,
    );
  });
  for (final change in ['revision', 'date', 'time', 'guests', 'addons']) {
    test('approval rejects changed $change', () {
      final c = reviewData();
      final approval = CustomerAvailability.parse(
        result(),
        uid: 'customer-1',
        packageId: 'package-1',
        providerId: 'caterer-1',
        customization: c,
      );
      final changed = EventCustomizationData(
        expectedPackageRevision: change == 'revision'
            ? 999
            : c.expectedPackageRevision,
        sharedContractVersion: c.sharedContractVersion,
        eventType: c.eventType,
        eventDate: change == 'date'
            ? c.eventDate.add(const Duration(days: 1))
            : c.eventDate,
        eventTime: change == 'time' ? '23:00' : c.eventTime,
        eventEndTime: c.eventEndTime,
        guestCount: change == 'guests' ? c.guestCount + 1 : c.guestCount,
        eventLocation: c.eventLocation,
        eventAddress: c.eventAddress,
        selectedFoods: c.selectedFoods,
        selectedDecorations: c.selectedDecorations,
        selectedFurniture: c.selectedFurniture,
        selectedAddOns: change == 'addons'
            ? [
                {'addonId': 'new', 'providerId': 'other'},
              ]
            : c.selectedAddOns,
        willArrangeOwnAddOns: c.willArrangeOwnAddOns,
        customerArrangedAddOnsNote: c.customerArrangedAddOnsNote,
        specialRequest: c.specialRequest,
      );
      expect(
        approval.permits('customer-1', 'package-1', 'caterer-1', changed),
        isFalse,
      );
      expect(approval.permits('customer-1', 'package-1', 'other', c), isFalse);
      expect(approval.permits(null, 'package-1', 'caterer-1', c), isFalse);
    });
  }
}
