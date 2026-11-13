import 'package:flutter_test/flutter_test.dart';
import 'package:feasta/features/customer/booking_submission_deadline_notice.dart';

void main() {
  final date = DateTime(2026, 11, 14);

  test('allows more than 24 hours before event start', () {
    expect(
      bookingSubmissionDeadlineNoticeMobile(
        eventDate: date,
        startMinutes: 600,
        now: DateTime.utc(2026, 11, 13, 1, 59, 59, 999),
      ),
      isNull,
    );
  });

  test('rejects exactly 24 hours before start', () {
    expect(
      bookingSubmissionDeadlineNoticeMobile(
        eventDate: date,
        startMinutes: 600,
        now: DateTime.utc(2026, 11, 13, 2),
      ),
      bookingSubmissionDeadlineWarning,
    );
  });

  test('rejects an event inside the deadline window', () {
    expect(
      bookingSubmissionDeadlineNoticeMobile(
        eventDate: date,
        startMinutes: 600,
        now: DateTime.utc(2026, 11, 13, 4),
      ),
      bookingSubmissionDeadlineWarning,
    );
  });

  test('changing to a later start clears the warning', () {
    final now = DateTime.utc(2026, 11, 13, 2);

    expect(
      bookingSubmissionDeadlineNoticeMobile(
        eventDate: date,
        startMinutes: 600,
        now: now,
      ),
      isNotNull,
    );

    expect(
      bookingSubmissionDeadlineNoticeMobile(
        eventDate: date,
        startMinutes: 601,
        now: now,
      ),
      isNull,
    );
  });

  test('an offset-aware time produces the same result', () {
    expect(
      bookingSubmissionDeadlineNoticeMobile(
        eventDate: date,
        startMinutes: 600,
        now: DateTime.parse('2026-11-13T10:00:00+08:00'),
      ),
      bookingSubmissionDeadlineWarning,
    );
  });

  test('missing event details defer to existing validation', () {
    expect(
      bookingSubmissionDeadlineNoticeMobile(eventDate: null, startMinutes: 600),
      isNull,
    );

    expect(
      bookingSubmissionDeadlineNoticeMobile(
        eventDate: date,
        startMinutes: null,
      ),
      isNull,
    );
  });

  test('invalid minute values defer to existing validation', () {
    for (final minutes in [-1, 1440]) {
      expect(
        bookingSubmissionDeadlineNoticeMobile(
          eventDate: date,
          startMinutes: minutes,
        ),
        isNull,
      );
    }
  });
}
