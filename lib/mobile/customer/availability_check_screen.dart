import 'package:flutter/material.dart';

import '../../models/event_customization_data.dart';
import '../../models/feasta_models.dart';
import '../../repositories/feasta_repository.dart';
import '../../widgets/loading_skeleton.dart';
import 'booking_summary_screen.dart';

class AvailabilityCheckScreen extends StatefulWidget {
  final ProviderModel provider;
  final PackageModel eventPackage;
  final EventCustomizationData customization;

  const AvailabilityCheckScreen({
    super.key,
    required this.provider,
    required this.eventPackage,
    required this.customization,
  });

  @override
  State<AvailabilityCheckScreen> createState() =>
      _AvailabilityCheckScreenState();
}

class _AvailabilityCheckScreenState extends State<AvailabilityCheckScreen> {
  final FeastaRepository repository = FeastaRepository();

  bool isLoading = true;
  bool isAvailable = false;
  String? errorMessage;

  @override
  void initState() {
    super.initState();
    _checkAvailability();
  }

  Future<void> _checkAvailability() async {
    try {
      final result = await repository.checkProviderAvailability(
        providerId: widget.provider.id,
        eventDate: widget.customization.eventDate,
        maxEventsPerDay: widget.provider.maxEventsPerDay,
      );

      if (!mounted) return;

      setState(() {
        isAvailable = result;
        isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        errorMessage = e.toString();
        isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Availability Check'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(22),
        child: isLoading
            ? const FeastaSkeletonDetailPage(
                padding: EdgeInsets.zero,
                showHero: false,
              )
            : errorMessage != null
                ? Center(child: Text(errorMessage!))
                : Column(
                    children: [
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: const Color(0xFFE5E7EB),
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.provider.businessName,
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 14),
                            _InfoRow(
                              label: 'Event Type',
                              value: widget.customization.eventType,
                            ),
                            _InfoRow(
                              label: 'Date',
                              value:
                                  '${widget.customization.eventDate.month}/${widget.customization.eventDate.day}/${widget.customization.eventDate.year}',
                            ),
                            _InfoRow(
                              label: 'Time',
                              value:
                                  '${widget.customization.eventTime} - ${widget.customization.eventEndTime}',
                            ),
                            _InfoRow(
                              label: 'Guests',
                              value: '${widget.customization.guestCount}',
                            ),
                            _InfoRow(
                              label: 'Capacity',
                              value:
                                  '${widget.provider.maxEventsPerDay} events/day',
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 28),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(28),
                        decoration: BoxDecoration(
                          color: isAvailable
                              ? Colors.green.withOpacity(0.08)
                              : Colors.red.withOpacity(0.08),
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(
                            color: isAvailable ? Colors.green : Colors.red,
                          ),
                        ),
                        child: Column(
                          children: [
                            Icon(
                              isAvailable
                                  ? Icons.check_circle
                                  : Icons.cancel,
                              color: isAvailable ? Colors.green : Colors.red,
                              size: 80,
                            ),
                            const SizedBox(height: 16),
                            Text(
                              isAvailable ? 'Available' : 'Not Available',
                              style: TextStyle(
                                color: isAvailable ? Colors.green : Colors.red,
                                fontSize: 28,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              isAvailable
                                  ? 'This provider can accommodate your event schedule.'
                                  : 'This provider has reached capacity for the selected date.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Colors.grey),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      if (isAvailable)
                        SizedBox(
                          width: double.infinity,
                          height: 56,
                          child: ElevatedButton(
                            onPressed: () {
                                Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                    builder: (_) => BookingSummaryScreen(
                                        provider: widget.provider,
                                        eventPackage: widget.eventPackage,
                                        customization: widget.customization,
                                        ),
                                    ),
                                );
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: primary,
                              foregroundColor: Colors.white,
                            ),
                            child: const Text(
                              'Continue to Booking Summary',
                              style: TextStyle(fontWeight: FontWeight.w900),
                            ),
                          ),
                        )
                      else
                        SizedBox(
                          width: double.infinity,
                          height: 56,
                          child: OutlinedButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Choose Another Date'),
                          ),
                        ),
                    ],
                  ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Row(
        children: [
          Text(
            label,
            style: const TextStyle(color: Colors.grey),
          ),
          const Spacer(),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}
