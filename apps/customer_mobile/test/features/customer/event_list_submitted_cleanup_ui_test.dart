import 'package:feasta/features/customer/booking_agreement_terms.dart';
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
    'confirmed submissions and recovery update the mobile list; uncertain outcomes retain it',
    (tester) async {
      tester.view.physicalSize = const Size(1000, 16000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      for (final outcome in [
        'created',
        'confirmed_created',
        'unresolved',
        'confirmed_rejected',
        'cleanup-failure',
      ]) {
        final auth = EventAuth();
        final storage = MemoryEventStorage();
        final list = EventListController(
          store: EventListStore(storage: storage),
          authentication: auth,
        );
        addTearDown(list.dispose);
        addTearDown(auth.dispose);
        await list.addPackage(submissionEntry(1));
        await list.addPackage(submissionEntry(2));
        var dispatches = 0;
        await tester.pumpWidget(
          EventListScope(
            controller: list,
            child: MaterialApp(
              home: EventListSubmissionScreen(
                store: SubmissionMemory(),
                call: (name, data) async {
                  final booking = {
                    'bookingId': 'booking_123',
                    'mainEventId': 'booking_123',
                    'providerRequestIds': ['request_123', 'request_456'],
                    'created': true,
                  };
                  if (name == 'getMultiProviderBookingDisclosures') {
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
                  }
                  if (name == 'reconcileBookingSubmission') {
                    return {
                      'clientRequestId': data['clientRequestId'],
                      'outcome': outcome,
                      'booking': booking,
                    };
                  }
                  dispatches++;
                  if (outcome == 'cleanup-failure') storage.failWrite = true;
                  if (outcome != 'created' && outcome != 'cleanup-failure') {
                    throw StateError('connection lost');
                  }
                  return booking;
                },
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        final terms = tester
            .widgetList<BookingAgreementTerms>(
              find.byType(BookingAgreementTerms),
            )
            .toList();
        expect(terms, hasLength(2));
        for (final term in terms) {
          term.onChanged!(true);
        }
        await tester.pump();
        await tester.tap(
          find.widgetWithText(ElevatedButton, 'Submit event booking request'),
        );
        await tester.pumpAndSettle();
        if (outcome != 'created' && outcome != 'cleanup-failure') {
          expect(list.list!.entries, hasLength(2));
          await tester.tap(find.text('Check previous request'));
          await tester.pumpAndSettle();
        }
        if (outcome == 'created' || outcome == 'confirmed_created') {
          expect(list.list!.entries, isEmpty, reason: outcome);
          expect(find.text('Booking request recorded'), findsOneWidget);
          expect(
            find.textContaining('Submitted items removed'),
            findsOneWidget,
          );
          await list.load();
          expect(list.list!.entries, isEmpty);
        } else if (outcome == 'cleanup-failure') {
          expect(list.list!.entries, hasLength(2));
          expect(find.text('Booking request recorded'), findsOneWidget);
          expect(find.textContaining('Booking recorded, but'), findsOneWidget);
          storage.failWrite = false;
          await tester.tap(find.text('Retry Event List update'));
          await tester.pumpAndSettle();
          expect(list.list!.entries, isEmpty);
        } else {
          expect(list.list!.entries, hasLength(2));
          expect(find.text('Booking request recorded'), findsNothing);
        }
        expect(dispatches, 1);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      }
    },
  );
}
