import 'package:feasta/core/theme/app_colors.dart';
import 'package:feasta/features/customer/customer_home_screen.dart';
import 'package:feasta/features/customer/customer_search_screen.dart';
import 'package:feasta/features/customer/provider_profile_screen.dart';
import 'package:feasta/features/customer/widgets/provider_brand_visual.dart';
import 'package:feasta/shared/models/promotion_model.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'provider_discovery_test.dart'
    show
        provider,
        collection,
        DiscoveryRepository,
        ProfileRepository,
        GuestAuth,
        HomeAddressStorage;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = GuestAuth();
  });

  testWidgets(
    'cover and full logo use separate real URLs and finite dimensions',
    (tester) async {
      final selected = provider(
        cover: 'https://example.com/cover.jpg',
        logo: 'https://example.com/logo.png',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProviderBrandVisual(
              provider: selected,
              showVerification: true,
            ),
          ),
        ),
      );
      final images = tester.widgetList<Image>(find.byType(Image)).toList();
      expect(images.map((image) => (image.image as NetworkImage).url), [
        selected.coverImageUrl,
        selected.logoUrl,
      ]);
      expect(images.first.fit, BoxFit.cover);
      expect(images.last.fit, BoxFit.contain);
      expect(tester.getSize(find.byType(ProviderBrandVisual)).height, 168);
      expect(
        tester.getSize(find.byType(ProviderLogoBadge)),
        const Size(52, 52),
      );
      expect(
        tester.widget<Icon>(find.byIcon(Icons.verified_rounded)).color,
        AppColors.success,
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.byIcon(Icons.storefront_outlined), findsNWidgets(2));
    },
  );

  for (final images in [
    (null, null),
    ('https://example.com/cover.jpg', null),
    (null, 'https://example.com/logo.png'),
  ]) {
    testWidgets('missing or failed image fallback: $images', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ProviderBrandVisual(
              provider: provider(cover: images.$1, logo: images.$2),
            ),
          ),
        ),
      );
      expect(
        find.byType(Image),
        findsNWidgets([images.$1, images.$2].whereType<String>().length),
      );
      await tester.pumpAndSettle();
      expect(find.byIcon(Icons.storefront_outlined), findsNWidgets(2));
      for (final icon in tester.widgetList<Icon>(
        find.byIcon(Icons.storefront_outlined),
      )) {
        expect(icon.color, customerDecorativeIconColor);
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Explore top cover and logo fit 320px with large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final selected = provider(
      cover: 'https://example.com/cover.jpg',
      logo: 'https://example.com/logo.png',
    );
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(1.5)),
          child: child!,
        ),
        home: (collection(Stream.value([selected])) as MaterialApp).home,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byType(ProviderBrandVisual), findsOneWidget);
    expect(find.byType(ProviderLogoBadge), findsOneWidget);
    expect(
      tester.getTopLeft(find.text(selected.businessName)).dy,
      greaterThan(tester.getBottomLeft(find.byType(ProviderBrandVisual)).dy),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('compact and large-text Search cards include the logo badge', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    for (final scale in [1.0, 1.5]) {
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: const Size(320, 900),
              textScaler: TextScaler.linear(scale),
            ),
            child: Scaffold(
              body: SingleChildScrollView(
                child: SearchProviderCard(
                  provider: provider(),
                  categoryNames: const {},
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(ProviderBrandVisual), findsOneWidget);
      expect(find.byType(ProviderLogoBadge), findsOneWidget);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('Home uses service category chips and provider logos', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerHomeScreen(
          repository: DiscoveryRepository(),
          addressStorage: HomeAddressStorage(),
          promotions: Stream.value(<PromotionModel>[]),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('SERVICE CATEGORIES'), findsOneWidget);
    expect(find.text('Choose a service'), findsOneWidget);
    expect(find.text('All services'), findsNWidgets(2));
    expect(find.text('Catering'), findsWidgets);
    expect(find.byIcon(Icons.restaurant_menu_rounded), findsNothing);
    await tester.ensureVisible(find.byType(ProviderLogoBadge).first);
    await tester.pumpAndSettle();
    expect(find.byType(ProviderBrandVisual), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'profile retains cover, full logo, actions and category tabs at 320px',
    (tester) async {
      tester.view.physicalSize = const Size(320, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final selected = provider(
        cover: 'https://example.com/cover.jpg',
        logo: 'https://example.com/logo.png',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ProviderProfileScreen(
            provider: selected,
            repository: ProfileRepository(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byType(ProviderLogoBadge), findsOneWidget);
      expect(
        tester
            .widget<Image>(
              find.byWidgetPredicate(
                (widget) =>
                    widget is Image &&
                    widget.semanticLabel == '${selected.businessName} logo',
              ),
            )
            .fit,
        BoxFit.contain,
      );
      expect(find.text('Chat'), findsOneWidget);
      expect(find.text('Book Now'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Packages'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
