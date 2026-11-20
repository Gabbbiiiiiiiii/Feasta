import 'package:feasta/core/widgets/widgets.dart';
import 'package:feasta/features/customer/special_request_screen.dart';
import 'package:feasta/shared/models/provider_calendar_month.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('special request status labels match web customer copy', () {
    expect(specialRequestStatus('pending_review').label, 'Under review');
    expect(
      specialRequestStatus('needs_clarification').label,
      'Provider needs more details',
    );
    expect(
      specialRequestStatus('quotation_sent').label,
      'Price offer received',
    );
    expect(
      specialRequestStatus('converted_to_booking').tone,
      FeastaStatusTone.success,
    );
    expect(specialRequestStatus('declined').tone, FeastaStatusTone.error);
  });

  test('event dates use civil calendar keys like the provider calendar', () {
    expect(calendarDateKey(DateTime(2027, 2, 5)), '2027-02-05');
    expect(calendarDateKey(DateTime(2027, 11, 20)), '2027-11-20');
  });

  test('money formatting stays peso-prefixed for published estimates', () {
    expect(specialRequestMoney(1250), '₱1250.00');
    expect(specialRequestMoney(99.5), '₱99.50');
  });
}
