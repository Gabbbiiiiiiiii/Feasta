import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_submission_contract.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'event_list_submission_test.dart' show submissionEntry;

void main() {
  final catering = submissionEntry(1);
  CustomerEventListEntry service({
    String provider = 'photo_provider',
    String id = 'photo_service',
    int? revision = 4,
    String address = ' Main Street ',
    String? instructions = 'Photograph the ceremony',
  }) => CustomerEventListEntry.marketplaceService(
    providerId: provider,
    serviceId: id,
    serviceName: 'Photography',
    providerName: 'Photographer',
    expectedRevision: revision,
    estimatedPrice: 9000,
    configuration: CustomerEventListConfiguration.fromJson({
      ...CustomerEventListConfiguration.marketplace(
        event: {
          ...catering.configuration!.event.toJson(),
          'eventType': ' Wedding ',
          'eventAddress': address,
          'specialRequest': 'Nested instructions',
        },
        specialRequest: instructions,
      ).toJson(),
      'estimatedTotal': 12000,
      'pricingContext': {
        'currency': 'PHP',
        'pricingModel': 'per_bundle',
        'displayedServicePrice': 11000,
      },
    }),
  );
  const fresh = EventListIdentityRevision(
    providerId: 'photo_provider',
    serviceId: 'photo_service',
    revision: 4,
  );
  Map<String, dynamic> build(
    List<CustomerEventListEntry> entries, {
    List<EventListIdentityRevision> metadata = const [fresh],
  }) => eventListSubmission(
    entries,
    'request_123',
    currentMarketplaceMetadata: metadata,
  );

  test('Catering v1 retains exact existing configuration and envelope', () {
    final second = submissionEntry(2);
    expect(build([catering, second]), {
      'schemaVersion': 1,
      'clientRequestId': 'request_123',
      'event': {
        ...catering.configuration!.event.toJson(),
        'specialRequest': '',
      },
      'selections': [
        for (final entry in [catering, second])
          {
            'providerId': entry.providerId,
            'packageId': entry.packageId,
            'configuration': entry.configuration!.toJson(),
          },
      ],
    });
  });
  test(
    'Catering plus Photography emits exact v2 identities and shared event',
    () {
      final photo = service();
      final payload = build([catering, photo]);
      expect(payload['schemaVersion'], 2);
      expect(payload['clientRequestId'], 'request_123');
      expect(payload, build([photo, catering]));
      final rows = payload['selections'] as List;
      final package = rows.singleWhere((s) => s['kind'] == 'catering_package');
      expect(package['packageId'], catering.packageId);
      expect(package['configuration'], catering.configuration!.toJson());
      final marketplace = rows.singleWhere(
        (s) => s['kind'] == 'marketplace_service',
      );
      expect(marketplace, {
        'kind': 'marketplace_service',
        'providerId': 'photo_provider',
        'serviceId': 'photo_service',
        'expectedRevision': 4,
        'configuration': {
          'event': {
            ...payload['event'] as Map,
            'specialRequest': 'Nested instructions',
          },
          'specialRequest': 'Photograph the ceremony',
        },
      });
      for (final row in rows) {
        final event = Map.of(row['configuration']['event'] as Map)
          ..remove('specialRequest');
        expect(
          event,
          Map.of(payload['event'] as Map)..remove('specialRequest'),
        );
      }
      expect(jsonEncode(marketplace), isNot(contains('price')));
      expect(jsonEncode(marketplace), isNot(contains('9000')));
      expect(jsonEncode(marketplace), isNot(contains('estimatedTotal')));
      expect(jsonEncode(marketplace), isNot(contains('pricingContext')));
      expect(photo.configuration!.event.eventType, ' Wedding ');
    },
  );
  test('multiple marketplace providers retain separate instructions', () {
    final payload = build(
      [
        catering,
        service(),
        service(
          provider: 'music_provider',
          id: 'music_service',
          instructions: '',
        ),
      ],
      metadata: const [
        fresh,
        EventListIdentityRevision(
          providerId: 'music_provider',
          serviceId: 'music_service',
          revision: 4,
        ),
      ],
    );
    final rows = payload['selections'] as List;
    expect(rows, hasLength(3));
    expect(
      rows.singleWhere(
        (s) => s['providerId'] == 'music_provider',
      )['configuration']['specialRequest'],
      '',
    );
    expect(
      build([
        catering,
        service(instructions: null),
      ])['selections'][0]['configuration']['specialRequest'],
      'Nested instructions',
    );
  });
  test('missing, stale or ambiguous fresh metadata requires refresh', () {
    for (final metadata in <List<EventListIdentityRevision>>[
      [],
      [fresh, fresh],
      [
        const EventListIdentityRevision(
          providerId: 'photo_provider',
          serviceId: 'photo_service',
          revision: 5,
        ),
      ],
      [
        const EventListIdentityRevision(
          providerId: 'other_provider',
          serviceId: 'photo_service',
          revision: 4,
        ),
      ],
      [
        const EventListIdentityRevision(
          providerId: 'photo_provider',
          serviceId: 'other_service',
          revision: 4,
        ),
      ],
    ]) {
      expect(
        () => build([catering, service()], metadata: metadata),
        throwsFormatException,
      );
    }
    expect(
      () => build([catering, service(revision: null)]),
      throwsFormatException,
    );
    expect(() => service(provider: ''), throwsFormatException);
    expect(() => service(id: ''), throwsFormatException);
    expect(() => service(revision: 0), throwsFormatException);
  });
  test(
    'conflicting event, duplicate provider and marketplace only fail safely',
    () {
      expect(
        () => build([catering, service(address: 'Other Street')]),
        throwsFormatException,
      );
      expect(
        () => build([catering, service(provider: catering.providerId)]),
        throwsFormatException,
      );
      expect(
        () => build([service(), service(provider: 'music_provider')]),
        throwsFormatException,
      );
      expect(
        () => eventListSubmission(
          [catering, service()],
          'bad',
          currentMarketplaceMetadata: const [fresh],
        ),
        throwsFormatException,
      );
    },
  );
}
