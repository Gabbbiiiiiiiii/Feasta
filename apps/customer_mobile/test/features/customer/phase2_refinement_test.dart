import 'package:feasta/core/helpers/booking_preparation.dart';
import 'package:feasta/features/customer/location_picker_screen.dart';
import 'package:feasta/features/customer/widgets/booking_preparation_price.dart';
import 'package:feasta/features/customer/manual_address_screen.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
import 'package:feasta/shared/models/event_customization_data.dart';
import 'package:feasta/features/customer/booking_summary_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';

import 'booking_preparation_test.dart' show preparationPackage;
import 'provider_discovery_test.dart' show provider;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
  });

  testWidgets(
    'review shows accurate event content and compact empty optional sections',
    (tester) async {
      final data = EventCustomizationData(
        eventType: 'Wedding',
        eventDate: DateTime(2030, 1, 2),
        eventTime: '2:00 PM',
        eventEndTime: '6:00 PM',
        guestCount: 50,
        eventLocation: 'Ormoc City',
        eventAddress: 'Verified manual venue',
        selectedFoods: ['Rice'],
        selectedDecorations: [],
        selectedFurniture: [],
        selectedAddOns: [],
        willArrangeOwnAddOns: false,
        customerArrangedAddOnsNote: '',
        specialRequest: '',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: BookingSummaryScreen(
            provider: provider(),
            eventPackage: preparationPackage(),
            customization: data,
            preparationOnly: true,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Verified manual venue'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('2:00 PM - 6:00 PM'), findsOneWidget);
      expect(find.text('50'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('No additional services selected'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Selected decorations'), findsNothing);
      expect(find.text('No decoration selections.'), findsNothing);
      expect(find.text('No provider add-ons selected.'), findsNothing);
      expect(find.text('Submit Booking Request'), findsNothing);
      await tester.scrollUntilVisible(
        find.textContaining('Known estimate:'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.text(preparationEstimateText(preparationPackage(), [])),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'service selection, replacement price and unknown add-ons stay distinct',
    (tester) async {
      final package = preparationPackage({
        'price': 5000,
        'serviceOptions': {
          'buffet_setup': {'price': 10000, 'includedServices': <String>[]},
          'full_service': {'price': null, 'includedServices': <String>[]},
        },
      });
      Future<void> show(String? tier, List<Map<String, dynamic>> addons) async {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: BookingPreparationPrice(
                package: package,
                addons: addons,
                serviceTier: tier,
                hasUnconfirmedRequests: true,
              ),
            ),
          ),
        );
      }

      await show(null, []);
      expect(
        find.text('Choose a service to see your estimate'),
        findsOneWidget,
      );
      expect(find.textContaining('Published price unavailable'), findsNothing);
      await show('buffet_setup', []);
      expect(
        preparationEstimate(package, [], serviceTier: 'buffet_setup'),
        10000,
      );
      expect(find.textContaining('Known estimate:'), findsOneWidget);
      expect(find.textContaining('costs unconfirmed'), findsOneWidget);
      await show('buffet_setup', [
        {'name': 'Staff', 'price': 700},
      ]);
      expect(
        preparationEstimate(package, [
          {'price': 700},
        ], serviceTier: 'buffet_setup'),
        10700,
      );
      expect(find.text('Staff'), findsOneWidget);
      await show('buffet_setup', [
        {'name': 'Staff', 'price': null},
      ]);
      expect(find.textContaining('Estimate unavailable'), findsOneWidget);
      expect(find.text('Published price unavailable'), findsOneWidget);
      await show('full_service', []);
      expect(find.textContaining('Estimate unavailable'), findsOneWidget);
      expect(find.text('Choose a service to see your estimate'), findsNothing);
    },
  );

  for (final unavailable in [
    'missing key',
    'native failure',
    'missing plugin',
  ]) {
    testWidgets(
      'unavailable maps ($unavailable) show manual fallback and prevent pin confirmation',
      (tester) async {
        SharedPreferences.setMockInitialValues({});
        const secure = MethodChannel(
          'plugins.it_nomads.com/flutter_secure_storage',
        );
        const maps = MethodChannel('feasta/maps_configuration');
        final messenger =
            TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
        messenger.setMockMethodCallHandler(secure, (_) async => null);
        {
          messenger.setMockMethodCallHandler(maps, (_) async {
            if (unavailable == 'missing plugin') throw MissingPluginException();
            if (unavailable == 'native failure') {
              throw PlatformException(code: 'unavailable');
            }
            return false;
          });
        }
        addTearDown(() {
          messenger.setMockMethodCallHandler(secure, null);
          messenger.setMockMethodCallHandler(maps, null);
        });
        await tester.pumpWidget(
          const MaterialApp(home: LocationPickerScreen()),
        );
        await tester.pumpAndSettle();
        expect(find.byType(GoogleMap), findsNothing);
        expect(find.textContaining('Map unavailable'), findsWidgets);
        expect(find.text('Enter address manually'), findsOneWidget);
        expect(
          tester.widget<ElevatedButton>(find.byType(ElevatedButton)).onPressed,
          isNull,
        );
        await tester.ensureVisible(find.text('Enter address manually'));
        await tester.tap(find.text('Enter address manually'));
        await tester.pumpAndSettle();
        expect(find.text('Add New Address'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }

  for (final changed in [false, true]) {
    testWidgets(
      'manual venue edit preserves coordinates only for unchanged venue ($changed)',
      (tester) async {
        final initial = CustomerAddressModel.defaultOrmoc.copyWith(
          id: 'venue',
          streetName: 'Old Street',
          barangay: 'District 1',
        );
        CustomerAddressModel? saved;
        await tester.pumpWidget(
          MaterialApp(
            home: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () async {
                    saved = await Navigator.push<CustomerAddressModel>(
                      context,
                      MaterialPageRoute(
                        builder: (_) => ManualAddressScreen(
                          initialAddress: initial,
                          preserveAddressId: true,
                        ),
                      ),
                    );
                  },
                  child: const Text('Edit venue'),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Edit venue'));
        await tester.pumpAndSettle();
        if (changed) {
          final street = find.byWidgetPredicate(
            (w) =>
                w is TextField &&
                (w.decoration?.labelText?.startsWith('Street Name') ?? false),
          );
          await tester.enterText(street, 'New Street');
          tester.testTextInput.hide();
          await tester.pumpAndSettle();
        }
        await tester.scrollUntilVisible(
          find.text('Save changes'),
          150,
          scrollable: find.byType(Scrollable).first,
        );
        await Scrollable.ensureVisible(
          tester.element(find.text('Save changes')),
          alignment: 0.5,
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Save changes'));
        await tester.pumpAndSettle();
        expect(saved, isNotNull);
        expect(saved!.hasCoordinates, !changed);
        expect(saved!.streetName, changed ? 'New Street' : 'Old Street');
        expect(saved!.id, 'venue');
      },
    );
  }
}
