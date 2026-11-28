import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/models/feasta_models.dart';

Map<String, dynamic> catalogService() => {
  'id': 'photo_service',
  'providerId': 'photo_provider',
  'providerName': 'Photo Studio',
  'name': 'Photography',
  'description': 'Ceremony coverage',
  'category': 'Photography',
  'price': 845,
  'imageUrl': 'https://example.com/photo.jpg',
  'bookingLeadTimeDays': 7,
  'source': 'feasta_addon_provider',
  'revision': 4,
};

void main() {
  test(
    'trusted catalog parser preserves service provider revision and display',
    () {
      final service = AddonModel.fromCatalog(catalogService());
      expect(service.id, 'photo_service');
      expect(service.providerId, 'photo_provider');
      expect(service.revision, 4);
      expect(service.hasMarketplaceSubmissionMetadata, isTrue);
      expect(service.name, 'Photography');
      expect(service.description, 'Ceremony coverage');
      expect(service.category, 'Photography');
      expect(service.providerBusinessName, 'Photo Studio');
      expect(service.providerType, 'addon_provider');
      expect(service.price, 845);
      expect(service.bookingLeadTimeDays, 7);
      expect(service.imageUrl, 'https://example.com/photo.jpg');
      expect(service.isActive && service.isAvailable, isTrue);
    },
  );

  for (final revision in [1, 4.0, 9007199254740991]) {
    test('positive safe integer revision $revision is preserved', () {
      final service = AddonModel.fromCatalog({
        ...catalogService(),
        'revision': revision,
      });
      expect(service.revision, revision.toInt());
      expect(service.hasMarketplaceSubmissionMetadata, isTrue);
    });
  }

  test(
    'missing revision retains browsing without mixed submission metadata',
    () {
      final raw = catalogService()..remove('revision');
      final service = AddonModel.fromCatalog(raw);
      expect(service.revision, isNull);
      expect(service.hasMarketplaceSubmissionMetadata, isFalse);
      expect(service.name, 'Photography');
      expect(service.price, 845);
      expect(service.isActive && service.isAvailable, isTrue);
    },
  );

  for (final revision in <Object?>[
    null,
    0,
    -1,
    1.5,
    '4',
    true,
    <String, dynamic>{},
    double.nan,
    double.infinity,
    9007199254740992,
  ]) {
    test('malformed revision $revision never becomes booking metadata', () {
      final service = AddonModel.fromCatalog({
        ...catalogService(),
        'revision': revision,
      });
      expect(service.revision, isNull);
      expect(service.hasMarketplaceSubmissionMetadata, isFalse);
      expect(service.price, 845);
      expect(service.id, 'photo_service');
    });
  }

  test('multiple catalog revisions remain linked to their own identities', () {
    final services = [
      AddonModel.fromCatalog(catalogService()),
      AddonModel.fromCatalog({
        ...catalogService(),
        'id': 'music_service',
        'providerId': 'music_provider',
        'revision': 8,
      }),
    ];
    expect(services.map((s) => (s.id, s.providerId, s.revision)), [
      ('photo_service', 'photo_provider', 4),
      ('music_service', 'music_provider', 8),
    ]);
  });

  test('missing identities are never fabricated', () {
    for (final key in ['id', 'providerId']) {
      final raw = catalogService()..remove(key);
      expect(() => AddonModel.fromCatalog(raw), throwsFormatException);
      final invalid = AddonModel.fromCatalog({...catalogService(), key: ''});
      expect(invalid.hasMarketplaceSubmissionMetadata, isFalse);
    }
  });

  test('Catering catalog retains its existing source and legacy map', () {
    final service = AddonModel.fromCatalog({
      ...catalogService(),
      'source': 'catering_provider',
    });
    expect(service.providerType, 'catering_provider');
    expect(service.revision, 4);
    expect(service.hasMarketplaceSubmissionMetadata, isFalse);
    expect(service.toBookingMap(), {
      'addonId': 'photo_service',
      'providerId': 'photo_provider',
      'providerBusinessName': 'Photo Studio',
      'providerType': 'catering_provider',
      'name': 'Photography',
      'category': 'Photography',
      'price': 845,
      'source': 'catering_provider',
    });
  });

  test(
    'legacy constructor and serialization stay compatible without revision',
    () {
      final service = AddonModel(
        id: 'legacy',
        providerId: 'caterer',
        name: 'Chairs',
        description: '',
        category: 'Furniture',
        price: 100,
        isActive: true,
        isAvailable: true,
        providerBusinessName: 'Caterer',
        providerType: 'catering_provider',
      );
      expect(service.revision, isNull);
      expect(service.hasMarketplaceSubmissionMetadata, isFalse);
      expect(service.toBookingMap(), {
        'addonId': 'legacy',
        'providerId': 'caterer',
        'providerBusinessName': 'Caterer',
        'providerType': 'catering_provider',
        'name': 'Chairs',
        'category': 'Furniture',
        'price': 100,
        'source': 'catering_provider',
      });
    },
  );

  test('revision does not change legacy marketplace price serialization', () {
    final current = AddonModel.fromCatalog(catalogService());
    final legacy = AddonModel.fromCatalog(catalogService()..remove('revision'));
    expect(
      current.toBookingMap(source: 'feasta_addon_provider'),
      legacy.toBookingMap(source: 'feasta_addon_provider'),
    );
    expect(current.toBookingMap().containsKey('revision'), isFalse);
    expect(current.toBookingMap().containsKey('expectedRevision'), isFalse);
  });
}
