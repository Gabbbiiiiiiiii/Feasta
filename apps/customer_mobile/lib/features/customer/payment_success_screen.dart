import '../../core/theme/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../shared/models/customer_payment_request.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'package:flutter/material.dart';

import 'booking_details_screen.dart';
import 'customer_main_screen.dart';
import 'customer_payment_receipt_screen.dart';

class PaymentSuccessScreen extends StatelessWidget {
  final String bookingId;
  final String providerName;
  final double amountPaid;
  final String? providerRequestId;

  const PaymentSuccessScreen({
    super.key,
    required this.bookingId,
    required this.providerName,
    required this.amountPaid,
    this.providerRequestId,
  });

  @override
  Widget build(BuildContext context) {
    const primary = AppColors.primary;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.check_circle, color: Colors.green, size: 115),
              const SizedBox(height: 28),
              const Text(
                'Payment Successful',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900),
              ),
              const SizedBox(height: 12),
              Text(
                'Your full payment for $providerName has been recorded. Your booking is now confirmed.',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.grey,
                  height: 1.5,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 28),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: AppColors.border),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Column(
                  children: [
                    const Text(
                      'Amount Paid',
                      style: TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '\u20B1${amountPaid.toStringAsFixed(0)}',
                      style: const TextStyle(
                        color: primary,
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.green.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Text(
                        'Confirmed',
                        style: TextStyle(
                          color: Colors.green,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                'Your payment receipt, including VAT and service charge, '
                'is available from Booking Details.',
                textAlign: TextAlign.center,
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
              const SizedBox(height: 34),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pushReplacement(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            BookingDetailsScreen(bookingId: bookingId),
                      ),
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: primary,
                    foregroundColor: Colors.white,
                  ),
                  child: const Text(
                    'View Booking Details',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              _ReceiptAction(
                bookingId: bookingId,
                providerRequestId: providerRequestId,
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: OutlinedButton(
                  onPressed: () {
                    Navigator.pushAndRemoveUntil(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const CustomerMainScreen(),
                      ),
                      (_) => false,
                    );
                  },
                  child: const Text(
                    'Back to Home',
                    style: TextStyle(fontWeight: FontWeight.w900),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReceiptAction extends StatelessWidget {
  const _ReceiptAction({
    required this.bookingId,
    required this.providerRequestId,
  });

  final String bookingId;
  final String? providerRequestId;

  @override
  Widget build(BuildContext context) {
    if (providerRequestId != null && providerRequestId!.trim().isNotEmpty) {
      return SizedBox(
        width: double.infinity,
        height: 56,
        child: OutlinedButton.icon(
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute<void>(
                builder: (_) => CustomerPaymentReceiptScreen(
                  bookingId: bookingId,
                  providerRequestId: providerRequestId!.trim(),
                ),
              ),
            );
          },
          icon: const Icon(Icons.receipt_long_outlined),
          label: const Text(
            'View payment receipt',
            style: TextStyle(fontWeight: FontWeight.w900),
          ),
        ),
      );
    }

    return FutureBuilder<CustomerProviderPaymentRequest?>(
      future: _loadReceiptRequest(),
      builder: (context, snapshot) {
        final request = snapshot.data;
        if (request == null) {
          return const SizedBox.shrink();
        }

        return SizedBox(
          width: double.infinity,
          height: 56,
          child: OutlinedButton.icon(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (_) => CustomerPaymentReceiptScreen(
                    bookingId: bookingId,
                    providerRequestId: request.id,
                  ),
                ),
              );
            },
            icon: const Icon(Icons.receipt_long_outlined),
            label: const Text(
              'View payment receipt',
              style: TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
        );
      },
    );
  }

  Future<CustomerProviderPaymentRequest?> _loadReceiptRequest() async {
    final booking = await FeastaRepository().bookingById(bookingId).first;
    if (booking == null) {
      return null;
    }
    final requests = await FeastaRepository().customerPaymentRequests(
      booking: booking,
    );
    for (final request in requests) {
      if (request.canViewPaymentReceipt) {
        return request;
      }
    }
    return null;
  }
}
