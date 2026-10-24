import 'dart:async';
import 'package:feasta/core/domain/service_category.dart';
import 'package:feasta/features/customer/customer_home_screen.dart';
import 'package:feasta/features/customer/customer_search_screen.dart';
import 'package:feasta/shared/models/promotion_model.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'provider_discovery_test.dart'
    show DiscoveryRepository, HomeAddressStorage, GuestAuth;

class CategoryRepository extends DiscoveryRepository {
  Future<List<ServiceCategory>> next = Future.value([]);
  final refreshes = <bool>[];
  @override
  Future<List<ServiceCategory>> getActiveServiceCategories({
    bool forceRefresh = false,
  }) {
    refreshes.add(forceRefresh);
    return next;
  }
}

void main() {
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = GuestAuth();
  });
  Widget home(CategoryRepository repo) => MaterialApp(
    home: CustomerHomeScreen(
      repository: repo,
      addressStorage: HomeAddressStorage(),
      promotions: Stream.value(<PromotionModel>[]),
    ),
  );
  const category = ServiceCategory(
    code: 'new_service',
    name: 'Published new service',
    serviceType: 'addon',
    status: 'active',
  );
  testWidgets(
    'Home loads canonical reader, refreshes changes and navigates by code',
    (tester) async {
      final repo = CategoryRepository();
      final pending = Completer<List<ServiceCategory>>();
      repo.next = pending.future;
      await tester.pumpWidget(home(repo));
      await tester.pump();
      expect(find.text('Catering'), findsNothing);
      pending.complete([category]);
      await tester.pumpAndSettle();
      expect(repo.refreshes, [true]);
      await tester.ensureVisible(find.text(category.name).first);
      await tester.tap(find.text(category.name).first);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<CustomerSearchScreen>(find.byType(CustomerSearchScreen))
            .initialCategoryCode,
        category.code,
      );
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pumpAndSettle();
      repo.next = Future.value([]);
      final refresh = tester
          .widget<RefreshIndicator>(find.byType(RefreshIndicator))
          .onRefresh();
      await tester.pump(const Duration(milliseconds: 500));
      await refresh;
      await tester.pumpAndSettle();
      expect(repo.refreshes, [true, true]);
      expect(find.text(category.name), findsNothing);
      expect(
        find.text('No event services are currently available.'),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'web chips scroll at narrow width and All services preserves guest navigation',
    (tester) async {
      tester.view.physicalSize = const Size(320, 850);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final repo = CategoryRepository()
        ..next = Future.value(const [
          ServiceCategory(
            code: 'catering_service',
            name: 'Catering Service',
            serviceType: 'catering',
            status: 'active',
          ),
          ServiceCategory(
            code: 'photography',
            name: 'Photography',
            serviceType: 'addon',
            status: 'active',
          ),
          ServiceCategory(
            code: 'videography',
            name: 'Videography',
            serviceType: 'addon',
            status: 'active',
          ),
        ]);
      await tester.pumpWidget(home(repo));
      await tester.pumpAndSettle();
      expect(find.text('SERVICE CATEGORIES'), findsOneWidget);
      expect(find.text('Choose a service'), findsOneWidget);
      await tester.ensureVisible(find.text('Videography').first);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Videography').first);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<CustomerSearchScreen>(find.byType(CustomerSearchScreen))
            .initialCategoryCode,
        'videography',
      );
      tester.state<NavigatorState>(find.byType(Navigator).first).pop();
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('All services').first);
      await tester.tap(find.text('All services').first);
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<CustomerSearchScreen>(find.byType(CustomerSearchScreen))
            .initialCategoryCode,
        isNull,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('failure offers retry without invented or stale categories', (
    tester,
  ) async {
    final repo = CategoryRepository();
    final pending = Completer<List<ServiceCategory>>();
    repo.next = pending.future;
    await tester.pumpWidget(home(repo));
    pending.completeError(StateError('permission-denied'));
    await tester.pumpAndSettle();
    expect(find.text('Event Services could not be loaded.'), findsOneWidget);
    expect(find.text('Catering'), findsNothing);
    expect(find.text('All services').first, findsOneWidget);
    expect(find.text('SERVICE CATEGORIES'), findsOneWidget);
    repo.next = Future.value([category]);
    await tester.ensureVisible(find.text('Retry'));
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text(category.name).first, findsOneWidget);
    expect(repo.refreshes, [true, true]);
  });
}
