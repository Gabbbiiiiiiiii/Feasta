import 'package:feasta/features/customer/booking_refund_policy_review_screen.dart';
import 'package:flutter/services.dart';
import 'package:feasta/features/customer/booking_agreement_review_screen.dart';
// ignore: depend_on_referenced_packages, implementation_imports
import 'package:cloud_firestore_platform_interface/src/pigeon/messages.pigeon.dart'
    as firestore_host;
// ignore: depend_on_referenced_packages, implementation_imports
import 'package:cloud_functions_platform_interface/src/pigeon/messages.pigeon.dart'
    as functions_host;
import 'package:feasta/features/customer/availability_check_screen.dart';
import 'package:feasta/shared/models/event_customization_data.dart';
import 'package:feasta/features/customer/widgets/package_option_cards.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:feasta/core/helpers/booking_preparation.dart';
import 'package:feasta/features/authentication/data/repositories/feasta_repository.dart';
import 'package:feasta/features/customer/package_details_screen.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';
import 'package:feasta/features/customer/booking_summary_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feasta/features/customer/manual_address_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'provider_discovery_test.dart' show provider, GuestAuth, SignedUser;
import 'booking_preparation_test.dart' show preparationPackage;

// Firestore's production codec writes FieldPath for native code but does not
// decode it in Dart. Supply the native-side decoding needed by this test mock.
class AvailabilityQueryCodec extends firestore_host.PigeonCodec {
  const AvailabilityQueryCodec();
  @override
  Object? readValueOfType(int type, ReadBuffer buffer) {
    if (type == 192) {
      return List.generate(readSize(buffer), (_) => readValue(buffer));
    }
    return super.readValueOfType(type, buffer);
  }
}

class PreparationUser extends SignedUser {
  @override
  String get uid => 'customer-1';
}

class PreparationAuth extends GuestAuth {
  @override
  UserPlatform? get currentUser =>
      GuestAuth.signedIn ? PreparationUser() : null;
  @override
  Stream<UserPlatform?> authStateChanges() => Stream.value(currentUser);
}

class PreparationRepository implements FeastaRepository {
  PackageModel? current = preparationPackage();
  bool fail = false;
  List<AddonModel> addons = [];
  @override
  Future<AddonModel?> getEligiblePreparationAddon(String id) async {
    final matching = addons.where(
      (addon) => addon.id == id && addon.isActive && addon.isAvailable,
    );
    return matching.isEmpty ? null : matching.first;
  }

  int validations = 0;
  final List<String> unexpected = [];
  @override
  Future<PackageModel?> getEligiblePackageForPreparation(
    String provider,
    String package,
  ) async {
    validations++;
    if (fail) throw StateError('offline');
    final value = current;
    return value != null &&
            value.id == package &&
            eligiblePreparationPackage(value, provider)
        ? value
        : null;
  }

  @override
  Stream<QuerySnapshot<Map<String, dynamic>>> myFavorites() =>
      const Stream.empty();
  @override
  Stream<List<AddonModel>> addonsByProvider(String provider) =>
      Stream.value(addons);
  @override
  dynamic noSuchMethod(Invocation call) {
    unexpected.add(call.memberName.toString());
    throw StateError('Unexpected operation ${call.memberName}');
  }
}

void seedDraft() {
  preparationDraftMemory.open('customer-1', 'caterer-1', 'package-1');
  preparationDraftMemory.save('customer-1', 'caterer-1', 'package-1', {
    'date': DateTime.now().add(const Duration(days: 30)),
    'start': const TimeOfDay(hour: 14, minute: 0),
    'end': const TimeOfDay(hour: 18, minute: 0),
    'type': 'Wedding',
    'guests': 50,
    'city': 'Ormoc City',
    'address': 'Main Street, District 1',
    'notes': 'No peanuts',
    'ownNotes': '',
    'foods': ['Rice', 'Fish'],
    'decorations': ['Flowers'],
    'furniture': ['Tables'],
    'addons': <Map<String, dynamic>>[],
    'own': false,
    'tier': null,
    'theme': null,
  });
}

void phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> openStep(WidgetTester tester, String label) async {
  tester
      .state<ScrollableState>(find.byType(Scrollable).first)
      .position
      .jumpTo(0);
  await tester.pumpAndSettle();
  await tester.scrollUntilVisible(
    find.byType(CustomizationProgress),
    100,
    scrollable: find.byType(Scrollable).first,
  );
  final target = int.parse(label[0]) - 1;
  var current = tester
      .widget<CustomizationProgress>(find.byType(CustomizationProgress))
      .step;
  while (current != target) {
    await tester.tap(find.text(current > target ? 'Back' : 'Continue'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byType(CustomizationProgress),
      100,
      scrollable: find.byType(Scrollable).first,
    );
    final next = tester
        .widget<CustomizationProgress>(find.byType(CustomizationProgress))
        .step;
    expect(
      next,
      isNot(current),
      reason: 'Step must pass validation before continuing',
    );
    current = next;
  }
}

EventCustomizationData reviewData() => EventCustomizationData(
  eventType: 'wedding',
  eventDate: DateTime(2030, 1, 2),
  eventTime: '14:00',
  eventEndTime: '18:00',
  guestCount: 50,
  eventLocation: 'Ormoc City',
  eventAddress: 'Main Street',
  selectedFoods: ['Rice'],
  selectedDecorations: ['Flowers'],
  selectedFurniture: ['Tables'],
  selectedAddOns: [],
  willArrangeOwnAddOns: false,
  customerArrangedAddOnsNote: '',
  specialRequest: 'No peanuts',
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  const callableChannel = BasicMessageChannel<Object?>(
    'dev.flutter.pigeon.cloud_functions_platform_interface.CloudFunctionsHostApi.call',
    functions_host.CloudFunctionsHostApi.pigeonChannelCodec,
  );
  const queryChannel = BasicMessageChannel<Object?>(
    'dev.flutter.pigeon.cloud_firestore_platform_interface.FirebaseFirestoreHostApi.queryGet',
    AvailabilityQueryCodec(),
  );
  final callableNames = <String>[];
  setUp(() {
    callableNames.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockDecodedMessageHandler<Object?>(callableChannel, (
          message,
        ) async {
          final arguments = (message as List).single as Map;
          callableNames.add(arguments['functionName'] as String);
          // Fail closed: no callable ever reaches a native Firebase plugin.
          return [
            'unavailable',
            'Blocked by preparation regression test',
            null,
          ];
        });
    GuestAuth.signedIn = true;
    preparationDraftMemory.clear();
    SharedPreferences.setMockInitialValues({});
  });
  tearDown(() {
    expect(callableNames, isNot(contains('submitBookingRequest')));
    expect(callableNames, isNot(contains('createPaymentSession')));
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockDecodedMessageHandler<Object?>(callableChannel, null)
      ..setMockDecodedMessageHandler<Object?>(queryChannel, null);
    GuestAuth.signedIn = false;
    preparationDraftMemory.clear();
  });
  testWidgets(
    'omitted preparationOnly defaults to safe review without submission',
    (tester) async {
      phone(tester);
      final screen = BookingSummaryScreen(
        provider: provider(),
        eventPackage: preparationPackage(),
        customization: reviewData(),
      );
      expect(screen.preparationOnly, isTrue);
      await tester.pumpWidget(MaterialApp(home: screen));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Preparation only. Availability is unverified. No booking has been sent.',
        ),
        findsOneWidget,
      );
      expect(find.text('Submit Booking Request'), findsNothing);
      expect(find.text('Edit event details and selections'), findsOneWidget);
      expect(callableNames, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'older availability navigation inherits preparation-only default',
    (tester) async {
      phone(tester);
      var availabilityReads = 0;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockDecodedMessageHandler<Object?>(queryChannel, (message) async {
            expect((message as List)[1], 'mainEvents');
            availabilityReads++;
            return [
              firestore_host.InternalQuerySnapshot(
                documents: [],
                documentChanges: [],
                metadata: firestore_host.InternalSnapshotMetadata(
                  hasPendingWrites: false,
                  isFromCache: false,
                ),
              ),
            ];
          });
      await tester.pumpWidget(
        MaterialApp(
          home: AvailabilityCheckScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            customization: reviewData(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        availabilityReads,
        1,
        reason: tester
            .widgetList<Text>(find.byType(Text))
            .map((w) => w.data)
            .join(' | '),
      );
      expect(find.text('Available'), findsOneWidget);
      await tester.tap(find.text('Continue to Booking Summary'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<BookingSummaryScreen>(find.byType(BookingSummaryScreen))
            .preparationOnly,
        isTrue,
      );
      expect(find.text('Submit Booking Request'), findsNothing);
      await tester.tap(find.text('Edit event details and selections'));
      await tester.pumpAndSettle();
      expect(find.byType(AvailabilityCheckScreen), findsOneWidget);
      expect(callableNames, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'preparation review opens only disclosure callable and keeps submission disabled',
    (tester) async {
      phone(tester);
      seedDraft();
      final repo = PreparationRepository();
      await tester.pumpWidget(
        MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await openStep(tester, '3 Services');
      await tester.tap(find.text('Review Event'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<BookingSummaryScreen>(find.byType(BookingSummaryScreen))
            .preparationOnly,
        isTrue,
      );
      final link = find.text('Review Booking & Payment Agreements');
      await tester.scrollUntilVisible(
        link,
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(link);
      await tester.pumpAndSettle();
      expect(find.byType(BookingAgreementReviewScreen), findsOneWidget);
      expect(callableNames, ['getBookingPaymentAgreementDisclosures']);
      expect(find.text('Submit Booking Request'), findsNothing);
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(find.text('Reload current agreements'), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNothing);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(BookingSummaryScreen), findsOneWidget);
      final refundLink = find.text('Review Refund Policies');
      await tester.scrollUntilVisible(
        refundLink,
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(refundLink);
      await tester.pumpAndSettle();
      expect(find.byType(BookingRefundPolicyReviewScreen), findsOneWidget);
      expect(callableNames, [
        'getBookingPaymentAgreementDisclosures',
        'getBookingRefundPolicyDisclosures',
      ]);
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(find.text('Reload current refund policies'), findsOneWidget);
      expect(find.text('Submit Booking Request'), findsNothing);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(BookingSummaryScreen), findsOneWidget);
      expect(repo.unexpected, isEmpty);
    },
  );
  for (final image in [null, 'https://invalid.example/missing-package.jpg']) {
    testWidgets('missing or failed package image keeps hero compact ($image)', (
      tester,
    ) async {
      final package = preparationPackage({
        'imageUrl': image,
        'imageUrls': <String>[],
      });
      await tester.pumpWidget(
        MaterialApp(
          home: PackageDetailsScreen(
            provider: provider(),
            eventPackage: package,
            repository: PreparationRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester
            .getSize(find.byKey(const ValueKey('package-details-hero')))
            .height,
        112,
      );
      expect(find.text('Select Package'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
    'Continue and Back retain draft fields; keyboard hides sticky footer',
    (tester) async {
      phone(tester);
      seedDraft();
      final repo = PreparationRepository();
      await tester.pumpWidget(
        MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('Step 1 of 4'), findsOneWidget);
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Step 2 of 4'), findsOneWidget);
      await tester.tap(find.text('Back'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Full event address'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Main Street, District 1'), findsOneWidget);
      final address = find.byWidgetPredicate(
        (w) =>
            w is TextField && w.controller?.text == 'Main Street, District 1',
      );
      await tester.enterText(address, 'Edited venue');
      tester.view.viewInsets = const FakeViewPadding(bottom: 300);
      await tester.pumpAndSettle();
      expect(find.text('Continue'), findsNothing);
      tester.view.viewInsets = FakeViewPadding.zero;
      tester.testTextInput.hide();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Back'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Full event address'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Edited venue'), findsOneWidget);
      expect(repo.unexpected, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'Select Package opens existing customization and preparation-only review; edits persist',
    (tester) async {
      phone(tester);
      seedDraft();
      final repo = PreparationRepository();
      await tester.pumpWidget(
        MaterialApp(
          home: PackageDetailsScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Select Package'), findsOneWidget);
      await tester.tap(find.text('Select Package'));
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsOneWidget);
      await openStep(tester, '1 Details');
      await tester.scrollUntilVisible(
        find.text('Full event address'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Main Street, District 1'), findsOneWidget);
      await openStep(tester, '3 Services');
      await tester.tap(find.text('Review Event'));
      await tester.pumpAndSettle();
      expect(find.byType(BookingSummaryScreen), findsOneWidget);
      expect(
        tester
            .widget<BookingSummaryScreen>(find.byType(BookingSummaryScreen))
            .preparationOnly,
        isTrue,
      );
      expect(find.text('Submit Booking Request'), findsNothing);
      expect(find.text('Edit event details and selections'), findsOneWidget);
      await tester.tap(find.text('Edit event details and selections'));
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Select Package'));
      await tester.pumpAndSettle();
      await openStep(tester, '1 Details');
      await tester.scrollUntilVisible(
        find.text('Full event address'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Main Street, District 1'), findsOneWidget);
      expect(repo.validations, 3);
      expect(repo.unexpected, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'unpublished and offline selection keep the customer on package details',
    (tester) async {
      final repo = PreparationRepository()..current = null;
      await tester.pumpWidget(
        MaterialApp(
          home: PackageDetailsScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Select Package'));
      await tester.pumpAndSettle();
      expect(find.byType(EventCustomizationScreen), findsNothing);
      expect(find.textContaining('no longer available'), findsWidgets);
      repo.fail = true;
      await tester.tap(find.text('Select Package'));
      await tester.pumpAndSettle();
      expect(find.textContaining('could not verify'), findsWidgets);
      expect(repo.unexpected, isEmpty);
    },
  );
  testWidgets(
    'package withdrawn before review is rejected without submitting',
    (tester) async {
      seedDraft();
      final repo = PreparationRepository()..current = null;
      await tester.pumpWidget(
        MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await openStep(tester, '3 Services');
      await tester.tap(find.text('Review Event'));
      await tester.pumpAndSettle();
      expect(find.byType(BookingSummaryScreen), findsNothing);
      expect(find.textContaining('no longer available'), findsWidgets);
      expect(repo.unexpected, isEmpty);
    },
  );
  testWidgets(
    'guest package inspection retains login boundary without drafting or writes',
    (tester) async {
      GuestAuth.signedIn = false;
      final repo = PreparationRepository();
      await tester.pumpWidget(
        MaterialApp(
          home: PackageDetailsScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Select Package'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Please log in or create an account to customize your event and continue booking.',
        ),
        findsOneWidget,
      );
      expect(find.byType(EventCustomizationScreen), findsNothing);
      expect(repo.validations, 0);
      expect(repo.unexpected, isEmpty);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(seconds: 11));
      }
    },
  );
  testWidgets(
    'food and add-on selections use current published prices in review',
    (tester) async {
      seedDraft();
      AddonModel addon(double price) => AddonModel(
        id: 'staff',
        providerId: 'caterer-1',
        name: 'Extra staff',
        description: 'Service staff',
        category: 'staff',
        price: price,
        isAvailable: true,
        isActive: true,
        providerBusinessName: 'Ana Catering',
        providerType: 'catering_provider',
      );
      final repo = PreparationRepository()..addons = [addon(500)];
      await tester.pumpWidget(
        MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await openStep(tester, '2 Package');
      await tester.scrollUntilVisible(
        find.text('Fish'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Fish'));
      await tester.pumpAndSettle();
      await openStep(tester, '3 Services');
      await tester.scrollUntilVisible(
        find.text('Extra staff'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Extra staff'));
      await tester.pumpAndSettle();
      repo.addons = [addon(900)];
      await openStep(tester, '3 Services');
      await tester.tap(find.text('Review Event'));
      await tester.pumpAndSettle();
      final review = tester.widget<BookingSummaryScreen>(
        find.byType(BookingSummaryScreen),
      );
      expect(review.customization.selectedFoods, ['Rice']);
      expect(review.customization.selectedAddOns.single['price'], 900);
      expect(
        preparationEstimate(
          review.eventPackage,
          review.customization.selectedAddOns,
        ),
        12900,
      );
      expect(find.text('Submit Booking Request'), findsNothing);
      expect(repo.unexpected, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('manual address route returns address to the draft without maps', (
    tester,
  ) async {
    seedDraft();
    final repo = PreparationRepository();
    await tester.pumpWidget(
      MaterialApp(
        home: EventCustomizationScreen(
          provider: provider(),
          eventPackage: preparationPackage(),
          repository: repo,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Enter address manually'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Enter address manually'));
    await tester.pumpAndSettle();
    expect(find.byType(ManualAddressScreen), findsOneWidget);
    // Use the existing form and its real validators, including its Ormoc defaults.
    final street = find.byWidgetPredicate(
      (w) =>
          w is TextField &&
          (w.decoration?.labelText?.startsWith('Street Name') ?? false),
    );
    final barangay = find.byWidgetPredicate(
      (w) =>
          w is TextField &&
          (w.decoration?.labelText?.startsWith('Barangay') ?? false),
    );
    await tester.enterText(street, 'New Street');
    await tester.enterText(barangay, 'District 2');
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Save address'),
      150,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save address'));
    await tester.pumpAndSettle();
    expect(find.byType(ManualAddressScreen), findsNothing);
    expect(find.textContaining('New Street'), findsWidgets);
    expect(repo.unexpected, isEmpty);
    expect(tester.takeException(), isNull);
  });
  testWidgets('new package choices reconcile stale selections before review', (
    tester,
  ) async {
    seedDraft();
    final repo = PreparationRepository()
      ..current = preparationPackage({
        'foodInclusions': ['Rice'],
      });
    await tester.pumpWidget(
      MaterialApp(
        home: EventCustomizationScreen(
          provider: provider(),
          eventPackage: preparationPackage(),
          repository: repo,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await openStep(tester, '3 Services');
    await tester.tap(find.text('Review Event'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Package options changed'), findsOneWidget);
    expect(find.byType(BookingSummaryScreen), findsNothing);
    await openStep(tester, '3 Services');
    await tester.tap(find.text('Review Event'));
    await tester.pumpAndSettle();
    final review = tester.widget<BookingSummaryScreen>(
      find.byType(BookingSummaryScreen),
    );
    expect(review.customization.selectedFoods, ['Rice']);
    expect(repo.unexpected, isEmpty);
  });
  testWidgets('invalid typed guest count is rejected before review', (
    tester,
  ) async {
    seedDraft();
    final repo = PreparationRepository();
    await tester.pumpWidget(
      MaterialApp(
        home: EventCustomizationScreen(
          provider: provider(),
          eventPackage: preparationPackage(),
          repository: repo,
        ),
      ),
    );
    await tester.pumpAndSettle();
    final guests = find.byWidgetPredicate(
      (w) => w is TextField && w.decoration?.labelText == 'Guests',
    );
    await tester.scrollUntilVisible(
      guests,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.enterText(guests, '0');
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Guest count is outside'), findsOneWidget);
    expect(find.byType(BookingSummaryScreen), findsNothing);
    expect(repo.unexpected, isEmpty);
  });
  testWidgets(
    'published catering service and theme selections are preserved in review',
    (tester) async {
      seedDraft();
      final package = preparationPackage({
        'serviceOptions': {
          'full_service': {
            'price': 15000,
            'includedServices': ['Staffed buffet'],
          },
        },
        'themeOptions': [
          {'id': 'garden', 'name': 'Garden'},
        ],
      });
      final repo = PreparationRepository()..current = package;
      await tester.pumpWidget(
        MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: package,
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await openStep(tester, '2 Package');
      await tester.tap(find.text('Full-Service Catering').first);
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Garden'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await Scrollable.ensureVisible(
        tester.element(find.text('Garden')),
        alignment: 0.3,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Garden'));
      await tester.pumpAndSettle();
      await openStep(tester, '3 Services');
      await tester.tap(find.text('Review Event'));
      await tester.pumpAndSettle();
      final review = tester.widget<BookingSummaryScreen>(
        find.byType(BookingSummaryScreen),
      );
      expect(review.customization.serviceTier, 'full_service');
      expect(review.customization.packageThemeId, 'garden');
      expect(
        preparationEstimate(
          review.eventPackage,
          [],
          serviceTier: review.customization.serviceTier,
        ),
        15000,
      );
      expect(repo.unexpected, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'review stays readable at enlarged text and never offers submission for unknown pricing',
    (tester) async {
      phone(tester);
      seedDraft();
      final package = preparationPackage({'price': null});
      final repo = PreparationRepository()..current = package;
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: package,
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await openStep(tester, '3 Services');
      await tester.tap(find.text('Review Event'));
      await tester.pumpAndSettle();
      expect(find.byType(BookingSummaryScreen), findsOneWidget);
      await tester.scrollUntilVisible(
        find.textContaining('Estimate unavailable'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(find.text('Submit Booking Request'), findsNothing);
      expect(find.text('Edit event details and selections'), findsOneWidget);
      expect(repo.unexpected, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  for (final scale in [1.0, 1.3, 2.0]) {
    testWidgets(
      'unknown pricing, capacity and responsive preparation at $scale',
      (tester) async {
        phone(tester);
        seedDraft();
        final repo = PreparationRepository();
        await tester.pumpWidget(
          MaterialApp(
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(
                context,
              ).copyWith(textScaler: TextScaler.linear(scale)),
              child: child!,
            ),
            home: EventCustomizationScreen(
              provider: provider(
                category: 'photographer',
                serviceType: 'addon',
              ),
              eventPackage: preparationPackage({
                'price': null,
                'maximumGuests': null,
                'guestCapacity': null,
                'foodInclusions': [],
                'decorInclusions': [],
                'furnitureInclusions': [],
              }),
              repository: repo,
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.textContaining('Estimate unavailable'),
          150,
          scrollable: find.byType(Scrollable).first,
        );
        expect(find.textContaining('Estimate unavailable'), findsOneWidget);
        expect(find.text('Food choices'), findsNothing);
        await openStep(tester, '3 Services');
        await tester.scrollUntilVisible(
          find.text('Special request'),
          200,
          scrollable: find.byType(Scrollable).first,
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      },
    );
  }
}
