import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_details_screen.dart';
import 'booking_lifecycle_presentation.dart';
import 'customer_booking_presentation.dart';
import 'customer_bookings_screen.dart';

/// Max upcoming-event cards shown on the home preview.
const int homeUpcomingPreviewLimit = 3;

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
        !const ['confirmed', 'in_progress'].contains(b.status)) {
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

/// First [homeUpcomingPreviewLimit] active bookings for the home strip.
List<BookingModel> homeUpcomingPreview(List<BookingModel> bookings) =>
    bookings.take(homeUpcomingPreviewLimit).toList();

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

  void _openAllBookings() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const CustomerBookingsScreen()));
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
      final preview = homeUpcomingPreview(bookings);
      final textTheme = Theme.of(context).textTheme;
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screen),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Text(
                    'Upcoming events',
                    style: textTheme.titleMedium?.copyWith(
                      color: AppColors.primaryStrong,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: _openAllBookings,
                  style: TextButton.styleFrom(
                    foregroundColor: AppColors.primaryStrong,
                    minimumSize: const Size(44, 44),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                  ),
                  child: const Text(
                    'See all',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            for (final booking in preview)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
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
    final presentation = CustomerBookingPresentation(booking);
    final textTheme = Theme.of(context).textTheme;
    final meta = [
      if (booking.eventDate != null)
        MaterialLocalizations.of(context).formatMediumDate(
          booking.eventDate!.toUtc().add(const Duration(hours: 8)),
        ),
      if (booking.eventTime.isNotEmpty) booking.eventTime,
      if (booking.eventLocation.isNotEmpty) booking.eventLocation,
    ].join(' · ');

    return Card(
      color: AppColors.surface,
      margin: EdgeInsets.zero,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.borderStrong),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => BookingDetailsScreen(bookingId: booking.id),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.sm,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 2),
                child: Icon(
                  Icons.event_available_outlined,
                  size: 18,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      booking.eventType.replaceAll('_', ' '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.titleSmall?.copyWith(
                        color: AppColors.primaryStrong,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        meta,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.bodySmall?.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                    ],
                    if (booking.providerBusinessName.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        booking.providerBusinessName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.bodySmall?.copyWith(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              Container(
                key: const ValueKey('booking-status-pill'),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: presentation.background,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Text(
                  presentation.label,
                  textAlign: TextAlign.center,
                  style: textTheme.labelSmall?.copyWith(
                    color: presentation.foreground,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
