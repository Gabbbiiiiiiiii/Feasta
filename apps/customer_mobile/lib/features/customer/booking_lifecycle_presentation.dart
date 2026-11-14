import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../../shared/models/feasta_models.dart';

const bookingReviewLabel = 'Booking review required';
const completionOnHoldLabel = 'Completion on hold';
const awaitingCompletionLabel = 'Awaiting completion';
const bookingReviewMessage =
    'FEASTA needs to resolve a booking review before progression.';
const endedBookingReviewMessage =
    "The event has ended. FEASTA must verify the booking's completion records before marking it completed.";

DateTime? scheduledBookingEnd(Map<String, dynamic> data) {
  DateTime? date(dynamic value) => value is Timestamp
      ? value.toDate()
      : value is DateTime
      ? value
      : value is String
      ? DateTime.tryParse(value)
      : null;
  final day = date(data['eventDate'])?.toUtc().add(const Duration(hours: 8));
  final clock = RegExp(r'^([01]\d|2[0-3]):[0-5]\d$');
  final startClock = data['eventTime'], endClock = data['eventEndTime'];
  if (day == null ||
      startClock is! String ||
      endClock is! String ||
      !clock.hasMatch(startClock) ||
      !clock.hasMatch(endClock)) {
    return null;
  }
  DateTime at(String value) => DateTime.utc(
    day.year,
    day.month,
    day.day,
    int.parse(value.substring(0, 2)),
    int.parse(value.substring(3)),
  ).subtract(const Duration(hours: 8));
  final start = at(startClock);
  if (data['eventStartAt'] != null &&
      date(data['eventStartAt'])?.toUtc() != start) {
    return null;
  }
  final end = at(endClock);
  return end.isAfter(start) ? end : end.add(const Duration(days: 1));
}

bool bookingCancellationBlocked(Map<String, dynamic> data) {
  final state = data['refundEligibilityState'];
  return data['activeCancellationRequestId'] != null ||
      data['approvedCancellationRequestId'] != null ||
      (state is Map && state['activeCancellationRequestId'] != null);
}

bool bookingReconciliationBlocked(Map<String, dynamic> data) {
  final enforcement = data['remainingBalanceEnforcement'];
  return data['refundExecutionLock'] != null ||
      data['reconciliationRequired'] == true ||
      data['lifecycleReconciliationRequired'] == true ||
      (enforcement is Map &&
          enforcement['status'] == 'reconciliation_required');
}

bool bookingReviewBlocked(Map<String, dynamic> data) =>
    bookingCancellationBlocked(data) || bookingReconciliationBlocked(data);
String? bookingLifecycleLabel(
  Map<String, dynamic> data,
  Iterable<Map<String, dynamic>> requests,
  DateTime now, {
  bool incomplete = false,
}) {
  final status = data['status'];
  if (['completed', 'cancelled', 'expired', 'rejected'].contains(status)) {
    return null;
  }
  final active = requests.where(
    (r) => ![
      'completed',
      'cancelled',
      'expired',
      'rejected',
    ].contains(r['status']),
  );
  final end = scheduledBookingEnd(data);
  final ended = end != null && !now.isBefore(end);
  if (bookingCancellationBlocked(data) ||
      active.any(bookingCancellationBlocked)) {
    return bookingReviewLabel;
  }
  if (incomplete ||
      bookingReconciliationBlocked(data) ||
      active.any(bookingReconciliationBlocked)) {
    return ended ? completionOnHoldLabel : bookingReviewLabel;
  }
  if (status == 'in_progress' && ended) return awaitingCompletionLabel;
  return null;
}

String? bookingLifecycleMessage(String? label) => switch (label) {
  completionOnHoldLabel => endedBookingReviewMessage,
  bookingReviewLabel => bookingReviewMessage,
  awaitingCompletionLabel =>
    'The event has ended and is awaiting completion confirmation.',
  _ => null,
};

/// Read-only presentation. The canonical model and action authority remain unchanged.
typedef BookingLifecycleSource =
    Stream<QuerySnapshot<Map<String, dynamic>>> Function(BookingModel booking);

/// Supplies a lifecycle read source to a subtree. Without a scope, cards use
/// the existing Firestore relationship query and ownership checks below.
class BookingLifecycleScope extends InheritedWidget {
  const BookingLifecycleScope({
    required this.source,
    required super.child,
    super.key,
  });
  final BookingLifecycleSource source;
  static BookingLifecycleSource? maybeOf(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<BookingLifecycleScope>()
      ?.source;
  @override
  bool updateShouldNotify(BookingLifecycleScope oldWidget) =>
      source != oldWidget.source;
}

class BookingLifecycleBuilder extends StatefulWidget {
  const BookingLifecycleBuilder({
    required this.booking,
    required this.builder,
    super.key,
  });
  final BookingModel booking;
  final Widget Function(BuildContext, String?, String?) builder;
  @override
  State<BookingLifecycleBuilder> createState() =>
      _BookingLifecycleBuilderState();
}

class _BookingLifecycleBuilderState extends State<BookingLifecycleBuilder> {
  Timer? _timer;
  late Stream<QuerySnapshot<Map<String, dynamic>>> _requests;
  BookingLifecycleSource? _source;
  void _subscribe() {
    _requests =
        _source?.call(widget.booking) ??
        FirebaseFirestore.instance
            .collection('providerRequests')
            .where('mainEventId', isEqualTo: widget.booking.id)
            .snapshots();
  }

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _source = BookingLifecycleScope.maybeOf(context);
    _subscribe();
  }

  @override
  void didUpdateWidget(covariant BookingLifecycleBuilder oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.booking.id != widget.booking.id) _subscribe();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final booking = widget.booking;
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _requests,
      builder: (context, snapshot) {
        final ids = booking.providerRequestIds.toSet();
        final requests =
            snapshot.data?.docs
                .where(
                  (doc) =>
                      ids.contains(doc.id) &&
                      doc.data()['mainEventId'] == booking.id &&
                      doc.data()['customerId'] == booking.customerId &&
                      (doc.data()['providerRequestId'] == null ||
                          doc.data()['providerRequestId'] == doc.id),
                )
                .map((doc) => doc.data())
                .toList() ??
            <Map<String, dynamic>>[];
        final now = DateTime.now();
        final data = {...booking.lifecycleData, 'status': booking.status};
        final label = bookingLifecycleLabel(
          data,
          requests,
          now,
          incomplete: snapshot.hasError || requests.length != ids.length,
        );
        return widget.builder(context, label, bookingLifecycleMessage(label));
      },
    );
  }
}
