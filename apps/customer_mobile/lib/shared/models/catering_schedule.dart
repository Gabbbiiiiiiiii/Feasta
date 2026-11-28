// Service-tier-aware catering schedule helpers.
// Drop-Off uses Estimated Drop-Off Time + "to" (still eventEndTime);
// Buffet Setup and Full-Service keep Event Start / Event End labels.

const dropOffTimeLabel = 'Estimated Drop-Off Time';
const dropOffTimeHelper =
    'Delivery window for your event location, for example 10:30 to 11:00.';
const dropOffEndTimeLabel = 'to';
const eventStartTimeLabel = 'Event Start Time';
const eventEndTimeLabel = 'Event End Time';

enum CateringScheduleMode { dropOffTime, eventRange }

CateringScheduleMode cateringScheduleMode(String? serviceTier) {
  return serviceTier == 'drop_off'
      ? CateringScheduleMode.dropOffTime
      : CateringScheduleMode.eventRange;
}

bool usesDropOffTimeDisplay({
  String? serviceTier,
  String? eventTime,
  String? eventEndTime,
}) {
  final start = eventTime?.trim() ?? '';
  final end = eventEndTime?.trim() ?? '';
  if (cateringScheduleMode(serviceTier) == CateringScheduleMode.dropOffTime) {
    return start.isNotEmpty && (end.isEmpty || end == start);
  }
  return start.isNotEmpty && (end.isEmpty || end == start);
}

String cateringScheduleFieldLabel({
  required String field,
  String? serviceTier,
}) {
  final dropOff =
      cateringScheduleMode(serviceTier) == CateringScheduleMode.dropOffTime;
  if (field == 'eventTime') {
    return dropOff ? dropOffTimeLabel : eventStartTimeLabel;
  }
  return dropOff ? dropOffEndTimeLabel : eventEndTimeLabel;
}
