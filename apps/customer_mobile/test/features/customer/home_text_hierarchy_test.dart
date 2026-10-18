import 'package:feasta/core/theme/app_colors.dart';
import 'package:feasta/features/customer/customer_home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets(
    'Home headings, supporting text, and actions have distinct roles',
    (tester) async {
      var tapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                const HomeGreeting(firstName: 'there'),
                HomeSectionHeader(
                  title: 'Event Services',
                  subtitle: 'Explore services',
                  onSeeAll: () => tapped = true,
                ),
                HomeSectionHeader(
                  title: 'Recommended for You',
                  subtitle: 'Verified providers',
                  onSeeAll: () {},
                ),
                const HomePromotionEmptyCard(),
              ],
            ),
          ),
        ),
      );
      for (final title in [
        'Hi, there!',
        'Event Services',
        'Recommended for You',
      ]) {
        expect(
          tester.widget<Text>(find.text(title)).style?.color,
          const Color(0xFF202525),
        );
      }
      for (final label in [
        'Explore services',
        'Verified providers',
        'No promotions are available right now.',
      ]) {
        expect(
          tester.widget<Text>(find.text(label)).style?.color,
          const Color(0xFF64716D),
        );
      }
      final greeting = find.textContaining(
        RegExp('Good (morning|afternoon|evening)'),
      );
      expect(
        tester.widget<Text>(greeting).style?.color,
        const Color(0xFF64716D),
      );
      final action = find.widgetWithText(TextButton, 'See all').first;
      expect(
        tester.widget<TextButton>(action).style?.foregroundColor?.resolve({}),
        AppColors.primaryStrong,
      );
      await tester.tap(action);
      expect(tapped, isTrue);
      expect(tester.takeException(), isNull);
    },
  );
}
