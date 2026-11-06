import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_details_screen.dart';
import 'booking_lifecycle_presentation.dart';
import 'customer_booking_presentation.dart';

/// Display only; the device clock never advances booking status.
int homeBookingStage(String status) => switch (status) {
  'accepted' ||
  'waiting_payment' ||
  'waiting_for_down_payment' ||
  'payment_processing' => 0,
  'confirmed' => 1,
  'in_progress' => 3,
  _ => -1,
};

List<BookingModel> homeActiveBookings(
  List<BookingModel> bookings,
  DateTime now,
) {
  final active = bookings.where((b) {
    if (b.lifecycleData['isDeleted'] == true ||
        !const [
          'pending',
          'pending_provider_approval',
          'needs_provider_replacement',
          'accepted',
          'waiting_payment',
          'waiting_for_down_payment',
          'payment_processing',
          'confirmed',
          'in_progress',
        ].contains(b.status)) {
      return false;
    }
    final end = scheduledBookingEnd({
      ...b.lifecycleData,
      'eventDate': b.eventDate,
      'eventTime': b.eventTime,
      'eventEndTime': b.eventEndTime,
    });
    return end == null || now.isBefore(end);
  }).toList();
  active.sort((a, b) {
    final day = (a.eventDate ?? DateTime(9999)).compareTo(
      b.eventDate ?? DateTime(9999),
    );
    if (day != 0) return day;
    final time = a.eventTime.compareTo(b.eventTime);
    return time != 0 ? time : a.id.compareTo(b.id);
  });
  return active;
}

class HomeBookingTimeline extends StatefulWidget {
  const HomeBookingTimeline({required this.repository, super.key});
  final FeastaRepository repository;
  @override
  State<HomeBookingTimeline> createState() => _HomeBookingTimelineState();
}

class _HomeBookingTimelineState extends State<HomeBookingTimeline> {
  late Stream<List<BookingModel>> _bookings;
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _load() {
    _bookings = widget.repository.customerActiveBookings();
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<List<BookingModel>>(
    stream: _bookings,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return TextButton(
          onPressed: () => setState(_load),
          child: const Text('Could not load booking timeline. Retry'),
        );
      }
      final bookings = homeActiveBookings(snapshot.data ?? [], DateTime.now());
      if (bookings.isEmpty) return const SizedBox.shrink();
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
        child: Column(
          children: [
            for (final booking in bookings)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: HomeBookingProgressCard(booking: booking),
              ),
          ],
        ),
      );
    },
  );
}

class HomeBookingProgressCard extends StatelessWidget {
  const HomeBookingProgressCard({required this.booking, super.key});
  final BookingModel booking;
  @override
  Widget build(BuildContext context) {
    final stage = homeBookingStage(booking.status);
    const labels = ['Accepted', 'Confirmed', 'Preparation', 'Event day'];
    return Card(
      color: AppColors.surface,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Booking timeline',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              booking.eventType.replaceAll('_', ' '),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if (booking.eventDate != null)
              Text(
                '${MaterialLocalizations.of(context).formatMediumDate(booking.eventDate!.toUtc().add(const Duration(hours: 8)))} | ${booking.eventTime}',
              ),
            if (booking.eventLocation.isNotEmpty) Text(booking.eventLocation),
            if (booking.providerBusinessName.isNotEmpty)
              Text(booking.providerBusinessName),
            const SizedBox(height: 8),
            Text(
              CustomerBookingPresentation(booking).label,
              style: const TextStyle(
                color: AppColors.primary,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < labels.length; i++)
                  Expanded(
                    child: Semantics(
                      label:
                          '${labels[i]}, ${i <= stage ? 'reached' : 'upcoming'}',
                      excludeSemantics: true,
                      child: Column(
                        children: [
                          Icon(
                            i <= stage
                                ? Icons.check_circle
                                : Icons.radio_button_unchecked,
                            color: i <= stage
                                ? AppColors.primary
                                : AppColors.placeholder,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            labels[i],
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => BookingDetailsScreen(bookingId: booking.id),
                  ),
                ),
                child: const Text('View booking details'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
