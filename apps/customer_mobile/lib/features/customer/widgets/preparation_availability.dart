import 'dart:async';
import 'dart:convert';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/material.dart';

typedef PreparationAvailabilityCheck =
    Future<dynamic> Function(Map<String, dynamic> input);

/// Read-only advisory check. Never reserves capacity or submits a booking.
class PreparationAvailability extends StatefulWidget {
  const PreparationAvailability({
    super.key,
    required this.packageId,
    required this.providerId,
    required this.date,
    required this.start,
    required this.end,
    required this.guests,
    this.addonIds = const [],
    this.providerName = 'Provider',
    this.check,
  });
  final String packageId, providerId;
  final String providerName;
  final DateTime? date;
  final TimeOfDay? start, end;
  final int guests;
  final List<String> addonIds;
  final PreparationAvailabilityCheck? check;
  @override
  State<PreparationAvailability> createState() =>
      _PreparationAvailabilityState();
}

class _PreparationAvailabilityState extends State<PreparationAvailability> {
  bool _available = false;
  Timer? _timer;
  int _generation = 0;
  String? _key;
  String _message =
      'Select a valid date, start/end time and guest count to check availability.';
  static const _reasons = {
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
  @override
  void initState() {
    super.initState();
    _schedule();
  }

  @override
  void didUpdateWidget(covariant PreparationAvailability oldWidget) {
    super.didUpdateWidget(oldWidget);
    _schedule();
  }

  void _schedule() {
    final date = widget.date, start = widget.start, end = widget.end;
    Map<String, dynamic>? input;
    if (date != null &&
        start != null &&
        end != null &&
        widget.guests > 0 &&
        end.hour * 60 + end.minute > start.hour * 60 + start.minute &&
        DateTime(
          date.year,
          date.month,
          date.day,
          start.hour,
          start.minute,
        ).isAfter(DateTime.now())) {
      String time(TimeOfDay value) =>
          '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
      input = {
        'packageId': widget.packageId,
        'addonIds': widget.addonIds.toSet().toList()..sort(),
        'eventDate':
            '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
        'eventTime': time(start),
        'eventEndTime': time(end),
        'guestCount': widget.guests,
      };
    }
    final key = input == null
        ? null
        : '${widget.providerId}:${jsonEncode(input)}';
    if (key == _key) return;
    _key = key;
    _available = false;
    final generation = ++_generation;
    _timer?.cancel();
    _message = input == null
        ? 'Select a valid date, start/end time and guest count to check availability.'
        : 'Checking availability?';
    if (input != null) {
      final payload = input;
      _timer = Timer(
        const Duration(milliseconds: 600),
        () => _run(payload, generation),
      );
    }
  }

  Future<void> _run(Map<String, dynamic> input, int generation) async {
    String message;
    bool verifiedAvailable = false;
    try {
      final dynamic response = widget.check != null
          ? await widget.check!(input)
          : (await FirebaseFunctions.instanceFor(region: 'asia-southeast1')
                    .httpsCallable(
                      'checkCustomerProviderAvailability',
                      options: HttpsCallableOptions(
                        timeout: const Duration(seconds: 30),
                      ),
                    )
                    .call<dynamic>(input))
                .data;
      final results = response is Map ? response['results'] : null;
      if (results is! List) throw const FormatException();
      final matching = results
          .where(
            (item) => item is Map && item['providerId'] == widget.providerId,
          )
          .toList();
      if (matching.length != 1) throw const FormatException();
      final result = matching.single as Map;
      final available = result['available'];
      final reason = result['reasonCode'];
      final detail = result['message'];
      if (available is! bool ||
          detail is! String ||
          detail.trim().isEmpty ||
          detail.length > 240 ||
          (available ? reason != null : !_reasons.contains(reason))) {
        throw const FormatException();
      }
      verifiedAvailable = available;
      message = available
          ? 'Available for your selected event.'
          : 'Unavailable: ${detail.trim()}';
    } catch (_) {
      message =
          'Availability could not be verified. Check your connection and sign-in, then retry.';
    }
    if (!mounted || generation != _generation) return;
    setState(() {
      _message = message;
      _available = verifiedAvailable;
    });
  }

  @override
  void dispose() {
    ++_generation;
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          liveRegion: true,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: _available
                  ? const Color(0xFFECFDF5)
                  : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_available) ...[
                  const Icon(Icons.check_circle, color: Color(0xFF059669)),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (_available) ...[
                        Text(
                          '${widget.providerName} is available',
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF065F46),
                          ),
                        ),
                        const SizedBox(height: 4),
                      ],
                      Text(
                        _message,
                        style: TextStyle(
                          color: _available ? const Color(0xFF047857) : null,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        if (_message.startsWith('Availability could'))
          TextButton(
            onPressed: () {
              setState(() {
                _key = null;
                _schedule();
              });
            },
            child: const Text('Retry availability'),
          ),
      ],
    ),
  );
}
