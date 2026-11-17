import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/customer_event_list.dart';
import 'event_list_configuration_codec_test.dart' as legacy;

CustomerEventListEntry marketplace({
  int? revision = 4,
  bool configured = true,
}) => CustomerEventListEntry.marketplaceService(
  providerId: 'provider_photo',
  serviceId: 'service_photo',
  serviceName: 'Photography',
  providerName: 'Photographer',
  expectedRevision: revision,
  estimatedPrice: 12000,
  configuration: configured
      ? CustomerEventListConfiguration.marketplace(
          event: Map<String, dynamic>.from(
            legacy.configuration()['event'] as Map,
          ),
          specialRequest: 'Photograph the ceremony',
        )
      : null,
);
CustomerEventList restore(List<CustomerEventListEntry> entries) =>
    CustomerEventList.decode(
      CustomerEventList(
        ownerUid: 'customer_A',
        revision: 7,
        updatedAt: DateTime.utc(2030),
        entries: entries,
      ).encode(),
      ownerUid: 'customer_A',
    );

void main() {
  test(
    'marketplace identity revision event and provider instructions round trip',
    () {
      final entry = restore([marketplace()]).entries.single;
      expect(entry.kind, 'marketplace_service');
      expect(entry.providerId, 'provider_photo');
      expect(entry.serviceId, 'service_photo');
      expect(entry.expectedRevision, 4);
      expect(entry.serviceName, 'Photography');
      expect(entry.configuration!.specialRequest, 'Photograph the ceremony');
      expect(entry.configuration!.event.specialRequest, '');
      expect(entry.estimatedPrice, 12000);
      expect(
        entry.readiness,
        CustomerEventListReadiness.configuredRevalidationRequired,
      );
      expect(entry.toJson().containsKey('packageId'), false);
      expect(entry.configuration!.toJson().containsKey('price'), false);
    },
  );
  test('mixed list preserves package encoding and separate identities', () {
    final catering = legacy.entry(
      CustomerEventListConfiguration.fromJson(legacy.configuration()),
    );
    final saved = restore([catering, marketplace()]);
    expect(saved.entries.first.toJson(), catering.toJson());
    expect(saved.entries.last.toJson(), marketplace().toJson());
    expect(saved.entries.map((e) => e.identity.key).toSet().length, 2);
    expect(
      saved.entries.last.identity.key,
      isNot(EventListIdentity.package('provider_photo', 'service_photo').key),
    );
    expect(() => saved.entries.clear(), throwsUnsupportedError);
  });
  test('legacy attached display prices restore without inventing metadata', () {
    final old = legacy
        .list(
          legacy.entry(
            CustomerEventListConfiguration.fromJson(legacy.configuration()),
          ),
        )
        .encode();
    final saved = CustomerEventList.decode(old, ownerUid: 'customer_A');
    expect(saved.encode(), old);
    final addon = saved.entries.single.configuration!.selectedAddOns.single;
    expect(addon.price, 500);
    expect(addon.serviceId, null);
    expect(addon.expectedRevision, null);
    expect(addon.hasMarketplaceSubmissionMetadata, false);
    expect(
      saved.entries.single.configuration!.toJson().containsKey(
        'specialRequest',
      ),
      false,
    );
  });
  test('missing revision persists and requires metadata refresh', () {
    final entry = restore([marketplace(revision: null)]).entries.single;
    expect(entry.expectedRevision, null);
    expect(entry.hasMarketplaceSubmissionMetadata, false);
    expect(
      entry.readiness,
      CustomerEventListReadiness.marketplaceMetadataRefreshRequired,
    );
    expect(
      entry.matchesMarketplaceMetadata(
        currentProviderId: 'provider_photo',
        currentServiceId: 'service_photo',
        currentRevision: 4,
      ),
      false,
    );
    expect(
      CustomerEventListEntry.fromJson(
        marketplace().toJson()..remove('expectedRevision'),
      ).expectedRevision,
      null,
    );
  });
  test('fresh comparison rejects stale revision and changed identities', () {
    final entry = marketplace();
    expect(
      entry.matchesMarketplaceMetadata(
        currentProviderId: 'provider_photo',
        currentServiceId: 'service_photo',
        currentRevision: 4,
      ),
      true,
    );
    for (final revision in [0, 3, 5]) {
      expect(
        entry.matchesMarketplaceMetadata(
          currentProviderId: 'provider_photo',
          currentServiceId: 'service_photo',
          currentRevision: revision,
        ),
        false,
      );
    }
    expect(
      entry.matchesMarketplaceMetadata(
        currentProviderId: 'provider_other',
        currentServiceId: 'service_photo',
        currentRevision: 4,
      ),
      false,
    );
    expect(
      entry.matchesMarketplaceMetadata(
        currentProviderId: 'provider_photo',
        currentServiceId: 'service_other',
        currentRevision: 4,
      ),
      false,
    );
    expect(
      marketplace(configured: false).readiness,
      CustomerEventListReadiness.needsCustomization,
    );
  });
  test(
    'malformed or missing standalone identities and invalid revisions fail safely',
    () {
      for (final field in ['providerId', 'serviceId']) {
        for (final value in [null, '', '../bad']) {
          expect(
            () => CustomerEventListEntry.fromJson(
              marketplace().toJson()..[field] = value,
            ),
            throwsFormatException,
          );
        }
      }
      for (final value in [0, -1, 1.5, '4', 9007199254740992]) {
        expect(
          () => CustomerEventListEntry.fromJson(
            marketplace().toJson()..['expectedRevision'] = value,
          ),
          throwsFormatException,
        );
      }
    },
  );
  test(
    'attached marketplace metadata survives mixed restoration and detects staleness',
    () {
      final json = legacy.configuration();
      final row = (json['selectedAddOns'] as List).single as Map;
      row['serviceId'] = 'service_photo';
      row['expectedRevision'] = 8;
      final addon = restore([
        legacy.entry(CustomerEventListConfiguration.fromJson(json)),
        marketplace(),
      ]).entries.first.configuration!.selectedAddOns.single;
      expect(addon.kind, 'marketplace_service');
      expect(addon.serviceId, 'service_photo');
      expect(addon.expectedRevision, 8);
      expect(addon.hasMarketplaceSubmissionMetadata, true);
      expect(
        addon.matchesMarketplaceMetadata(
          currentProviderId: 'provider_456',
          currentServiceId: 'service_photo',
          currentRevision: 9,
        ),
        false,
      );
      expect(addon.toJson(), row);
    },
  );
  test('attached service identity is not inferred from addonId', () {
    final input = legacy.configuration();
    final row = (input['selectedAddOns'] as List).single as Map;
    row['expectedRevision'] = 4;
    final addon = CustomerEventListConfiguration.fromJson(
      input,
    ).selectedAddOns.single;
    expect(addon.serviceId, null);
    expect(addon.hasMarketplaceSubmissionMetadata, false);
    row['expectedRevision'] = 0;
    expect(
      () => CustomerEventListConfiguration.fromJson(input),
      throwsFormatException,
    );
  });
  test('explicit empty instructions and nested fallback stay distinct', () {
    for (final instructions in [null, '', 'Ceremony only']) {
      final config = CustomerEventListConfiguration.marketplace(
        event: {
          ...legacy.configuration()['event'] as Map<String, dynamic>,
          'specialRequest': 'Nested instructions',
        },
        specialRequest: instructions,
      );
      final restored = CustomerEventListConfiguration.fromJson(
        jsonDecode(jsonEncode(config.toJson())) as Map<String, dynamic>,
      );
      expect(restored.specialRequest, instructions);
      expect(restored.event.specialRequest, 'Nested instructions');
      expect(
        restored.toJson().containsKey('specialRequest'),
        instructions != null,
      );
    }
  });
  test('duplicate marketplace identity is rejected without merging', () {
    expect(
      () => restore([marketplace(), marketplace()]),
      throwsFormatException,
    );
  });
}
