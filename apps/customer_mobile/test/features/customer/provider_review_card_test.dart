import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:feasta/features/presentation/widgets/provider_review_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ProviderReviewCard', () {
    testWidgets('shows customer review and provider response', (tester) async {
      await tester.pumpWidget(
        _app(
          data: {
            'customerFirstName': 'Gabriel',
            'customerLastName': 'Customer',
            'rating': 5,
            'comment': 'Excellent food and professional service.',
            'createdAt': Timestamp.fromDate(DateTime(2026, 8, 10)),
            'providerReply': 'Thank you for choosing our catering service!',
            'providerReplyAt': Timestamp.fromDate(DateTime(2026, 8, 11)),
          },
        ),
      );

      expect(find.text('Gabriel Customer'), findsOneWidget);

      expect(
        find.text('Excellent food and professional service.'),
        findsOneWidget,
      );

      expect(find.text('Aug 10, 2026'), findsOneWidget);

      expect(find.text('Provider response'), findsOneWidget);

      expect(
        find.text('Thank you for choosing our catering service!'),
        findsOneWidget,
      );

      expect(find.text('Aug 11, 2026'), findsOneWidget);

      expect(find.bySemanticsLabel('5 out of 5 stars'), findsOneWidget);
    });

    testWidgets('does not render provider response when no reply exists', (
      tester,
    ) async {
      await tester.pumpWidget(
        _app(
          data: {
            'customerFirstName': 'Ana',
            'customerLastName': 'Reyes',
            'rating': 4,
            'comment': 'Very good experience.',
            'createdAt': Timestamp.fromDate(DateTime(2026, 8, 12)),
            'providerReply': null,
            'providerReplyAt': null,
          },
        ),
      );

      expect(find.text('Ana Reyes'), findsOneWidget);

      expect(find.text('Very good experience.'), findsOneWidget);

      expect(find.text('Provider response'), findsNothing);

      expect(find.bySemanticsLabel('4 out of 5 stars'), findsOneWidget);
    });

    testWidgets('falls back safely when customer identity is missing', (
      tester,
    ) async {
      await tester.pumpWidget(
        _app(
          data: {
            'customerFirstName': '',
            'customerLastName': '',
            'rating': 3,
            'comment': 'Good overall.',
          },
        ),
      );

      expect(find.text('Customer'), findsOneWidget);

      expect(find.text('F'), findsOneWidget);

      expect(find.bySemanticsLabel('3 out of 5 stars'), findsOneWidget);
    });

    testWidgets('clamps invalid ratings to the supported range', (
      tester,
    ) async {
      await tester.pumpWidget(
        _app(
          data: {
            'customerFirstName': 'Test',
            'rating': 99,
            'comment': 'Rating test.',
          },
        ),
      );

      expect(find.bySemanticsLabel('5 out of 5 stars'), findsOneWidget);
    });

    testWidgets('remains usable with large text scaling', (tester) async {
      await tester.pumpWidget(
        _app(
          textScale: 2,
          data: {
            'customerFirstName': 'Gabriel',
            'customerLastName': 'Customer',
            'rating': 5,
            'comment':
                'The service was excellent and the entire team handled our event professionally.',
            'createdAt': Timestamp.fromDate(DateTime(2026, 8, 10)),
            'providerReply':
                'Thank you very much for your detailed feedback. We hope to serve you again.',
            'providerReplyAt': Timestamp.fromDate(DateTime(2026, 8, 11)),
          },
        ),
      );

      expect(tester.takeException(), isNull);

      expect(find.text('Gabriel Customer'), findsOneWidget);

      expect(find.text('Provider response'), findsOneWidget);
    });
  });

  group('formatProviderReviewDate', () {
    test('formats Firestore timestamps consistently', () {
      final result = formatProviderReviewDate(
        Timestamp.fromDate(DateTime(2026, 8, 16)),
      );

      expect(result, 'Aug 16, 2026');
    });

    test('returns empty text for unsupported values', () {
      expect(formatProviderReviewDate(null), '');

      expect(formatProviderReviewDate('2026-08-16'), '');
    });
  });
}

Widget _app({required Map<String, dynamic> data, double textScale = 1}) {
  return MaterialApp(
    home: MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(textScale)),
      child: Scaffold(
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: ProviderReviewCard(data: data),
        ),
      ),
    ),
  );
}
