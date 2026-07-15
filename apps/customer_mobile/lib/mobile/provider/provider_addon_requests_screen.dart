import 'package:flutter/material.dart';

import '../../core/constants/status_constants.dart';
import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';

class ProviderAddonRequestsScreen extends StatefulWidget {
  const ProviderAddonRequestsScreen({super.key});

  @override
  State<ProviderAddonRequestsScreen> createState() =>
      _ProviderAddonRequestsScreenState();
}

class _ProviderAddonRequestsScreenState
    extends State<ProviderAddonRequestsScreen> {
  final FeastaRepository repository = FeastaRepository();

  String selectedFilter = AddonRequestStatus.pending;

  final List<String> filters = [
    AddonRequestStatus.pending,
    AddonRequestStatus.accepted,
    AddonRequestStatus.rejected,
    AddonRequestStatus.completed,
    AddonRequestStatus.cancelled,
  ];

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

  Future<void> _acceptRequest(AddonRequestModel request) async {
    try {
      await repository.acceptAddonRequest(request);

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add-on request accepted.')),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception: ', ''))),
      );
    }
  }

  Future<void> _rejectRequest(AddonRequestModel request) async {
    final reasonController = TextEditingController();

    final reason = await showDialog<String>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: const Text('Reject Request'),
          content: TextField(
            controller: reasonController,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'Enter reason for rejection',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context, reasonController.text.trim());
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              child: const Text('Reject'),
            ),
          ],
        );
      },
    );

    if (reason == null) return;

    try {
      await repository.rejectAddonRequest(
        request: request,
        reason: reason,
      );

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add-on request rejected.')),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceAll('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Service Requests',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              scrollDirection: Axis.horizontal,
              itemCount: filters.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (context, index) {
                final filter = filters[index];
                final isSelected = selectedFilter == filter;

                return ChoiceChip(
                  label: Text(statusLabel(filter)),
                  selected: isSelected,
                  selectedColor: primary.withOpacity(0.15),
                  labelStyle: TextStyle(
                    color: isSelected ? primary : Colors.grey,
                    fontWeight: FontWeight.w800,
                  ),
                  onSelected: (_) {
                    setState(() {
                      selectedFilter = filter;
                    });
                  },
                );
              },
            ),
          ),
          Expanded(
            child: StreamBuilder<List<AddonRequestModel>>(
              stream: repository.addonRequestsByProviderOwner(),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const FeastaSkeletonList(
                    itemCount: 5,
                    padding: EdgeInsets.all(16),
                  );
                }

                if (snapshot.hasError) {
                  return Center(child: Text('Error: ${snapshot.error}'));
                }

                final requests = (snapshot.data ?? [])
                    .where((request) => request.status == selectedFilter)
                    .toList();

                if (requests.isEmpty) {
                  return Center(
                    child: Text(
                      'No ${statusLabel(selectedFilter).toLowerCase()} service requests.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.grey),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: requests.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 14),
                  itemBuilder: (context, index) {
                    final request = requests[index];

                    return AddonRequestCard(
                      request: request,
                      statusLabel: statusLabel(request.status),
                      statusColor: statusColor(request.status),
                      onAccept: () => _acceptRequest(request),
                      onReject: () => _rejectRequest(request),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class AddonRequestCard extends StatelessWidget {
  final AddonRequestModel request;
  final String statusLabel;
  final Color statusColor;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  const AddonRequestCard({
    super.key,
    required this.request,
    required this.statusLabel,
    required this.statusColor,
    required this.onAccept,
    required this.onReject,
  });

  String get formattedDate {
    final date = request.eventDate;

    if (date == null) return 'No date';

    return '${date.month}/${date.day}/${date.year}';
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

Color paymentStatusColor(String status) {
  switch (status) {
    case 'paid':
      return Colors.green;
    case 'waiting_payment':
      return Colors.orange;
    case 'cancelled':
    case 'refund_review':
      return Colors.red;
    default:
      return Colors.grey;
  }
}

String linkStatusLabel(String status) {
  switch (status) {
    case AddonLinkStatus.active:
      return 'Active';
    case AddonLinkStatus.awaitingCustomerRecoverySelection:
      return 'On Hold - Booking Recovery';
    case AddonLinkStatus.relinked:
      return 'Relinked to New Caterer';
    case AddonLinkStatus.cancelledDueToMainBookingFailed:
      return 'Cancelled - Main Booking Failed';
    default:
      return status;
  }
}

Color linkStatusColor(String status) {
  switch (status) {
    case AddonLinkStatus.active:
    case AddonLinkStatus.relinked:
      return Colors.green;
    case AddonLinkStatus.awaitingCustomerRecoverySelection:
      return Colors.orange;
    case AddonLinkStatus.cancelledDueToMainBookingFailed:
      return Colors.red;
    default:
      return Colors.grey;
  }
}

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    final canRespond = request.status == AddonRequestStatus.pending;

    final paymentColor = paymentStatusColor(request.paymentStatus);
    final linkColor = linkStatusColor(request.linkStatus);

    final isOnRecoveryHold =
        request.linkStatus == AddonLinkStatus.awaitingCustomerRecoverySelection;

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
                backgroundColor: primary.withOpacity(0.12),
                child: const Icon(Icons.add_business, color: primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  request.addonName,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
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
          const SizedBox(height: 12),

          Text(
            'Customer: ${request.customerFirstName} ${request.customerLastName}',
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),

          Row(
            children: [
              const Icon(Icons.category_outlined, color: Colors.grey, size: 19),
              const SizedBox(width: 6),
              Text(
                request.category,
                style: const TextStyle(color: Colors.grey),
              ),
            ],
          ),
          const SizedBox(height: 8),

          Row(
            children: [
              const Icon(Icons.event, color: Colors.grey, size: 19),
              const SizedBox(width: 6),
              Text(
                '$formattedDate • ${request.eventTime} - ${request.eventEndTime}',
                style: const TextStyle(color: Colors.grey),
              ),
            ],
          ),
          const SizedBox(height: 8),

          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.location_on_outlined,
                  color: Colors.grey, size: 19),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  request.eventAddress,
                  style: const TextStyle(color: Colors.grey),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          Text(
            '₱${request.price.toStringAsFixed(0)}',
            style: const TextStyle(
              color: primary,
              fontSize: 22,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: 12),

          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatusChip(
                label: 'Main: ${request.mainBookingStatus}',
                color: Colors.blueGrey,
              ),
              _StatusChip(
                label: 'Payment: ${paymentStatusLabel(request.paymentStatus)}',
                color: paymentColor,
              ),
              _StatusChip(
                label: linkStatusLabel(request.linkStatus),
                color: linkColor,
              ),
            ],
          ),

          if (isOnRecoveryHold) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.08),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: Colors.orange.withOpacity(0.35),
                ),
              ),
              child: const Text(
                'This request is currently on hold because the main catering booking is under recovery. The customer cannot pay this add-on service until they select and confirm a new catering provider.',
                style: TextStyle(
                  height: 1.4,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],

          if (request.rejectedReason != null &&
              request.rejectedReason!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              'Reason: ${request.rejectedReason}',
              style: const TextStyle(color: Colors.red),
            ),
          ],

          if (canRespond) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: onReject,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.red,
                      side: const BorderSide(color: Colors.red),
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
                    onPressed: onAccept,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: primary,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text(
                      'Accept',
                      style: TextStyle(fontWeight: FontWeight.w900),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusChip({
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 10,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
