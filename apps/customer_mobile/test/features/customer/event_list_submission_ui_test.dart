import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/event_list/event_list_controller.dart';
import 'package:feasta/features/customer/event_list/event_list_scope.dart';
import 'package:feasta/features/customer/event_list/event_list_store.dart';
import 'package:feasta/features/customer/event_list/event_list_submission_screen.dart';
import 'booking_agreement_fixtures.dart';
import 'customer_event_list_test.dart' show EventAuth, MemoryEventStorage;
import 'event_list_submission_test.dart' show submissionEntry, SubmissionMemory;

void main() {
  testWidgets(
    'coordinated review at 320px and both text scales preserves the list on Back',
    (tester) async {
      // The production store serializes through a process-wide Future queue.
      // Keep both layouts in one fake-async zone, like the existing list UI suite.
      for (final scale in [1.0, 2.0]) {
        final auth = EventAuth();
        final list = EventListController(
          store: EventListStore(storage: MemoryEventStorage()),
          authentication: auth,
        );
        addTearDown(list.dispose);
        addTearDown(auth.dispose);
        await list.addPackage(submissionEntry(1));
        await list.addPackage(submissionEntry(2));
        final before = list.list!.toJson();
        final calls = <String>[];
        tester.view.physicalSize = const Size(320, 760);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          EventListScope(
            controller: list,
            child: MaterialApp(
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(
                  context,
                ).copyWith(textScaler: TextScaler.linear(scale)),
                child: child!,
              ),
              home: Builder(
                builder: (context) => Scaffold(
                  body: TextButton(
                    onPressed: () => Navigator.of(context).push<void>(
                      MaterialPageRoute(
                        builder: (_) => EventListSubmissionScreen(
                          store: SubmissionMemory(),
                          call: (name, data) async {
                            calls.add(name);
                            return {
                              'agreements': [
                                agreementFixture(),
                                agreementFixture(
                                  provider: 'provider_456',
                                  keyCharacter: 'b',
                                ),
                              ],
                              'refundPolicies': {
                                'rolloutMode': 'off',
                                'acknowledgementsRequired': false,
                                'policies': [],
                              },
                            };
                          },
                        ),
                      ),
                    ),
                    child: const Text('Review saved event'),
                  ),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Review saved event'));
        await tester.pumpAndSettle();
        expect(calls, ['getMultiProviderBookingDisclosures']);
        expect(find.text('Review event request'), findsOneWidget);
        final submit = tester.widget<ElevatedButton>(
          find.widgetWithText(ElevatedButton, 'Submit event booking request'),
        );
        expect(submit.onPressed, isNull);
        await tester.scrollUntilVisible(find.text('Event details'), 120);
        expect(find.text('Event details'), findsOneWidget);
        await tester.scrollUntilVisible(find.text('Package 1'), 150);
        expect(find.text('Package & customization'), findsWidgets);
        expect(find.text('Provider 1'), findsOneWidget);
        expect(find.text('₱100.00'), findsOneWidget);
        await tester.scrollUntilVisible(find.text('Package 2'), 150);
        expect(find.text('Provider 2'), findsOneWidget);
        expect(find.text('₱200.00'), findsOneWidget);
        for (var i = 0; i < 20; i++) {
          await tester.drag(find.byType(ListView), const Offset(0, -450));
          await tester.pump();
          expect(tester.takeException(), isNull);
        }
        await tester.pageBack();
        await tester.pumpAndSettle();
        expect(list.list!.toJson(), before);
        expect(calls, ['getMultiProviderBookingDisclosures']);
        await tester.pumpWidget(const SizedBox.shrink());
        await list.load();
        await tester.pump();
      }
    },
  );
}
