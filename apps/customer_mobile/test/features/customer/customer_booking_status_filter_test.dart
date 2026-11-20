import 'package:flutter_test/flutter_test.dart';

import 'package:feasta/features/customer/customer_booking_status_filter.dart';

void main() {
  group('Customer booking tab status parity', () {
    test('provider rejection is in All, never Pending or Upcoming', () {
      const status = 'needs_provider_replacement';

      expect(customerBookingStatusMatchesFilter(status, 'All'), isTrue);
      expect(customerBookingStatusMatchesFilter(status, 'Pending'), isFalse);
      expect(customerBookingStatusMatchesFilter(status, 'Upcoming'), isFalse);
      expect(customerBookingStatusMatchesFilter(status, 'Past'), isFalse);
    });

    test('pending provider approval remains Pending', () {
      const status = 'pending_provider_approval';

      expect(customerBookingStatusMatchesFilter(status, 'All'), isTrue);
      expect(customerBookingStatusMatchesFilter(status, 'Pending'), isTrue);
      expect(customerBookingStatusMatchesFilter(status, 'Upcoming'), isFalse);
      expect(customerBookingStatusMatchesFilter(status, 'Past'), isFalse);
    });

    test('payment-required bookings remain Pending', () {
      for (final status in [
        'waiting_payment',
        'waiting_for_down_payment',
        'payment_processing',
      ]) {
        expect(
          customerBookingStatusMatchesFilter(status, 'Pending'),
          isTrue,
          reason: status,
        );
      }
    });

    test('confirmed bookings remain Upcoming', () {
      const status = 'confirmed';

      expect(customerBookingStatusMatchesFilter(status, 'All'), isTrue);
      expect(customerBookingStatusMatchesFilter(status, 'Pending'), isFalse);
      expect(customerBookingStatusMatchesFilter(status, 'Upcoming'), isTrue);
      expect(customerBookingStatusMatchesFilter(status, 'Past'), isFalse);
    });

    test('terminal bookings remain in Past', () {
      for (final status in [
        'completed',
        'cancelled',
        'expired',
        'rejected',
      ]) {
        expect(
          customerBookingStatusMatchesFilter(status, 'Past'),
          isTrue,
          reason: status,
        );
        expect(
          customerBookingStatusMatchesFilter(status, 'Pending'),
          isFalse,
          reason: status,
        );
        expect(
          customerBookingStatusMatchesFilter(status, 'Upcoming'),
          isFalse,
          reason: status,
        );
      }
    });

    test('pending and accepted requests do not become Upcoming', () {
      for (final status in ['pending', 'accepted']) {
        expect(
          customerBookingStatusMatchesFilter(status, 'Pending'),
          isTrue,
          reason: status,
        );
        expect(
          customerBookingStatusMatchesFilter(status, 'Upcoming'),
          isFalse,
          reason: status,
        );
      }
    });
    test('newly created booking appears before older booking', () {
      final older = DateTime.utc(2026, 11, 13);
      final newer = DateTime.utc(2026, 11, 15);

      expect(
        compareCustomerBookingCreatedNewest(
          newer, 'new', older, 'old',
        ),
        lessThan(0),
      );
      expect(
        compareCustomerBookingCreatedNewest(
          older, 'old', newer, 'new',
        ),
        greaterThan(0),
      );
    });

    test('creation time wins over event date and booking status', () {
      final sameCreatedAt = DateTime.utc(2026, 11, 15);

      expect(
        compareCustomerBookingCreatedNewest(
          sameCreatedAt, 'booking-b',
          sameCreatedAt, 'booking-a',
        ),
        lessThan(0),
      );
    });

    test('missing creation timestamps sort last', () {
      final created = DateTime.utc(2026, 11, 15);

      expect(
        compareCustomerBookingCreatedNewest(
          created, 'a', null, 'b',
        ),
        lessThan(0),
      );
      expect(
        compareCustomerBookingCreatedNewest(
          null, 'a', created, 'b',
        ),
        greaterThan(0),
      );
    });

    test('sorting remains deterministic when timestamps are missing', () {
      expect(
        compareCustomerBookingCreatedNewest(
          null, 'booking-b', null, 'booking-a',
        ),
        lessThan(0),
      );
    });
  });
}
