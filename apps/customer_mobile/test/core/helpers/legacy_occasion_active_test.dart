import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/core/helpers/legacy_occasion_visibility.dart';
import 'package:feasta/core/services/occasion_catalog_service.dart';

void main() {
  const wedding = CatalogOccasion(
    id: 'wedding',
    label: 'Wedding',
    sortOrder: 1,
    revision: 3,
    applicableServiceCategoryCodes: ['catering_service'],
  );

  const birthday = CatalogOccasion(
    id: 'birthday',
    label: 'Birthday',
    sortOrder: 2,
    revision: 3,
    applicableServiceCategoryCodes: ['catering_service'],
  );

  test('inactive Birthday is excluded; active Wedding is retained', () {
    final active = [wedding];

    expect(
      isLegacyOccasionActiveInCatalog(
        {'eventType': 'birthday', 'isPublished': true},
        active,
      ),
      isFalse,
    );

    expect(
      isLegacyOccasionActiveInCatalog(
        {'eventType': 'wedding', 'isPublished': true},
        active,
      ),
      isTrue,
    );
  });

  test('legacy display labels resolve against active catalog', () {
    expect(
      isLegacyOccasionActiveInCatalog(
        {'eventType': ' Wedding '},
        [wedding],
      ),
      isTrue,
    );

    expect(
      isLegacyOccasionActiveInCatalog(
        {'eventType': 'Birthday'},
        [wedding],
      ),
      isFalse,
    );
  });

  test('reactivated Birthday becomes eligible again', () {
    expect(
      isLegacyOccasionActiveInCatalog(
        {'eventType': 'birthday'},
        [wedding, birthday],
      ),
      isTrue,
    );
  });

  test('empty catalog, missing and invalid event types fail closed', () {
    expect(
      isLegacyOccasionActiveInCatalog({'eventType': 'wedding'}, []),
      isFalse,
    );

    for (final value in [null, '', 42, 'unknown']) {
      expect(
        isLegacyOccasionActiveInCatalog(
          {'eventType': value},
          [wedding],
        ),
        isFalse,
      );
    }
  });

  test('V2 packages cannot bypass the separate V2 verifier', () {
    expect(
      isLegacyOccasionActiveInCatalog({
        'eventType': 'wedding',
        'occasionSchemaVersion': 2,
        'occasionMatchIds': ['wedding'],
      }, [wedding]),
      isFalse,
    );
  });
}
