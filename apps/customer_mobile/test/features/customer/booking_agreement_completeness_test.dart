import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_agreement_controller.dart';
import 'package:feasta/shared/models/booking_agreement.dart';
import 'booking_agreement_fixtures.dart';

void main() {
  final failure = isA<AgreementReviewFailure>();
  final both = [
    agreementFixture(),
    agreementFixture(provider: 'provider_456', deposit: false),
  ];
  for (final scenario in <String, List<String>>{
    'only catering': ['provider_123'],
    'only marketplace': ['provider_456'],
    'unrelated only': ['provider_789'],
    'same count with unrelated': ['provider_123', 'provider_789'],
    'unexpected extra': ['provider_123', 'provider_456', 'provider_789'],
    'duplicate': ['provider_123', 'provider_456', 'provider_456'],
  }.entries) {
    test('rejects ${scenario.key}; cannot export partial consent', () async {
      var response = both;
      final c = BookingAgreementController(
        resolveProviders: fixtureProviders,
        loader: (_) async => response.map(BookingAgreement.fromJson).toList(),
      );
      addTearDown(c.dispose);
      c.select(agreementSelection(addons: [marketplaceFixture()]));
      await c.load();
      for (final a in c.agreements) {
        c.acknowledge(a.providerId, a.agreementKey, true);
      }
      expect(c.allAcknowledged, isTrue);
      response = scenario.value
          .map((id) => agreementFixture(provider: id))
          .toList();
      await c.load();
      for (final id in scenario.value) {
        c.acknowledge(id, 'a' * 64, true);
      }
      expect(c.status, AgreementReviewStatus.failed);
      expect(c.message, contains('refreshed'));
      expect(c.agreements, isEmpty);
      expect(c.allAcknowledged, isFalse);
      expect(() => c.acknowledgements, throwsA(failure));
      response = both;
      await c.load();
      expect(c.status, AgreementReviewStatus.ready);
      expect(c.allAcknowledged, isFalse);
      for (final a in c.agreements) {
        expect(c.acknowledged(a), isFalse);
        c.acknowledge(a.providerId, a.agreementKey, true);
      }
      expect(c.acknowledgements.map((a) => a['providerId']).toSet(), {
        'provider_123',
        'provider_456',
      });
    });
  }

  for (final marketplace in [false, true]) {
    test('complete distinct providers, marketplace=$marketplace', () async {
      final addons = [
        {
          'addonId': 'addon_123',
          'providerId': 'provider_123',
          'source': 'catering_provider',
        },
        if (marketplace) ...[
          marketplaceFixture(),
          marketplaceFixture(id: 'addon_789'),
        ],
      ];
      final lookedUp = <String>[];
      final c = BookingAgreementController(
        resolveProviders: (r) => r.expectedProviderIds(
          lookupOwner: (id) async {
            lookedUp.add(id);
            return id == 'addon_123' ? 'provider_123' : 'provider_456';
          },
        ),
        loader: (_) async => (marketplace ? both : [agreementFixture()])
            .map(BookingAgreement.fromJson)
            .toList(),
      );
      addTearDown(c.dispose);
      c.select(agreementSelection(addons: addons));
      await c.load();
      expect(
        lookedUp,
        marketplace ? ['addon_123', 'addon_456', 'addon_789'] : ['addon_123'],
      );
      for (final a in c.agreements) {
        c.acknowledge(a.providerId, a.agreementKey, true);
      }
      expect(c.acknowledgements.length, marketplace ? 2 : 1);
    });
  }

  for (final patch in <Map<String, dynamic>>[
    {'providerId': null},
    {'providerId': 'provider_789'},
    {'source': 'catering_provider'},
    {'addonId': 'addon_unknown'},
  ]) {
    test('unresolved or mismatched ownership fails closed: $patch', () async {
      var calls = 0;
      final c = BookingAgreementController(
        resolveProviders: fixtureProviders,
        loader: (_) async {
          calls++;
          return [];
        },
      );
      addTearDown(c.dispose);
      c.select(
        agreementSelection(
          addons: [
            {...marketplaceFixture(), ...patch},
          ],
        ),
      );
      await c.load();
      expect(c.status, AgreementReviewStatus.failed);
      expect(calls, 0);
      expect(c.allAcknowledged, isFalse);
      expect(() => c.acknowledgements, throwsA(failure));
    });
  }

  test('local ownership without a server resolver is insufficient', () async {
    final c = BookingAgreementController(loader: (_) async => []);
    addTearDown(c.dispose);
    c.select(agreementSelection(addons: [marketplaceFixture()]));
    await c.load();
    expect(c.status, AgreementReviewStatus.failed);
    expect(() => c.acknowledgements, throwsA(failure));
  });

  test(
    'ownership refresh failure revokes previously complete consent',
    () async {
      var unavailable = false;
      final c = BookingAgreementController(
        resolveProviders: (r) => r.expectedProviderIds(
          lookupOwner: (_) async => unavailable ? null : 'provider_456',
        ),
        loader: (_) async => both.map(BookingAgreement.fromJson).toList(),
      );
      addTearDown(c.dispose);
      c.select(agreementSelection(addons: [marketplaceFixture()]));
      await c.load();
      for (final a in c.agreements) {
        c.acknowledge(a.providerId, a.agreementKey, true);
      }
      expect(c.allAcknowledged, isTrue);
      unavailable = true;
      await c.load();
      expect(c.agreements, isEmpty);
      expect(c.allAcknowledged, isFalse);
      expect(() => c.acknowledgements, throwsA(failure));
    },
  );

  test(
    'ownership snapshot is immutable; old resolution cannot load new selection',
    () async {
      final pending = Completer<String?>();
      final addon = marketplaceFixture();
      final calls = <BookingAgreementRequest>[];
      final c = BookingAgreementController(
        resolveProviders: (r) =>
            r.expectedProviderIds(lookupOwner: (_) => pending.future),
        loader: (r) async {
          calls.add(r);
          return [BookingAgreement.fromJson(agreementFixture())];
        },
      );
      addTearDown(c.dispose);
      c.select(agreementSelection(addons: [addon]));
      final old = c.load();
      await Future<void>.delayed(Duration.zero);
      addon['providerId'] = 'provider_789';
      c.select(agreementSelection());
      await c.load();
      pending.complete('provider_456');
      await old;
      expect(calls.length, 1);
      expect(calls.single.toJson()['addonIds'], isEmpty);
      expect(c.status, AgreementReviewStatus.ready);
      // The request must retain B even if the caller mutates its source map.
      final mutableAddon = marketplaceFixture();
      final original = BookingAgreementRequest(
        agreementSelection(addons: [mutableAddon]),
        'review_request_123',
      );
      mutableAddon['providerId'] = 'provider_789';
      mutableAddon['source'] = 'catering_provider';
      final payload = original.toJson()..['addonIds'] = [];
      expect(payload['addonIds'], isEmpty);
      expect(await fixtureProviders(original), {
        'provider_123',
        'provider_456',
      });
    },
  );

  test(
    'account switch while disclosure pending ignores old provider agreements',
    () async {
      final pending = Completer<List<BookingAgreement>>();
      var calls = 0;
      final c = BookingAgreementController(
        loader: (_) {
          calls++;
          return calls == 1
              ? pending.future
              : Future.value([
                  BookingAgreement.fromJson(
                    agreementFixture(keyCharacter: 'b'),
                  ),
                ]);
        },
      );
      addTearDown(c.dispose);
      c.select(agreementSelection(), ownerId: 'customer_123');
      final old = c.load();
      await Future<void>.delayed(Duration.zero);
      c.select(agreementSelection(), ownerId: 'customer_456');
      await c.load();
      pending.complete([BookingAgreement.fromJson(agreementFixture())]);
      await old;
      c.acknowledge('provider_123', 'a' * 64, true);
      expect(c.allAcknowledged, isFalse);
      expect(c.agreements.single.agreementKey, 'b' * 64);
    },
  );

  test(
    'late complete disclosure after expiry never restores consent',
    () async {
      var now = DateTime.utc(2030, 1, 1);
      final pending = Completer<List<BookingAgreement>>();
      final c = BookingAgreementController(
        now: () => now,
        loader: (_) => pending.future,
      );
      addTearDown(c.dispose);
      c.select(agreementSelection());
      final loading = c.load();
      await Future<void>.delayed(Duration.zero);
      now = DateTime.utc(2030, 1, 2, 6);
      pending.complete([BookingAgreement.fromJson(agreementFixture())]);
      await loading;
      c.acknowledge('provider_123', 'a' * 64, true);
      expect(c.status, AgreementReviewStatus.failed);
      expect(c.agreements, isEmpty);
      expect(() => c.acknowledgements, throwsA(failure));
    },
  );
}
