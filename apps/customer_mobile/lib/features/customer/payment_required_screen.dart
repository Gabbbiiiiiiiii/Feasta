import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../shared/models/feasta_models.dart';
import '../../core/security/runtime_security.dart';
import '../authentication/data/repositories/feasta_repository.dart';

class PaymentRequiredScreen extends StatefulWidget {
  final BookingModel booking;

  const PaymentRequiredScreen({
    super.key,
    required this.booking,
  });

  @override
  State<PaymentRequiredScreen> createState() => _PaymentRequiredScreenState();
}

class _PaymentRequiredScreenState extends State<PaymentRequiredScreen> {
  final FeastaRepository repository = FeastaRepository();

  bool isProcessing = false;

  Future<void> _continueToPayment() async {
    setState(() => isProcessing = true);

    try {
      final session = await repository.createPaymentSession(
        booking: widget.booking,
      );
        final checkoutUri = RuntimeSecurity.requireTrustedPayMongoCheckout(
          session.checkoutUrl,
        );
        final opened = await launchUrl(
          checkoutUri,
        mode: LaunchMode.externalApplication,
      );
      if (!opened) throw Exception('Unable to open the secure checkout page.');

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Complete payment in PayMongo. FEASTA will confirm it after the secure webhook is received.',
          ),
        ),
      );
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

  @override
  Widget build(BuildContext context) {
    const primary = Color(0xFFFF6333);

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Payment Required',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: primary.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: primary.withValues(alpha: 0.3)),
            ),
            child: Column(
              children: [
                const Icon(
                  Icons.credit_card,
                  color: primary,
                  size: 70,
                ),
                const SizedBox(height: 16),
                const Text(
                  'Down Payment Required',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Your booking was accepted by ${widget.booking.providerBusinessName}. Complete your down payment to confirm your booking.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.grey,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          _PaymentCard(
            title: 'Booking Information',
            children: [
              _PaymentRow(
                label: 'Booking Code',
                value: widget.booking.bookingCode,
              ),
              _PaymentRow(
                label: 'Provider',
                value: widget.booking.providerBusinessName,
              ),
              _PaymentRow(
                label: 'Package',
                value: widget.booking.packageName,
              ),
              _PaymentRow(
                label: 'Event Type',
                value: widget.booking.eventType,
              ),
            ],
          ),
          const SizedBox(height: 16),
          _PaymentCard(
            title: 'Payment Summary',
            children: [
              _PaymentRow(
                label: 'Total Amount',
                value: '₱${widget.booking.totalAmount.toStringAsFixed(0)}',
              ),
              _PaymentRow(
                label: 'Down Payment',
                value: '₱${widget.booking.downPaymentAmount.toStringAsFixed(0)}',
                valueColor: primary,
                isBold: true,
              ),
              _PaymentRow(
                label: 'Remaining Balance',
                value: '₱${widget.booking.remainingBalance.toStringAsFixed(0)}',
              ),
            ],
          ),
          const SizedBox(height: 16),
          _PaymentCard(
            title: 'Payment Method',
            children: [
              const ListTile(
                leading: Icon(Icons.verified_user_outlined, color: primary),
                title: Text(
                  'PayMongo',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text('GCash, Maya, card, and online payments'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.orange.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: Colors.orange.withValues(alpha: 0.4),
              ),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: Colors.orange),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'This is a payment placeholder for testing. Real PayMongo checkout must be handled by a backend or cloud function, not directly inside Flutter.',
                    style: TextStyle(height: 1.4),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 100),
        ],
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(18),
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(
            top: BorderSide(color: Color(0xFFE5E7EB)),
          ),
        ),
        child: SafeArea(
          child: SizedBox(
            height: 56,
            width: double.infinity,
            child: ElevatedButton(
              onPressed: isProcessing ? null : _continueToPayment,
              style: ElevatedButton.styleFrom(
                backgroundColor: primary,
                foregroundColor: Colors.white,
              ),
              child: isProcessing
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(
                      'Pay ₱${widget.booking.downPaymentAmount.toStringAsFixed(0)}',
                      style: const TextStyle(fontWeight: FontWeight.w900),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _PaymentCard({
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

class _PaymentRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isBold;
  final Color? valueColor;

  const _PaymentRow({
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
