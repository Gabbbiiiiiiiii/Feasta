import 'package:feasta/features/customer/location_picker_screen.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
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
import 'package:shared_preferences/shared_preferences.dart';
import 'package:feasta/core/helpers/booking_preparation.dart';
import 'package:feasta/core/widgets/widgets.dart';
import 'package:feasta/features/customer/event_customization_screen.dart';
import 'package:feasta/features/customer/booking_summary_screen.dart';
import 'package:feasta/features/customer/package_details_screen.dart';
import 'package:feasta/features/customer/widgets/package_option_cards.dart';
import 'booking_preparation_test.dart' show preparationPackage;
import 'booking_preparation_flow_test.dart'
    show PreparationAuth, PreparationRepository, seedDraft, phone;
import 'provider_discovery_test.dart' show provider, GuestAuth;

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
    preparationDraftMemory.clear();
    SharedPreferences.setMockInitialValues({});
  });
  tearDown(() {
    GuestAuth.signedIn = false;
    preparationDraftMemory.clear();
  });
  final package = preparationPackage({
    'serviceOptions': {
      'drop_off': {
        'title': 'Published delivery',
        'description': 'Delivered to your venue',
        'price': 5000,
        'includedServices': ['Delivery'],
      },
      'full_service': {
        'title': 'Published staffed service',
        'description': 'Prepared and served',
        'price': 20000,
        'includedServices': ['Wait staff', 'Cleanup'],
      },
    },
    'themeOptions': [
      {
        'id': 'garden',
        'name': 'Published garden',
        'description': 'Green table setting',
      },
    ],
  });
  testWidgets('map result persists in draft, reopens and cancel preserves it', (
    tester,
  ) async {
    phone(tester);
    seedDraft();
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
    await tester.scrollUntilVisible(
      find.text('Choose on Map'),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await Scrollable.ensureVisible(
      tester.element(find.widgetWithText(OutlinedButton, 'Choose on Map')),
      alignment: 0.5,
    );
    await tester.pumpAndSettle();
    final cityField = find.byWidgetPredicate(
      (widget) =>
          widget is TextField && widget.decoration?.hintText == 'Ormoc City',
    );
    final addressField = find.widgetWithText(
      TextField,
      'Main Street, District 1',
    );
    final mapButton = find.widgetWithText(OutlinedButton, 'Choose on Map');
    expect(
      tester.getTopLeft(cityField).dy,
      lessThan(tester.getTopLeft(find.text('Full event address')).dy),
    );
    expect(
      tester.getTopLeft(find.text('Full event address')).dy,
      lessThan(tester.getTopLeft(find.text('Enter address manually')).dy),
    );
    expect(
      tester.getTopLeft(find.text('Enter address manually')).dy,
      lessThan(tester.getTopLeft(addressField).dy),
    );
    expect(
      tester.getBottomLeft(addressField).dy,
      lessThan(tester.getTopLeft(mapButton).dy),
    );
    expect(tester.getSize(mapButton).width, tester.getSize(addressField).width);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Choose on Map'));
    await tester.pumpAndSettle();
    expect(find.byType(LocationPickerScreen), findsOneWidget);
    final confirmed = CustomerAddressModel.defaultOrmoc.copyWith(
      id: 'event-pin',
      fullAddress: 'Exact venue, Isabel',
      city: 'Isabel',
    );
    Navigator.of(
      tester.element(find.byType(LocationPickerScreen)),
    ).pop(confirmed);
    await tester.pumpAndSettle();
    expect(find.text('Exact venue, Isabel'), findsOneWidget);
    final saved = preparationDraftMemory.open(
      'customer-1',
      'caterer-1',
      'package-1',
    )!;
    expect(
      (saved['eventAddress'] as CustomerAddressModel).latitude,
      confirmed.latitude,
    );
    await Scrollable.ensureVisible(
      tester.element(
        find.widgetWithText(OutlinedButton, 'View or Edit Map Location'),
      ),
      alignment: 0.5,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('View or Edit Map Location'));
    await tester.pumpAndSettle();
    final picker = tester.widget<LocationPickerScreen>(
      find.byType(LocationPickerScreen),
    );
    expect(picker.initialAddress, confirmed);
    expect(picker.sessionOnly, isTrue);
    Navigator.of(tester.element(find.byType(LocationPickerScreen))).pop();
    await tester.pumpAndSettle();
    expect(find.text('Exact venue, Isabel'), findsOneWidget);
    await tester.enterText(
      find.widgetWithText(TextField, 'Exact venue, Isabel'),
      'Different address',
    );
    await tester.pump();
    expect(find.text('Choose on Map'), findsOneWidget);
    expect(
      preparationDraftMemory.open(
        'customer-1',
        'caterer-1',
        'package-1',
      )!['eventAddress'],
      isNull,
    );
  });
  testWidgets(
    'details cards are read-only while customization remains selectable',
    (tester) async {
      phone(tester);
      seedDraft();
      final repo = PreparationRepository()..current = package;
      await tester.pumpWidget(
        MaterialApp(
          home: PackageDetailsScreen(
            provider: provider(),
            eventPackage: package,
            repository: repo,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.tune_rounded), findsNothing);
      await tester.scrollUntilVisible(
        find.text('Published delivery'),
        180,
        scrollable: find.byType(Scrollable).first,
      );
      await Scrollable.ensureVisible(
        tester.element(find.text('Published delivery')),
        alignment: 0.3,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Published delivery'));
      await tester.pumpAndSettle();
      expect(find.text('Selected'), findsNothing);
      expect(find.text('Choose'), findsNothing);
      expect(find.text('Delivered to your venue'), findsOneWidget);
      expect(find.text('Delivery'), findsOneWidget);
      await tester.tap(find.text('Select Package'));
      await tester.pumpAndSettle();
      expect(find.text('Selected Package'), findsOneWidget);
      expect(find.byType(ChoiceChip), findsNothing);
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<ServiceOptionCards>(find.byType(ServiceOptionCards))
            .selected,
        isNull,
      );
      await tester.scrollUntilVisible(
        find.text('Published staffed service'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await Scrollable.ensureVisible(
        tester.element(find.text('Published staffed service')),
        alignment: 0.3,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Published staffed service'));
      await tester.pumpAndSettle();
      expect(find.text('Selected'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Published garden'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Green table setting'), findsOneWidget);
      expect(find.byType(FeastaImage), findsWidgets);
      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byType(ServiceOptionCards),
        -150,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester
            .widget<ServiceOptionCards>(find.byType(ServiceOptionCards))
            .selected,
        isNull,
      );
      expect(repo.unexpected, isEmpty);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'invalid event cannot advance; service choice gates next step; footer stays horizontal',
    (tester) async {
      phone(tester);
      await tester.pumpWidget(
        MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: package,
            repository: PreparationRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<CustomizationProgress>(find.byType(CustomizationProgress))
            .step,
        0,
      );
      expect(find.text('Please select an event date.'), findsOneWidget);
      expect(
        tester.getCenter(find.text('Back')).dx,
        lessThan(tester.getCenter(find.text('Continue')).dx),
      );
      expect(
        tester.getCenter(find.text('Back')).dy,
        closeTo(tester.getCenter(find.text('Continue')).dy, 5),
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'required service blocks Continue and Back preserves compatible theme',
    (tester) async {
      phone(tester);
      seedDraft();
      await tester.pumpWidget(
        MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: package,
            repository: PreparationRepository()..current = package,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(
        find.text('Choose an available catering service option.'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<CustomizationProgress>(find.byType(CustomizationProgress))
            .step,
        1,
      );
      await tester.scrollUntilVisible(
        find.text('Published staffed service'),
        120,
        scrollable: find.byType(Scrollable).first,
      );
      await Scrollable.ensureVisible(
        tester.element(find.text('Published staffed service')),
        alignment: 0.2,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Published staffed service'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Published garden'),
        120,
        scrollable: find.byType(Scrollable).first,
      );
      await Scrollable.ensureVisible(
        tester.element(find.text('Published garden')),
        alignment: 0.2,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Published garden'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Back'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byType(PackageThemeCards),
        120,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester
            .widget<PackageThemeCards>(find.byType(PackageThemeCards))
            .selected,
        'garden',
      );
      expect(
        preparationEstimate(package, [
          {'price': 700},
        ], serviceTier: 'full_service'),
        20700,
      );
      expect(
        themeReferenceImage({
          'imageUrls': ['', 'https://example.test/theme.jpg'],
        }),
        'https://example.test/theme.jpg',
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'missing package category stays unknown despite provider categories',
    (tester) async {
      phone(tester);
      seedDraft();
      final unknown = preparationPackage({'eventType': ''});
      await tester.pumpWidget(
        MaterialApp(
          home: EventCustomizationScreen(
            provider: provider(),
            eventPackage: unknown,
            repository: PreparationRepository()..current = unknown,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(DropdownButtonFormField<String>), findsNothing);
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<CustomizationProgress>(find.byType(CustomizationProgress))
            .step,
        0,
      );
      expect(
        find.textContaining('Published event category unavailable'),
        findsWidgets,
      );
    },
  );
  testWidgets(
    'theme toggles, exclusive requests, draft restoration and review notes',
    (tester) async {
      phone(tester);
      seedDraft();
      final repo = PreparationRepository()..current = package;
      Future<void> show(String text) async {
        tester
            .state<ScrollableState>(find.byType(Scrollable).first)
            .position
            .jumpTo(0);
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(
          find.text(text),
          100,
          scrollable: find.byType(Scrollable).first,
        );
        await Scrollable.ensureVisible(
          tester.element(find.text(text)),
          alignment: 0.2,
        );
        await tester.pumpAndSettle();
      }

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
      expect(find.byType(DropdownButtonFormField<String>), findsNothing);
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await show('Published staffed service');
      await tester.tap(find.text('Published staffed service'));
      await tester.pumpAndSettle();
      await show('Published garden');
      await tester.tap(find.text('Published garden'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<PackageThemeCards>(find.byType(PackageThemeCards))
            .selected,
        'garden',
      );
      await tester.tap(find.text('Published garden'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<PackageThemeCards>(find.byType(PackageThemeCards))
            .selected,
        isNull,
      );
      await tester.tap(find.text('Published garden'));
      await tester.pumpAndSettle();
      await show('No theme needed');
      await tester.tap(find.text('No theme needed'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<PackageThemeCards>(find.byType(PackageThemeCards))
            .selected,
        isNull,
      );
      await show('Request a custom theme');
      await tester.tap(find.text('Request a custom theme'));
      await tester.pumpAndSettle();
      final input = find.widgetWithText(
        TextField,
        'E.g., Rustic outdoor, fairytale, modern glam...',
      );
      expect(
        find.descendant(
          of: find.byType(PackageThemeCards),
          matching: find.text('Choose'),
        ),
        findsNothing,
      );
      expect(find.byType(ThemeSelectionIndicator), findsNWidgets(3));
      await tester.enterText(input, 'Temporary request');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      FocusManager.instance.primaryFocus?.unfocus();
      await show('Cancel request');
      await tester.tap(find.text('Cancel request'));
      await tester.pumpAndSettle();
      final cleared = preparationDraftMemory.open(
        'customer-1',
        'caterer-1',
        'package-1',
      )!;
      expect(cleared['themeChoice'], isNull);
      expect(cleared['customTheme'], '');
      expect(cleared['notes'], 'No peanuts');
      expect(input, findsNothing);
      await show('Request a custom theme');
      await tester.tap(find.text('Request a custom theme'));
      await tester.pumpAndSettle();
      await tester.enterText(input, 'Ocean blue');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Back'));
      await tester.pumpAndSettle();
      final saved = preparationDraftMemory.open(
        'customer-1',
        'caterer-1',
        'package-1',
      )!;
      expect(saved['themeChoice'], 'custom');
      expect(saved['theme'], isNull);
      expect(saved['customTheme'], 'Ocean blue');
      expect(saved['notes'], 'No peanuts');
      expect(
        preparationEstimate(package, [], serviceTier: 'full_service'),
        20000,
      );
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Review Event'));
      await tester.pumpAndSettle();
      final review = tester.widget<BookingSummaryScreen>(
        find.byType(BookingSummaryScreen),
      );
      expect(review.customization.specialRequest, contains('Ocean blue'));
      expect(
        review.customization.specialRequest,
        contains('requires provider confirmation'),
      );
      expect(review.customization.packageThemeId, isNull);
      expect(tester.takeException(), isNull);
    },
  );
  for (final scale in [1.0, 2.0]) {
    testWidgets(
      'published cards and theme fallback visual at text scale $scale',
      (tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          MaterialApp(
            home: MediaQuery(
              data: MediaQueryData(
                size: const Size(360, 800),
                textScaler: TextScaler.linear(scale),
              ),
              child: Scaffold(
                body: SingleChildScrollView(
                  child: RepaintBoundary(
                    key: const ValueKey('options'),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        children: [
                          ServiceOptionCards(
                            package: package,
                            selected: 'full_service',
                            onSelected: (_) {},
                          ),
                          PackageThemeCards(
                            package: package,
                            selected: 'garden',
                            onSelected: (_) {},
                          ),
                          ThemeChoiceCard(
                            title: 'No theme needed',
                            selected: false,
                            onTap: () {},
                          ),
                          ThemeChoiceCard(
                            title: 'Request a custom theme',
                            subtitle:
                                'Provider confirmation required. Price is not yet confirmed.',
                            selected: false,
                            onTap: () {},
                          ),
                          const CustomizationProgress(step: 1),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Cleanup'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await expectLater(
          find.byKey(const ValueKey('options')),
          matchesGoldenFile('goldens/package-options-$scale.png'),
        );
      },
    );
  }
}
