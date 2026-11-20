import 'dart:io';
import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:feasta/features/customer/package_details_screen.dart';
import 'package:feasta/features/customer/widgets/package_option_cards.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/customer_event_list_screen.dart';
import 'booking_preparation_flow_test.dart'
    show PreparationRepository, PreparationAuth;
import 'booking_preparation_test.dart' show preparationPackage;
import 'provider_discovery_test.dart' show provider, GuestAuth;
import 'customer_event_list_test.dart' show MemoryEventStorage, EventAuth;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final config = File('.dart_tool/package_config.json').absolute;
    final packages =
        (jsonDecode(await config.readAsString()) as Map)['packages'] as List;
    final flutter = packages.cast<Map>().singleWhere(
      (entry) => entry['name'] == 'flutter',
    );
    final fontRoot = config.uri
        .resolve('${flutter['rootUri']}/')
        .resolve('../../bin/cache/artifacts/material_fonts/');
    for (final entry in {
      'Roboto': 'roboto-regular.ttf',
      'MaterialIcons': 'MaterialIcons-Regular.otf',
    }.entries) {
      final loader = FontLoader(entry.key)
        ..addFont(
          Future.value(
            ByteData.sublistView(
              await File.fromUri(fontRoot.resolve(entry.value)).readAsBytes(),
            ),
          ),
        );
      await loader.load();
    }

    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = PreparationAuth();
  });
  setUp(() {
    GuestAuth.signedIn = true;
  });
  tearDown(() {
    GuestAuth.signedIn = false;
  });
  testWidgets('capacity uses structured fields and preserves legacy values', (
    tester,
  ) async {
    for (final values in [(0, 30, 100), (50, 10, 100), (0, 0, 0)]) {
      final package = preparationPackage({
        'guestCapacity': values.$1,
        'minimumGuests': values.$2,
        'maximumGuests': values.$3,
        'description': 'Suitable for 30-100 guests.',
      });
      await tester.pumpWidget(
        MaterialApp(
          home: PackageDetailsScreen(
            key: UniqueKey(),
            provider: provider(),
            eventPackage: package,
            repository: PreparationRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      if (values.$1 > 0) {
        expect(find.text('${values.$1} guests'), findsOneWidget);
      }
      if (values.$2 > 0) {
        expect(find.text('Minimum: ${values.$2} guests'), findsOneWidget);
      }
      if (values.$3 > 0) {
        expect(find.text('Maximum: ${values.$3} guests'), findsOneWidget);
      }
      expect(
        find.text('Capacity not published'),
        values == (0, 0, 0) ? findsOneWidget : findsNothing,
      );
      expect(tester.takeException(), isNull);
    }
  });
  testWidgets(
    'preserves details and Event List actions at 320px with normal and large text',
    (tester) async {
      for (final scale in [1.0, 2.0]) {
        tester.view.physicalSize = const Size(320, 740);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        // Synthetic fixture: the description must never become capacity data.
        const description =
            'A complete celebration for 30-100 guests. Full published description stays visible.';
        final package = preparationPackage({
          'name': 'Filipino Birthday Feast',
          'price': 450,
          'pricingModel': 'per_pax',
          'guestCapacity': 0,
          'minimumGuests': 0,
          'maximumGuests': 0,
          'description': description,
          'foodInclusions': ['Main: Chicken', 'Main: Fish', 'Main: Chicken'],
          'foodChoiceGroups': [
            {
              'id': 'first',
              'title': 'First category',
              'selectionCount': 1,
              'options': [
                {'id': 'a', 'name': 'Dish A'},
                {'id': 'c', 'name': 'Dish C'},
              ],
            },
            {
              'id': 'second',
              'title': 'Second category',
              'selectionCount': 1,
              'options': [
                {'id': 'b', 'name': 'Dish B'},
                {'id': 'd', 'name': 'Dish D'},
              ],
            },
          ],
          'serviceOptions': {
            'buffet_setup': {
              'title': 'Buffet Setup',
              'price': 450,
              'includedServices': ['Buffet equipment'],
            },
            'full_service': {
              'title': 'Full-Service Catering',
              'price': 650,
              'includedServices': ['Staff and cleanup'],
            },
          },
        });
        final repo = PreparationRepository()..current = package;
        final auth = EventAuth();
        final controller = EventListController(
          store: EventListStore(storage: MemoryEventStorage()),
          authentication: auth,
        );
        addTearDown(controller.dispose);
        addTearDown(auth.dispose);
        await tester.pumpWidget(
          EventListScope(
            controller: controller,
            child: MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
              home: PackageDetailsScreen(
                provider: provider(),
                eventPackage: package,
                repository: repo,
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        Future<void> reveal(Finder finder) async {
          await tester.scrollUntilVisible(
            finder,
            110,
            scrollable: find.byType(Scrollable).first,
            maxScrolls: 150,
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }

        expect(find.text('Select Package').hitTestable(), findsOneWidget);
        expect(
          find.byKey(const ValueKey('package-details-hero')),
          findsOneWidget,
        );
        await reveal(find.text('Filipino Birthday Feast'));
        await reveal(find.text('Capacity not published'));
        await reveal(
          find.text(
            'You pay the full amount after the provider accepts your request.',
          ),
        );
        await reveal(find.text('Add to List'));
        await tester.tap(find.text('Add to List'));
        await tester.pumpAndSettle();
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 30)),
        );
        await tester.pumpAndSettle();
        expect(controller.list?.entries, isNotEmpty);
        expect(
          controller.list!.entries.single.packageName,
          'Filipino Birthday Feast',
        );
        await reveal(
          find.text(
            'Planning selection only. No reservation or availability guarantee.',
          ),
        );
        await reveal(find.text('Buffet Setup'));
        expect(
          tester
              .widget<ServiceOptionCards>(find.byType(ServiceOptionCards))
              .readOnly,
          isTrue,
        );
        await tester.tap(find.text('Buffet Setup'));
        await tester.pumpAndSettle();
        expect(find.text('Selected'), findsNothing);
        await reveal(find.text('Buffet equipment'));
        await reveal(find.text('Full-Service Catering'));
        await reveal(find.text('Staff and cleanup'));
        expect(find.textContaining('650'), findsWidgets);
        await reveal(find.text(description));
        await reveal(find.text('Food Inclusions'));
        expect(find.text('Main: Chicken'), findsNWidgets(2));
        expect(find.text('Main: Fish'), findsOneWidget);
        for (final title in [
          'Decoration & Setup',
          'Tables & Chairs',
          'Service Inclusions',
        ]) {
          await reveal(find.text(title));
        }
        await reveal(find.text('Dish A, Dish C'));
        await reveal(find.text('Dish B, Dish D'));
        expect(find.text('Select Package').hitTestable(), findsOneWidget);
        await tester.scrollUntilVisible(
          find.text('View Event List'),
          -140,
          scrollable: find.byType(Scrollable).first,
          maxScrolls: 150,
        );
        await Scrollable.ensureVisible(
          tester.element(find.text('View Event List')),
          alignment: 0.5,
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('View Event List'));
        await tester.pumpAndSettle();
        expect(find.byType(CustomerEventListScreen), findsOneWidget);
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(find.byType(PackageDetailsScreen), findsOneWidget);
        expect(repo.unexpected, isEmpty);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      }
    },
  );
}
