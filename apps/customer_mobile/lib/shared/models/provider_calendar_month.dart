/// Civil dates are scheduling dates, never device-local instants.
String calendarDateKey(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

DateTime manilaToday([DateTime? now]) {
  final manila = (now ?? DateTime.now()).toUtc().add(const Duration(hours: 8));
  return DateTime(manila.year, manila.month, manila.day);
}

enum CalendarAvailability {
  available('Available'),
  booked('Booked'),
  onHold('On hold'),
  unavailable('Unavailable'),
  unknown('Availability unknown');

  const CalendarAvailability(this.label);
  final String label;
}

class ProviderCalendarMonth {
  ProviderCalendarMonth.parse(dynamic data, String expectedMonth) {
    if (data is! Map ||
        data['month'] != expectedMonth ||
        data['dates'] is! List ||
        (data['dates'] as List).length > 31) {
      throw const FormatException('Invalid calendar response.');
    }
    month = expectedMonth;
    final parsed = <String, CalendarAvailability>{};
    for (final row in data['dates'] as List) {
      if (row is! Map || row['date'] is! String) {
        throw const FormatException('Invalid calendar date.');
      }
      final key = row['date'] as String;
      final date = DateTime.tryParse(key);
      final state = switch (row['state']) {
        'booked' => CalendarAvailability.booked,
        'on_hold' => CalendarAvailability.onHold,
        'unavailable' => CalendarAvailability.unavailable,
        _ => null,
      };
      if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(key) ||
          !key.startsWith('$month-') ||
          date == null ||
          calendarDateKey(date) != key ||
          state == null ||
          parsed.containsKey(key)) {
        throw const FormatException('Invalid calendar date.');
      }
      parsed[key] = state;
    }
    dates = Map.unmodifiable(parsed);
  }

  late final String month;
  late final Map<String, CalendarAvailability> dates;

  CalendarAvailability status(DateTime date, {DateTime? today}) {
    final key = calendarDateKey(date);
    if (key.compareTo(calendarDateKey(today ?? manilaToday())) <= 0) {
      return CalendarAvailability.unavailable;
    }
    if (!key.startsWith('$month-')) return CalendarAvailability.unknown;
    return dates[key] ?? CalendarAvailability.available;
  }
}
