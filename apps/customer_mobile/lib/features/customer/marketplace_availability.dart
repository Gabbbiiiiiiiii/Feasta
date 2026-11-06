import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';

class MarketplaceEventContext {
  const MarketplaceEventContext({
    required this.eventDate,
    required this.eventTime,
    required this.eventEndTime,
    required this.guestCount,
  });
  final String eventDate, eventTime, eventEndTime;
  final int guestCount;
  Map<String, dynamic> toJson() => {
    'eventDate': eventDate,
    'eventTime': eventTime,
    'eventEndTime': eventEndTime,
    'guestCount': guestCount,
    'serviceType': 'all',
  };
  String get key => '$eventDate/$eventTime/$eventEndTime/$guestCount';

  String? validate(DateTime now) {
    final date = DateTime.tryParse(eventDate);
    if (date == null ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(eventDate) ||
        '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}' !=
            eventDate) {
      return 'Choose a valid event date.';
    }
    final manila = now.toUtc().add(const Duration(hours: 8));
    if (date.isBefore(DateTime(manila.year, manila.month, manila.day))) {
      return 'Choose today or a future event date.';
    }
    final clock = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');
    if (!clock.hasMatch(eventTime) ||
        !clock.hasMatch(eventEndTime) ||
        eventTime.compareTo(eventEndTime) >= 0) {
      return 'End time must be later than start time on the same day.';
    }
    if (guestCount < 1 || guestCount > 10000) {
      return 'Enter between 1 and 10,000 guests.';
    }
    return null;
  }
}

class MarketplaceAvailability {
  const MarketplaceAvailability(this.providerId, this.available, this.message);
  final String providerId, message;
  final bool available;
}

const _reasons = {
  'PROVIDER_NOT_OPERATIONAL',
  'PROVIDER_SCHEDULE_INVALID',
  'SERVICE_CATEGORY_NOT_SUPPORTED',
  'EVENT_DATE_INVALID',
  'EVENT_TIME_INVALID',
  'OUTSIDE_OPERATING_DAY',
  'BLOCKED_DATE',
  'LEAD_TIME_NOT_MET',
  'MAX_EVENTS_REACHED',
  'TIME_CONFLICT',
  'GUEST_CAPACITY_BELOW_MINIMUM',
  'GUEST_CAPACITY_EXCEEDED',
};

List<MarketplaceAvailability> parseMarketplaceAvailability(
  dynamic data,
  List<String> expected,
) {
  if (data is! Map || data['results'] is! List) {
    throw const FormatException('Invalid availability response.');
  }
  final seen = <String>{};
  final results = <MarketplaceAvailability>[];
  for (final item in data['results'] as List) {
    if (item is! Map ||
        item['providerId'] is! String ||
        !expected.contains(item['providerId']) ||
        !seen.add(item['providerId'] as String) ||
        item['available'] is! bool ||
        item['message'] is! String ||
        (item['message'] as String).trim().isEmpty ||
        (item['message'] as String).length > 240 ||
        (item['available'] == true
            ? item['reasonCode'] != null
            : !_reasons.contains(item['reasonCode']))) {
      throw const FormatException('Invalid availability response.');
    }
    results.add(
      MarketplaceAvailability(
        item['providerId'] as String,
        item['available'] as bool,
        (item['message'] as String).trim(),
      ),
    );
  }
  if (seen.length != expected.length) {
    throw const FormatException('Incomplete availability response.');
  }
  return results;
}

Future<List<MarketplaceAvailability>> checkMarketplaceAvailability(
  List<String> ids,
  MarketplaceEventContext context,
) async {
  final auth = FirebaseAuth.instance;
  final uid = auth.currentUser?.uid;
  if (uid == null) {
    throw StateError(
      'Sign in to check provider availability. You can still browse without signing in.',
    );
  }
  final validation = context.validate(DateTime.now());
  if (validation != null) throw StateError(validation);
  final result = <MarketplaceAvailability>[];
  final callable = FirebaseFunctions.instanceFor(region: 'asia-southeast1')
      .httpsCallable(
        'checkMarketplaceProviderAvailability',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 30)),
      );
  // Use the same maximum batch size as the web backend contract.
  for (var offset = 0; offset < ids.length; offset += 12) {
    final batch = ids.sublist(
      offset,
      offset + 12 > ids.length ? ids.length : offset + 12,
    );
    final response = await callable.call<dynamic>({
      'providerIds': batch,
      ...context.toJson(),
    });
    if (auth.currentUser?.uid != uid) {
      throw StateError('Account changed. Check availability again.');
    }
    result.addAll(parseMarketplaceAvailability(response.data, batch));
  }
  return result;
}
