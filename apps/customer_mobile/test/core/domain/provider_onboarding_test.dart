import 'package:feasta/core/domain/provider_onboarding.dart';
import 'package:feasta/core/enums/domain_enum_serializers.dart';
import 'package:feasta/core/enums/domain_enums.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Map<String, Object?> validInput() => {
    'ownerFirstName': 'Ana',
    'ownerLastName': 'Reyes',
    'businessName': 'Ana Events',
    'businessEmail': ' ANA@EVENTS.TEST ',
    'businessPhone': '+639171234567',
    'description': 'Full-service event catering for celebrations.',
    'providerServiceType': 'both',
    'providerCategory': 'catering_service',
    'serviceCategories': ['catering_service', 'photographer'],
    'address': '123 Main Street',
    'city': 'Ormoc City',
    'province': 'Leyte',
    'locationCoordinates': {'latitude': 11.0064, 'longitude': 124.6075},
    'serviceAreas': ['Ormoc City', 'Ormoc City'],
    'maxServiceDistanceKm': 80,
    'eventTypesSupported': ['wedding'],
    'minGuestsPerEvent': 20,
    'maxGuestsPerEvent': 500,
    'acceptsMultipleEventsPerDay': true,
    'maxEventsPerDay': 2,
    'availableStaffCount': 20,
    'availableEquipmentCount': 100,
    'operatingDays': ['monday', 'saturday'],
    'bookingLeadTimeDays': 7,
    'unavailableDates': ['2026-12-25'],
  };

  test('canonical values align with shared TypeScript values', () {
    expect(ProviderServiceType.values.map(providerServiceTypeToJson), [
      'catering',
      'addon',
      'both',
    ]);
    expect(
      VerificationDocumentStatus.values.map(verificationDocumentStatusToJson),
      ['pending', 'verified', 'rejected', 'expired'],
    );
    expect(
      requiredProviderVerificationDocumentTypes
          .map(verificationDocumentTypeToJson)
          .toSet(),
      {'business_permit', 'valid_id'},
    );
    expect(
      providerVerificationDocumentDefinitions
          .where((definition) => definition.isRequired)
          .map((definition) => verificationDocumentTypeToJson(definition.type))
          .toSet(),
      {'business_permit', 'valid_id'},
    );
  });

  test('validates and normalizes onboarding input', () {
    final result = validateProviderOnboardingInput(validInput());
    expect(result.isValid, isTrue);
    expect(result.value!.businessEmail, 'ana@events.test');
    expect(result.value!.serviceAreas, ['Ormoc City']);
    expect(result.value!.providerServiceType, ProviderServiceType.both);
    expect(result.value!.minGuestsPerEvent, 20);
    expect(result.value!.operatingDays, ['monday', 'saturday']);
  });

  test('rejects impossible capacity and service type mismatches', () {
    final input = validInput()
      ..['providerServiceType'] = 'catering'
      ..['serviceCategories'] = ['photographer']
      ..['minGuestsPerEvent'] = 501
      ..['maxGuestsPerEvent'] = 500
      ..['maxServiceDistanceKm'] = -1
      ..['operatingDays'] = ['funday'];
    final result = validateProviderOnboardingInput(input);
    expect(result.isValid, isFalse);
    expect(
      result.issues.map((issue) => issue.field),
      containsAll([
        'serviceCategories',
        'minGuestsPerEvent',
        'maxServiceDistanceKm',
        'operatingDays',
      ]),
    );
  });

  test('legacy capacity remains compatible', () {
    final input = validInput()
      ..remove('maxGuestsPerEvent')
      ..remove('locationCoordinates')
      ..remove('maxEventsPerDay')
      ..remove('acceptsMultipleEventsPerDay')
      ..remove('availableStaffCount')
      ..remove('availableEquipmentCount')
      ..remove('serviceCategories')
      ..remove('maxServiceDistanceKm')
      ..remove('minGuestsPerEvent')
      ..remove('operatingDays')
      ..remove('bookingLeadTimeDays')
      ..remove('unavailableDates')
      ..['guestCapacity'] = 250
      ..['eventTypesSupported'] = ['Wedding'];
    final result = validateProviderOnboardingInput(input);
    expect(result.isValid, isTrue);
    expect(result.value!.maxGuestsPerEvent, 250);
    expect(result.value!.maxEventsPerDay, 1);
    expect(result.value!.eventTypesSupported, ['wedding']);
  });

  test('unknown privileged fields and unknown enums fail closed', () {
    final input = validInput()
      ..['providerServiceType'] = 'venue'
      ..['verificationStatus'] = 'approved'
      ..['isActive'] = true;
    final result = validateProviderOnboardingInput(input);
    expect(result.isValid, isFalse);
    expect(
      result.issues.map((issue) => issue.field),
      containsAll(['providerServiceType', 'verificationStatus', 'isActive']),
    );
    expect(tryParseProviderVerificationStatus('verified'), isNull);
    expect(tryParseVerificationDocumentStatus('approved'), isNull);
  });
}
