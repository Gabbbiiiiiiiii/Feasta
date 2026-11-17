import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/customer_payment_request.dart';
import '../../shared/models/feasta_models.dart';
import '../../shared/models/independent_booking.dart';
import '../authentication/data/repositories/customer_provider_requests_source.dart';
import 'booking_lifecycle_presentation.dart';
import 'payment_required_screen.dart';

String _label(String value) => value
    .split('_')
    .map(
      (word) =>
          word.isEmpty ? word : '${word[0].toUpperCase()}${word.substring(1)}',
    )
    .join(' ');

/// Parent-only summary; never presents the first provider as the whole event.
class IndependentBookingSummary extends StatelessWidget {
  const IndependentBookingSummary({
    required this.booking,
    this.onDetails,
    super.key,
  });
  final BookingModel booking;
  final VoidCallback? onDetails;

  @override
  Widget build(BuildContext context) {
    final eventDay = booking.eventDate?.toUtc().add(const Duration(hours: 8));
    IndependentBooking? event;
    try {
      event = IndependentBooking.fromBooking(booking);
    } on FormatException {
      /* Fail closed below. */
    }
    return FeastaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Coordinated event',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          Text(booking.bookingCode),
          Text(booking.eventType),
          Text(
            event == null
                ? 'Provider information needs review'
                : '${event.assignments.length} independent providers',
          ),
          Text('Event status: ${_label(booking.status)}'),
          Text(
            eventDay == null
                ? 'Date unavailable'
                : 'Event date: ${eventDay.year}-${eventDay.month.toString().padLeft(2, '0')}-${eventDay.day.toString().padLeft(2, '0')}',
          ),
          Text('${booking.eventTime} – ${booking.eventEndTime}'),
          Text('${booking.eventLocation}\n${booking.eventAddress}'),
          if (event != null) ...[
            const SizedBox(height: 8),
            const Text('Event total'),
            FeastaPriceText(amount: event.totalInCentavos / 100),
            const Text(
              'Provider responses and payments are tracked separately.',
            ),
          ] else
            const Text(
              'Refresh this booking or contact FEASTA support. Amount unavailable.',
            ),
          if (onDetails != null)
            TextButton(onPressed: onDetails, child: const Text('View Details')),
        ],
      ),
    );
  }
}

/// Uses the existing read-only relationship source and validates the complete
/// assignment/request set before presenting provider state or payment actions.
class IndependentBookingDetails extends StatefulWidget {
  const IndependentBookingDetails({required this.booking, super.key});
  final BookingModel booking;
  @override
  State<IndependentBookingDetails> createState() =>
      _IndependentBookingDetailsState();
}

class _IndependentBookingDetailsState extends State<IndependentBookingDetails> {
  Stream<QuerySnapshot<Map<String, dynamic>>>? _requests;
  BookingLifecycleSource? _source;
  void _subscribe() {
    _requests =
        _source?.call(widget.booking) ??
        watchCustomerProviderRequests(widget.booking);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final source = BookingLifecycleScope.maybeOf(context);
    if (_requests == null || source != _source) {
      _source = source;
      _subscribe();
    }
  }

  @override
  void didUpdateWidget(covariant IndependentBookingDetails oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.booking != widget.booking) _subscribe();
  }

  Widget _unavailable() => FeastaCard(
    child: Column(
      children: [
        const Text(
          'Provider booking information is unavailable. Refresh this booking or contact FEASTA support.',
        ),
        TextButton(
          onPressed: () => setState(_subscribe),
          child: const Text('Refresh provider details'),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      IndependentBookingSummary(booking: widget.booking),
      const SizedBox(height: 16),
      StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
        stream: _requests,
        builder: (context, snapshot) {
          if (snapshot.hasError) return _unavailable();
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final docs = snapshot.data?.docs;
          if (docs == null) return _unavailable();
          try {
            final event = IndependentBooking.fromBooking(widget.booking);
            final records = {for (final doc in docs) doc.id: doc.data()};
            if (records.length != docs.length) return _unavailable();
            final requests = event.readRequests(widget.booking, records);
            final canPay =
                !bookingReviewBlocked(widget.booking.lifecycleData) &&
                docs.any((doc) {
                  final request = requests.firstWhere(
                    (r) => r.assignment.requestId == doc.id,
                  );
                  return request.status != null &&
                      request.paymentStatus != null &&
                      !request.reviewRequired &&
                      !bookingReviewBlocked(doc.data()) &&
                      CustomerProviderPaymentRequest.fromDoc(
                        doc,
                        mainEventStatus: widget.booking.status,
                      ).canStartCheckout;
                });
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final request in requests)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: FeastaCard(
                      key: ValueKey(
                        'provider-request-${request.assignment.requestId}',
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            request.providerName,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(
                            request.assignment.marketplace
                                ? 'Marketplace service · ${request.category}'
                                : 'Catering package',
                          ),
                          Text(request.serviceName),
                          Text(
                            'Request status: ${request.status == null ? 'Status unavailable' : _label(request.status!)}',
                          ),
                          if (request.reviewRequired ||
                              bookingReviewBlocked(
                                records[request.assignment.requestId]!,
                              ))
                            const Text('Booking review required'),
                          const Text('Provider amount'),
                          FeastaPriceText(
                            amount: request.assignment.amountInCentavos / 100,
                          ),
                          Text(
                            'Payment status: ${request.paymentStatus == null ? 'Unavailable' : _label(request.paymentStatus!)}',
                          ),
                          if (request.settlementStatus != null)
                            Text(
                              'Settlement: ${_label(request.settlementStatus!)}',
                            ),
                          if (request.settledInCentavos != null) ...[
                            const Text('Gross settled'),
                            FeastaPriceText(
                              amount: request.settledInCentavos! / 100,
                            ),
                            const Text('Outstanding'),
                            FeastaPriceText(
                              amount: request.outstandingInCentavos! / 100,
                            ),
                          ] else
                            const Text(
                              'Current settlement balance unavailable',
                            ),
                        ],
                      ),
                    ),
                  ),
                if (canPay)
                  FilledButton.icon(
                    icon: const Icon(Icons.payment),
                    label: const Text('Manage Payments'),
                    onPressed: () => Navigator.push<void>(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            PaymentRequiredScreen(booking: widget.booking),
                      ),
                    ),
                  ),
              ],
            );
          } on FormatException {
            return _unavailable();
          }
        },
      ),
    ],
  );
}
