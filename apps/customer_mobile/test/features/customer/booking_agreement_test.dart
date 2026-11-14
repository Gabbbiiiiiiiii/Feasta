import 'dart:async';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/booking_agreement.dart';
import 'package:feasta/features/customer/booking_agreement_controller.dart';
import 'booking_agreement_fixtures.dart';

void main() {
  final fails = isA<AgreementReviewFailure>();
  test('strict public disclosure parses deposit and multiple providers', () {
    final list = parseAgreementDisclosures(
      disclosureFixture([
        agreementFixture(),
        agreementFixture(provider: 'provider_456', deposit: false),
      ]),
    );
    expect(list.map((a) => a.providerId), ['provider_123', 'provider_456']);
    expect(list[0].upfront, 30001);
    expect(list[0].remaining, 70000);
    expect(list[0].depositEligible, isTrue);
    expect(list[1].upfront, 100001);
    expect(list[1].remaining, 0);
    expect(list[1].allocation, isNull);
    expect(() => list.clear(), throwsUnsupportedError);
    expect(() => list[0].serviceNames.clear(), throwsUnsupportedError);
    expect(() => list[0].allocation!.clear(), throwsUnsupportedError);
  });
  test(
    'centavos format exactly and deadlines use Manila regardless of device',
    () {
      expect(agreementMoney(100001), 'PHP 1,000.01');
      expect(agreementMoney(1), 'PHP 0.01');
      expect(agreementMoney(0), 'PHP 0.00');
      final a = BookingAgreement.fromJson(agreementFixture());
      expect(
        agreementTime(a.time('hardPaymentDeadlineAt')),
        '2030-01-04 14:00 (Asia/Manila)',
      );
    },
  );
  test('missing agreements is reconciliation, not an empty success', () {
    for (final response in [
      null,
      <String, dynamic>{},
      {...disclosureFixture()}..remove('agreements'),
    ]) {
      expect(
        () => parseAgreementDisclosures(response),
        throwsA(
          isA<AgreementReviewFailure>().having(
            (e) => e.reconciliation,
            'reconciliation',
            isTrue,
          ),
        ),
      );
    }
    for (final agreements in [
      null,
      [],
      'invalid',
      List.filled(22, agreementFixture()),
      [agreementFixture(), agreementFixture()],
    ]) {
      expect(
        () => parseAgreementDisclosures({
          ...disclosureFixture(),
          'agreements': agreements,
        }),
        throwsA(fails),
      );
    }
  });
  test(
    'rejects malformed schema, amounts, services, allocation, dates and extra authority',
    () {
      for (final patch in [
        {'schemaVersion': 2},
        {'timingSchemaVersion': 4},
        {'agreementKey': 'bad'},
        {'providerId': ''},
        {'providerName': ''},
        {'serviceNames': []},
        {
          'serviceNames': [42],
        },
        {'serviceTierLabel': 1},
        {'grossAmountInCentavos': 100001.0},
        {'grossAmountInCentavos': -1},
        {'requiredUpfrontAmountInCentavos': 9007199254740992},
        {'remainingBalanceInCentavos': 70001},
        {'depositEligible': 'true'},
        {'eventStartAt': '2030-02-30T06:00:00.000Z'},
        {'hardPaymentDeadlineAt': '2030-01-04T07:00:00.000Z'},
        {'preparationStartsAt': 'not a date'},
        {'paymentDefaultAllocation': null},
        {
          'paymentDefaultAllocation': {
            'customerDefaultRefundAmountInCentavos': 0,
          },
        },
        {'latitude': 11},
        {'financialSnapshot': {}},
      ]) {
        expect(
          () => BookingAgreement.fromJson({...agreementFixture(), ...patch}),
          throwsA(fails),
        );
      }
      for (final key in BookingAgreement.fields.where(
        (k) => k != 'eligibilityReason',
      )) {
        expect(
          () => BookingAgreement.fromJson({...agreementFixture()}..remove(key)),
          throwsA(fails),
          reason: key,
        );
      }
      expect(
        () => BookingAgreement.fromJson({
          ...agreementFixture(deposit: false),
          'remainingBalanceInCentavos': 1,
          'requiredUpfrontAmountInCentavos': 100000,
        }),
        throwsA(fails),
      );
    },
  );
  test('actual backend allocation metadata is required and consistent', () {
    final fixture = agreementFixture();
    final allocation = fixture['paymentDefaultAllocation'] as Map;
    for (final field in BookingAgreement.allocationFields) {
      final incomplete = {...allocation}..remove(field);
      expect(
        () => BookingAgreement.fromJson({
          ...fixture,
          'paymentDefaultAllocation': incomplete,
        }),
        throwsA(fails),
        reason: field,
      );
    }
    for (final patch in [
      {'schemaVersion': 2},
      {'paidDepositInCentavos': 30000},
      {'customerRefundRateBps': 6000},
      {'providerReservationCompRateBps': 1000},
      {'feastaCancellationFeeRateBps': 2000},
      {'customerDefaultRefundAmountInCentavos': 21001},
      {'unknown': 1},
    ]) {
      expect(
        () => BookingAgreement.fromJson({
          ...fixture,
          'paymentDefaultAllocation': {...allocation, ...patch},
        }),
        throwsA(fails),
      );
    }
  });
  test(
    'safe actionable messages for callable errors and agreement reasons',
    () {
      for (final code in [
        'unauthenticated',
        'permission-denied',
        'not-found',
        'failed-precondition',
        'deadline-exceeded',
        'unavailable',
        'resource-exhausted',
        'invalid-argument',
        'internal',
      ]) {
        final failure = agreementReviewFailure(
          FirebaseFunctionsException(
            code: code,
            message: 'RAW PRIVATE SERVER ERROR',
          ),
        );
        expect(failure.message, isNot(contains('RAW')));
        expect(failure.message, isNotEmpty);
      }
      for (final reason in [
        'BOOKING_PAYMENT_AGREEMENT_CHANGED',
        'BOOKING_PAYMENT_AGREEMENT_REQUIRED',
      ]) {
        expect(
          agreementReviewFailure(
            FirebaseFunctionsException(
              code: 'failed-precondition',
              message: 'changed',
              details: {'reason': reason},
            ),
          ).message,
          contains(reason.endsWith('CHANGED') ? 'changed' : 'acknowledge'),
        );
      }
    },
  );
  test(
    'initial consent is empty, exact pairing required, each provider acknowledged',
    () async {
      final c = BookingAgreementController(
        resolveProviders: fixtureProviders,
        loader: (_) async => parseAgreementDisclosures(
          disclosureFixture([
            agreementFixture(),
            agreementFixture(provider: 'provider_456', deposit: false),
          ]),
        ),
      );
      addTearDown(c.dispose);
      c.select(agreementSelection(addons: [marketplaceFixture()]));
      await c.load();
      expect(c.allAcknowledged, isFalse);
      expect(() => c.acknowledgements, throwsA(fails));
      c.acknowledge('provider_123', 'b' * 64, true);
      expect(c.allAcknowledged, isFalse);
      c.acknowledge('provider_123', 'a' * 64, true);
      expect(c.allAcknowledged, isFalse);
      c.acknowledge('provider_456', 'a' * 64, true);
      expect(c.acknowledgements, [
        {'providerId': 'provider_123', 'agreementKey': 'a' * 64},
        {'providerId': 'provider_456', 'agreementKey': 'a' * 64},
      ]);
    },
  );
  test(
    'refresh changes keys and failures revoke consent; stable scoped request ID',
    () async {
      var character = 'a';
      var fail = false;
      final ids = <String>[];
      final c = BookingAgreementController(
        resolveProviders: fixtureProviders,
        loader: (r) async {
          ids.add(r.clientRequestId);
          if (fail) {
            throw FirebaseFunctionsException(
              code: 'unavailable',
              message: 'offline',
            );
          }
          return [
            BookingAgreement.fromJson(
              agreementFixture(keyCharacter: character),
            ),
          ];
        },
      );
      addTearDown(c.dispose);
      c.select(agreementSelection());
      await c.load();
      c.acknowledge('provider_123', 'a' * 64, true);
      expect(c.allAcknowledged, isTrue);
      character = 'b';
      await c.load();
      expect(c.allAcknowledged, isFalse);
      c.acknowledge('provider_123', 'a' * 64, true);
      expect(c.allAcknowledged, isFalse);
      c.acknowledge('provider_123', 'b' * 64, true);
      expect(c.allAcknowledged, isTrue);
      fail = true;
      await c.load();
      expect(c.status, AgreementReviewStatus.failed);
      expect(c.agreements, isEmpty);
      expect(c.allAcknowledged, isFalse);
      expect(ids.toSet().length, 1);
    },
  );
  test(
    'all relevant selection edits and account change invalidate acknowledgements',
    () async {
      final c = BookingAgreementController(
        resolveProviders: fixtureProviders,
        loader: (_) async => [BookingAgreement.fromJson(agreementFixture())],
      );
      addTearDown(c.dispose);
      final selections = [
        agreementSelection(provider: 'provider_456'),
        agreementSelection(package: 'package_456'),
        agreementSelection(tier: 'buffet_setup'),
        agreementSelection(theme: 'classic'),
        agreementSelection(date: DateTime(2030, 1, 6)),
        agreementSelection(start: '13:00'),
        agreementSelection(end: '19:00'),
        agreementSelection(guests: 60),
        agreementSelection(type: 'birthday'),
        agreementSelection(address: 'Other Street'),
        agreementSelection(location: 'Ormoc'),
        agreementSelection(notes: 'No peanuts'),
        agreementSelection(own: true),
        agreementSelection(ownNotes: 'Family DJ'),
        agreementSelection(foods: ['Fish']),
        agreementSelection(decor: ['Lights']),
        agreementSelection(furniture: ['Chairs']),
        agreementSelection(
          addons: [
            {
              'addonId': 'addon_123',
              'providerId': 'provider_123',
              'source': 'catering_provider',
              'quantity': 1,
            },
          ],
        ),
        agreementSelection(
          addons: [
            {
              'addonId': 'addon_123',
              'providerId': 'provider_123',
              'source': 'catering_provider',
              'quantity': 2,
            },
          ],
        ),
      ];
      for (final next in selections) {
        c.select(agreementSelection(), ownerId: 'customer_123');
        await c.load();
        c.acknowledge('provider_123', 'a' * 64, true);
        expect(c.allAcknowledged, isTrue);
        expect(c.select(next, ownerId: 'customer_123'), isTrue);
        expect(c.allAcknowledged, isFalse);
        expect(c.agreements, isEmpty);
      }
      await c.load();
      c.acknowledge('provider_123', 'a' * 64, true);
      c.select(selections.last, ownerId: 'customer_456');
      expect(c.allAcknowledged, isFalse);
    },
  );
  test(
    'same selection preserves review; quantity-only edits invalidate without sending metadata',
    () async {
      final requests = <BookingAgreementRequest>[];
      final c = BookingAgreementController(
        resolveProviders: fixtureProviders,
        loader: (r) async {
          requests.add(r);
          return [BookingAgreement.fromJson(agreementFixture())];
        },
      );
      addTearDown(c.dispose);
      final selection = agreementSelection(
        addons: [
          {
            'addonId': 'addon_123',
            'providerId': 'provider_123',
            'source': 'catering_provider',
            'quantity': 1,
            'price': double.infinity,
          },
        ],
      );
      c.select(selection);
      await c.load();
      c.acknowledge('provider_123', 'a' * 64, true);
      expect(c.select(selection), isFalse);
      expect(c.allAcknowledged, isTrue);
      c.select(
        agreementSelection(
          addons: [
            {
              'addonId': 'addon_123',
              'providerId': 'provider_123',
              'source': 'catering_provider',
              'quantity': 2,
              'price': double.infinity,
            },
          ],
        ),
      );
      expect(c.allAcknowledged, isFalse);
      await c.load();
      expect(requests[0].clientRequestId, isNot(requests[1].clientRequestId));
      final first = requests[0].toJson()..remove('clientRequestId');
      final second = requests[1].toJson()..remove('clientRequestId');
      expect(first, second);
      expect(first['addonIds'], ['addon_123']);
      expect(first.containsKey('price'), isFalse);
    },
  );
  test(
    'duplicate requests deduplicate, stale older success cannot replace newer terms',
    () async {
      final pending = <Completer<List<BookingAgreement>>>[];
      final requests = <BookingAgreementRequest>[];
      final c = BookingAgreementController(
        resolveProviders: fixtureProviders,
        loader: (r) {
          requests.add(r);
          final p = Completer<List<BookingAgreement>>();
          pending.add(p);
          return p.future;
        },
      );
      addTearDown(c.dispose);
      c.select(agreementSelection());
      final older = c.load();
      expect(c.load(), same(older));
      await Future<void>.delayed(Duration.zero);
      expect(pending.length, 1);
      c.select(agreementSelection(theme: 'classic'));
      final newer = c.load();
      await Future<void>.delayed(Duration.zero);
      expect(requests[0].clientRequestId, isNot(requests[1].clientRequestId));
      pending[1].complete([
        BookingAgreement.fromJson(agreementFixture(keyCharacter: 'b')),
      ]);
      await newer;
      pending[0].complete([BookingAgreement.fromJson(agreementFixture())]);
      await older;
      expect(c.agreements.single.agreementKey, 'b' * 64);
    },
  );
  test(
    'old error, invalid selection and controller disposal cannot retain consent',
    () async {
      final pending = <Completer<List<BookingAgreement>>>[];
      final c = BookingAgreementController(
        resolveProviders: fixtureProviders,
        loader: (_) {
          final p = Completer<List<BookingAgreement>>();
          pending.add(p);
          return p.future;
        },
      );
      c.select(agreementSelection());
      final old = c.load();
      await Future<void>.delayed(Duration.zero);
      c.select(agreementSelection(theme: 'classic'));
      final fresh = c.load();
      await Future<void>.delayed(Duration.zero);
      pending[1].complete([
        BookingAgreement.fromJson(agreementFixture(keyCharacter: 'b')),
      ]);
      await fresh;
      pending[0].completeError(StateError('old failure'));
      await old;
      expect(c.status, AgreementReviewStatus.ready);
      c.select(agreementSelection(guests: 0));
      expect(c.agreements, isEmpty);
      expect(c.status, AgreementReviewStatus.failed);
      c.select(agreementSelection());
      final disposed = c.load();
      await Future<void>.delayed(Duration.zero);
      c.dispose();
      pending[2].complete([BookingAgreement.fromJson(agreementFixture())]);
      await disposed;
    },
  );
  test(
    'time cutoff revokes acknowledgement even before an expiry timer fires',
    () async {
      var now = DateTime.utc(2030, 1, 1);
      final c = BookingAgreementController(
        resolveProviders: fixtureProviders,
        now: () => now,
        loader: (_) async => [BookingAgreement.fromJson(agreementFixture())],
      );
      addTearDown(c.dispose);
      c.select(agreementSelection());
      await c.load();
      c.acknowledge('provider_123', 'a' * 64, true);
      expect(c.allAcknowledged, isTrue);
      now = DateTime.utc(2030, 1, 2, 6);
      expect(c.allAcknowledged, isFalse);
      expect(() => c.acknowledgements, throwsA(fails));
    },
  );
}
