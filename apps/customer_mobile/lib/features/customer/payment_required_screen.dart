import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/security/runtime_security.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/customer_payment_request.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'payment_status_screen.dart';

class PaymentRequiredScreen extends StatefulWidget {
  const PaymentRequiredScreen({required this.booking, super.key});

  final BookingModel booking;

  @override
  State<PaymentRequiredScreen> createState() => _PaymentRequiredScreenState();
}

class _PaymentRequiredScreenState extends State<PaymentRequiredScreen> {
  final FeastaRepository repository = FeastaRepository();

  late Future<List<CustomerProviderPaymentRequest>> _requestsFuture;

  String? _processingRequestId;
  CustomerPaymentChoice? _processingChoice;

  BookingModel get booking => widget.booking;

  bool get isProcessing => _processingRequestId != null;

  @override
  void initState() {
    super.initState();
    _requestsFuture = _loadRequests();
  }

  Future<List<CustomerProviderPaymentRequest>> _loadRequests() {
    return repository.customerPaymentRequests(booking: booking);
  }

  void _reload() {
    setState(() {
      _requestsFuture = _loadRequests();
    });
  }

  Future<void> _continueToPayment(
    CustomerProviderPaymentRequest request,
    CustomerPaymentOption option,
  ) async {
    if (isProcessing) {
      return;
    }

    setState(() {
      _processingRequestId = request.id;
      _processingChoice = option.choice;
    });

    try {
      final session = await repository.createProviderPaymentSession(
        providerRequestId: request.id,
        paymentChoice: option.choice,
      );

      if (session.bookingId != booking.id) {
        throw Exception(
          'The secure payment session does not match this booking.',
        );
      }

      final checkoutUri = RuntimeSecurity.requireTrustedPayMongoCheckout(
        session.checkoutUrl,
      );

      final opened = await launchUrl(
        checkoutUri,
        mode: LaunchMode.externalApplication,
      );

      if (!opened) {
        throw Exception('Unable to open the secure checkout page.');
      }

      if (!mounted) {
        return;
      }

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => PaymentStatusScreen(
            bookingId: booking.id,
            providerRequestId: request.id,
            paymentChoice: option.choice,
            amountInCentavos: option.amountInCentavos,
          ),
        ),
      );
    } catch (error) {
      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(error.toString().replaceAll('Exception: ', '')),
          ),
        );

      _reload();
    } finally {
      if (mounted) {
        setState(() {
          _processingRequestId = null;
          _processingChoice = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        title: Text(
          'Payments',
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: FutureBuilder<List<CustomerProviderPaymentRequest>>(
        future: _requestsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              snapshot.data == null) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(AppSpacing.screen),
                child: CircularProgressIndicator(),
              ),
            );
          }

          if (snapshot.hasError) {
            return FeastaApplicationErrorState(
              kind: FeastaErrorKind.load,
              message:
                  'We could not load the trusted payment information. '
                  'Please try again.',
              onRetry: _reload,
            );
          }

          final requests =
              snapshot.data ?? const <CustomerProviderPaymentRequest>[];

          return RefreshIndicator(
            color: AppColors.primary,
            onRefresh: () async {
              _reload();
              await _requestsFuture;
            },
            child: _PaymentPageContent(
              booking: booking,
              requests: requests,
              processingRequestId: _processingRequestId,
              processingChoice: _processingChoice,
              onPay: _continueToPayment,
            ),
          );
        },
      ),
    );
  }
}

class _PaymentPageContent extends StatelessWidget {
  const _PaymentPageContent({
    required this.booking,
    required this.requests,
    required this.processingRequestId,
    required this.processingChoice,
    required this.onPay,
  });

  final BookingModel booking;
  final List<CustomerProviderPaymentRequest> requests;
  final String? processingRequestId;
  final CustomerPaymentChoice? processingChoice;

  final Future<void> Function(
    CustomerProviderPaymentRequest request,
    CustomerPaymentOption option,
  )
  onPay;

  @override
  Widget build(BuildContext context) {
    final payableCount = requests
        .where((request) => request.canStartCheckout)
        .length;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.sm,
        AppSpacing.screen,
        AppSpacing.massive,
      ),
      children: [
        _PaymentHero(
          bookingCode: booking.bookingCode,
          payableCount: payableCount,
        ),

        const SizedBox(height: AppSpacing.xl),

        _BookingSummary(booking: booking),

        const SizedBox(height: AppSpacing.xl),

        Text(
          'Provider payments',
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),

        const SizedBox(height: AppSpacing.xxs),

        Text(
          'Each provider has its own payment requirement. '
          'The final payable amount is verified by FEASTA before checkout.',
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
            height: 1.45,
          ),
        ),

        const SizedBox(height: AppSpacing.md),

        if (requests.isEmpty)
          const FeastaEmptyState(
            icon: Icons.payments_outlined,
            title: 'No provider payments available',
            message:
                'There are no provider payment requests attached '
                'to this booking.',
          )
        else
          for (var index = 0; index < requests.length; index++) ...[
            _ProviderPaymentCard(
              request: requests[index],
              processingRequestId: processingRequestId,
              processingChoice: processingChoice,
              onPay: onPay,
            ),
            if (index != requests.length - 1)
              const SizedBox(height: AppSpacing.md),
          ],

        const SizedBox(height: AppSpacing.xl),

        const _SecureCheckoutNotice(),
      ],
    );
  }
}

class _PaymentHero extends StatelessWidget {
  const _PaymentHero({required this.bookingCode, required this.payableCount});

  final String bookingCode;
  final int payableCount;

  @override
  Widget build(BuildContext context) {
    final hasPayment = payableCount > 0;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Container(
            width: 82,
            height: 82,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              shape: BoxShape.circle,
            ),
            child: Icon(
              hasPayment
                  ? Icons.account_balance_wallet_outlined
                  : Icons.verified_outlined,
              color: AppColors.primaryStrong,
              size: 40,
            ),
          ),

          const SizedBox(height: AppSpacing.md),

          Text(
            hasPayment ? 'Payment available' : 'No payment due right now',
            textAlign: TextAlign.center,
            style: AppTypography.pageTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: AppSpacing.xs),

          Text(
            hasPayment
                ? '$payableCount provider '
                      '${payableCount == 1 ? 'payment is' : 'payments are'} '
                      'ready for secure checkout.'
                : 'FEASTA found no payment action currently available.',
            textAlign: TextAlign.center,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
              height: 1.45,
            ),
          ),

          const SizedBox(height: AppSpacing.sm),

          Text(
            bookingCode,
            style: AppTypography.caption.copyWith(
              color: AppColors.secondaryTextAccessible,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _BookingSummary extends StatelessWidget {
  const _BookingSummary({required this.booking});

  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Booking',
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: AppSpacing.md),

          _DetailRow(label: 'Event', value: booking.eventType),

          const Divider(height: AppSpacing.lg, color: AppColors.border),

          _DetailRow(label: 'Booking total', value: _peso(booking.totalAmount)),
        ],
      ),
    );
  }
}

class _ProviderPaymentCard extends StatelessWidget {
  const _ProviderPaymentCard({
    required this.request,
    required this.processingRequestId,
    required this.processingChoice,
    required this.onPay,
  });

  final CustomerProviderPaymentRequest request;
  final String? processingRequestId;
  final CustomerPaymentChoice? processingChoice;

  final Future<void> Function(
    CustomerProviderPaymentRequest request,
    CustomerPaymentOption option,
  )
  onPay;

  bool get anyCheckoutRunning => processingRequestId != null;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 46,
                height: 46,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.primarySubtle,
                  borderRadius: BorderRadius.circular(AppRadius.medium),
                ),
                child: const Icon(
                  Icons.storefront_outlined,
                  color: AppColors.primaryStrong,
                ),
              ),

              const SizedBox(width: AppSpacing.sm),

              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      request.providerBusinessName,
                      style: AppTypography.cardTitle.copyWith(
                        color: AppColors.mainText,
                        fontWeight: FontWeight.w900,
                      ),
                    ),

                    const SizedBox(height: AppSpacing.xxs),

                    Text(
                      request.packageName,
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: AppSpacing.md),

          _DetailRow(label: 'Request status', value: _humanize(request.status)),

          const Divider(height: AppSpacing.lg, color: AppColors.border),

          _DetailRow(
            label: 'Payment status',
            value: _humanize(request.paymentStatus),
          ),

          if (request.checkoutOptions.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.lg),

            for (
              var index = 0;
              index < request.checkoutOptions.length;
              index++
            ) ...[
              _PaymentOptionButton(
                request: request,
                option: request.checkoutOptions[index],
                disabled: anyCheckoutRunning,
                isLoading:
                    processingRequestId == request.id &&
                    processingChoice == request.checkoutOptions[index].choice,
                primary: index == 0,
                onPay: onPay,
              ),
              if (index != request.checkoutOptions.length - 1)
                const SizedBox(height: AppSpacing.sm),
            ],
          ] else ...[
            const SizedBox(height: AppSpacing.md),

            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(AppSpacing.sm),
              decoration: BoxDecoration(
                color: AppColors.surfaceMuted,
                borderRadius: BorderRadius.circular(AppRadius.medium),
              ),
              child: Text(
                _noPaymentMessage(request),
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PaymentOptionButton extends StatelessWidget {
  const _PaymentOptionButton({
    required this.request,
    required this.option,
    required this.disabled,
    required this.isLoading,
    required this.primary,
    required this.onPay,
  });

  final CustomerProviderPaymentRequest request;
  final CustomerPaymentOption option;
  final bool disabled;
  final bool isLoading;
  final bool primary;

  final Future<void> Function(
    CustomerProviderPaymentRequest request,
    CustomerPaymentOption option,
  )
  onPay;

  String get actionLabel {
    switch (option.choice) {
      case CustomerPaymentChoice.minimum:
        return 'Pay Minimum';

      case CustomerPaymentChoice.full:
        return 'Pay Full';

      case CustomerPaymentChoice.remainingBalance:
        return 'Pay Remaining Balance';
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = '$actionLabel · ${_peso(option.amount)}';

    final callback = disabled
        ? null
        : () {
            onPay(request, option);
          };

    if (primary) {
      return FeastaPrimaryButton(
        label: label,
        loadingLabel: 'Preparing secure checkout',
        isLoading: isLoading,
        icon: const Icon(Icons.payment_rounded),
        onPressed: callback,
      );
    }

    return FeastaSecondaryButton(
      label: label,
      loadingLabel: 'Preparing secure checkout',
      isLoading: isLoading,
      icon: const Icon(Icons.payment_rounded),
      onPressed: callback,
    );
  }
}

class _SecureCheckoutNotice extends StatelessWidget {
  const _SecureCheckoutNotice();

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.verified_user_outlined, color: AppColors.success),

          const SizedBox(width: AppSpacing.sm),

          Expanded(
            child: Text(
              'Checkout opens securely through PayMongo. '
              'The mobile app does not send an authoritative payment amount. '
              'FEASTA updates the payment only after trusted confirmation.',
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 4,
          child: Text(
            label,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          ),
        ),

        const SizedBox(width: AppSpacing.md),

        Expanded(
          flex: 6,
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ],
    );
  }
}

String _noPaymentMessage(CustomerProviderPaymentRequest request) {
  switch (request.paymentStatus) {
    case 'processing':
      return 'Payment confirmation is currently in progress.';

    case 'paid':
      return 'No additional payment is currently due for this provider.';

    case 'failed':
    case 'expired':
      return 'This payment is not currently eligible for another checkout.';

    default:
      return 'No online payment action is currently available.';
  }
}

String _humanize(String value) {
  final normalized = value.trim();

  if (normalized.isEmpty) {
    return 'Unavailable';
  }

  return normalized
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

String _peso(double amount) {
  final fixed = amount.toStringAsFixed(2);
  final parts = fixed.split('.');
  final digits = parts[0];

  final buffer = StringBuffer();

  for (var index = 0; index < digits.length; index++) {
    final remaining = digits.length - index;

    buffer.write(digits[index]);

    if (remaining > 1 && remaining % 3 == 1) {
      buffer.write(',');
    }
  }

  return '₱${buffer.toString()}.${parts[1]}';
}
