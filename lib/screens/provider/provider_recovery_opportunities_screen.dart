import 'package:flutter/material.dart';

import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';

class ProviderRecoveryOpportunitiesScreen extends StatelessWidget {
  final ProviderModel provider;

  const ProviderRecoveryOpportunitiesScreen({
    super.key,
    required this.provider,
  });

  Future<void> _sendOffer(
    BuildContext context,
    BookingModel booking,
  ) async {
    final messageController = TextEditingController();
    final priceController = TextEditingController(
      text: booking.totalAmount.toStringAsFixed(0),
    );

    final submitted = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Send Recovery Offer'),
          content: SingleChildScrollView(
            child: Column(
              children: [
                Text(
                  'Send an offer for ${booking.customerFirstName} ${booking.customerLastName}’s event.',
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: priceController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Estimated Price',
                    prefixText: '₱',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: messageController,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Message',
                    hintText: 'Example: We are available for your event.',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Close'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Send Offer'),
            ),
          ],
        );
      },
    );

    if (submitted != true) return;

    final estimatedPrice =
        double.tryParse(priceController.text.trim()) ?? booking.totalAmount;

    try {
      await FeastaRepository().sendRecoveryOffer(
        booking: booking,
        offeringProvider: provider,
        message: messageController.text.trim(),
        estimatedPrice: estimatedPrice,
      );

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Recovery offer sent to customer.'),
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

  String _formattedDate(DateTime? date) {
    if (date == null) return 'No date';
    return '${date.month}/${date.day}/${date.year}';
  }

  void _showEventDetails(
  BuildContext context,
  BookingModel booking,
) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(24),
      ),
    ),
    builder: (context) {
      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.85,
        minChildSize: 0.45,
        maxChildSize: 0.95,
        builder: (context, scrollController) {
          return ListView(
            controller: scrollController,
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Customer Event Details',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 16),

              _DetailRow(label: 'Customer', value: '${booking.customerFirstName} ${booking.customerLastName}'),
              _DetailRow(label: 'Event Type', value: booking.eventType),
              _DetailRow(label: 'Date', value: _formattedDate(booking.eventDate)),
              _DetailRow(label: 'Time', value: '${booking.eventTime} - ${booking.eventEndTime}'),
              _DetailRow(label: 'Guests', value: '${booking.guestCount}'),
              _DetailRow(label: 'Location', value: booking.eventLocation),
              _DetailRow(label: 'Address', value: booking.eventAddress),
              _DetailRow(label: 'Original Package', value: booking.packageName),
              _DetailRow(
                label: 'Estimated Catering Total',
                value: '₱${booking.totalAmount.toStringAsFixed(0)}',
              ),

              const SizedBox(height: 18),
              _DetailList(
                title: 'Selected Foods',
                items: booking.selectedFoods,
                emptyText: 'No selected foods.',
              ),

              const SizedBox(height: 14),
              _DetailList(
                title: 'Selected Decorations',
                items: booking.selectedDecorations,
                emptyText: 'No selected decorations.',
              ),

              const SizedBox(height: 14),
              _DetailList(
                title: 'Selected Furniture',
                items: booking.selectedFurniture,
                emptyText: 'No selected furniture.',
              ),

              const SizedBox(height: 14),
              _AddOnsDetailList(
                title: 'Selected Add-ons',
                addOns: booking.selectedAddOns,
              ),

              if (booking.willArrangeOwnAddOns) ...[
                const SizedBox(height: 14),
                const Text(
                  'Customer-arranged Add-ons',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
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

              if (booking.specialRequest.isNotEmpty) ...[
                const SizedBox(height: 14),
                const Text(
                  'Special Request',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  booking.specialRequest,
                  style: const TextStyle(
                    color: Colors.grey,
                    height: 1.4,
                  ),
                ),
              ],
            ],
          );
        },
      );
    },
  );
}

  @override
  Widget build(BuildContext context) {
    final repository = FeastaRepository();
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Recovery Opportunities',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: StreamBuilder<List<BookingModel>>(
        stream: repository.recoveryOpportunitiesForProvider(provider.id),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const FeastaSkeletonList(
              itemCount: 5,
              padding: EdgeInsets.all(16),
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
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No recovery opportunities available right now.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: bookings.length,
            separatorBuilder: (_, __) => const SizedBox(height: 14),
            itemBuilder: (context, index) {
              final booking = bookings[index];

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
                      booking.eventType,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Customer: ${booking.customerFirstName} ${booking.customerLastName}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Date: ${_formattedDate(booking.eventDate)}',
                      style: const TextStyle(color: Colors.grey),
                    ),
                    Text(
                      'Time: ${booking.eventTime} - ${booking.eventEndTime}',
                      style: const TextStyle(color: Colors.grey),
                    ),
                    Text(
                      'Guests: ${booking.guestCount}',
                      style: const TextStyle(color: Colors.grey),
                    ),
                    Text(
                      'Location: ${booking.eventLocation}',
                      style: const TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Estimated Catering Total: ₱${booking.totalAmount.toStringAsFixed(0)}',
                      style: const TextStyle(
                        color: primary,
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    if (booking.specialRequest.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(
                        'Special Request: ${booking.specialRequest}',
                        style: const TextStyle(
                          color: Colors.grey,
                          height: 1.4,
                        ),
                      ),
                    ],
                    const SizedBox(height: 14),
                    SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: OutlinedButton.icon(
                        onPressed: () => _showEventDetails(context, booking),
                        icon: const Icon(Icons.visibility_outlined),
                        label: const Text(
                        'View Event Details',
                        style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                    ),
                    ),

                    const SizedBox(height: 10),

                    SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton.icon(
                        onPressed: () => _sendOffer(context, booking),
                        icon: const Icon(Icons.handshake_outlined),
                        label: const Text(
                          'Send Recovery Offer',
                          style: TextStyle(fontWeight: FontWeight.w900),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: primary,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;

  const _DetailRow({
    required this.label,
    required this.value,
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
            style: const TextStyle(
              color: Colors.grey,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              value.isEmpty ? 'N/A' : value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailList extends StatelessWidget {
  final String title;
  final List<String> items;
  final String emptyText;

  const _DetailList({
    required this.title,
    required this.items,
    required this.emptyText,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 6),
        if (items.isEmpty)
          Text(
            emptyText,
            style: const TextStyle(color: Colors.grey),
          )
        else
          ...items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 5),
              child: Text('• $item'),
            ),
          ),
      ],
    );
  }
}

class _AddOnsDetailList extends StatelessWidget {
  final String title;
  final List<Map<String, dynamic>> addOns;

  const _AddOnsDetailList({
    required this.title,
    required this.addOns,
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
            fontSize: 16,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 6),
        if (addOns.isEmpty)
          const Text(
            'No selected add-ons.',
            style: TextStyle(color: Colors.grey),
          )
        else
          ...addOns.map((addon) {
            final name = addon['name'] ?? '';
            final providerBusinessName = addon['providerBusinessName'] ?? '';
            final source = addon['source'] ?? '';
            final price = ((addon['price'] ?? 0) as num).toDouble();

            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      providerBusinessName.toString().isEmpty
                          ? '$name\n$source'
                          : '$name • $providerBusinessName\n$source',
                      style: const TextStyle(height: 1.3),
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
