import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';

class ProviderMyRecoveryOffersScreen extends StatelessWidget {
  final ProviderModel provider;

  const ProviderMyRecoveryOffersScreen({
    super.key,
    required this.provider,
  });

  Color _statusColor(String status) {
    switch (status) {
      case RecoveryOfferStatus.offered:
        return Colors.orange;
      case RecoveryOfferStatus.selected:
        return Colors.green;
      case RecoveryOfferStatus.declined:
        return Colors.red;
      case RecoveryOfferStatus.expired:
        return Colors.grey;
      default:
        return Colors.grey;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case RecoveryOfferStatus.offered:
        return 'Waiting for Customer';
      case RecoveryOfferStatus.selected:
        return 'Selected';
      case RecoveryOfferStatus.declined:
        return 'Declined';
      case RecoveryOfferStatus.expired:
        return 'Expired';
      default:
        return status;
    }
  }

  String _formattedDate(DateTime? date) {
    if (date == null) return 'Unknown date';
    return '${date.month}/${date.day}/${date.year}';
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
          initialChildSize: 0.72,
          minChildSize: 0.40,
          maxChildSize: 0.92,
          builder: (context, scrollController) {
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

                _DetailRow(
                  label: 'Customer',
                  value: offer.customerId,
                ),
                _DetailRow(
                  label: 'Estimated Price',
                  value: '₱${offer.estimatedPrice.toStringAsFixed(0)}',
                  valueColor: primary,
                ),
                _DetailRow(
                  label: 'Status',
                  value: _statusLabel(offer.status),
                  valueColor: _statusColor(offer.status),
                ),
                _DetailRow(
                  label: 'Sent Date',
                  value: _formattedDate(offer.createdAt),
                ),

                const SizedBox(height: 18),
                const Text(
                  'Your Message',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  offer.message.isEmpty
                      ? 'No message provided.'
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
                    color: _statusColor(offer.status).withOpacity(0.08),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: _statusColor(offer.status).withOpacity(0.35),
                    ),
                  ),
                  child: Text(
                    offer.status == RecoveryOfferStatus.selected
                        ? 'The customer selected your recovery offer. Wait for the customer to complete the down payment.'
                        : offer.status == RecoveryOfferStatus.offered
                            ? 'Your offer is still waiting for customer selection.'
                            : offer.status == RecoveryOfferStatus.declined
                                ? 'The customer selected another caterer or this offer was declined.'
                                : 'This recovery offer is no longer active.',
                    style: const TextStyle(
                      height: 1.4,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
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
          'My Recovery Offers',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: StreamBuilder<List<RecoveryOfferModel>>(
        stream: repository.recoveryOffersByProvider(provider.id),
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
                  'You have not sent any recovery offers yet.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.grey),
                ),
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: offers.length,
            separatorBuilder: (_, __) => const SizedBox(height: 14),
            itemBuilder: (context, index) {
              final offer = offers[index];
              final statusColor = _statusColor(offer.status);

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
                    Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: statusColor.withOpacity(0.12),
                          child: Icon(
                            Icons.handshake_outlined,
                            color: statusColor,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'Recovery Offer',
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: statusColor.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(
                            _statusLabel(offer.status),
                            style: TextStyle(
                              color: statusColor,
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 12),

                    Text(
                      offer.message.isEmpty
                          ? 'No message provided.'
                          : offer.message,
                      maxLines: 2,
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
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                      ),
                    ),

                    const SizedBox(height: 6),

                    Text(
                      'Sent: ${_formattedDate(offer.createdAt)}',
                      style: const TextStyle(color: Colors.grey),
                    ),

                    const SizedBox(height: 14),

                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: OutlinedButton.icon(
                        onPressed: () => _showOfferDetails(context, offer),
                        icon: const Icon(Icons.visibility_outlined),
                        label: const Text(
                          'View Offer Details',
                          style: TextStyle(fontWeight: FontWeight.w900),
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
