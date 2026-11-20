import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/core/helpers/legacy_occasion_visibility.dart';

void main() {
  test('complete absence of V2 fields retains ordinary legacy package', () {
    expect(isLegacyOccasionPublicPackage({'eventType': 'birthday'}), isTrue);
    expect(isLegacyOccasionPublicPackage({
      'occasionSchemaVersion': 1,
      'eventType': 'wedding',
    }), isTrue);
  });

  test('V2 and malformed version markers are rejected', () {
    for (final marker in [2, null, '2', 0, -1, true]) {
      expect(isLegacyOccasionPublicPackage({
        'eventType': 'birthday', 'occasionSchemaVersion': marker,
      }), isFalse);
    }
  });

  test('every partial V2 field is rejected, including explicit null', () {
    for (final key in [
      'occasionScope', 'occasionIds', 'occasionMatchIds',
      'occasionCatalogRevision', 'providerEligibilityRevision',
      'occasionEligibilityState', 'foodChoiceGroups',
    ]) {
      expect(isLegacyOccasionPublicPackage({
        'occasionSchemaVersion': 1, 'eventType': 'birthday', key: null,
      }), isFalse, reason: key);
    }
  });

  test('unrecognized V2 pricing stays out of the legacy mobile reader', () {
    expect(isLegacyOccasionPublicPackage({'pricingModel': 'per_pax'}), isFalse);
    expect(isLegacyOccasionPublicPackage({'offerSchemaVersion': 2}), isFalse);
    expect(isLegacyOccasionPublicPackage({'offerSchemaVersion': 1}), isTrue);
    for (final marker in [null, '1', false, 0, 3]) {
      expect(isLegacyOccasionPublicPackage({'offerSchemaVersion': marker}), isFalse);
    }
    expect(isLegacyOccasionPublicPackage({'pricingModel': null}), isFalse);
  });

  test('completed-looking V2 does not bypass the legacy filter', () {
    expect(isLegacyOccasionPublicPackage({
      'occasionSchemaVersion': 2,
      'occasionScope': 'specific',
      'occasionIds': ['birthday'],
      'occasionMatchIds': ['birthday'],
      'occasionEligibilityState': 'valid',
      'occasionCatalogRevision': 2,
      'providerEligibilityRevision': 1,
    }), isFalse);
  });
}
