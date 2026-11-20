import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/authentication/data/repositories/feasta_repository.dart'
    show exactPreparationAddon;
import 'package:feasta/features/customer/event_list/event_list_submission_controller.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'booking_agreement_fixtures.dart';
import 'booking_refund_policy_test.dart' show refundFixture;
import 'event_list_submission_test.dart' show submissionEntry, SubmissionMemory;

void main() {
  final catering = submissionEntry(1);
  CustomerEventListEntry service(
    String suffix, {
    CustomerEventListEvent? event,
  }) => CustomerEventListEntry.marketplaceService(
    providerId: 'provider_$suffix',
    serviceId: 'service_$suffix',
    serviceName: 'Photography',
    providerName: 'Photographer',
    expectedRevision: 4,
    estimatedPrice: 99999,
    configuration: CustomerEventListConfiguration.marketplace(
      event: (event ?? catering.configuration!.event).toJson(),
    ),
  );
  late EventListSubmissionController controller;
  late List<String> refreshes;
  late List<(String, Map<String, dynamic>)> calls;
  late List<CustomerEventListEntry> entries;
  int? revision;
  String? owner, serviceId;
  bool missing = false, backendFails = false, current = true;
  setUp(() {
    entries = [catering, service('456')];
    revision = 4;
    owner = null;
    serviceId = null;
    missing = false;
    backendFails = false;
    current = true;
    refreshes = [];
    calls = [];
    controller = EventListSubmissionController(
      uid: 'customer_123',
      isCurrent: () => current,
      store: SubmissionMemory(),
      now: () => DateTime.utc(2029),
      refreshMarketplaceService: (id) async {
        refreshes.add(id);
        if (missing) return null;
        return AddonModel(
          id: serviceId ?? id,
          providerId: owner ?? id.replaceFirst('service_', 'provider_'),
          revision: revision,
          name: 'Photo',
          description: '',
          category: 'Photography',
          price: 99999,
          isAvailable: true,
          isActive: true,
          providerBusinessName: 'Photo',
          providerType: 'addon_provider',
        );
      },
      call: (name, data) async {
        calls.add((name, jsonDecode(jsonEncode(data)) as Map<String, dynamic>));
        if (name == 'getMultiProviderBookingDisclosures') {
          return {
            'agreements': [
              for (var i = 0; i < entries.length; i++)
                agreementFixture(
                  provider: entries[i].providerId,
                  keyCharacter: String.fromCharCode(97 + i),
                ),
            ],
            'refundPolicies': {
              'rolloutMode': 'required',
              'acknowledgementsRequired': true,
              'policies': [
                for (final e in entries) refundFixture(provider: e.providerId),
              ],
            },
          };
        }
        if (backendFails) throw StateError('backend rejected');
        return {
          'bookingId': 'booking_123',
          'mainEventId': 'booking_123',
          'providerRequestIds': [
            for (final e in entries) 'request_${e.providerId}',
          ],
          'created': true,
        };
      },
    );
  });
  tearDown(() => controller.dispose());
  void accept() {
    for (final a in controller.agreements) {
      controller.acceptAgreement(a, true);
    }
    for (final p in controller.policies) {
      controller.acceptPolicy(p, true);
    }
  }

  test('Catering v1 never refreshes marketplace', () async {
    entries = [catering, submissionEntry(2)];
    await controller.prepare(entries);
    accept();
    await controller.submit();
    expect(refreshes, isEmpty);
    expect(calls.last.$2['submission']['schemaVersion'], 1);
    expect(controller.result, isNotNull);
  });
  for (final count in [1, 2]) {
    test(
      'mixed $count services refresh before review and dispatch with exact consent',
      () async {
        entries = [catering, service('456'), if (count == 2) service('789')];
        await controller.prepare(entries);
        accept();
        final id = controller.requestId;
        final expectedAgreements = controller.agreements
            .map((a) => a.acknowledgement)
            .toList();
        final expectedPolicies = controller.policies
            .map((p) => p.acknowledgement)
            .toList();
        await controller.submit();
        expect(refreshes.length, count * 2);
        expect(controller.requestId, id);
        expect(controller.result, isNotNull);
        final payload = calls.last.$2;
        expect(payload['agreementAcknowledgements'], expectedAgreements);
        expect(payload['policyAcknowledgements'], expectedPolicies);
        expect(payload['submission']['schemaVersion'], 2);
        for (final row in payload['submission']['selections'] as List) {
          if (row['kind'] == 'marketplace_service') {
            expect(row['expectedRevision'], 4);
            expect((row['configuration'] as Map).keys.toSet(), {
              'event',
              'specialRequest',
            });
            expect(jsonEncode(row), isNot(contains('99999')));
          }
        }
      },
    );
  }
  for (final invalid in ['missing', 'null', 'zero', 'stale', 'owner', 'id']) {
    test('$invalid metadata blocks disclosure', () async {
      switch (invalid) {
        case 'missing':
          missing = true;
        case 'null':
          revision = null;
        case 'zero':
          revision = 0;
        case 'stale':
          revision = 5;
        case 'owner':
          owner = 'provider_wrong';
        case 'id':
          serviceId = 'service_wrong';
      }
      await controller.prepare(entries);
      expect(calls, isEmpty);
      expect(controller.ready, isFalse);
      expect(controller.agreements, isEmpty);
      expect(controller.result, isNull);
    });
  }
  test('changed revision clears consent and prevents submission', () async {
    await controller.prepare(entries);
    accept();
    revision = 5;
    await controller.submit();
    expect(calls.length, 1);
    expect(controller.agreements, isEmpty);
    expect(controller.pending, isFalse);
    expect(controller.result, isNull);
    revision = 4;
    await controller.prepare(entries);
    expect(controller.ready, isFalse);
  });
  test('changed selections and event require fresh acknowledgements', () async {
    await controller.prepare(entries);
    accept();
    entries = [catering, service('789')];
    await controller.prepare(entries);
    expect(controller.ready, isFalse);
    expect(controller.agreements.every(controller.agreementAccepted), isFalse);
    accept();
    final changed = submissionEntry(1, address: 'Different street');
    entries = [changed, service('789', event: changed.configuration!.event)];
    await controller.prepare(entries);
    expect(controller.agreements, isNotEmpty);
    expect(controller.agreements.every(controller.agreementAccepted), isFalse);
    expect(controller.ready, isFalse);
  });
  test(
    'list revision invalidation removes previously accepted evidence',
    () async {
      await controller.prepare(entries);
      accept();
      expect(controller.ready, isTrue);
      controller.invalidateReviews();
      expect(controller.ready, isFalse);
      expect(controller.agreements, isEmpty);
      await controller.submit();
      expect(calls.length, 1);
    },
  );
  test(
    'exact catalog rejects duplicate identities and ambiguous ownership',
    () {
      AddonModel record(String owner) => AddonModel(
        id: 'service_456',
        providerId: owner,
        revision: 4,
        name: 'Photo',
        description: '',
        category: 'Photography',
        price: 99999,
        isAvailable: true,
        isActive: true,
        providerBusinessName: 'Photo',
        providerType: 'addon_provider',
      );
      final first = record('provider_456');
      expect(exactPreparationAddon([first], 'service_456'), same(first));
      expect(exactPreparationAddon([], 'service_456'), isNull);
      expect(exactPreparationAddon([first], 'service_other'), isNull);
      expect(exactPreparationAddon([first, first], 'service_456'), isNull);
      expect(
        exactPreparationAddon([first, record('provider_other')], 'service_456'),
        isNull,
      );
    },
  );
  test('session change blocks dispatch', () async {
    await controller.prepare(entries);
    accept();
    current = false;
    await controller.submit();
    expect(calls.length, 1);
  });
  test(
    'backend failure preserves uncertain identity without fake success',
    () async {
      await controller.prepare(entries);
      accept();
      final id = controller.requestId;
      backendFails = true;
      await controller.submit();
      expect(controller.result, isNull);
      expect(controller.pending, isTrue);
      expect(controller.requestId, id);
    },
  );
}
