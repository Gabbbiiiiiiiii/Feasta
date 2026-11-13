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
    final presentation = CustomerBookingPresentation(booking);
    final textTheme = Theme.of(context).textTheme;
    const labels = ['Accepted', 'Confirmed', 'Preparation', 'Event day'];
    return Card(
      color: AppColors.surface,
      margin: EdgeInsets.zero,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: const BorderSide(color: AppColors.borderStrong),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.event_available_outlined,
                    size: 18, color: AppColors.primary),
                const SizedBox(width: 6),
                Expanded(
                  child: Text('Your upcoming event',
                      style: textTheme.labelMedium?.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w700,
                      )),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Container(
                    key: const ValueKey('booking-status-pill'),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: presentation.background,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Text(presentation.label,
                        textAlign: TextAlign.center,
                        style: textTheme.labelSmall?.copyWith(
                          color: presentation.foreground,
                          fontWeight: FontWeight.w700,
                        )),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              booking.eventType.replaceAll('_', ' '),
              style: textTheme.headlineSmall?.copyWith(
                color: AppColors.primaryStrong,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
            if (booking.eventDate != null || booking.eventTime.isNotEmpty || booking.eventLocation.isNotEmpty)
              Text(
                [
                  if (booking.eventDate != null)
                    MaterialLocalizations.of(context).formatMediumDate(booking.eventDate!.toUtc().add(const Duration(hours: 8))),
                  if (booking.eventTime.isNotEmpty) booking.eventTime,
                  if (booking.eventLocation.isNotEmpty) booking.eventLocation,
                ].join(' · '),
                style: textTheme.bodySmall?.copyWith(color: AppColors.secondaryTextAccessible),
              ),
            if (booking.providerBusinessName.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(booking.providerBusinessName,
                    style: textTheme.bodySmall?.copyWith(color: AppColors.secondaryTextAccessible)),
              ),
            const SizedBox(height: 12),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: 12),
            Text(
              'Event journey',
              style: textTheme.titleSmall?.copyWith(
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
                          Row(
                            children: [
                              Expanded(child: Container(height: 2, color: i == 0 ? Colors.transparent : i <= stage ? AppColors.primary : AppColors.borderStrong)),
                              Container(
                                width: 28,
                                height: 28,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: i <= stage ? AppColors.primary : AppColors.surface,
                                  border: Border.all(color: i <= stage ? AppColors.primary : AppColors.borderStrong, width: 2),
                                ),
                                child: i <= stage ? const Icon(Icons.check, size: 16, color: AppColors.primaryForeground) : null,
                              ),
                              Expanded(child: Container(height: 2, color: i == labels.length - 1 ? Colors.transparent : i < stage ? AppColors.primary : AppColors.borderStrong)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            labels[i],
                            textAlign: TextAlign.center,
                            style: textTheme.labelSmall?.copyWith(
                              color: i <= stage ? AppColors.primary : AppColors.secondaryTextAccessible,
                              fontWeight: i <= stage ? FontWeight.w700 : FontWeight.w400,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.primarySubtle,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('CURRENT REFUND-POLICY STAGE',
                      style: textTheme.labelSmall?.copyWith(color: AppColors.secondaryTextAccessible)),
                  const SizedBox(height: 4),
                  // The mobile booking model has no current policy-stage
                  // projection. A settlement refundPercentage is not a policy rate.
                  Text('View booking policies',
                      style: textTheme.titleSmall?.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text('Review the available refund policy in your booking details.',
                      style: textTheme.bodySmall?.copyWith(color: AppColors.secondaryTextAccessible)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.info_outline, size: 16, color: AppColors.secondaryTextAccessible),
                const SizedBox(width: 8),
                Expanded(child: Text('Your event updates at a glance.',
                    style: textTheme.bodySmall?.copyWith(color: AppColors.secondaryTextAccessible))),
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
