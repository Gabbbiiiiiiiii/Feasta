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
  test('all linked review blockers take precedence', () {
    for (final patch in [{'lifecycleReconciliationRequired': true}, {'reconciliationRequired': true}, {'activeCancellationRequestId': 'request'}]) {
      expect(bookingLifecycleLabel(data, [{'status': 'in_progress'}, {'status': 'in_progress', ...patch}], end), 'Booking review required');
      expect(bookingLifecycleLabel(data, [{'status': 'completed', ...patch}], end), 'Awaiting completion');
    }
    expect(bookingLifecycleLabel(data, [], end, incomplete: true), 'Booking review required');
  });
  test('canonical terminal labels retain precedence', () {
    for (final status in ['completed', 'cancelled', 'expired']) {
      expect(bookingLifecycleLabel({...data, 'status': status, 'lifecycleReconciliationRequired': true}, [], end), isNull);
    }
  });
}
