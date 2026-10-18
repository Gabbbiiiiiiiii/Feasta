import 'dart:async';
import 'package:feasta/features/customer/customer_home_screen.dart';
import 'package:feasta/features/customer/customer_main_screen.dart';
import 'package:feasta/features/customer/customer_provider_collection_screen.dart';
import 'package:feasta/features/customer/widgets/provider_brand_visual.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'provider_discovery_test.dart' show provider, GuestAuth;

Widget explore(Stream<List<ProviderModel>> stream, {VoidCallback? onBack}) =>
    CustomerProviderCollectionScreen(
      title: 'Explore Providers',
      subtitle: 'Public event services',
      stream: stream,
      serviceCategoryNames: Future.value({
        'catering_service': 'Catering',
        'venue_provider': 'Venue',
      }),
      onBack: onBack,
    );

void phone(WidgetTester tester) {
  // C55 1080 x 2400 physical pixels at a representative 3x logical scale.
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetViewInsets);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = GuestAuth();
  });
  setUp(
    () => SharedPreferences.setMockInitialValues({
      'device_permission_location_asked': true,
      'device_permission_notification_asked': true,
    }),
  );

  testWidgets(
    'C55 two columns, long text, real separate images and balanced missing ratings',
    (tester) async {
      phone(tester);
      final longName = 'A very long provider business name for celebrations';
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.3)),
            child: child!,
          ),
          home: explore(
            Stream.value([
              provider(
                id: 'a',
                name: longName,
                location:
                    'A very long street address and district in Ormoc City',
                cover: 'https://example.com/cover.jpg',
                logo: 'https://example.com/logo.png',
                rating: 4.8,
                reviews: 12,
              ),
              provider(id: 'b', name: 'Second', price: 0),
            ]),
          ),
        ),
      );
      await tester.pump();
      final a = find.byKey(const ValueKey('provider-a'));
      final b = find.byKey(const ValueKey('provider-b'));
      expect(tester.getTopLeft(a).dy, tester.getTopLeft(b).dy);
      expect(tester.getTopLeft(a).dx, lessThan(tester.getTopLeft(b).dx));
      expect(tester.getSize(a), tester.getSize(b));
      final images = tester.widgetList<Image>(find.byType(Image)).toList();
      expect(images.map((i) => (i.image as NetworkImage).url), [
        'https://example.com/cover.jpg',
        'https://example.com/logo.png',
      ]);
      expect(images.first.fit, BoxFit.cover);
      expect(images.last.fit, BoxFit.contain);
      expect(find.text('4.8 (12)'), findsOneWidget);
      expect(find.byIcon(Icons.star_rounded), findsOneWidget);
      expect(
        tester.widget<Text>(find.text(longName)).overflow,
        TextOverflow.ellipsis,
      );
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.storefront_outlined), findsNWidgets(4));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'Guest single-letter live relevance combines filters and preserves one subscription',
    (tester) async {
      phone(tester);
      var subscriptions = 0;
      final stream = Stream<List<ProviderModel>>.multi((controller) {
        subscriptions++;
        controller.add([
          provider(name: 'Classic Events', id: 'classic'),
          provider(name: 'SB', id: 'sb'),
          provider(name: 'The Studio', id: 'studio'),
          provider(name: 'Secret', id: 'private', visible: false),
          provider(
            name: 'Studio Venue',
            id: 'venue',
            category: 'venue_provider',
          ),
          provider(name: 'Studio Expensive', id: 'expensive', price: 30000),
        ]);
      });
      await tester.pumpWidget(MaterialApp(home: explore(stream)));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 's');
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('SB')).dy,
        lessThanOrEqualTo(tester.getTopLeft(find.text('The Studio')).dy),
      );
      await tester.tap(find.byTooltip('Filter providers'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<String>).first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Catering').last);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Max budget'),
        '20000',
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Filter providers'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('provider-venue')), findsNothing);
      expect(find.byKey(const ValueKey('provider-expensive')), findsNothing);
      expect(find.byKey(const ValueKey('provider-private')), findsNothing);
      final positions = ['sb', 'studio', 'classic']
          .map((id) => tester.getTopLeft(find.byKey(ValueKey('provider-$id'))))
          .toList();
      expect(positions[0].dy, positions[1].dy);
      expect(positions[0].dx, lessThan(positions[1].dx));
      expect(positions[2].dy, greaterThan(positions[1].dy));
      await tester.enterText(find.byType(TextField).first, 'z');
      await tester.pumpAndSettle();
      expect(find.byType(ProviderBrandVisual), findsNothing);
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('provider-sb')), findsOneWidget);
      expect(find.byKey(const ValueKey('provider-venue')), findsNothing);
      expect(find.byKey(const ValueKey('provider-expensive')), findsNothing);
      expect(subscriptions, 1);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'shared navigation hides for keyboard, restores and handles back',
    (tester) async {
      phone(tester);
      await tester.pumpWidget(const MaterialApp(home: CustomerMainScreen()));
      await tester.pump(const Duration(milliseconds: 200));
      final home = tester.widget<CustomerHomeScreen>(
        find.byType(CustomerHomeScreen),
      );
      home.onExploreProviders!(
        explore(
          Stream.value(
            List.generate(30, (i) => provider(id: '$i', name: 'Provider $i')),
          ),
          onBack: home.onCloseExplore,
        ),
      );
      await tester.pumpAndSettle();
      final nav = find.text('Home');
      final bottom = tester.getBottomLeft(nav).dy;
      expect(find.text('Messages'), findsOneWidget);
      expect(find.text('Bookings'), findsOneWidget);
      expect(find.text('Login'), findsOneWidget);
      expect(find.text('Plan'), findsOneWidget);
      await tester.drag(
        find.byType(CustomScrollView).first,
        const Offset(0, -650),
      );
      await tester.pumpAndSettle();
      expect(tester.getBottomLeft(nav).dy, bottom);
      expect(find.byKey(const ValueKey('provider-6')), findsOneWidget);
      await tester.drag(
        find.byType(CustomScrollView).first,
        const Offset(0, 1000),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byType(TextField).first);
      tester.view.viewInsets = const FakeViewPadding(bottom: 840);
      await tester.pumpAndSettle();
      expect(nav, findsNothing);
      expect(find.text('Messages'), findsNothing);
      expect(find.text('Plan'), findsNothing);
      await tester.drag(
        find.byType(CustomScrollView).first,
        const Offset(0, -500),
      );
      await tester.pumpAndSettle();
      expect(nav, findsNothing);
      expect(tester.takeException(), isNull);
      tester.view.resetViewInsets();
      await tester.pumpAndSettle();
      expect(nav, findsOneWidget);
      expect(tester.getBottomLeft(nav).dy, bottom);
      await tester.tap(
        find.byWidgetPredicate(
          (widget) =>
              widget is Image &&
              widget.image is AssetImage &&
              (widget.image as AssetImage).assetName ==
                  'assets/images/plan.png',
        ),
      );
      await tester.pumpAndSettle();
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(CustomerProviderCollectionScreen), findsOneWidget);
      await tester.binding.handlePopRoute();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byType(CustomerProviderCollectionScreen), findsNothing);
      expect(find.byType(CustomerHomeScreen), findsOneWidget);
    },
  );
  testWidgets(
    'Explore keeps search available through loading, empty and error states',
    (tester) async {
      phone(tester);
      final controller = StreamController<List<ProviderModel>>();
      addTearDown(controller.close);
      await tester.pumpWidget(MaterialApp(home: explore(controller.stream)));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      controller.add([]);
      await tester.pumpAndSettle();
      expect(find.text('No providers available yet'), findsOneWidget);
      controller.addError(StateError('offline'));
      await tester.pumpAndSettle();
      expect(find.text('Could not load providers'), findsOneWidget);
      controller.add([provider()]);
      await tester.pumpAndSettle();
      expect(find.byType(ProviderBrandVisual), findsOneWidget);
      expect(find.byIcon(Icons.storefront_outlined), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'narrow two-column cards remain bounded with large text and review counts',
    (tester) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: child!,
          ),
          home: explore(
            Stream.value([
              provider(
                id: 'a',
                name: 'An exceptionally long provider name',
                rating: 4.9,
                reviews: 1234567,
              ),
              provider(
                id: 'b',
                name: 'Another long provider name',
                location: 'Long street location near Ormoc City',
              ),
            ]),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(ProviderBrandVisual), findsNWidgets(2));
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -300));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
}
