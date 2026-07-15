import 'package:flutter/material.dart';

import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../../shared/widgets/loading_skeleton.dart';
import 'booking_details_screen.dart';

class CustomerBookingsScreen extends StatelessWidget {
  const CustomerBookingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final FeastaRepository repository = FeastaRepository();

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
              return const FeastaSkeletonList(
                itemCount: 5,
                padding: EdgeInsets.all(20),
              );
            }

            if (snapshot.hasError) {
              return Center(
                child: Text('Error: ${snapshot.error}'),
              );
            }

            final bookings = snapshot.data ?? [];

            if (bookings.isEmpty) {
              return const Center(
                child: Text(
                  'No bookings yet.',
                  style: TextStyle(color: Colors.grey),
                ),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: bookings.length,
              separatorBuilder: (_, __) => const SizedBox(height: 16),
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

  const BookingCard({
    super.key,
    required this.booking,
  });

  Color get statusColor {
    switch (booking.status) {
      case 'pending':
        return Colors.orange;
      case 'waiting_payment':
        return const Color(0xFFFF6333);
      case 'confirmed':
        return Colors.green;
      case 'completed':
        return Colors.blue;
      case 'cancelled':
      case 'rejected':
      case 'expired':
        return Colors.red;
      default:
        return Colors.grey;
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
    const primary = Color(0xFFFF6333);

    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => BookingDetailsScreen(bookingId: booking.id),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE5E7EB)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: primary.withOpacity(0.12),
                  child: const Icon(
                    Icons.restaurant,
                    color: primary,
                  ),
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
                        style: const TextStyle(color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                      color: statusColor,
                      fontWeight: FontWeight.w900,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                const Icon(
                  Icons.calendar_month_outlined,
                  color: Colors.grey,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  formattedDate,
                  style: const TextStyle(color: Colors.grey),
                ),
                const Spacer(),
                Text(
                  booking.bookingCode,
                  style: const TextStyle(
                    color: Colors.grey,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              BookingDetailsScreen(bookingId: booking.id),
                        ),
                      );
                    },
                    child: const Text(
                      'View Details',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                ElevatedButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Chat screen will be connected soon.'),
                      ),
                    );
                  },
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: const Text('Chat'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
