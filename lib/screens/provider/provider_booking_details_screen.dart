import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../core/constants/status_constants.dart';
import '../../widgets/loading_skeleton.dart';
import '../chat/chat_screen.dart';

class ProviderBookingDetailsScreen extends StatefulWidget {
  final String bookingId;

  const ProviderBookingDetailsScreen({
    super.key,
    required this.bookingId,
  });

  @override
  State<ProviderBookingDetailsScreen> createState() =>
      _ProviderBookingDetailsScreenState();
}

class _ProviderBookingDetailsScreenState
    extends State<ProviderBookingDetailsScreen> {
  final FeastaRepository repository = FeastaRepository();

  bool isProcessing = false;
  

  Future<void> _acceptBooking(BookingModel booking) async {
    setState(() => isProcessing = true);

    try {
      await repository.acceptBooking(booking: booking);

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Booking accepted. Customer can now pay down payment.'),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => isProcessing = false);
      }
    }
  }

  Future<void> _rejectBooking(BookingModel booking) async {
  final reasonController = TextEditingController();

  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text('Reject Booking'),
        content: TextField(
          controller: reasonController,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Enter reason for rejection',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Reject'),
          ),
        ],
      );
    },
  );

  if (confirmed != true) {
    reasonController.dispose();
    return;
  }

  final reason = reasonController.text.trim();
  reasonController.dispose();

  setState(() => isProcessing = true);

  try {
    await repository.rejectBooking(
      booking: booking,
      reason: reason,
    );

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Booking rejected.'),
      ),
    );

    Navigator.pop(context);
  } catch (e) {
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(e.toString().replaceAll('Exception: ', '')),
      ),
    );
  } finally {
    if (mounted) {
      setState(() => isProcessing = false);
    }
  }
}

  Future<void> _markCompleted(BookingModel booking) async {
  final confirm = await showDialog<bool>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text('Mark as Completed'),
        content: const Text(
          'Are you sure this event booking is already completed? The customer will be allowed to leave a review after this.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Mark Completed'),
          ),
        ],
      );
    },
  );

  if (confirm != true) return;

  setState(() => isProcessing = true);

  try {
    await repository.markBookingCompleted(booking: booking);

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Booking marked as completed.'),
      ),
    );

    Navigator.pop(context);
  } catch (e) {
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(e.toString().replaceAll('Exception: ', '')),
      ),
    );
  } finally {
    if (mounted) {
      setState(() => isProcessing = false);
    }
  }
}

  String _formatDate(DateTime? date) {
    if (date == null) return 'No date';
    return '${date.month}/${date.day}/${date.year}';
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Booking Request',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: StreamBuilder<BookingModel?>(
        stream: repository.bookingById(widget.bookingId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const FeastaSkeletonDetailPage(
              padding: EdgeInsets.all(20),
              showHero: false,
            );
          }

          if (snapshot.hasError) {
            return Center(
              child: Text('Error: ${snapshot.error}'),
            );
          }

          final booking = snapshot.data;

          if (booking == null) {
            return const Center(
              child: Text('Booking not found.'),
            );
          }

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              if (booking.recoveryStatus == BookingRecoveryStatus.completed &&
                  booking.originalProviderId != booking.providerId) ...[
                _RecoveryNoticeCard(booking: booking),
                const SizedBox(height: 16),
              ],
              _Card(
                title: 'Customer Information',
                children: [
                  _RowItem(
                    label: 'Name',
                    value:
                        '${booking.customerFirstName} ${booking.customerLastName}',
                  ),
                  _RowItem(label: 'Email', value: booking.customerEmail),
                  _RowItem(
                    label: 'Phone',
                    value: booking.customerPhoneNumber,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _Card(
                title: 'Event Details',
                children: [
                  _RowItem(label: 'Booking Code', value: booking.bookingCode),
                  _RowItem(label: 'Package', value: booking.packageName),
                  _RowItem(label: 'Event Type', value: booking.eventType),
                  _RowItem(label: 'Date', value: _formatDate(booking.eventDate)),
                  _RowItem(
                    label: 'Time',
                    value: '${booking.eventTime} - ${booking.eventEndTime}',
                  ),
                  _RowItem(label: 'Guests', value: '${booking.guestCount}'),
                  _RowItem(label: 'Location', value: booking.eventLocation),
                  _RowItem(label: 'Address', value: booking.eventAddress),
                ],
              ),
              const SizedBox(height: 16),
              _ListCard(
                title: 'Selected Foods',
                items: booking.selectedFoods,
              ),
              const SizedBox(height: 16),
              _ListCard(
                title: 'Selected Decorations',
                items: booking.selectedDecorations,
              ),
              const SizedBox(height: 16),
              _ListCard(
                title: 'Selected Furniture',
                items: booking.selectedFurniture,
              ),
              const SizedBox(height: 16),
              _SeparatedAddOnsCard(booking: booking),
              const SizedBox(height: 16),
              if (booking.specialRequest.isNotEmpty)
                _Card(
                  title: 'Special Request',
                  children: [
                    Text(
                      booking.specialRequest,
                      style: const TextStyle(
                        color: Colors.grey,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: 16),
              _Card(
                title: 'Payment Summary',
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
                    valueColor: primary,
                    isBold: true,
                  ),
                  _RowItem(
                    label: 'Remaining',
                    value: '₱${booking.remainingBalance.toStringAsFixed(0)}',
                  ),
                  _RowItem(
                    label: 'Status',
                    value: booking.status,
                  ),
                ],
              ),
              const SizedBox(height: 24),

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
                          currentRole: UserRoles.provider,
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: const Text(
                    'Chat with Customer',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: primary,
                    side: const BorderSide(color: primary),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              if (booking.status == 'pending')
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: isProcessing ? null : () => _rejectBooking(booking),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.red,
                        side: const BorderSide(color: Colors.red),
                        minimumSize: const Size.fromHeight(54),
                      ),
                      child: const Text(
                        'Reject',
                        style: TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: isProcessing ? null : () => _acceptBooking(booking),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primary,
                        foregroundColor: Colors.white,
                        minimumSize: const Size.fromHeight(54),
                      ),
                      child: isProcessing
                          ? const CircularProgressIndicator(
                              color: Colors.white,
                            )
                          : const Text(
                              'Accept',
                              style: TextStyle(fontWeight: FontWeight.w900),
                            ),
                    ),
                  ),
                ],
              )
            else if (booking.status == 'confirmed')
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton.icon(
                  onPressed: isProcessing ? null : () => _markCompleted(booking),
                  icon: const Icon(Icons.check_circle_outline),
                  label: const Text(
                    'Mark as Completed',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                  ),
                ),
              )
            else
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.grey.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Text(
                  'This booking is already ${booking.status}.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _RecoveryNoticeCard extends StatelessWidget {
  final BookingModel booking;

  const _RecoveryNoticeCard({
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
                  'Recovered Booking Request',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'This booking came from Feasta’s booking recovery flow. The customer selected your recovery offer, so you are now the assigned catering provider for this event.',
                  style: TextStyle(
                    color: Colors.grey.shade700,
                    height: 1.4,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Current Status: ${booking.status}',
                  style: const TextStyle(
                    color: primary,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
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
              fontSize: 21,
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

class _ListCard extends StatelessWidget {
  final String title;
  final List<String> items;

  const _ListCard({
    required this.title,
    required this.items,
  });

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: title,
      children: items.isEmpty
          ? const [
              Text(
                'No selected items.',
                style: TextStyle(color: Colors.grey),
              ),
            ]
          : items.map((item) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    const Icon(
                      Icons.check_circle,
                      color: Colors.green,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: Text(item)),
                  ],
                ),
              );
            }).toList(),
    );
  }
}

class _SeparatedAddOnsCard extends StatelessWidget {
  final BookingModel booking;

  const _SeparatedAddOnsCard({
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
    return _Card(
      title: 'Selected Add-ons',
      children: [
        _ProviderAddOnGroup(
          title: 'Catering Provider Add-ons',
          addOns: cateringProviderAddOns,
          emptyText: 'No catering provider add-ons selected.',
        ),
        const SizedBox(height: 14),
        _ProviderAddOnGroup(
          title: 'Feasta Marketplace Add-ons',
          addOns: marketplaceAddOns,
          emptyText: 'No marketplace add-ons selected.',
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

class _ProviderAddOnGroup extends StatelessWidget {
  final String title;
  final List<Map<String, dynamic>> addOns;
  final String emptyText;

  const _ProviderAddOnGroup({
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
