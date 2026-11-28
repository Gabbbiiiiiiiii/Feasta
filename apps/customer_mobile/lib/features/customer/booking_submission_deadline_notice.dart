/// Customer-side warning matching FEASTA Web.
///
/// Event start times use Asia/Manila (UTC+08:00).
/// Firebase remains the authoritative booking deadline validator.
const bookingSubmissionDeadlineWarning =
    "This event starts too soon to meet FEASTA's payment deadline "
    "(24 hours before the event). Choose a later event date or start time.";

String? bookingSubmissionDeadlineNoticeMobile({
  required DateTime? eventDate,
  required int? startMinutes,
  DateTime? now,
}) {
  if (eventDate == null ||
      startMinutes == null ||
      startMinutes < 0 ||
      startMinutes >= 1440) {
    return null;
  }

  final eventStartUtc = DateTime.utc(
    eventDate.year,
    eventDate.month,
    eventDate.day,
  ).add(Duration(minutes: startMinutes - 480));

  final deadlineUtc = eventStartUtc.subtract(const Duration(hours: 24));

  final currentUtc = (now ?? DateTime.now()).toUtc();

  // Web rejects the exact 24-hour boundary.
  return currentUtc.isBefore(deadlineUtc)
      ? null
      : bookingSubmissionDeadlineWarning;
}
