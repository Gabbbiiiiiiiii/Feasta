import 'dart:convert';

import 'package:feasta/features/customer/public_provider_reviews_sliver.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Widget app(http.Client client, {String providerId = 'provider_1'}) {
  return MaterialApp(
    home: Scaffold(
      body: CustomScrollView(
        slivers: [
          PublicProviderReviewsSliver(
            providerId: providerId,
            client: client,
            webBaseUrl: 'https://example.test',
          ),
        ],
      ),
    ),
  );
}

Map<String, dynamic> review(String id, String comment) => {
  'id': id,
  'rating': 5,
  'comment': comment,
  'createdAt': '2026-11-11T10:00:00.000Z',
  'providerReply': null,
};

http.Response response(List<Object?> reviews, {String? cursor}) {
  return http.Response(
    jsonEncode({'reviews': reviews, 'nextCursor': cursor}),
    200,
    headers: {'content-type': 'application/json'},
  );
}

void main() {
  testWidgets('displays server-validated public reviews', (tester) async {
    final client = MockClient((request) async {
      expect(request.url.scheme, 'https');
      expect(request.url.path, '/customer/providers/provider_1/reviews');
      return response([review('r1', 'Excellent service')]);
    });

    await tester.pumpWidget(app(client));
    await tester.pumpAndSettle();

    expect(find.text('Excellent service'), findsOneWidget);
    expect(find.text('Verified customer'), findsOneWidget);
    expect(find.text('Retry reviews'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('failed request offers a working retry', (tester) async {
    var calls = 0;

    final client = MockClient((request) async {
      calls++;
      if (calls == 1) return http.Response('Unavailable', 503);
      return response([review('r2', 'Service recovered')]);
    });

    await tester.pumpWidget(app(client));
    await tester.pumpAndSettle();

    expect(find.text('Retry reviews'), findsOneWidget);

    await tester.tap(find.text('Retry reviews'));
    await tester.pumpAndSettle();

    expect(calls, 2);
    expect(find.text('Service recovered'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('load more uses the server cursor', (tester) async {
    var calls = 0;

    final client = MockClient((request) async {
      calls++;

      if (calls == 1) {
        expect(request.url.queryParameters.containsKey('cursor'), isFalse);
        return response([review('r1', 'First review')], cursor: 'next123');
      }

      expect(request.url.queryParameters['cursor'], 'next123');
      return response([review('r2', 'Second review')]);
    });

    await tester.pumpWidget(app(client));
    await tester.pumpAndSettle();

    expect(find.text('First review'), findsOneWidget);

    await tester.tap(find.text('Load more reviews'));
    await tester.pumpAndSettle();

    expect(find.text('First review'), findsOneWidget);
    expect(find.text('Second review'), findsOneWidget);
    expect(calls, 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets('malformed API response does not render reviews', (tester) async {
    final client = MockClient((request) async {
      return http.Response(
        jsonEncode({
          'reviews': [
            {'id': 'r1', 'rating': 99, 'comment': 'Invalid'},
          ],
          'nextCursor': null,
        }),
        200,
      );
    });

    await tester.pumpWidget(app(client));
    await tester.pumpAndSettle();

    expect(find.text('Invalid'), findsNothing);
    expect(find.text('Retry reviews'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
