import 'package:feasta/core/security/runtime_security.dart';
import 'package:feasta/core/config/firebase_emulator_config.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/core/helpers/booking_preparation.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:feasta/shared/models/event_customization_data.dart';
import 'package:feasta/shared/models/booking_contract.dart';

PackageModel package(String model) => PackageModel.fromMap('package_v2_demo', {
  'providerId': 'provider_demo',
  'name': 'V2',
  'description': 'Demo package',
  'eventType': 'birthday',
  'sharedContractVersion': 2,
  'revision': 2,
  'occasionScope': 'all',
  'occasionMatchIds': ['birthday', 'wedding'],
  'pricingModel': model,
  'price': 100.25,
  'minimumGuests': 10,
  'maximumGuests': 50,
  'status': 'published',
  'isActive': true,
  'isPublished': true,
  'providerPubliclyVisible': true,
  'isDeleted': false,
  'decorInclusions': ['Shared flowers'],
  'furnitureInclusions': [],
  'serviceOptions': {
    'drop_off': {
      'price': 100.25,
      'includedServices': ['Delivery'],
      'decorInclusions': ['Tier flowers'],
      'equipmentInclusions': ['Warmer'],
    },
  },
});
EventCustomizationData selection({
  int? revision = 2,
  int guests = 20,
  String occasion = 'wedding',
}) => EventCustomizationData(
  sharedContractVersion: 2,
  expectedPackageRevision: revision,
  eventType: occasion,
  eventDate: DateTime(2099, 2, 15),
  eventTime: '10:00',
  eventEndTime: '14:00',
  guestCount: guests,
  eventLocation: 'Ormoc City',
  eventAddress: '123 Street',
  selectedFoods: [],
  selectedDecorations: [],
  selectedFurniture: [],
  selectedAddOns: [],
  willArrangeOwnAddOns: false,
  customerArrangedAddOnsNote: '',
  specialRequest: '',
  serviceTier: 'drop_off',
);
void main() {
  test('demo Firebase override is explicit and debug/emulator-only', () {
    expect(
      FirebaseEmulatorConfig.debugDemoOptions(
        projectId: '',
        useEmulators: false,
        isDebugMode: false,
      ),
      isNull,
    );
    final options = FirebaseEmulatorConfig.debugDemoOptions(
      projectId: 'demo-feasta-stage-e',
      useEmulators: true,
      isDebugMode: true,
    )!;
    expect(options.projectId, 'demo-feasta-stage-e');
    expect(options.apiKey, 'demo-only');
    RuntimeSecurity.validateFirebaseProject(
      projectId: options.projectId,
      isReleaseMode: false,
      expectedDemoProjectId: options.projectId,
    );
    expect(
      () => RuntimeSecurity.validateFirebaseProject(
        projectId: 'feasta-catering-system',
        isReleaseMode: false,
        expectedDemoProjectId: options.projectId,
      ),
      throwsStateError,
    );
    expect(
      () => RuntimeSecurity.validateFirebaseProject(
        projectId: options.projectId,
        isReleaseMode: true,
        expectedDemoProjectId: options.projectId,
      ),
      throwsStateError,
    );

    for (final flags in [(false, true), (true, false)]) {
      expect(
        () => FirebaseEmulatorConfig.debugDemoOptions(
          projectId: 'demo-feasta-stage-e',
          useEmulators: flags.$1,
          isDebugMode: flags.$2,
        ),
        throwsStateError,
      );
    }
    expect(
      () => FirebaseEmulatorConfig.debugDemoOptions(
        projectId: 'feasta-catering-system',
        useEmulators: true,
        isDebugMode: true,
      ),
      throwsStateError,
    );
  });
  test('production/default Mobile queries retain the legacy scalar path', () {
    expect(FirebaseEmulatorConfig.v2DiscoveryEnabled, isFalse);
    expect(FirebaseEmulatorConfig.authPort, 9099);
    expect(FirebaseEmulatorConfig.firestorePort, 8080);
    expect(FirebaseEmulatorConfig.functionsPort, 5001);
    expect(FirebaseEmulatorConfig.storagePort, 9199);
  });
  test('V2 metadata, Fits All and tier inclusions survive parsing', () {
    final p = package('per_pax');
    expect(p.revision, 2);
    expect(p.occasionDisplayLabel, 'Fits All');
    expect(p.occasionMatchIds, ['birthday', 'wedding']);
    expect(preparationInclusions(p, 'decorInclusions', 'drop_off'), [
      'Shared flowers',
      'Tier flowers',
    ]);
    expect(preparationInclusions(p, 'equipmentInclusions', 'drop_off'), [
      'Warmer',
    ]);
    expect(preparationInclusions(p, 'decorInclusions', 'full_service'), [
      'Shared flowers',
    ]);
  });
  test('per-pax and fixed bundle estimates use selected tier and guests', () {
    expect(
      preparationEstimate(
        package('per_pax'),
        [],
        serviceTier: 'drop_off',
        guests: 20,
      ),
      2005,
    );
    expect(
      preparationEstimate(
        package('per_bundle'),
        [],
        serviceTier: 'drop_off',
        guests: 20,
      ),
      100.25,
    );
    expect(
      preparationEstimate(
        package('per_pax'),
        [],
        serviceTier: 'drop_off',
        guests: 9,
      ),
      isNull,
    );
    expect(
      preparationEstimate(package('per_pax'), [], serviceTier: 'drop_off'),
      isNull,
    );
  });
  test(
    'V2 booking persists revision and canonical dynamic occasion without prices',
    () {
      final json = BookingSelection(
        providerId: 'provider_demo',
        packageId: 'package_v2_demo',
        customization: selection(occasion: 'company_party'),
      ).toJson(clientRequestId: 'request_demo_123');
      expect(json['sharedContractVersion'], 2);
      expect(json['expectedPackageRevision'], 2);
      expect(json['eventType'], 'company_party');
      expect(json.containsKey('price'), false);
      expect(json.containsKey('pricingModel'), false);
      expect(
        () => BookingSelection(
          providerId: 'provider_demo',
          packageId: 'package_v2_demo',
          customization: selection(revision: null),
        ).toJson(clientRequestId: 'request_demo_123'),
        throwsFormatException,
      );
    },
  );
  test(
    'immutable customization snapshot retains V2 revision and guest validation',
    () {
      final s = snapshotCustomization(selection());
      expect(s.expectedPackageRevision, 2);
      expect(s.sharedContractVersion, 2);
      expect(
        () => BookingSelection(
          providerId: 'provider_demo',
          packageId: 'package_v2_demo',
          customization: selection(guests: 0),
        ).toJson(clientRequestId: 'request_demo_123'),
        throwsFormatException,
      );
    },
  );
}
