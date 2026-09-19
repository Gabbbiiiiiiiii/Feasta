import 'package:flutter/material.dart';

import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/widgets/widgets.dart';
import 'booking_details_screen.dart';

class CustomerBookingsScreen extends StatefulWidget {
  const CustomerBookingsScreen({super.key});

  @override
  State<CustomerBookingsScreen> createState() => _CustomerBookingsScreenState();
}

class _CustomerBookingsScreenState extends State<CustomerBookingsScreen> {
  final FeastaRepository repository = FeastaRepository();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Scaffold(
        appBar: AppBar(
          title: const Text(
            'My Bookings',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
          automaticallyImplyLeading: false,
        ),
        body: StreamBuilder<List<BookingModel>>(
          stream: repository.customerBookings(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const FeastaListSkeleton(
                itemCount: 5,
                padding: EdgeInsets.all(20),
              );
            }

            if (snapshot.hasError) {
              return Center(
                child: FeastaApplicationErrorState(
                  kind: FeastaErrorKind.load,
                  message: 'We could not load your bookings. Please try again.',
                  onRetry: () => setState(() {}),
                ),
              );
            }

            final bookings = snapshot.data ?? [];

            if (bookings.isEmpty) {
              return const Center(
                child: FeastaEmptyState(
                  title: 'No bookings yet',
                  message:
                      'Your current and completed bookings will appear here.',
                  icon: Icons.event_note_outlined,
                ),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: bookings.length,
              separatorBuilder: (_, _) => const SizedBox(height: 16),
              itemBuilder: (context, index) {
                final booking = bookings[index];

                return BookingCard(booking: booking);
              },
            );
          },
        ),
      ),
    );
  }
}

class BookingCard extends StatelessWidget {
  final BookingModel booking;

  const BookingCard({super.key, required this.booking});

  FeastaStatusTone get statusTone {
    switch (booking.status) {
      case 'pending':
      case 'waiting_payment':
      case 'payment_processing':
        return FeastaStatusTone.warning;
      case 'accepted':
      case 'confirmed':
        return FeastaStatusTone.success;
      case 'completed':
        return FeastaStatusTone.info;
      case 'cancelled':
      case 'rejected':
      case 'expired':
        return FeastaStatusTone.error;
      default:
        return FeastaStatusTone.neutral;
    }
  }

  String get statusLabel {
    switch (booking.status) {
      case 'pending':
        return 'Pending';
      case 'accepted':
        return 'Accepted';
      case 'waiting_payment':
        return 'Waiting for Payment';
      case 'payment_processing':
        return 'Processing Payment';
      case 'confirmed':
        return 'Confirmed';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      case 'rejected':
        return 'Rejected';
      case 'expired':
        return 'Expired';
      default:
        return booking.status;
    }
  }

  String get formattedDate {
    final date = booking.eventDate;

    if (date == null) return 'No date';

    return '${date.month}/${date.day}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    const primary = AppColors.primary;
    final stackActions = MediaQuery.textScalerOf(context).scale(1) > 1.3;

    return Semantics(
      container: true,
      explicitChildNodes: true,
      label:
          'Booking with ${booking.providerBusinessName}. '
          '${booking.eventType}. Status $statusLabel. Event date $formattedDate.',
      child: FeastaCard(
        semanticLabel:
            'Booking with ${booking.providerBusinessName}, ${booking.eventType}, $statusLabel, $formattedDate',
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => BookingDetailsScreen(bookingId: booking.id),
            ),
          );
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: primary.withValues(alpha: 0.12),
                  child: const Icon(Icons.restaurant, color: primary),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        booking.providerBusinessName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 19,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        booking.eventType,
                        style: const TextStyle(
                          color: AppColors.secondaryTextAccessible,
                        ),
                      ),
                    ],
                  ),
                ),
                Flexible(
                  child: FeastaStatusBadge(
                    label: statusLabel,
                    tone: statusTone,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.xs,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                const Icon(
                  Icons.calendar_month_outlined,
                  color: AppColors.secondaryTextAccessible,
                  size: 20,
                ),
                Text(
                  formattedDate,
                  style: const TextStyle(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
                Text(
                  booking.bookingCode,
                  style: const TextStyle(
                    color: AppColors.secondaryTextAccessible,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            if (stackActions)
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FeastaSecondaryButton(
                    label: 'View details',
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              BookingDetailsScreen(bookingId: booking.id),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  FeastaPrimaryButton(
                    label: 'Chat',
                    onPressed: () => _showChatPlaceholder(context),
                    icon: const Icon(Icons.chat_bubble_outline),
                  ),
                ],
              )
            else
              Row(
                children: [
                  Expanded(
                    child: FeastaSecondaryButton(
                      label: 'View details',
                      onPressed: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) =>
                                BookingDetailsScreen(bookingId: booking.id),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  FeastaPrimaryButton(
                    label: 'Chat',
                    width: FeastaButtonWidth.intrinsic,
                    onPressed: () => _showChatPlaceholder(context),
                    icon: const Icon(Icons.chat_bubble_outline),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  void _showChatPlaceholder(BuildContext context) {
    FeastaSnackbars.show(
      context,
      message: 'Chat will be available here soon.',
      tone: FeastaSnackbarTone.info,
    );
  }
}
