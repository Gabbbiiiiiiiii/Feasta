import 'package:feasta/core/helpers/provider_discovery.dart';
import 'package:feasta/features/customer/customer_search_screen.dart';
import 'package:firebase_core/firebase_core.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_core_platform_interface/test.dart';
// ignore: depend_on_referenced_packages
import 'package:firebase_auth_platform_interface/firebase_auth_platform_interface.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'provider_discovery_test.dart'
    show provider, DiscoveryRepository, GuestAuth;

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    setupFirebaseCoreMocks();
    await Firebase.initializeApp();
    FirebaseAuthPlatform.instance = GuestAuth();
  });

  test(
    'single-letter ranks full-name prefixes, word prefixes, substrings, then service-only matches',
    () {
      final candidates = [
        provider(name: "Lerie's Photo", id: 'lerie'),
        provider(name: 'SB', id: 'sb'),
        provider(name: "Sophie's Shot", id: 'sophie'),
        provider(name: 'The Studio', id: 'studio'),
        provider(name: 'Classic Events', id: 'classic'),
        provider(name: 'Ana Catering', id: 'ana'),
      ];
      final matches =
          candidates
              .where((p) => matchesProviderDiscovery(p, keyword: ' S '))
              .toList()
            ..sort((a, b) => compareProviderSearchRelevance(a, b, ' S '));
      expect(matches.map((p) => p.id), [
        'sb',
        'sophie',
        'lerie',
        'studio',
        'classic',
        'ana',
      ]);
      expect(candidates.map((p) => providerBusinessNameSearchRank(p, 's')), [
        1,
        0,
        0,
        1,
        2,
        3,
      ]);
    },
  );

  test('multi-letter name ranking trims spaces and ignores case', () {
    final candidates =
        [
            'Classic Events',
            'The Studio',
            'Studio One',
          ].map((name) => provider(name: name)).toList()
          ..sort((a, b) => compareProviderSearchRelevance(a, b, ' ST '));
    expect(candidates.map((p) => p.businessName), [
      'Studio One',
      'The Studio',
      'Classic Events',
    ]);
    expect(
      providerBusinessNameSearchRank(
        provider(name: 'STUDIO ONE'),
        ' studio one ',
      ),
      0,
    );
    expect(
      providerBusinessNameSearchRank(provider(name: 'The Studio'), 'tud'),
      2,
    );
    expect(providerBusinessNameSearchRank(provider(name: 'Ana'), '   '), 0);
  });

  test('ties use normalized names then IDs independent of snapshot order', () {
    final candidates = [
      provider(name: 'Sophie', id: 'z'),
      provider(name: ' SB ', id: 'b'),
      provider(name: 'sb', id: 'a'),
    ];
    for (final input in [candidates, candidates.reversed]) {
      final sorted = input.toList()
        ..sort((a, b) => compareProviderSearchRelevance(a, b, 's'));
      expect(sorted.map((p) => p.id), ['a', 'b', 'z']);
    }
  });

  testWidgets(
    'Guest Mode live name ranking preserves combined filters, count and stream',
    (tester) async {
      final repository = DiscoveryRepository(
        providers: [
          provider(name: "Lerie's Photo", id: 'lerie'),
          provider(name: "Sophie's Shot", id: 'sophie'),
          provider(name: 'SB', id: 'sb'),
          provider(name: 'Secret Studio', id: 'private', visible: false),
          provider(name: 'Studio Expensive', id: 'expensive', price: 30000),
          provider(
            name: 'Studio Venue',
            id: 'venue',
            category: 'venue_provider',
          ),
        ],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: CustomerSearchScreen(
            repository: repository,
            initialCategoryCode: 'catering_service',
            initialEventType: 'Wedding',
            initialLocation: 'District 1',
            initialMaxBudget: 15000,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Hide filters'));
      await tester.pumpAndSettle();
      final field = find.byType(TextField).first;
      Future<void> search(String query, String firstId, String count) async {
        await tester.enterText(field, query);
        await tester.pumpAndSettle();
        expect(find.text(count), findsOneWidget);
        final cards = tester
            .widgetList<SearchProviderCard>(find.byType(SearchProviderCard))
            .toList();
        expect(cards.first.provider.id, firstId);
        expect(find.text('Secret Studio'), findsNothing);
        expect(find.text('Studio Expensive'), findsNothing);
        expect(find.text('Studio Venue'), findsNothing);
        expect(tester.takeException(), isNull);
      }

      await search('s', 'sb', '3 providers found');
      expect(
        tester
            .widgetList<SearchProviderCard>(find.byType(SearchProviderCard))
            .take(2)
            .map((card) => card.provider.id),
        ['sb', 'sophie'],
      );
      await search(' so ', 'sophie', '1 provider found');
      await search('le', 'lerie', '1 provider found');
      await search('S', 'sb', '3 providers found');
      expect(repository.searchCalls, 1);
      expect(repository.subscriptions, 1);
    },
  );
}
