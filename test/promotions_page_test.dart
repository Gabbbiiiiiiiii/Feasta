import 'package:feasta/models/promotion_model.dart';
import 'package:feasta/services/promotion_service.dart';
import 'package:feasta/web/pages/promotions_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class FakePromotionService extends PromotionService {
  FakePromotionService() : super(repository: null);

  @override
  Stream<List<PromotionModel>> watchPromotions({bool includeInactive = true}) {
    return Stream.value(const <PromotionModel>[]);
  }
}

void main() {
  testWidgets('promotions page shows empty state and new promotion action', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: PromotionsPage(service: FakePromotionService()),
      ),
    );

    expect(find.text('Promotions'), findsOneWidget);
    expect(find.text('No promotions yet'), findsOneWidget);
    expect(find.text('New Promotion'), findsOneWidget);
  });
}
