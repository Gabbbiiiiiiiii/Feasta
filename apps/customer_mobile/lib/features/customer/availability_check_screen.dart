import '../../shared/models/customer_availability.dart';
import 'customization_session.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../core/theme/app_colors.dart';
import 'package:flutter/material.dart';

import '../../shared/models/event_customization_data.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import '../../shared/widgets/loading_skeleton.dart';
import 'booking_summary_screen.dart';

class AvailabilityCheckScreen extends StatefulWidget {
  final CustomizationSession? session;
  final FeastaRepository? repository;
  final ProviderModel provider;
  final PackageModel eventPackage;
  final EventCustomizationData customization;

  const AvailabilityCheckScreen({
    super.key,
    this.session,
    this.repository,
    required this.provider,
    required this.eventPackage,
    required this.customization,
  });

  @override
  State<AvailabilityCheckScreen> createState() =>
      _AvailabilityCheckScreenState();
}

class _AvailabilityCheckScreenState extends State<AvailabilityCheckScreen> {
  late final FeastaRepository repository =
      widget.repository ?? FeastaRepository();
  bool get _authorized =>
      widget.session != null &&
      widget.session!.authorized &&
      FirebaseAuth.instance.currentUser?.uid == widget.session!.uid;

  CustomerAvailability? availability;
  bool openingReview = false;
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
      if (!_authorized) throw StateError('Please sign in again.');
      if (widget.eventPackage.providerId != widget.provider.id) {
        throw StateError(
          'Booking provider changed. Review your package again.',
        );
      }
      final result = await repository.checkProviderAvailability(
        providerId: widget.provider.id,
        packageId: widget.eventPackage.id,
        customization: widget.customization,
      );

      if (!mounted) return;

      if (result.available &&
          (!_authorized ||
              !result.permits(
                FirebaseAuth.instance.currentUser?.uid,
                widget.eventPackage.id,
                widget.provider.id,
                widget.customization,
              ))) {
        throw StateError(
          'Availability check expired or selection changed. Review your event again.',
        );
      }
      setState(() {
        availability = result;
        isAvailable =
            _authorized &&
            result.permits(
              FirebaseAuth.instance.currentUser?.uid,
              widget.eventPackage.id,
              widget.provider.id,
              widget.customization,
            );
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
    const primary = AppColors.primary;

    return CustomizationSessionBoundary(
      session: widget.session,
      builder: (_) => Scaffold(
        appBar: AppBar(title: const Text('Availability Check')),
        body: Padding(
          padding: const EdgeInsets.all(22),
          child: isLoading
              ? const FeastaSkeletonDetailPage(
                  padding: EdgeInsets.zero,
                  showHero: false,
                )
              : errorMessage != null
              ? Center(child: Text(errorMessage!))
              : ListView(
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(18),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: AppColors.border),
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
                            ? Colors.green.withValues(alpha: 0.08)
                            : Colors.red.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: isAvailable ? Colors.green : Colors.red,
                        ),
                      ),
                      child: Column(
                        children: [
                          Icon(
                            isAvailable ? Icons.check_circle : Icons.cancel,
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
                            availability!.message,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),
                    if (isAvailable)
                      SizedBox(
                        width: double.infinity,
                        height: 56,
                        child: ElevatedButton(
                          onPressed: () {
                            if (openingReview ||
                                !_authorized ||
                                availability?.permits(
                                      FirebaseAuth.instance.currentUser?.uid,
                                      widget.eventPackage.id,
                                      widget.provider.id,
                                      widget.customization,
                                    ) !=
                                    true) {
                              return;
                            }
                            openingReview = true;
                            Navigator.push(
                              context,
                              CustomizationSessionRoute(
                                session: widget.session,
                                builder: (_) => widget.session == null
                                    ? BookingSummaryScreen(
                                        provider: widget.provider,
                                        eventPackage: widget.eventPackage,
                                        customization: widget.customization,
                                        preparationOnly: true,
                                      )
                                    : BookingSummaryScreen(
                                        provider: widget.provider,
                                        eventPackage: widget.eventPackage,
                                        customization: widget.customization,
                                        session: widget.session,
                                        preparationOnly: false,
                                        availability: availability,
                                      ),
                              ),
                            ).whenComplete(() {
                              openingReview = false;
                            });
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
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 9),
      child: Row(
        children: [
          Text(label, style: const TextStyle(color: Colors.grey)),
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
