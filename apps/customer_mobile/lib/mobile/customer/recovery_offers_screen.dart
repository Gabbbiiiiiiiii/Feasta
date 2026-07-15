import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';

class RecoveryOffersScreen extends StatelessWidget {
  final BookingModel booking;

  const RecoveryOffersScreen({
    super.key,
    required this.booking,
  });

  Future<void> _selectOffer(
    BuildContext context,
    RecoveryOfferModel offer,
  ) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Confirm Recovery Caterer'),
          content: Text(
            'Selecting ${offer.offeringProviderBusinessName} will replace the original catering provider for this booking. After selecting, you must complete the down payment to confirm the booking.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Close'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Confirm Selection'),
            ),
          ],
        );
      },
    );

    if (confirm != true) return;

    try {
      await FeastaRepository().selectRecoveryOffer(
        booking: booking,
        offer: offer,
      );

      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Recovery caterer selected. Please pay down payment.'),
        ),
      );

      Navigator.pop(context);
    } catch (e) {
      if (!context.mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceAll('Exception: ', '')),
        ),
      );
    }
  }

  void _showOfferDetails(
  BuildContext context,
  RecoveryOfferModel offer,
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
      const primary = Color(0xFFFF6333);

      return DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.82,
        minChildSize: 0.40,
        maxChildSize: 0.95,
        builder: (context, scrollController) {
          return FutureBuilder<ProviderModel?>(
            future: FeastaRepository().getProviderById(
              offer.offeringProviderId,
            ),
            builder: (context, providerSnapshot) {
              final provider = providerSnapshot.data;

              return ListView(
                controller: scrollController,
                padding: const EdgeInsets.all(20),
                children: [
                  const Text(
                    'Recovery Offer Details',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 16),

                  if (providerSnapshot.connectionState ==
                      ConnectionState.waiting)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 8),
                      child: FeastaSkeletonPulse(
                        child: Column(
                          children: [
                            FeastaSkeletonBox(height: 96, radius: 18),
                            SizedBox(height: 12),
                            FeastaSkeletonBox(height: 54, radius: 14),
                          ],
                        ),
                      ),
                    )
                  else
                    _ProviderProfileCard(
                      provider: provider,
                      fallbackBusinessName:
                          offer.offeringProviderBusinessName,
                    ),

                  const SizedBox(height: 18),

                  _DetailRow(
                    label: 'Estimated Price',
                    value: '₱${offer.estimatedPrice.toStringAsFixed(0)}',
                    valueColor: primary,
                  ),
                  _DetailRow(
                    label: 'Offer Status',
                    value: offer.status,
                  ),

                  const SizedBox(height: 18),
                  const Text(
                    'Provider Message',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    offer.message.isEmpty
                        ? 'This caterer offered to handle your event.'
                        : offer.message,
                    style: const TextStyle(
                      color: Colors.grey,
                      height: 1.4,
                    ),
                  ),

                  const SizedBox(height: 18),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.orange.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: Colors.orange.withOpacity(0.35),
                      ),
                    ),
                    child: const Text(
                      'Important: If you select this caterer, they will become the new main catering provider for your booking. Your external marketplace add-ons will stay on hold until you complete the catering down payment.',
                      style: TextStyle(
                        height: 1.4,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),

                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: ElevatedButton(
                      onPressed: booking.recoveryStatus ==
                                  BookingRecoveryStatus.open ||
                              booking.recoveryStatus ==
                                  BookingRecoveryStatus.offerReceived
                          ? () {
                              Navigator.pop(context);
                              _selectOffer(context, offer);
                            }
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: primary,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text(
                        'Select This Caterer',
                        style: TextStyle(fontWeight: FontWeight.w900),
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        },
      );
    },
  );
}

  bool get canSelectOffer {
    return booking.recoveryStatus == BookingRecoveryStatus.open ||
        booking.recoveryStatus == BookingRecoveryStatus.offerReceived;
  }

  @override
  Widget build(BuildContext context) {
    final repository = FeastaRepository();
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Recovery Offers',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: StreamBuilder<List<RecoveryOfferModel>>(
        stream: repository.recoveryOffersByBooking(booking.id),
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

          final offers = snapshot.data ?? [];

          if (offers.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text(
                  'No recovery offers yet. Qualified caterers can offer service for your rejected request.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
              ),
            );
          }

          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: primary.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: primary.withOpacity(0.25),
                  ),
                ),
                child: const Text(
                  'Compare the caterers who offered to handle your rejected booking request. Select only one caterer to continue, then complete the down payment to confirm.',
                  style: TextStyle(
                    height: 1.4,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 16),

              ...offers.map((offer) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: Container(
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
                          offer.offeringProviderBusinessName,
                          style: const TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          offer.message.isEmpty
                              ? 'This caterer offered to handle your event.'
                              : offer.message,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.grey,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Estimated Price: ₱${offer.estimatedPrice.toStringAsFixed(0)}',
                          style: const TextStyle(
                            color: primary,
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(height: 14),

                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: OutlinedButton.icon(
                            onPressed: () => _showOfferDetails(context, offer),
                            icon: const Icon(Icons.visibility_outlined),
                            label: const Text(
                              'View Offer Details',
                              style: TextStyle(fontWeight: FontWeight.w900),
                            ),
                          ),
                        ),

                        const SizedBox(height: 10),

                        SizedBox(
                          width: double.infinity,
                          height: 50,
                          child: ElevatedButton(
                            onPressed: canSelectOffer
                                ? () => _selectOffer(context, offer)
                                : null,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: primary,
                              foregroundColor: Colors.white,
                            ),
                            child: const Text(
                              'Select This Caterer',
                              style: TextStyle(fontWeight: FontWeight.w900),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ],
          );
        },
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;

  const _DetailRow({
    required this.label,
    required this.value,
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
              style: TextStyle(
                color: valueColor ?? Colors.black,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ProviderProfileCard extends StatelessWidget {
  final ProviderModel? provider;
  final String fallbackBusinessName;

  const _ProviderProfileCard({
    required this.provider,
    required this.fallbackBusinessName,
  });

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    final businessName = provider?.businessName ?? fallbackBusinessName;
    final description = provider?.description ?? '';
    final location = provider?.location ?? '';
    final ratingAverage = provider?.ratingAverage ?? 0;
    final reviewCount = provider?.reviewCount ?? 0;
    final minPrice = provider?.minPrice ?? 0;
    final maxPrice = provider?.maxPrice ?? 0;
    final serviceAreas = provider?.serviceAreas ?? [];
    final eventTypesSupported = provider?.eventTypesSupported ?? [];
    final coverImageUrl = provider?.coverImageUrl;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE5E7EB)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (coverImageUrl != null && coverImageUrl.isNotEmpty) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.network(
                coverImageUrl,
                height: 150,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) {
                  return Container(
                    height: 150,
                    width: double.infinity,
                    color: primary.withOpacity(0.10),
                    child: const Icon(
                      Icons.storefront,
                      color: primary,
                      size: 44,
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 14),
          ],

          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: primary.withOpacity(0.12),
                child: const Icon(
                  Icons.storefront,
                  color: primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      businessName,
                      style: const TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    if (location.isNotEmpty)
                      Text(
                        location,
                        style: const TextStyle(
                          color: Colors.grey,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),

          if (description.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              description,
              style: const TextStyle(
                color: Colors.grey,
                height: 1.4,
              ),
            ),
          ],

          const SizedBox(height: 14),

          Row(
            children: [
              const Icon(
                Icons.star,
                color: Colors.amber,
                size: 20,
              ),
              const SizedBox(width: 5),
              Text(
                '${ratingAverage.toStringAsFixed(1)} ($reviewCount reviews)',
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),

          const SizedBox(height: 10),

          if (minPrice > 0 || maxPrice > 0)
            Text(
              'Price Range: ₱${minPrice.toStringAsFixed(0)} - ₱${maxPrice.toStringAsFixed(0)}',
              style: const TextStyle(
                color: primary,
                fontWeight: FontWeight.w900,
              ),
            ),

          if (eventTypesSupported.isNotEmpty) ...[
            const SizedBox(height: 14),
            const Text(
              'Supported Events',
              style: TextStyle(
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: eventTypesSupported.map((type) {
                return Chip(
                  label: Text(type),
                  backgroundColor: primary.withOpacity(0.08),
                );
              }).toList(),
            ),
          ],

          if (serviceAreas.isNotEmpty) ...[
            const SizedBox(height: 14),
            const Text(
              'Service Areas',
              style: TextStyle(
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: serviceAreas.map((area) {
                return Chip(
                  label: Text(area),
                  backgroundColor: Colors.grey.withOpacity(0.10),
                );
              }).toList(),
            ),
          ],
        ],
      ),
    );
  }
}
