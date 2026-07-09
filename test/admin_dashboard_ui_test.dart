import 'package:feasta/web/admin/pages/dashboard_page.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('dashboard shows a refreshed overview summary', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: DashboardPage()));

    expect(find.text('Operations snapshot'), findsOneWidget);
    expect(find.text('Provider verification'), findsOneWidget);
  });
}
