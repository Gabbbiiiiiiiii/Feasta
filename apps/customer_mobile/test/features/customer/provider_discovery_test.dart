import 'package:feasta/features/customer/widgets/provider_grid.dart';
import 'package:firebase_core/firebase_core.dart';
import 'test_occasion_catalog_fixture.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
// ignore: depend_on_referenced_packages
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:feasta/features/customer/customer_home_screen.dart';
import 'package:feasta/features/authentication/data/services/customer_address_storage_service.dart';
import 'package:feasta/shared/models/customer_address_model.dart';
import 'package:feasta/shared/models/promotion_model.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:feasta/core/helpers/provider_category_helper.dart';
import 'dart:async';
import 'package:feasta/core/domain/service_category.dart';
import 'package:feasta/features/customer/customer_search_screen.dart';
import 'package:feasta/features/authentication/data/repositories/feasta_repository.dart';
import 'package:feasta/core/helpers/provider_discovery.dart';
import 'package:feasta/features/customer/customer_provider_collection_screen.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:feasta/features/customer/provider_profile_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/shared/widgets/loading_skeleton.dart';

ProviderModel provider({
  String city = 'Ormoc City',
  String? cover,
  String? logo,
  String name = 'Ana Catering',
  String id = 'caterer-1',
  String category = 'catering_service',
  List<String>? categories,
  String serviceType = 'catering',
  bool visible = true,
  bool suspended = false,
  bool deleted = false,
  bool active = true,
  String status = 'approved',
  String description = 'Local celebrations',
  double price = 12000,
  String location = 'District 1, Ormoc City',
  double rating = 0,
  int reviews = 0,
}) => ProviderModel(
  id: id,
  serviceCategories: categories,
  coverImageUrl: cover,
  logoUrl: logo,
  ownerId: 'owner',
  businessName: name,
  businessEmail: '',
  businessPhone: '',
  ownerFirstName: '',
  ownerLastName: '',
  description: description,
  location: location,
  address: 'Main St',
  city: city,
  province: 'Leyte',
  serviceAreas: const [],
  eventTypesSupported: const ['Wedding'],
  minPrice: price,
  maxPrice: 20000,
  ratingAverage: rating,
  reviewCount: reviews,
  totalCompletedBookings: 0,
  totalViews: 0,
  favoriteCount: 0,
  verificationStatus: status,
  providerServiceType: serviceType,
  providerCategory: category,
  maxEventsPerDay: 1,
  availableStaffCount: 0,
  availableEquipmentCount: 0,
  acceptsMultipleEventsPerDay: false,
  isActive: active,
  isFeatured: false,
  publiclyVisible: visible,
  isSuspended: suspended,
  isDeleted: deleted,
);
Widget collection(Stream<List<ProviderModel>> stream) => MaterialApp(
  home: CustomerProviderCollectionScreen(
    title: 'Caterers',
    subtitle: 'Ormoc City',
    stream: stream,
    serviceCategoryNames: Future.value({'catering_service': 'Catering'}),
  ),
);

class DiscoveryRepository implements FeastaRepository {
  DiscoveryRepository({this.providers});
  final List<ProviderModel>? providers;
  int searchCalls = 0;
  int subscriptions = 0;
  @override
  Future<List<ServiceCategory>> getActiveServiceCategories({
    bool forceRefresh = false,
  }) async => const [
    ServiceCategory(
      code: 'catering_service',
      name: 'Catering',
      serviceType: 'catering',
      status: 'active',
    ),
  ];
  @override
  Future<Map<String, String>> getServiceCategoryNameMap({
    bool forceRefresh = false,
  }) async => {};
  @override
  Stream<List<ProviderModel>> searchAllVerifiedProviders({
    required String keyword,
    String? categoryCode,
    required String eventType,
    required String location,
    required double? minBudget,
    required double? maxBudget,
  }) {
    searchCalls++;
    return Stream<List<ProviderModel>>.multi((controller) {
      subscriptions++;
      controller.add(providers ?? [provider()]);
    });
  }

  @override
  Stream<List<ProviderModel>> verifiedProviders() => Stream.value([provider()]);
  @override
  Stream<List<ProviderModel>> verifiedAddonProviders({
    String category = 'all',
  }) => Stream.value([]);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class LiveSuggestionRepository extends DiscoveryRepository {
  final updates = StreamController<List<ProviderModel>>.broadcast();
  @override
  Future<Map<String, String>> getServiceCategoryNameMap({
    bool forceRefresh = false,
  }) async => {
    'catering_service': 'Live Catering',
    'photography': 'Live Photography',
  };
  @override
  Stream<List<ProviderModel>> searchAllVerifiedProviders({
    required String keyword,
    String? categoryCode,
    required String eventType,
    required String location,
    required double? minBudget,
    required double? maxBudget,
  }) => updates.stream;
}

class HomeAddressStorage extends CustomerAddressStorageService {
  @override
  Future<CustomerAddressModel> getSelectedOrDefault() async =>
      CustomerAddressModel.defaultOrmoc;
}

class GroupedDiscoveryRepository extends DiscoveryRepository {
  GroupedDiscoveryRepository()
    : super(
        providers: [
          provider(),
          provider(),
          provider(id: 'catering-2'),
          provider(id: 'catering-3'),
          provider(
            id: 'photo',
            name: 'Photo Studio',
            category: 'photography',
            serviceType: 'addon',
          ),
          provider(
            id: 'video',
            name: 'Video Studio',
            category: 'videography',
            serviceType: 'addon',
          ),
          provider(
            id: 'flowers',
            name: 'Flower Studio',
            category: 'florist',
            serviceType: 'addon',
          ),
          provider(id: 'hidden', visible: false),
        ],
      );

  @override
  Future<List<ServiceCategory>> getActiveServiceCategories({
    bool forceRefresh = false,
  }) async => [
    for (final code in [
      'catering_service',
      'photography',
      'videography',
      'florist',
      'empty',
    ])
      ServiceCategory(
        code: code,
        name: code,
        serviceType: code == 'catering_service' ? 'catering' : 'addon',
        status: 'active',
      ),
  ];
}

class HomeStateRepository extends DiscoveryRepository {
  HomeStateRepository(this.stream);
  final Stream<List<ProviderModel>> stream;
  @override
  Stream<List<ProviderModel>> searchAllVerifiedProviders({
    required String keyword,
    String? categoryCode,
    required String eventType,
    required String location,
    required double? minBudget,
    required double? maxBudget,
  }) => stream;
}

class SignedUser with MockPlatformInterfaceMixin implements UserPlatform {
  @override
  String get uid => 'pia';
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class SignedHomeRepository extends DiscoveryRepository {
  @override
  Stream<List<BookingModel>> customerActiveBookings() => Stream.value([]);
  @override
  Stream<UserModel?> currentUserData() => Stream.value(
    UserModel(
      id: 'pia',
      uid: 'pia',
      firstName: 'Pia',
      lastName: 'Customer',
      email: '',
      phoneNumber: '',
      role: 'customer',
      isEmailVerified: true,
      isPhoneVerified: true,
      isActive: true,
      isBlocked: false,
    ),
  );
  @override
  Stream<QuerySnapshot<Map<String, dynamic>>> myNotifications() =>
      const Stream.empty();
}

class GuestAuth extends FirebaseAuthPlatform {
  static bool signedIn = false;
  @override
  FirebaseAuthPlatform delegateFor({required FirebaseApp app}) => this;
  @override
  FirebaseAuthPlatform setInitialValues({
    dynamic currentUser,
    String? languageCode,
  }) => this;
  @override
  UserPlatform? get currentUser => signedIn ? SignedUser() : null;
  @override
  Stream<UserPlatform?> authStateChanges() => Stream.value(currentUser);
}

class ProfileRepository extends DiscoveryRepository {
  @override
  Stream<List<PackageModel>> packagesByProvider(String providerId) =>
      Stream.value([]);
  @override
  Stream<List<MenuItemModel>> menuItemsByProvider(String providerId) =>
      Stream.value([]);
}

class RouteRecorder extends NavigatorObserver {
  Route<dynamic>? selected;
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (previousRoute != null) selected = route;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = GuestAuth();
  });

  for (final width in [320.0, 393.0]) {
    testWidgets('Home guest discovery and category navigation at $width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 850);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repository = DiscoveryRepository();
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerHomeScreen(
            occasionLoader: testOccasionLoader,
            repository: repository,
            addressStorage: HomeAddressStorage(),
            promotions: Stream.value(<PromotionModel>[]),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Hi, there!'), findsOneWidget);
      expect(find.text('Ormoc City'), findsOneWidget);
      expect(find.text('Recommended for You'), findsNothing);
      expect(find.text('Popular Providers'), findsNothing);
      expect(find.text('Explore Providers'), findsNothing);
      expect(
        find.text('Find the right services for your celebration.'),
        findsNothing,
      );
      await tester.ensureVisible(find.text('Ana Catering').first);
      await tester.pumpAndSettle();
      expect(find.text('Ana Catering').hitTestable().first, findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.drag(find.byType(CustomScrollView), const Offset(0, 1200));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Catering').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Catering').first);
      await tester.pumpAndSettle();
      expect(find.byType(CustomerSearchScreen), findsNothing);
      expect(
        find.byWidgetPredicate(
          (w) => w is HomeSectionHeader && w.title == 'Catering',
        ),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('Ana Catering').first);
      await tester.pumpAndSettle();
      expect(find.text('Ana Catering').hitTestable().first, findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'organized provider previews filter locally and See all uses category contracts',
    (tester) async {
      final repository = GroupedDiscoveryRepository();
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerHomeScreen(
            occasionLoader: testOccasionLoader,
            repository: repository,
            addressStorage: HomeAddressStorage(),
            promotions: Stream.value(<PromotionModel>[]),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byTooltip('My Event List'), findsOneWidget);
      expect(
        find.widgetWithText(OutlinedButton, 'My Event List'),
        findsNothing,
      );
      await tester.ensureVisible(find.text('SERVICE CATEGORIES'));
      await tester.pumpAndSettle();
      expect(repository.searchCalls, 1);
      Finder header(String title) => find.byWidgetPredicate(
        (w) => w is HomeSectionHeader && w.title == title,
      );
      expect(header('All Providers'), findsNothing);
      expect(header('empty'), findsNothing);
      for (final code in [
        'catering_service',
        'photography',
        'videography',
        'florist',
        'empty',
      ]) {
        final callsBeforeSelection = repository.searchCalls;
        await tester.scrollUntilVisible(
          find.text('SERVICE CATEGORIES'),
          -300,
          scrollable: find
              .byWidgetPredicate(
                (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
              )
              .first,
        );
        final chip = find.text(code).first;
        await tester.ensureVisible(chip);
        await tester.pumpAndSettle();
        await tester.tap(chip);
        await tester.pumpAndSettle();
        expect(find.byType(CustomerSearchScreen), findsNothing);
        expect(header('All Providers'), findsNothing);
        expect(header(code), findsOneWidget);
        expect(repository.searchCalls, callsBeforeSelection);
        final seeAll = find.descendant(
          of: header(code),
          matching: find.text('See all'),
        );
        expect(seeAll, findsNothing);
        expect(
          find.byKey(PageStorageKey('home-provider-row-$code')),
          findsNothing,
        );
        if (code == 'catering_service') {
          expect(
            find.byWidgetPredicate(
              (w) => w is ProviderCardGrid && w.itemCount == 3,
            ),
            findsOneWidget,
          );
          await tester.ensureVisible(find.byKey(const ValueKey('catering-3')));
          await tester.pumpAndSettle();
          expect(
            find.byKey(const ValueKey('catering-3')).hitTestable(),
            findsOneWidget,
          );
        }
      }
      await tester.scrollUntilVisible(
        find.text('SERVICE CATEGORIES'),
        -300,
        scrollable: find
            .byWidgetPredicate(
              (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
            )
            .first,
      );
      final allChip = find.text('All services').first;
      await tester.ensureVisible(allChip);
      await tester.tap(allChip);
      await tester.pumpAndSettle();
      expect(header('All Providers'), findsNothing);
      expect(header('photography'), findsOneWidget);
      expect(header('videography'), findsOneWidget);
      final preview = find.byKey(
        const PageStorageKey('home-provider-row-catering_service'),
      );
      await tester.ensureVisible(preview);
      await tester.pumpAndSettle();
      final rowList = tester.widget<SingleChildScrollView>(preview);
      expect(rowList.scrollDirection, Axis.horizontal);
      await tester.drag(preview, const Offset(-600, 0));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('catering-3')).hitTestable(),
        findsOneWidget,
      );

      final seeAll = find.descendant(
        of: header('catering_service'),
        matching: find.text('See all'),
      );
      await tester.ensureVisible(seeAll);
      await tester.pumpAndSettle();
      await tester.tap(seeAll);
      await tester.pumpAndSettle();
      expect(find.byType(CustomerSearchScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('Home empty provider state and direct filter access', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerHomeScreen(
          occasionLoader: testOccasionLoader,
          repository: DiscoveryRepository(providers: []),
          addressStorage: HomeAddressStorage(),
          promotions: Stream.value(<PromotionModel>[]),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('No providers available yet.'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('No providers available yet.'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byTooltip('Search filters'),
      -300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byTooltip('Search filters'));
    await tester.pumpAndSettle();
    expect(find.text('Filters'), findsOneWidget);
    expect(find.text('Choose date'), findsOneWidget);
    expect(find.text('Start time'), findsOneWidget);
    expect(find.text('End time'), findsOneWidget);
    expect(find.text('Theme & Style'), findsNothing);
    await tester.tap(find.text('Choose date'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Apply filters'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apply filters'));
    await tester.pumpAndSettle();
    expect(
      find.text('Choose an event date, start time and end time.'),
      findsOneWidget,
    );
    expect(find.byType(BottomSheet), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('signed-in Home uses the existing customer name', (tester) async {
    GuestAuth.signedIn = true;
    addTearDown(() => GuestAuth.signedIn = false);
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerHomeScreen(
          occasionLoader: testOccasionLoader,
          repository: SignedHomeRepository(),
          addressStorage: HomeAddressStorage(),
          promotions: Stream.value(<PromotionModel>[]),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Hi, Pia!'), findsOneWidget);
    expect(find.text('Hi, there!'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'Home loading and error states fit narrow screens with larger text',
    (tester) async {
      tester.view.physicalSize = const Size(320, 850);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final updates = StreamController<List<ProviderModel>>();
      addTearDown(updates.close);
      await tester.pumpWidget(
        MaterialApp(
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(1.5)),
            child: child!,
          ),
          home: CustomerHomeScreen(
            occasionLoader: testOccasionLoader,
            repository: HomeStateRepository(updates.stream),
            addressStorage: HomeAddressStorage(),
            promotions: Stream.value(<PromotionModel>[]),
          ),
        ),
      );
      await tester.pump();
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -450));
      await tester.pump();
      expect(find.byType(FeastaSkeletonHorizontalCards), findsOneWidget);
      expect(tester.takeException(), isNull);
      updates.addError(StateError('offline'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Could not load providers. Retry'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Could not load providers. Retry'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );

  for (final scale in [1.0, 1.3, 2.0]) {
    testWidgets('profile identity fits narrow phone at $scale', (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(
              size: const Size(360, 800),
              textScaler: TextScaler.linear(scale),
            ),
            child: ProviderProfileScreen(
              provider: provider(
                name: 'A very long provider business name for celebrations',
                location:
                    'A long street and barangay address, Ormoc City, Leyte',
              ),
              repository: ProfileRepository(),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('No reviews yet'), findsWidgets);
      await tester.ensureVisible(find.text('Book Now'));
      final bookPosition = tester.getTopLeft(find.text('Book Now'));
      final chatPosition = tester.getTopLeft(find.text('Chat'));

      // Compact screens stack the buttons vertically to avoid text wrapping.
      expect(chatPosition.dy, greaterThan(bookPosition.dy));
      expect((chatPosition.dx - bookPosition.dx).abs(), lessThan(80));
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
    'guest profiles render category tabs, empty states and reset selection on provider changes',
    (tester) async {
      final repository = ProfileRepository();
      Future<void> show(String category, String id) async {
        await tester.pumpWidget(
          MaterialApp(
            home: ProviderProfileScreen(
              key: const ValueKey('profile'),
              provider: provider(
                category: category,
                serviceType: 'addon',
                id: id,
              ),
              repository: repository,
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.drag(find.byType(CustomScrollView), const Offset(0, -400));
        await tester.pumpAndSettle();
      }

      await show('photographer', 'photo');
      expect(find.widgetWithText(ChoiceChip, 'Portfolio'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Menu'), findsNothing);
      await tester.ensureVisible(find.widgetWithText(ChoiceChip, 'Portfolio'));
      await tester.tap(find.widgetWithText(ChoiceChip, 'Portfolio'));
      await tester.pumpAndSettle();
      expect(find.text('No photos available yet'), findsOneWidget);
      await show('catering_service', 'catering');
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Packages'))
            .selected,
        isTrue,
      );
      expect(find.widgetWithText(ChoiceChip, 'Menu'), findsNothing);
      expect(find.widgetWithText(ChoiceChip, 'Photos'), findsNothing);
      expect(find.widgetWithText(ChoiceChip, 'Reviews'), findsOneWidget);
      await show('florist', 'florist');
      expect(find.widgetWithText(ChoiceChip, 'Menu'), findsNothing);
      expect(find.widgetWithText(ChoiceChip, 'Catalog'), findsNothing);
      expect(find.widgetWithText(ChoiceChip, 'Photos'), findsOneWidget);
      expect(
        tester
            .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Packages'))
            .selected,
        isTrue,
      );
      await show('cake_pastry', 'cake');
      expect(find.widgetWithText(ChoiceChip, 'Packages'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Reviews'), findsOneWidget);
      expect(find.widgetWithText(ChoiceChip, 'Menu'), findsNothing);
      expect(find.widgetWithText(ChoiceChip, 'Photos'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'guest search renders finite tappable cards while typing with keyboard',
    (tester) async {
      tester.view.physicalSize = const Size(360, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final selected = provider(
        cover: "https://example.com/cover.jpg",
        name: "Lerie's Photo",
        id: 'lerie',
        category: 'photographer',
        serviceType: 'addon',
      );
      final repository = DiscoveryRepository(
        providers: [
          selected,
          provider(),
          provider(name: 'Leo Catering', id: 'leo'),
          provider(name: 'Bea Catering', id: 'bea'),
        ],
      );
      final observer = RouteRecorder();
      await tester.pumpWidget(
        MaterialApp(
          navigatorObservers: [observer],
          home: CustomerSearchScreen(
            occasionLoader: testOccasionLoader,
            repository: repository,
            initialQuery: 'Catering',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Find event services'), findsOneWidget);
      final header = tester.widget<Text>(find.text('Find event services'));
      expect(header.maxLines, 1);
      expect(find.text('Search'), findsNothing);
      expect(find.text('3 providers found'), findsOneWidget);
      expect(find.byType(SearchProviderCard), findsNWidgets(3));
      for (final card in find.byType(SearchProviderCard).evaluate()) {
        final size = tester.getSize(find.byWidget(card.widget));
        expect(size.height.isFinite && size.height > 0, isTrue);
      }
      final field = find.byType(TextField).first;
      tester.view.viewInsets = const FakeViewPadding(bottom: 280);
      addTearDown(tester.view.resetViewInsets);
      for (final text in ['L', 'Le', 'Ler', 'Lerie']) {
        await tester.enterText(field, text);
        await tester.pumpAndSettle();
        expect(find.text("Lerie's Photo").hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
      expect(find.text('1 provider found'), findsOneWidget);
      expect(find.byType(SearchProviderCard), findsOneWidget);
      expect(repository.searchCalls, 1);
      expect(repository.subscriptions, 1);
      await tester.tap(find.text("Lerie's Photo"));
      final route = observer.selected! as MaterialPageRoute<dynamic>;
      final profile =
          route.builder(tester.element(field)) as ProviderProfileScreen;
      expect(profile.provider, same(selected));
      await tester.pumpWidget(const SizedBox());
    },
  );

  testWidgets(
    'category and keyword render only matching cards and clearing text retains category',
    (tester) async {
      final repository = DiscoveryRepository(
        providers: [
          provider(),
          provider(name: 'Leo Catering', id: 'leo'),
          provider(
            name: 'Lerie Photo',
            id: 'photo',
            category: 'photographer',
            serviceType: 'addon',
          ),
        ],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerSearchScreen(
            occasionLoader: testOccasionLoader,
            repository: repository,
            initialCategoryCode: 'catering_service',
            initialQuery: 'L',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('1 provider found'), findsOneWidget);
      expect(find.text('Leo Catering').hitTestable(), findsOneWidget);
      expect(find.text('Lerie Photo'), findsNothing);
      await tester.tap(find.byTooltip('Clear search'));
      await tester.pumpAndSettle();
      expect(find.text('2 providers found'), findsOneWidget);
      expect(find.byType(SearchProviderCard), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    },
  );

  test(
    'category tab rules use existing classification and supported sources',
    () {
      expect(providerProfileTabs(provider()), ['Packages', 'Reviews']);
      for (final category in [
        'photographer',
        'Photography / Videography',
        'videographer',
      ]) {
        expect(
          providerProfileTabs(
            provider(category: category, serviceType: 'addon'),
          ),
          ['Packages', 'Portfolio', 'Reviews'],
        );
      }
      for (final category in ['florist', 'car_rental']) {
        expect(
          providerProfileTabs(
            provider(category: category, serviceType: 'addon'),
          ),
          ['Packages', 'Photos', 'Reviews'],
        );
      }
      expect(
        providerProfileTabs(
          provider(category: 'cake_pastry', serviceType: 'addon'),
        ),
        ['Packages', 'Reviews'],
      );
    },
  );

  testWidgets('portfolio empty state uses camera and portfolio language', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ProviderPhotosSection(provider: provider(), isPortfolio: true),
        ),
      ),
    );
    expect(find.text('No photos available yet'), findsOneWidget);
    expect(find.byIcon(Icons.camera_alt_outlined), findsOneWidget);
    expect(find.byIcon(Icons.restaurant_menu_rounded), findsNothing);
  });

  testWidgets(
    'clearing an empty category search clears the category constraint',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerSearchScreen(
            occasionLoader: testOccasionLoader,
            repository: DiscoveryRepository(),
            initialCategoryCode: 'photographer',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('No results found'), findsOneWidget);
      await tester.tap(find.text('Clear search'));
      await tester.pumpAndSettle();
      expect(find.text('Popular services'), findsNothing);
    },
  );

  testWidgets('collection fits a narrow phone with larger text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: const TextScaler.linear(1.3)),
          child: child!,
        ),
        home: CustomerProviderCollectionScreen(
          title: 'Caterers',
          subtitle: 'Ormoc City',
          stream: Stream.value([provider()]),
          serviceCategoryNames: Future.value({}),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Ana Catering'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byTooltip('Filter providers'));
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Location'), 'Ormoc');
    await tester.ensureVisible(find.text('Show results'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Show results'));
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsNothing);
    expect(find.widgetWithText(InputChip, 'Ormoc'), findsOneWidget);
    expect(find.byType(SearchProviderCard), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('typing filters locally and clearing search restores discovery', (
    tester,
  ) async {
    final repository = DiscoveryRepository();
    await tester.pumpWidget(
      MaterialApp(
        home: CustomerSearchScreen(
          occasionLoader: testOccasionLoader,
          repository: repository,
          initialQuery: 'Ana',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Ana Catering'), findsOneWidget);
    final field = find.byType(TextField).first;
    await tester.enterText(field, 'Missing caterer');
    await tester.pumpAndSettle();
    expect(find.text('No results found'), findsOneWidget);
    await tester.enterText(field, 'Catering');
    await tester.pumpAndSettle();
    expect(find.text('Ana Catering'), findsOneWidget);
    expect(repository.searchCalls, 1);
    expect(repository.subscriptions, 1);
    await tester.tap(find.byTooltip('Clear search'));
    await tester.pumpAndSettle();
    expect(find.text('Popular services'), findsNothing);
    expect(find.text('No results found'), findsNothing);
  });

  testWidgets(
    'search suggestions follow live provider categories and filter stays inside search',
    (tester) async {
      final repository = LiveSuggestionRepository();
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerSearchScreen(
            repository: repository,
            occasionLoader: testOccasionLoader,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Popular services'), findsNothing);
      final search = find.byType(TextField).first;
      expect(
        tester.widget<TextField>(search).decoration!.suffixIcon,
        isNotNull,
      );
      repository.updates.add([provider()]);
      await tester.pumpAndSettle();
      expect(find.widgetWithText(ActionChip, 'Live Catering'), findsOneWidget);
      expect(find.widgetWithText(ActionChip, 'Live Photography'), findsNothing);
      repository.updates.add([
        provider(id: 'photo', category: 'photography', serviceType: 'addon'),
      ]);
      await tester.pumpAndSettle();
      expect(find.widgetWithText(ActionChip, 'Live Catering'), findsNothing);
      expect(
        find.widgetWithText(ActionChip, 'Live Photography'),
        findsOneWidget,
      );
      repository.updates.add([]);
      await tester.pumpAndSettle();
      expect(find.text('Popular searches'), findsNothing);
      await tester.pumpWidget(const SizedBox());
      await repository.updates.close();
    },
  );

  testWidgets('provider cards show two per row and adapt for large text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    Future<void> showGrid(double scale) async {
      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(scale)),
            child: Scaffold(
              body: SingleChildScrollView(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: ProviderCardGrid(
                    itemCount: 3,
                    itemBuilder: (_, index) => ProviderGridCard(
                      key: ValueKey('grid-$index'),
                      provider: provider(id: '$index', name: 'Provider $index'),
                      categoryNames: const {},
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
    }

    await showGrid(1);
    final first = tester.getRect(find.byKey(const ValueKey('grid-0')));
    final second = tester.getRect(find.byKey(const ValueKey('grid-1')));
    final third = tester.getRect(find.byKey(const ValueKey('grid-2')));
    expect(first.top, second.top);
    expect(first.width, second.width);
    expect(second.left, greaterThan(first.right));
    expect(third.top, greaterThan(first.bottom));
    expect(tester.takeException(), isNull);
    await showGrid(2);
    expect(
      tester.getTopLeft(find.byKey(const ValueKey('grid-1'))).dy,
      greaterThan(
        tester.getBottomLeft(find.byKey(const ValueKey('grid-0'))).dy,
      ),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('missing public photos have a truthful empty state', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: ProviderPhotosSection(provider: provider())),
      ),
    );
    expect(find.text('No photos available yet'), findsOneWidget);
  });
  testWidgets(
    'selecting a collection provider passes that provider to its profile',
    (tester) async {
      final observer = RouteRecorder();
      final selected = provider();
      await tester.pumpWidget(
        MaterialApp(
          navigatorObservers: [observer],
          home: CustomerProviderCollectionScreen(
            title: 'Caterers',
            subtitle: 'Ormoc City',
            stream: Stream.value([selected]),
            serviceCategoryNames: Future.value({}),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ana Catering'));
      final route = observer.selected! as MaterialPageRoute<dynamic>;
      final profile =
          route.builder(tester.element(find.text('Ana Catering')))
              as ProviderProfileScreen;
      expect(profile.provider, same(selected));
      // Inspect the route without starting live Firebase services in the profile.
      await tester.pumpWidget(const SizedBox());
    },
  );
  test(
    'public discovery rejects private, incomplete and unavailable profiles',
    () {
      expect(isDiscoverableProvider(provider()), isTrue);
      for (final p in [
        provider(visible: false),
        provider(suspended: true),
        provider(deleted: true),
        provider(active: false),
        provider(status: 'pending'),
        provider(description: ''),
        provider(city: 'Tacloban'),
        provider(city: 'New Ormoc'),
      ]) {
        expect(isDiscoverableProvider(p), isFalse);
      }
    },
  );
  test(
    'keyword, category, event, area and budget combine; clearing restores results',
    () {
      final p = provider();
      expect(
        matchesProviderDiscovery(
          p,
          keyword: 'ana catering',
          categoryCode: 'catering_service',
          eventType: 'wedding',
          location: 'District 1',
          minBudget: 10000,
          maxBudget: 15000,
        ),
        isTrue,
      );
      expect(
        matchesProviderDiscovery(
          p,
          keyword: 'photographer',
          categoryCode: 'catering_service',
        ),
        isFalse,
      );
      expect(matchesProviderDiscovery(p, eventType: 'Birthday'), isFalse);
      expect(matchesProviderDiscovery(p, location: 'District 2'), isFalse);
      expect(matchesProviderDiscovery(p, maxBudget: 5000), isFalse);
      expect(
        matchesProviderDiscovery(p, minBudget: 20000, maxBudget: 10000),
        isFalse,
      );
      expect(
        matchesProviderDiscovery(provider(price: 0), maxBudget: 15000),
        isFalse,
      );
      expect(matchesProviderDiscovery(p, keyword: ''), isTrue);
    },
  );
  testWidgets(
    'collection shows loading, empty, error and missing-photo fallback',
    (tester) async {
      final stream = StreamController<List<ProviderModel>>();
      addTearDown(stream.close);
      await tester.pumpWidget(collection(stream.stream));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      stream.add([provider(visible: false)]);
      await tester.pumpAndSettle();
      expect(find.text('No providers available yet'), findsOneWidget);
      stream.addError(StateError('offline'));
      await tester.pumpAndSettle();
      expect(find.text('Could not load providers'), findsOneWidget);
      stream.add([provider()]);
      await tester.pumpAndSettle();
      expect(find.text('Ana Catering'), findsOneWidget);
      expect(find.byIcon(Icons.storefront_outlined), findsNWidgets(2));
      expect(find.text('0.0 (0)'), findsNothing);
    },
  );
}
