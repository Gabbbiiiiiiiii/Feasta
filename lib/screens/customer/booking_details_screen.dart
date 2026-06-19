import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';
import 'payment_required_screen.dart';
import '../../core/constants/status_constants.dart';
import '../chat/chat_screen.dart';
import 'review_screen.dart';
import 'addon_payment_required_screen.dart';
import 'recovery_offers_screen.dart';

class BookingDetailsScreen extends StatelessWidget {
  final String bookingId;

  const BookingDetailsScreen({
    super.key,
    required this.bookingId,
  });

  @override
  Widget build(BuildContext context) {
    final FeastaRepository repository = FeastaRepository();

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Booking Details',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: StreamBuilder<BookingModel?>(
        stream: repository.bookingById(bookingId),
        builder: (context, bookingSnapshot) {
          if (bookingSnapshot.connectionState == ConnectionState.waiting) {
            return const FeastaSkeletonDetailPage(
              padding: EdgeInsets.all(20),
              showHero: false,
            );
          }

          if (bookingSnapshot.hasError) {
            return Center(
              child: Text('Error: ${bookingSnapshot.error}'),
            );
          }

          final booking = bookingSnapshot.data;

          if (booking == null) {
            return const Center(
              child: Text('Booking not found.'),
            );
          }

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                booking.bookingCode,
                style: const TextStyle(
                  color: Colors.grey,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              if (booking.recoveryStatus == BookingRecoveryStatus.completed &&
                  booking.selectedRecoveryOfferId != null) ...[
                _CustomerRecoveryNoticeCard(booking: booking),
                const SizedBox(height: 18),
              ],
              BookingStatusCard(booking: booking),
              const SizedBox(height: 18),
              BookingTimelineCard(bookingId: booking.id),
              const SizedBox(height: 18),
              EventDetailsCard(booking: booking),
              const SizedBox(height: 18),
              BookingAddOnsCard(booking: booking),
              const SizedBox(height: 18),
              PaymentDetailsCard(booking: booking),
              const SizedBox(height: 18),
              ActionButtons(booking: booking),
            ],
          );
        },
      ),
    );
  }
}

class BookingStatusCard extends StatelessWidget {
  final BookingModel booking;

  const BookingStatusCard({
    super.key,
    required this.booking,
  });

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

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: statusColor.withOpacity(0.09),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: statusColor.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          Icon(
            Icons.info_outline,
            color: statusColor,
            size: 34,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  statusLabel,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _statusMessage(booking.status),
                  style: const TextStyle(height: 1.35),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _statusMessage(String status) {
    switch (status) {
      case 'pending':
        return 'Your booking request is waiting for provider review.';
      case 'waiting_payment':
        return 'Your booking was accepted. Please complete the down payment.';
      case 'confirmed':
        return 'Your booking is confirmed.';
      case 'completed':
        return 'This booking has been completed.';
      case 'cancelled':
        return 'This booking was cancelled.';
      case 'rejected':
        return 'This booking was rejected by the provider.';
      case 'expired':
        return 'This booking request has expired.';
      default:
        return 'Booking status updated.';
    }
  }
}

class BookingTimelineCard extends StatelessWidget {
  final String bookingId;

  const BookingTimelineCard({
    super.key,
    required this.bookingId,
  });

  @override
  Widget build(BuildContext context) {
    final FeastaRepository repository = FeastaRepository();

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE5E7EB)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: repository.bookingTimelines(bookingId),
        builder: (context, snapshot) {
          final timelines = snapshot.data?.docs ?? [];

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Booking Timeline',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 16),
              if (snapshot.connectionState == ConnectionState.waiting)
                const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FeastaSkeletonBox(width: 180, height: 14, radius: 8),
                    SizedBox(height: 10),
                    FeastaSkeletonBox(height: 12, radius: 8),
                    SizedBox(height: 10),
                    FeastaSkeletonBox(width: 130, height: 12, radius: 8),
                  ],
                )
              else if (timelines.isEmpty)
                const Text(
                  'No timeline yet.',
                  style: TextStyle(color: Colors.grey),
                )
              else
                ...timelines.map((doc) {
                  final data = doc.data();
                  final title = data['title'] ?? '';
                  final description = data['description'] ?? '';
                  final status = data['status'] ?? '';
                  final createdAt = data['createdAt'];

                  return TimelineItem(
                    title: title,
                    description: description,
                    status: status,
                    createdAt: createdAt,
                  );
                }),
            ],
          );
        },
      ),
    );
  }
}

class TimelineItem extends StatelessWidget {
  final String title;
  final String description;
  final String status;
  final dynamic createdAt;

  const TimelineItem({
    super.key,
    required this.title,
    required this.description,
    required this.status,
    required this.createdAt,
  });

  String get formattedDate {
    if (createdAt is Timestamp) {
      final date = (createdAt as Timestamp).toDate();
      return '${date.month}/${date.day}/${date.year} ${date.hour}:${date.minute.toString().padLeft(2, '0')}';
    }

    return '';
  }

  bool get isCompleted {
    return status == 'pending' ||
        status == 'accepted' ||
        status == 'waiting_payment' ||
        status == 'confirmed' ||
        status == 'completed';
  }

  @override
  Widget build(BuildContext context) {
    final color = isCompleted ? Colors.green : Colors.grey;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 17,
            backgroundColor: color.withOpacity(0.12),
            child: Icon(
              Icons.check,
              color: color,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  description,
                  style: const TextStyle(color: Colors.grey),
                ),
                if (formattedDate.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    formattedDate,
                    style: const TextStyle(
                      color: Colors.grey,
                      fontSize: 12,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class EventDetailsCard extends StatelessWidget {
  final BookingModel booking;

  const EventDetailsCard({
    super.key,
    required this.booking,
  });

  String get formattedDate {
    final date = booking.eventDate;
    if (date == null) return 'No date';
    return '${date.month}/${date.day}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'Event Details',
      children: [
        _RowItem(label: 'Provider', value: booking.providerBusinessName),
        _RowItem(label: 'Package', value: booking.packageName),
        _RowItem(label: 'Event Type', value: booking.eventType),
        _RowItem(label: 'Date', value: formattedDate),
        _RowItem(
          label: 'Time',
          value: '${booking.eventTime} - ${booking.eventEndTime}',
        ),
        _RowItem(label: 'Guests', value: '${booking.guestCount}'),
        _RowItem(label: 'Location', value: booking.eventLocation),
        _RowItem(label: 'Address', value: booking.eventAddress),
      ],
    );
  }
}

class PaymentDetailsCard extends StatelessWidget {
  final BookingModel booking;

  const PaymentDetailsCard({
    super.key,
    required this.booking,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return _Card(
      title: 'Payment Details',
      children: [
        _RowItem(
          label: 'Package Price',
          value: '₱${booking.packagePrice.toStringAsFixed(0)}',
        ),
        _RowItem(
          label: 'Add-ons',
          value: '₱${booking.addOnsTotal.toStringAsFixed(0)}',
        ),
        const Divider(),
        _RowItem(
          label: 'Total',
          value: '₱${booking.totalAmount.toStringAsFixed(0)}',
          isBold: true,
        ),
        _RowItem(
          label: 'Down Payment',
          value: '₱${booking.downPaymentAmount.toStringAsFixed(0)}',
          isBold: true,
          valueColor: primary,
        ),
        _RowItem(
          label: 'Remaining Balance',
          value: '₱${booking.remainingBalance.toStringAsFixed(0)}',
        ),
        _RowItem(
          label: 'Payment Status',
          value: booking.paymentStatus,
        ),
      ],
    );
  }
}

class ActionButtons extends StatelessWidget {
  final BookingModel booking;

  const ActionButtons({
    super.key,
    required this.booking,
  });

    Future<void> _cancelBooking(BuildContext context) async {
      final reasonController = TextEditingController();

      final reason = await showDialog<String>(
        context: context,
        builder: (context) {
          return AlertDialog(
            title: const Text('Cancel Booking'),
            content: TextField(
              controller: reasonController,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'Enter cancellation reason',
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(context, reasonController.text.trim());
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                ),
                child: const Text('Submit'),
              ),
            ],
          );
        },
      );

      if (reason == null) return;

      try {
        await FeastaRepository().cancelOrRequestBookingCancellation(
          booking: booking,
          reason: reason,
        );

        if (!context.mounted) return;

        final isPaidBooking =
            booking.status == BookingStatus.confirmed ||
            booking.paymentStatus == PaymentStatus.partiallyPaid ||
            booking.paymentStatus == PaymentStatus.paid;

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              isPaidBooking
                  ? 'Cancellation request submitted to provider.'
                  : 'Booking cancelled successfully.',
            ),
          ),
        );
      } catch (e) {
        if (!context.mounted) return;

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
          ),
        );
      }
    }

    Future<void> _cancelRecoveryRequest(BuildContext context) async {
      final reasonController = TextEditingController();

      final reason = await showDialog<String>(
        context: context,
        builder: (context) {
          return AlertDialog(
            title: const Text('Cancel Recovery Request'),
            content: TextField(
              controller: reasonController,
              maxLines: 3,
              decoration: const InputDecoration(
                hintText: 'Enter reason for cancelling recovery',
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(context, reasonController.text.trim());
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                ),
                child: const Text('Cancel Recovery'),
              ),
            ],
          );
        },
      );

      if (reason == null) return;

      try {
        await FeastaRepository().cancelRecoveryRequest(
          booking: booking,
          reason: reason,
        );

        if (!context.mounted) return;

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Recovery request cancelled.'),
          ),
        );
      } catch (e) {
        if (!context.mounted) return;

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
          ),
        );
      }
    }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Column(
      children: [
        SizedBox(
          width: double.infinity,
          height: 54,
          child: OutlinedButton.icon(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ChatScreen(
                    booking: booking,
                    currentRole: UserRoles.customer,
                  ),
                ),
              );
            },
            icon: const Icon(Icons.chat_bubble_outline),
            label: const Text(
              'Chat with Provider',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
            style: OutlinedButton.styleFrom(
              foregroundColor: primary,
              side: const BorderSide(color: primary),
            ),
          ),
        ),

        const SizedBox(height: 12),

        if (booking.status == 'waiting_payment') ...[
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => PaymentRequiredScreen(
                      booking: booking,
                    ),
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
              child: const Text(
                'Pay Down Payment',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        if (booking.status == 'completed') ...[
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton.icon(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => ReviewScreen(booking: booking),
                  ),
                );
              },
              icon: const Icon(Icons.star_outline),
              label: const Text(
                'Write Review',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.amber,
                foregroundColor: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        if (booking.recoveryStatus == BookingRecoveryStatus.open ||
            booking.recoveryStatus == BookingRecoveryStatus.offerReceived) ...[
          SizedBox(
            width: double.infinity,
            height: 54,
            child: ElevatedButton.icon(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (_) => RecoveryOffersScreen(
                      booking: booking,
                    ),
                  ),
                );
              },
              icon: const Icon(Icons.replay_circle_filled),
              label: const Text(
                'View Recovery Offers',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 54,
            child: OutlinedButton.icon(
              onPressed: () => _cancelRecoveryRequest(context),
              icon: const Icon(Icons.cancel_outlined),
              label: const Text(
                'Cancel Recovery Request',
                style: TextStyle(fontWeight: FontWeight.w900),
              ),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.red,
                side: const BorderSide(color: Colors.red),
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        if ((booking.status == BookingStatus.pending ||
        booking.status == BookingStatus.waitingPayment ||
        booking.status == BookingStatus.confirmed) &&
        booking.recoveryStatus != BookingRecoveryStatus.open &&
        booking.recoveryStatus != BookingRecoveryStatus.offerReceived)
        SizedBox(
          width: double.infinity,
          height: 54,
          child: OutlinedButton(
            onPressed: () => _cancelBooking(context),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.red,
              side: const BorderSide(color: Colors.red),
            ),
            child: const Text(
              'Cancel Booking',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _Card({
    required this.title,
    required this.children,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE5E7EB)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }
}

class BookingAddOnsCard extends StatelessWidget {
  final BookingModel booking;

  const BookingAddOnsCard({
    super.key,
    required this.booking,
  });

  List<Map<String, dynamic>> get cateringProviderAddOns {
    return booking.selectedAddOns
        .where((addon) => addon['source'] == 'catering_provider')
        .toList();
  }

  List<Map<String, dynamic>> get marketplaceAddOns {
    return booking.selectedAddOns
        .where((addon) => addon['source'] == 'feasta_addon_provider')
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final repository = FeastaRepository();

    return _Card(
      title: 'Add-ons',
      children: [
        _AddOnGroup(
          title: 'Catering Provider Add-ons',
          addOns: cateringProviderAddOns,
          emptyText: 'No catering provider add-ons selected.',
        ),
        const SizedBox(height: 14),

        StreamBuilder<List<AddonRequestModel>>(
          stream: repository.addonRequestsByBooking(booking.id),
          builder: (context, snapshot) {
            final requests = snapshot.data ?? [];

            return _MarketplaceAddOnGroup(
              booking: booking,
              addOns: marketplaceAddOns,
              requests: requests,
            );
          },
        ),

        if (booking.willArrangeOwnAddOns) ...[
          const SizedBox(height: 14),
          const Text(
            'Customer-arranged Add-ons',
            style: TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 16,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            booking.customerArrangedAddOnsNote.isEmpty
                ? 'Customer will arrange their own add-ons.'
                : booking.customerArrangedAddOnsNote,
            style: const TextStyle(
              color: Colors.grey,
              height: 1.4,
            ),
          ),
        ],
      ],
    );
  }
}

class _MarketplaceAddOnGroup extends StatelessWidget {
  final BookingModel booking;
  final List<Map<String, dynamic>> addOns;
  final List<AddonRequestModel> requests;

  const _MarketplaceAddOnGroup({
  required this.booking,
  required this.addOns,
  required this.requests,
});

  Color statusColor(String status) {
    switch (status) {
      case AddonRequestStatus.pending:
        return Colors.orange;
      case AddonRequestStatus.accepted:
        return Colors.green;
      case AddonRequestStatus.rejected:
      case AddonRequestStatus.cancelled:
        return Colors.red;
      case AddonRequestStatus.completed:
        return Colors.blue;
      default:
        return Colors.grey;
    }
  }

  String statusLabel(String status) {
    switch (status) {
      case AddonRequestStatus.pending:
        return 'Pending';
      case AddonRequestStatus.accepted:
        return 'Accepted';
      case AddonRequestStatus.rejected:
        return 'Rejected';
      case AddonRequestStatus.completed:
        return 'Completed';
      case AddonRequestStatus.cancelled:
        return 'Cancelled';
      default:
        return status;
    }
  }

  AddonRequestModel? requestForAddon(Map<String, dynamic> addon) {
    final addonId = addon['addonId']?.toString() ?? '';

    try {
      return requests.firstWhere((request) => request.addonId == addonId);
    } catch (_) {
      return null;
    }
  }

  String paymentStatusLabel(String status) {
  switch (status) {
    case 'unpaid':
      return 'Unpaid';
    case 'waiting_payment':
      return 'Waiting for Payment';
    case 'paid':
      return 'Paid';
    case 'cancelled':
      return 'Cancelled';
    case 'refund_review':
      return 'Refund Review';
    case 'refunded':
      return 'Refunded';
    default:
      return status;
  }
}

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Feasta Marketplace Add-ons',
          style: TextStyle(
            fontWeight: FontWeight.w900,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 8),

        if (addOns.isEmpty)
          const Text(
            'No marketplace add-ons selected.',
            style: TextStyle(color: Colors.grey),
          )
        else
          ...addOns.map((addon) {
            final name = addon['name'] ?? '';
            final providerBusinessName = addon['providerBusinessName'] ?? '';
            final price = ((addon['price'] ?? 0) as num).toDouble();

            final request = requestForAddon(addon);
            final status = request?.status ?? AddonRequestStatus.pending;
            final color = statusColor(status);

            final paymentStatus = request?.paymentStatus ?? 'unpaid';

            final linkStatus = request?.linkStatus ?? AddonLinkStatus.active;

            final canPayAddon = request != null &&
                booking.status == BookingStatus.confirmed &&
                request.status == AddonRequestStatus.accepted &&
                request.paymentStatus == 'waiting_payment' &&
                linkStatus != AddonLinkStatus.awaitingCustomerRecoverySelection &&
                linkStatus != AddonLinkStatus.cancelledDueToMainBookingFailed;

            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFFE5E7EB)),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            providerBusinessName.isEmpty
                                ? name
                                : '$name • $providerBusinessName',
                            style: const TextStyle(
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        Text(
                          '₱${price.toStringAsFixed(0)}',
                          style: const TextStyle(
                            color: primary,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      statusLabel(status),
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w900,
                        fontSize: 12,
                      ),
                    ),
                  ),

                  const SizedBox(height: 8),

                  Text(
                    'Payment: ${paymentStatusLabel(paymentStatus)}',
                    style: TextStyle(
                      color: paymentStatus == 'paid' ? Colors.green : Colors.grey,
                      fontWeight: FontWeight.w800,
                    ),
                  ),

                  if (canPayAddon) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 46,
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => AddonPaymentRequiredScreen(
                                booking: booking,
                                addonRequest: request,
                              ),
                            ),
                          );
                        },
                        icon: const Icon(Icons.payment),
                        label: const Text(
                          'Pay Add-on Service',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: primary,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                  ],
                    if (request?.rejectedReason != null &&
                        request!.rejectedReason!.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        'Reason: ${request.rejectedReason}',
                        style: const TextStyle(
                          color: Colors.red,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _AddOnGroup extends StatelessWidget {
  final String title;
  final List<Map<String, dynamic>> addOns;
  final String emptyText;

  const _AddOnGroup({
    required this.title,
    required this.addOns,
    required this.emptyText,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontWeight: FontWeight.w900,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 8),
        if (addOns.isEmpty)
          Text(
            emptyText,
            style: const TextStyle(color: Colors.grey),
          )
        else
          ...addOns.map((addon) {
            final name = addon['name'] ?? '';
            final providerBusinessName =
                addon['providerBusinessName'] ?? '';
            final price = ((addon['price'] ?? 0) as num).toDouble();

            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      providerBusinessName.isEmpty
                          ? name
                          : '$name • $providerBusinessName',
                    ),
                  ),
                  Text(
                    '₱${price.toStringAsFixed(0)}',
                    style: const TextStyle(
                      color: primary,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            );
          }),
      ],
    );
  }
}

class _RowItem extends StatelessWidget {
  final String label;
  final String value;
  final bool isBold;
  final Color? valueColor;

  const _RowItem({
    required this.label,
    required this.value,
    this.isBold = false,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Colors.grey),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: valueColor ?? Colors.black,
                fontWeight: isBold ? FontWeight.w900 : FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CustomerRecoveryNoticeCard extends StatelessWidget {
  final BookingModel booking;

  const _CustomerRecoveryNoticeCard({
    required this.booking,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: primary.withOpacity(0.08),
        border: Border.all(color: primary.withOpacity(0.35)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            backgroundColor: primary.withOpacity(0.15),
            child: const Icon(
              Icons.replay_circle_filled,
              color: primary,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Recovered Booking',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'This booking was continued through Feasta’s booking recovery flow. Your new catering provider is ${booking.providerBusinessName}.',
                  style: TextStyle(
                    color: Colors.grey.shade700,
                    height: 1.4,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (booking.status == BookingStatus.waitingPayment) ...[
                  const SizedBox(height: 10),
                  const Text(
                    'Please complete the down payment to confirm this recovered booking.',
                    style: TextStyle(
                      color: primary,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
