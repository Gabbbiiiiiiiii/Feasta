import 'dart:async';
import 'package:feasta/features/customer/customer_bookings_controller.dart';
import 'package:feasta/features/customer/customer_bookings_screen.dart';
import 'package:feasta/core/theme/app_theme.dart';
import 'package:feasta/shared/models/feasta_models.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';

BookingModel booking({
  String id = 'booking-1',
  String uid = 'customer-1',
  String status = 'confirmed',
  int? pending,
  int? rejected,
}) => BookingModel(
  id: id,
  bookingCode: 'FEASTA-001',
  customerId: uid,
  providerId: 'provider-1',
  providerRequestIds: const ['provider-request-1'],
  packageId: 'package-1',
  customerFirstName: 'Ana',
  customerLastName: 'Dela Cruz',
  customerEmail: 'ana@example.test',
  customerPhoneNumber: '09170000000',
  providerBusinessName:
      'A deliberately long provider business name that must remain readable',
  packageName: 'Celebration package',
  eventType: 'Wedding reception',
  eventDate: DateTime(2027, 2, 14),
  eventTime: '10:00',
  eventEndTime: '14:00',
  guestCount: 100,
  eventLocation: 'Manila',
  eventAddress: 'Manila',
  selectedFoods: const [],
  selectedDecorations: const [],
  selectedFurniture: const [],
  selectedAddOns: const [],
  willArrangeOwnAddOns: false,
  customerArrangedAddOnsNote: '',
  specialRequest: '',
  packagePrice: 50000,
  addOnsTotal: 0,
  totalAmount: 50000,
  downPaymentPercentage: 20,
  downPaymentAmount: 10000,
  remainingBalance: 40000,
  pendingProviderRequestCount: pending,
  rejectedProviderRequestCount: rejected,
  status: status,
  paymentStatus: 'pending',
  cancellationStatus: 'none',
  refundStatus: 'none',
  refundAmount: 0,
  refundPercentage: 0,
  recoveryStatus: 'none',
  originalProviderId: 'provider-1',
  currentProviderId: 'provider-1',
  rejectedByProviderIds: const [],
);

class FakeSource implements CustomerBookingsSource {
  @override
  String? currentUid = 'customer-1';
  final auth = StreamController<String?>.broadcast();
  final requests = <StreamController<CustomerBookingsPage>>[];
  final cursors = <Object?>[];
  int cancellations = 0;
  final callbacks = <void Function(CustomerBookingsPage)>[];
  @override
  Stream<String?> get accounts => auth.stream;
  @override
  Stream<CustomerBookingsPage> watch(String uid, Object? cursor) {
    expect(uid, currentUid);
    cursors.add(cursor);
    final stream = StreamController<CustomerBookingsPage>.broadcast(
      onCancel: () => cancellations++,
    );
    requests.add(stream);
    return CapturedStream(stream.stream, callbacks.add);
  }

  void emit(int index, int start, int count, bool more) {
    requests[index].add(
      CustomerBookingsPage(
        List.generate(count, (i) => booking(id: '${start + i}')),
        'cursor-${start + count}',
        more,
      ),
    );
  }

  void account(String? uid) {
    currentUid = uid;
    auth.add(uid);
  }
}

// Retain the callback so tests can force an already-canceled listener to fire.
class CapturedStream extends Stream<CustomerBookingsPage> {
  CapturedStream(this.delegate, this.capture);
  final Stream<CustomerBookingsPage> delegate;
  final void Function(void Function(CustomerBookingsPage)) capture;
  @override
  StreamSubscription<CustomerBookingsPage> listen(
    void Function(CustomerBookingsPage)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    capture(onData!);
    return delegate.listen(
      onData,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }
}

Future<void> tick() => Future<void>.delayed(Duration.zero);
void main() {
  test(
    'initial and repeated identical auth events keep one immediate listener',
    () async {
      final source = FakeSource();
      final c = CustomerBookingsController(source);
      expect(c.loading, true);
      expect(source.requests, hasLength(1));
      for (var i = 0; i < 3; i++) {
        source.account('customer-1');
        await tick();
      }
      expect(source.requests, hasLength(1));
      expect(source.cancellations, 0);
      source.emit(0, 0, 1, false);
      await tick();
      source.account('customer-1');
      await tick();
      expect(c.bookings, hasLength(1));
      expect(source.requests, hasLength(1));
      c.dispose();
      expect(source.cancellations, 1);
    },
  );
  test(
    'signed-out startup waits for sign-in and disposal cancels auth',
    () async {
      final source = FakeSource()..currentUid = null;
      final c = CustomerBookingsController(source);
      expect(c.loading, false);
      expect(c.signedIn, false);
      expect(c.bookings, isEmpty);
      source.account(null);
      await tick();
      expect(source.requests, isEmpty);
      source.account('customer-1');
      await tick();
      expect(source.requests, hasLength(1));
      expect(c.loading, true);
      source.account('customer-2');
      c.dispose();
      await tick();
      expect(source.requests, hasLength(1));
      expect(source.cancellations, 1);
      expect(source.auth.hasListener, false);
      source.callbacks.first(CustomerBookingsPage([booking()], 'old', false));
    },
  );
  test(
    'A to B to A rejects forced stale callbacks and cancels each old listener',
    () async {
      final source = FakeSource();
      final c = CustomerBookingsController(source);
      source.emit(0, 0, 1, true);
      await tick();
      final pending = c.loadMore();
      source.account('customer-2');
      await tick();
      await pending;
      expect(source.cancellations, 2);
      expect(c.bookings, isEmpty);
      source.callbacks[0](CustomerBookingsPage([booking()], 'stale', true));
      expect(c.bookings, isEmpty);
      source.account('customer-1');
      await tick();
      expect(source.requests, hasLength(4));
      expect(source.cancellations, 3);
      source.callbacks[0](CustomerBookingsPage([booking()], 'stale', true));
      source.callbacks[1](CustomerBookingsPage([booking()], 'stale', true));
      source.callbacks[2](
        CustomerBookingsPage([booking(uid: 'customer-2')], 'b', false),
      );
      expect(c.bookings, isEmpty);
      expect(c.loading, true);
      source.emit(3, 100, 1, false);
      await tick();
      expect(c.bookings.single.id, '100');
      c.dispose();
      expect(source.cancellations, 4);
    },
  );
  test(
    'sign-out during loading cancels both pages and rejects stale callback',
    () async {
      final source = FakeSource();
      final c = CustomerBookingsController(source);
      source.emit(0, 0, 1, true);
      await tick();
      final pending = c.loadMore();
      source.account(null);
      await tick();
      await pending;
      expect(source.cancellations, 2);
      source.callbacks[1](CustomerBookingsPage([booking()], 'old', false));
      expect(c.bookings, isEmpty);
      expect(c.loading, false);
      expect(c.signedIn, false);
      c.dispose();
    },
  );
  for (final large in [false, true]) {
    testWidgets(
      'pagination semantics through loading failure refresh and invalidation large=$large',
      (tester) async {
        final semantics = tester.ensureSemantics();
        try {
          if (large) {
            tester.view.physicalSize = const Size(320, 800);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
          }
          final source = FakeSource();
          await tester.pumpWidget(
            MaterialApp(
              theme: AppTheme.light,
              home: MediaQuery(
                data: MediaQueryData(
                  textScaler: TextScaler.linear(large ? 2 : 1),
                ),
                child: Scaffold(body: CustomerBookingsScreen(source: source)),
              ),
            ),
          );
          expect(find.bySemanticsLabel('Loading list'), findsOneWidget);
          expect(find.bySemanticsLabel('Load More'), findsNothing);
          source.emit(0, 0, 1, true);
          await tester.pumpAndSettle();
          await tester.scrollUntilVisible(find.text('Load More'), 200);
          final load = tester.getSemantics(find.bySemanticsLabel('Load More'));
          expect(load.getSemanticsData().hasAction(SemanticsAction.tap), true);
          await tester.tap(find.text('Load More'));
          await tester.pump();
          final loading = find.bySemanticsLabel('Loading more bookings.');
          expect(loading, findsOneWidget);
          expect(
            tester
                .getSemantics(loading)
                .getSemanticsData()
                .flagsCollection
                .isLiveRegion,
            true,
          );
          expect(find.bySemanticsLabel('Load More'), findsNothing);
          source.requests[1].addError(StateError('offline'));
          await tester.pumpAndSettle();
          final failure = find.bySemanticsLabel(
            'Could not load older bookings. Please retry.',
          );
          expect(
            tester
                .getSemantics(failure)
                .getSemanticsData()
                .flagsCollection
                .isLiveRegion,
            true,
          );
          expect(find.bySemanticsLabel('Loading more bookings.'), findsNothing);
          expect(
            tester
                .getSemantics(find.bySemanticsLabel('Retry'))
                .getSemanticsData()
                .hasAction(SemanticsAction.tap),
            true,
          );
          await tester.ensureVisible(find.text('Retry'));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Retry'));
          await tester.pump();
          expect(failure, findsNothing);
          source.emit(2, 1, 1, false);
          await tester.pumpAndSettle();
          await tester.scrollUntilVisible(
            find.text('You have reached the end of available bookings.'),
            200,
          );
          expect(
            find.bySemanticsLabel(
              'You have reached the end of available bookings.',
            ),
            findsOneWidget,
          );
          expect(find.bySemanticsLabel('Load More'), findsNothing);
          source.emit(0, 100, 1, true);
          await tester.pumpAndSettle();
          await tester.scrollUntilVisible(find.text('Load More'), -200);
          final updated = find.bySemanticsLabel(
            'Bookings updated. Load older bookings again.',
          );
          expect(updated, findsOneWidget);
          expect(
            tester
                .getSemantics(updated)
                .getSemanticsData()
                .flagsCollection
                .isLiveRegion,
            true,
          );
          final refresh = tester
              .widget<RefreshIndicator>(find.byType(RefreshIndicator))
              .onRefresh();
          await tester.pump();
          expect(find.bySemanticsLabel('Loading list'), findsOneWidget);
          expect(updated, findsNothing);
          expect(find.bySemanticsLabel('Loading more bookings.'), findsNothing);
          source.emit(3, 200, 1, false);
          await refresh;
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.pumpWidget(const SizedBox());
        } finally {
          semantics.dispose();
        }
      },
    );
  }
  for (final count in [0, 7, 20]) {
    test('$count bookings ends without another request', () async {
      final source = FakeSource();
      final c = CustomerBookingsController(source);
      source.emit(0, 0, count, false);
      await tick();
      expect(c.bookings.length, count);
      expect(c.hasMore, false);
      await c.loadMore();
      expect(source.requests.length, 1);
      c.dispose();
    });
  }
  test(
    'multiple pages, stable cursor, duplicate suppression and end',
    () async {
      final source = FakeSource();
      final c = CustomerBookingsController(source);
      source.emit(0, 0, 20, true);
      await tick();
      final pending = c.loadMore();
      c.loadMore();
      expect(source.requests.length, 2);
      expect(source.cursors.last, 'cursor-20');
      source.emit(1, 19, 20, true);
      await pending;
      expect(c.bookings.length, 39);
      final last = c.loadMore();
      source.emit(2, 39, 3, false);
      await last;
      expect(c.bookings.map((b) => b.id).toSet().length, 42);
      expect(c.hasMore, false);
      c.dispose();
    },
  );
  test('failure retains bookings and retry uses same cursor', () async {
    final source = FakeSource();
    final c = CustomerBookingsController(source);
    source.emit(0, 0, 20, true);
    await tick();
    final pending = c.loadMore();
    source.requests[1].addError(StateError('offline'));
    await pending;
    expect(c.bookings.length, 20);
    expect(c.error, isNotNull);
    final retry = c.loadMore();
    expect(source.cursors.last, 'cursor-20');
    source.emit(2, 20, 2, false);
    await retry;
    expect(c.bookings.length, 22);
    expect(c.error, isNull);
    c.dispose();
  });
  test(
    'new, changed or deleted head invalidates loaded and pending descendants',
    () async {
      final source = FakeSource();
      final c = CustomerBookingsController(source);
      source.emit(0, 0, 20, true);
      await tick();
      final pending = c.loadMore();
      source.emit(1, 20, 20, true);
      await pending;
      final next = c.loadMore();
      source.emit(0, 100, 19, true);
      await tick();
      await next;
      source.emit(2, 40, 5, false);
      await tick();
      expect(c.bookings.length, 19);
      expect(c.bookings.first.id, '100');
      c.dispose();
    },
  );
  for (final uid in ['customer-2', null]) {
    test(
      'account $uid while loading clears and ignores old responses',
      () async {
        final source = FakeSource();
        final c = CustomerBookingsController(source);
        source.emit(0, 0, 20, true);
        await tick();
        final pending = c.loadMore();
        source.account(uid);
        await tick();
        await pending;
        source.emit(1, 20, 5, false);
        await tick();
        expect(c.bookings, isEmpty);
        expect(c.signedIn, uid != null);
        c.dispose();
      },
    );
  }
  test('ownership mismatch is rejected', () async {
    final source = FakeSource();
    final c = CustomerBookingsController(source);
    source.requests.first.add(
      CustomerBookingsPage([booking(uid: 'other')], null, false),
    );
    await tick();
    expect(c.bookings, isEmpty);
    expect(c.error, isNotNull);
    c.dispose();
  });
  test(
    'refresh waits for fresh page and disposal ignores pending events',
    () async {
      final source = FakeSource();
      final c = CustomerBookingsController(source);
      source.emit(0, 0, 20, true);
      await tick();
      var completed = false;
      final refresh = c.refresh().then((_) => completed = true);
      await tick();
      expect(completed, false);
      expect(c.bookings, isEmpty);
      source.emit(1, 100, 1, false);
      await refresh;
      expect(c.bookings.single.id, '100');
      final pending = c.refresh();
      c.dispose();
      await pending;
      source.emit(2, 0, 5, false);
      await tick();
    },
  );
  test('older page change invalidates only its descendants', () async {
    final source = FakeSource();
    final c = CustomerBookingsController(source);
    source.emit(0, 0, 20, true);
    await tick();
    final second = c.loadMore();
    source.emit(1, 20, 20, true);
    await second;
    final third = c.loadMore();
    source.emit(2, 40, 5, false);
    await third;
    source.emit(1, 200, 19, true);
    await tick();
    expect(c.bookings.length, 39);
    expect(c.bookings.first.id, '0');
    expect(c.bookings.last.id, '218');
    expect(c.historyUpdated, true);
    c.dispose();
  });
  test(
    'new account gets only its own pages after old pending completion',
    () async {
      final source = FakeSource();
      final c = CustomerBookingsController(source);
      source.emit(0, 0, 20, true);
      await tick();
      final old = c.loadMore();
      source.account('customer-2');
      await tick();
      await old;
      source.requests[2].add(
        CustomerBookingsPage([booking(id: 'b', uid: 'customer-2')], 'b', false),
      );
      await tick();
      source.emit(1, 20, 5, false);
      await tick();
      expect(c.bookings.single.customerId, 'customer-2');
      c.dispose();
    },
  );
  testWidgets(
    'offline first page times out with retry instead of endless loading',
    (tester) async {
      final source = FakeSource();
      final c = CustomerBookingsController(source);
      await tester.pump(const Duration(seconds: 31));
      expect(c.loading, false);
      expect(c.error, isA<TimeoutException>());
      c.dispose();
    },
  );
  testWidgets('pull refresh awaits a new server page', (tester) async {
    final source = FakeSource();
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(body: CustomerBookingsScreen(source: source)),
      ),
    );
    source.emit(0, 0, 1, false);
    await tester.pumpAndSettle();
    await tester.dragFrom(const Offset(160, 180), const Offset(0, 500));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(source.requests.length, 2);
    source.emit(0, 50, 1, false);
    await tester.pump();
    expect(find.text('Showing 1 booking'), findsNothing);
    source.emit(1, 100, 1, false);
    await tester.pumpAndSettle();
    expect(find.text('Showing 1 booking'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('narrow large-text screen loads more and offers retry', (
    tester,
  ) async {
    final source = FakeSource();
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: Scaffold(body: CustomerBookingsScreen(source: source)),
        ),
      ),
    );
    source.emit(0, 0, 1, true);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Load More'), 300);
    await tester.tap(find.text('Load More'));
    await tester.pump();
    expect(source.requests.length, 2);
    source.requests[1].addError(StateError('offline'));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
