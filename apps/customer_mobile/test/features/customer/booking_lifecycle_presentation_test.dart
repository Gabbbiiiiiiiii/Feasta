import 'package:flutter_test/flutter_test.dart';
import '../../../lib/features/customer/booking_lifecycle_presentation.dart';

void main() {
  final data = <String, dynamic>{'status': 'in_progress', 'eventDate': DateTime.utc(2026, 10, 17), 'eventTime': '08:14', 'eventEndTime': '18:14'};
  final end = DateTime.utc(2026, 10, 17, 10, 14);
  test('Manila end boundary and overnight projection preserve canonical status', () {
    expect(bookingLifecycleLabel(data, [], end.subtract(const Duration(milliseconds: 1))), isNull);
    expect(bookingLifecycleLabel(data, [], end), 'Awaiting completion');
    expect(data['status'], 'in_progress');
    expect(scheduledBookingEnd({...data, 'eventTime': '22:00', 'eventEndTime': '01:00'}), DateTime.utc(2026, 10, 17, 17));
    expect(scheduledBookingEnd({...data, 'eventStartAt': DateTime.utc(2026, 10, 17, 3)}), isNull);
  });
  test('ended reconciliation evidence holds completion and active linked blockers take precedence', () {
    for (final patch in [{'lifecycleReconciliationRequired': true}, {'reconciliationRequired': true}, {'refundExecutionLock': {}}, {'remainingBalanceEnforcement': {'status': 'reconciliation_required'}}]) {
      expect(bookingLifecycleLabel(data, [{'status': 'in_progress'}, {'status': 'in_progress', ...patch}], end), 'Completion on hold');
      expect(bookingLifecycleLabel({...data, ...patch}, [], end), 'Completion on hold');
      expect(bookingLifecycleLabel(data, [{'status': 'in_progress', ...patch}], end.subtract(const Duration(milliseconds: 1))), 'Booking review required');
      expect(bookingLifecycleLabel(data, [{'status': 'completed', ...patch}], end), 'Awaiting completion');
    }
    expect(bookingLifecycleLabel(data, [], end, incomplete: true), 'Completion on hold');
    expect(bookingLifecycleLabel(data, [], end.subtract(const Duration(milliseconds: 1)), incomplete: true), 'Booking review required');
  });
  test('cancellation holds remain booking review before and after the event end', () {
    for (final now in [end.subtract(const Duration(milliseconds: 1)), end, end.add(const Duration(days: 1))]) {
      expect(bookingLifecycleLabel(data, [{'status': 'in_progress', 'activeCancellationRequestId': 'request', 'lifecycleReconciliationRequired': true}], now), 'Booking review required');
      expect(bookingLifecycleLabel({...data, 'approvedCancellationRequestId': 'request'}, [], now, incomplete: true), 'Booking review required');
    }
  });
  test('lifecycle messages match the web wording', () {
    expect(bookingLifecycleMessage('Completion on hold'), "The event has ended. FEASTA must verify the booking's completion records before marking it completed.");
    expect(bookingLifecycleMessage('Booking review required'), 'FEASTA needs to resolve a booking review before progression.');
    expect(bookingLifecycleMessage('Awaiting completion'), 'The event has ended and is awaiting completion confirmation.');
    expect(bookingLifecycleMessage(null), isNull);
  });
  test('canonical terminal labels retain precedence', () {
    for (final status in ['completed', 'cancelled', 'expired']) {
      expect(bookingLifecycleLabel({...data, 'status': status, 'lifecycleReconciliationRequired': true}, [], end), isNull);
    }
  });
}
