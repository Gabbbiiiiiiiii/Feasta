import 'package:feasta/app/router/customer_route_guard.dart';
import 'package:feasta/core/helpers/provider_discovery.dart';
import 'package:feasta/features/authentication/application/customer_auth_controller.dart';
import 'package:feasta/features/presentation/widgets/customer_login_modal.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:feasta/shared/models/feasta_models.dart';

import '../authentication/customer_auth_controller_test.dart'
    show FakeCustomerAuthStateRepository, identity;
import '../authentication/customer_auth_navigation_test.dart'
    show NavigationGateway, NavigationRepository;
import 'provider_discovery_test.dart' show provider;

void main() {
  test(
    'public provider parser preserves canonical lists and legacy fallback',
    () {
      ProviderModel parse(Map<String, dynamic> data) =>
          ProviderModel.fromDoc(_ProviderDoc(data));
      expect(
        providerDiscoveryCategories(parse({'providerCategory': 'photography'})),
        {'photography'},
      );
      expect(
        providerDiscoveryCategories(
          parse({'providerCategory': 'photography', 'serviceCategories': []}),
        ),
        isEmpty,
      );
      expect(
        providerDiscoveryCategories(
          parse({
            'providerCategory': 'legacy',
            'serviceCategories': [
              'photography',
              'videography',
              'photography',
              42,
              'bad code',
            ],
          }),
        ),
        {'photography', 'videography'},
      );
    },
  );
  test(
    'restoration resolves before the once-only guest offer is consumed',
    () async {
      final repository = FakeCustomerAuthStateRepository();
      final controller = CustomerAuthenticationController(
        repository: repository,
      )..start();
      expect(controller.takeOpeningLoginOffer(), false);
      repository.emitAuth(null);
      await Future<void>.delayed(Duration.zero);
      expect(controller.takeOpeningLoginOffer(), true);
      repository.emitAuth(null);
      await Future<void>.delayed(Duration.zero);
      expect(controller.takeOpeningLoginOffer(), false);
      controller.dispose();
      await repository.close();
    },
  );

  test('restored signed-in customer never receives an opening offer', () async {
    final repository = FakeCustomerAuthStateRepository();
    final controller = CustomerAuthenticationController(repository: repository)
      ..start();
    repository.emitAuth(identity);
    await Future<void>.delayed(const Duration(milliseconds: 30));
    expect(controller.takeOpeningLoginOffer(), false);
    repository.emitAuth(null);
    await Future<void>.delayed(Duration.zero);
    expect(controller.takeOpeningLoginOffer(), false);
    controller.dispose();
    await repository.close();
  });

  test('protected deep link keeps its existing authentication flow', () async {
    final repository = FakeCustomerAuthStateRepository();
    final controller = CustomerAuthenticationController(
      repository: repository,
      initialLocation: CustomerAppLocations.bookings,
    )..start();
    repository.emitAuth(null);
    await Future<void>.delayed(Duration.zero);
    expect(controller.takeOpeningLoginOffer(), false);
    expect(controller.intendedLocation, CustomerAppLocations.bookings);
    controller.dispose();
    await repository.close();
  });

  test('grouping uses authoritative categories and unique eligible IDs', () {
    final catering = provider(
      categories: ['catering_service', 'photography', 'photography'],
    );
    final groups = groupDiscoverableProviders([
      catering,
      catering,
      provider(id: 'photo', category: 'photography', serviceType: 'addon'),
      provider(id: 'video', category: 'videography', serviceType: 'addon'),
      provider(id: 'flowers', category: 'florist', serviceType: 'addon'),
      provider(id: 'private', visible: false),
      provider(id: 'inactive', active: false),
      provider(id: 'pending', status: 'pending'),
      provider(id: 'rejected', status: 'rejected'),
      provider(id: 'suspended', suspended: true),
    ]);
    expect(groups['']!.map((p) => p.id), [
      'caterer-1',
      'photo',
      'video',
      'flowers',
    ]);
    expect(groups['catering_service']!.length, 1);
    expect(groups['photography']!.map((p) => p.id), ['caterer-1', 'photo']);
    expect(
      matchesProviderDiscovery(catering, categoryCode: 'photography'),
      true,
    );
    expect(
      matchesProviderDiscovery(catering, categoryCode: 'videography'),
      false,
    );
    expect(providerDiscoveryCategories(provider(categories: [])), isEmpty);
    expect(groups['videography']!.single.id, 'video');
    expect(groups['florist']!.single.id, 'flowers');
    expect(groupDiscoverableProviders([])[''], isEmpty);
  });

  for (final dismissal in ['swipe', 'back', 'close', 'barrier']) {
    testWidgets('idle guest login supports $dismissal and manual reopening', (
      tester,
    ) async {
      final repository = NavigationRepository();
      var closed = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () async {
                  final result = await showCustomerLoginModal(
                    context,
                    loginGateway: NavigationGateway(repository),
                  );
                  closed = !result;
                },
                child: const Text('Open login'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open login'));
      await tester.pumpAndSettle();
      if (dismissal == 'swipe') {
        await tester.drag(
          find.byKey(const Key('customer-login-drag-handle')),
          const Offset(0, 600),
        );
      } else if (dismissal == 'back') {
        await tester.binding.handlePopRoute();
      } else if (dismissal == 'barrier') {
        await tester.tapAt(const Offset(5, 5));
      } else {
        await tester.tap(find.byTooltip('Close'));
      }
      await tester.pumpAndSettle();
      expect(closed, true);
      expect(repository.currentIdentity, isNull);
      expect(
        find.byKey(const Key('customer-login-sheet-surface')),
        findsNothing,
      );
      await tester.tap(find.text('Open login'));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('customer-login-sheet-surface')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
      await repository.close();
    });
  }
}

// Test double for the SDK document boundary; production never subclasses it.
// ignore: subtype_of_sealed_class
class _ProviderDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _ProviderDoc(this.values);
  final Map<String, dynamic> values;
  @override
  String get id => 'public-provider';
  @override
  Map<String, dynamic> data() => values;
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
