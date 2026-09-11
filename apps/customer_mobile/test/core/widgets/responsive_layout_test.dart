import 'package:feasta/core/theme/app_breakpoints.dart';
import 'package:feasta/core/theme/app_theme.dart';
import 'package:feasta/core/widgets/widgets.dart';
import 'package:feasta/features/customer/customer_search_screen.dart';
import 'package:feasta/features/customer/provider_profile_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const widths = <double>[360, 390, 600, 768, 900, 1024, 1280, 1440];

ProviderModel providerFixture() => ProviderModel(
  id: 'provider-1',
  ownerId: 'owner-1',
  businessName: 'A Deliberately Long Responsive Catering Provider Name',
  businessEmail: 'provider@feasta.test',
  businessPhone: '09170000000',
  ownerFirstName: 'Provider',
  ownerLastName: 'Owner',
  description: 'Responsive provider description',
  location: 'A deliberately long service location in Metro Manila',
  address: 'Sample address',
  city: 'Manila',
  province: 'Metro Manila',
  serviceAreas: const ['Manila'],
  eventTypesSupported: const ['Wedding'],
  minPrice: 125000,
  maxPrice: 9999999,
  ratingAverage: 4.8,
  reviewCount: 1200,
  totalCompletedBookings: 20,
  totalViews: 100,
  favoriteCount: 10,
  verificationStatus: 'approved',
  providerServiceType: 'catering',
  providerCategory: 'catering_service',
  maxEventsPerDay: 2,
  availableStaffCount: 20,
  availableEquipmentCount: 50,
  acceptsMultipleEventsPerDay: true,
  isActive: true,
  isFeatured: true,
);

PackageModel packageFixture() => PackageModel(
  id: 'package-1',
  providerId: 'provider-1',
  name: 'A Complete Wedding Celebration Package With A Long Name',
  description: 'Package description',
  eventType: 'Wedding',
  price: 9999999,
  downPaymentPercentage: 20,
  downPaymentAmount: 200000,
  guestCapacity: 500,
  minimumGuests: 50,
  maximumGuests: 500,
  foodInclusions: const ['Food'],
  decorInclusions: const ['Decor'],
  furnitureInclusions: const ['Tables'],
  serviceInclusions: const ['Staff'],
  isCustomizable: true,
  isActive: true,
);

Widget harness(Widget child, {double textScale = 1}) => MaterialApp(
  theme: AppTheme.light,
  home: MediaQuery(
    data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
    child: Scaffold(body: child),
  ),
);

void setViewport(WidgetTester tester, double width, {double height = 1000}) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = Size(width, height);
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
}

void main() {
  for (final width in widths) {
    testWidgets('shared product and form layouts fit at ${width.toInt()} px', (
      tester,
    ) async {
      setViewport(tester, width);
      await tester.pumpWidget(
        harness(
          SingleChildScrollView(
            child: FeastaContentContainer(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FeastaTextField(
                    label: 'Business name',
                    initialValue: 'A long business name for responsive forms',
                  ),
                  const SizedBox(height: 16),
                  SearchProviderCard(provider: providerFixture()),
                  const SizedBox(height: 16),
                  PackageCard(
                    eventPackage: packageFixture(),
                    provider: providerFixture(),
                  ),
                  const FeastaEmptyState(
                    title: 'No matching providers',
                    message: 'Try changing your search filters.',
                  ),
                ],
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(
        tester.getSize(find.byType(FeastaContentContainer)).width,
        lessThanOrEqualTo(width),
      );
    });
  }

  for (final width in const <double>[360, 390, 600]) {
    testWidgets('cards and states support 200% text at ${width.toInt()} px', (
      tester,
    ) async {
      setViewport(tester, width, height: 1200);
      await tester.pumpWidget(
        harness(
          SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                SearchProviderCard(provider: providerFixture()),
                const SizedBox(height: 16),
                PackageCard(
                  eventPackage: packageFixture(),
                  provider: providerFixture(),
                ),
                const FeastaErrorState(
                  title: 'Unable to load providers',
                  message: 'Check your connection and try again.',
                ),
              ],
            ),
          ),
          textScale: 2,
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('dialog wraps actions at narrow width and large text', (
    tester,
  ) async {
    setViewport(tester, 360, height: 700);
    await tester.pumpWidget(
      harness(
        FeastaConfirmationDialog(
          title: 'Cancel this booking request?',
          message:
              'The provider will be notified and the request will no longer be active.',
          confirmLabel: 'Cancel booking',
          onConfirm: () {},
        ),
        textScale: 2,
      ),
    );
    expect(tester.takeException(), isNull);
    expect(find.text('Cancel booking'), findsOneWidget);
  });

  testWidgets('five-item navigation retains touch targets at 360 px', (
    tester,
  ) async {
    setViewport(tester, 360, height: 700);
    await tester.pumpWidget(
      harness(
        Scaffold(
          body: const SizedBox.expand(),
          bottomNavigationBar: BottomNavigationBar(
            items: const [
              BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
              BottomNavigationBarItem(
                icon: Icon(Icons.search),
                label: 'Search',
              ),
              BottomNavigationBarItem(
                icon: Icon(Icons.event),
                label: 'Bookings',
              ),
              BottomNavigationBarItem(
                icon: Icon(Icons.favorite),
                label: 'Favorites',
              ),
              BottomNavigationBarItem(
                icon: Icon(Icons.person),
                label: 'Account',
              ),
            ],
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
    for (final label in const [
      'Home',
      'Search',
      'Bookings',
      'Favorites',
      'Account',
    ]) {
      final item = find.ancestor(
        of: find.text(label),
        matching: find.byType(InkResponse),
      );
      final size = tester.getSize(item);
      expect(size.height, greaterThanOrEqualTo(48));
    }
  });

  test('responsive breakpoints classify the requested width matrix', () {
    expect(AppBreakpoints.windowClassFor(360), AppWindowClass.mobile);
    expect(AppBreakpoints.windowClassFor(600), AppWindowClass.tablet);
    expect(AppBreakpoints.windowClassFor(1024), AppWindowClass.laptop);
    expect(AppBreakpoints.windowClassFor(1280), AppWindowClass.desktop);
    expect(AppBreakpoints.windowClassFor(1440), AppWindowClass.desktop);
  });
}
