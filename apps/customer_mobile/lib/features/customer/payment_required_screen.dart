import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/security/runtime_security.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_shadows.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
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

  bool isProcessing = false;

  BookingModel get booking => widget.booking;

  Future<void> _continueToPayment() async {
    if (isProcessing) {
      return;
    }

    setState(() {
      isProcessing = true;
    });

    try {
      final session = await repository.createPaymentSession(booking: booking);

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
          builder: (_) => PaymentStatusScreen(bookingId: booking.id),
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
    } finally {
      if (mounted) {
        setState(() {
          isProcessing = false;
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
          'Payment Required',
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screen,
          AppSpacing.sm,
          AppSpacing.screen,
          140,
        ),
        children: [
          _PaymentRequiredHero(providerName: booking.providerBusinessName),

          const SizedBox(height: AppSpacing.xl),

          const _SectionHeading(
            title: 'Booking information',
            subtitle:
                'Review the accepted booking before continuing to payment.',
          ),

          const SizedBox(height: AppSpacing.md),

          _PaymentSectionCard(
            icon: Icons.receipt_long_outlined,
            title: 'Booking',
            children: [
              _DetailRow(label: 'Booking code', value: booking.bookingCode),
              _DetailRow(
                label: 'Provider',
                value: booking.providerBusinessName,
              ),
              _DetailRow(label: 'Package', value: booking.packageName),
              _DetailRow(label: 'Event type', value: booking.eventType),
            ],
          ),

          const SizedBox(height: AppSpacing.xl),

          const _SectionHeading(
            title: 'Payment summary',
            subtitle: 'Only the required down payment is due now.',
          ),

          const SizedBox(height: AppSpacing.md),

          _PaymentSummaryCard(
            totalAmount: booking.totalAmount,
            downPaymentAmount: booking.downPaymentAmount,
            remainingBalance: booking.remainingBalance,
            downPaymentPercentage: booking.downPaymentPercentage,
          ),

          const SizedBox(height: AppSpacing.xl),

          const _SectionHeading(
            title: 'Payment method',
            subtitle: 'You will continue to PayMongo’s secure checkout.',
          ),

          const SizedBox(height: AppSpacing.md),

          const _PayMongoCard(),

          const SizedBox(height: AppSpacing.md),

          const _SecurePaymentNotice(),

          const SizedBox(height: AppSpacing.md),

          const _PaymentProcessCard(),
        ],
      ),
      bottomNavigationBar: _PaymentBottomBar(
        amount: booking.downPaymentAmount,
        isProcessing: isProcessing,
        onPressed: _continueToPayment,
      ),
    );
  }
}

class _PaymentRequiredHero extends StatelessWidget {
  const _PaymentRequiredHero({required this.providerName});

  final String providerName;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: AppColors.primarySubtle,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 104,
                height: 104,
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  shape: BoxShape.circle,
                ),
              ),
              const Icon(
                Icons.account_balance_wallet_outlined,
                color: AppColors.primary,
                size: 48,
              ),
              Positioned(
                right: -1,
                bottom: 3,
                child: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: AppColors.success,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.surface, width: 4),
                  ),
                  child: const Icon(
                    Icons.check_rounded,
                    color: Colors.white,
                    size: 18,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: AppSpacing.lg),

          Text(
            'Down payment required',
            textAlign: TextAlign.center,
            style: AppTypography.pageTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: AppSpacing.sm),

          Text(
            '$providerName accepted your booking request. '
            'Complete the required down payment to secure '
            'and confirm your booking.',
            textAlign: TextAlign.center,
            style: AppTypography.body.copyWith(
              color: AppColors.secondaryTextAccessible,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: AppTypography.sectionTitle.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: AppSpacing.xxs),
        Text(
          subtitle,
          style: AppTypography.bodySmall.copyWith(
            color: AppColors.secondaryTextAccessible,
            height: 1.4,
          ),
        ),
      ],
    );
  }
}

class _PaymentSectionCard extends StatelessWidget {
  const _PaymentSectionCard({
    required this.icon,
    required this.title,
    required this.children,
  });

  final IconData icon;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardHeading(icon: icon, title: title),

          const SizedBox(height: AppSpacing.lg),

          for (var index = 0; index < children.length; index++) ...[
            children[index],
            if (index != children.length - 1)
              const Divider(height: AppSpacing.lg, color: AppColors.border),
          ],
        ],
      ),
    );
  }
}

class _CardHeading extends StatelessWidget {
  const _CardHeading({required this.icon, required this.title});

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 42,
          height: 42,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primarySubtle,
            borderRadius: BorderRadius.circular(AppRadius.medium),
          ),
          child: Icon(icon, color: AppColors.primaryStrong, size: 21),
        ),

        const SizedBox(width: AppSpacing.sm),

        Expanded(
          child: Text(
            title,
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final largeText = MediaQuery.textScalerOf(context).scale(16) >= 22;

    if (largeText) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: AppTypography.caption.copyWith(
              color: AppColors.secondaryTextAccessible,
              fontWeight: FontWeight.w700,
            ),
          ),

          const SizedBox(height: AppSpacing.xxs),

          Text(
            value,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w800,
              height: 1.4,
            ),
          ),
        ],
      );
    }

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
              height: 1.35,
            ),
          ),
        ),
      ],
    );
  }
}

class _PaymentSummaryCard extends StatelessWidget {
  const _PaymentSummaryCard({
    required this.totalAmount,
    required this.downPaymentAmount,
    required this.remainingBalance,
    required this.downPaymentPercentage,
  });

  final double totalAmount;
  final double downPaymentAmount;
  final double remainingBalance;
  final double downPaymentPercentage;

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        children: [
          _PriceRow(label: 'Booking total', amount: totalAmount),

          const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
            child: Divider(height: 1, color: AppColors.border),
          ),

          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.primarySubtle,
              borderRadius: BorderRadius.circular(AppRadius.large),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Due now',
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    fontWeight: FontWeight.w700,
                  ),
                ),

                const SizedBox(height: AppSpacing.xxs),

                FeastaPriceText(
                  amount: downPaymentAmount,
                  decimalDigits: 0,
                  semanticLabel: 'Down payment due now',
                  style: AppTypography.pageTitle.copyWith(
                    color: AppColors.primaryStrong,
                    fontWeight: FontWeight.w900,
                  ),
                ),

                const SizedBox(height: AppSpacing.xs),

                Text(
                  '${downPaymentPercentage.toStringAsFixed(0)}% down payment',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: AppSpacing.md),

          _PriceRow(label: 'Remaining balance', amount: remainingBalance),
        ],
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  const _PriceRow({required this.label, required this.amount});

  final String label;
  final double amount;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),

        const SizedBox(width: AppSpacing.md),

        FeastaPriceText(
          amount: amount,
          decimalDigits: 0,
          semanticLabel: label,
          style: AppTypography.label.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }
}

class _PayMongoCard extends StatelessWidget {
  const _PayMongoCard();

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 52,
            height: 52,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.primarySubtle,
              borderRadius: BorderRadius.circular(AppRadius.large),
            ),
            child: const Icon(
              Icons.verified_user_outlined,
              color: AppColors.primaryStrong,
              size: 26,
            ),
          ),

          const SizedBox(width: AppSpacing.md),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Secure checkout with PayMongo',
                  style: AppTypography.cardTitle.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),

                const SizedBox(height: AppSpacing.xs),

                Text(
                  'Available payment methods depend on '
                  'the options enabled in your PayMongo checkout.',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.4,
                  ),
                ),

                const SizedBox(height: AppSpacing.sm),

                Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xs,
                  children: const [
                    _PaymentMethodChip(
                      icon: Icons.phone_android_rounded,
                      label: 'E-wallets',
                    ),
                    _PaymentMethodChip(
                      icon: Icons.credit_card_rounded,
                      label: 'Cards',
                    ),
                    _PaymentMethodChip(
                      icon: Icons.account_balance_outlined,
                      label: 'Online payment',
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentMethodChip extends StatelessWidget {
  const _PaymentMethodChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(AppRadius.pill),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: AppColors.secondaryTextAccessible),
          const SizedBox(width: 5),
          Text(
            label,
            style: AppTypography.caption.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SecurePaymentNotice extends StatelessWidget {
  const _SecurePaymentNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.successSubtle,
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.surface,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.lock_outline_rounded,
              color: AppColors.success,
              size: 20,
            ),
          ),

          const SizedBox(width: AppSpacing.sm),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Secure external checkout',
                  style: AppTypography.label.copyWith(
                    color: AppColors.mainText,
                    fontWeight: FontWeight.w900,
                  ),
                ),

                const SizedBox(height: AppSpacing.xxs),

                Text(
                  'FEASTA opens the trusted PayMongo checkout page '
                  'for payment. Your booking is updated only after '
                  'FEASTA receives the secure payment confirmation.',
                  style: AppTypography.bodySmall.copyWith(
                    color: AppColors.secondaryTextAccessible,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PaymentProcessCard extends StatelessWidget {
  const _PaymentProcessCard();

  @override
  Widget build(BuildContext context) {
    return FeastaCard(
      padding: const EdgeInsets.all(AppSpacing.card),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'How payment works',
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.mainText,
              fontWeight: FontWeight.w900,
            ),
          ),

          const SizedBox(height: AppSpacing.lg),

          const _PaymentStep(
            number: '1',
            title: 'Continue to secure checkout',
            description: 'FEASTA creates a payment session for this booking.',
          ),

          const _PaymentStepConnector(),

          const _PaymentStep(
            number: '2',
            title: 'Complete payment',
            description:
                'Finish the payment using the available method in PayMongo.',
          ),

          const _PaymentStepConnector(),

          const _PaymentStep(
            number: '3',
            title: 'Wait for confirmation',
            description:
                'FEASTA confirms the payment after receiving the secure payment update.',
          ),

          const _PaymentStepConnector(),

          const _PaymentStep(
            number: '4',
            title: 'Booking confirmed',
            description:
                'Once payment succeeds, your booking can move to the confirmed state.',
          ),
        ],
      ),
    );
  }
}

class _PaymentStep extends StatelessWidget {
  const _PaymentStep({
    required this.number,
    required this.title,
    required this.description,
  });

  final String number;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.primarySubtle,
            shape: BoxShape.circle,
          ),
          child: Text(
            number,
            style: AppTypography.label.copyWith(
              color: AppColors.primaryStrong,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),

        const SizedBox(width: AppSpacing.sm),

        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: AppTypography.label.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: AppSpacing.xxs),

              Text(
                description,
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PaymentStepConnector extends StatelessWidget {
  const _PaymentStepConnector();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(left: 16, top: 5, bottom: 5),
      child: SizedBox(
        width: 2,
        height: 18,
        child: ColoredBox(color: AppColors.border),
      ),
    );
  }
}

class _PaymentBottomBar extends StatelessWidget {
  const _PaymentBottomBar({
    required this.amount,
    required this.isProcessing,
    required this.onPressed,
  });

  final double amount;
  final bool isProcessing;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final largeText = MediaQuery.textScalerOf(context).scale(16) >= 22;

    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.sm,
        AppSpacing.screen,
        AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: const Border(top: BorderSide(color: AppColors.border)),
        boxShadow: AppShadows.navigation,
      ),
      child: SafeArea(
        top: false,
        child: largeText
            ? Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Amount due now',
                    style: AppTypography.caption.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),

                  const SizedBox(height: AppSpacing.xxs),

                  FeastaPriceText(
                    amount: amount,
                    decimalDigits: 0,
                    semanticLabel: 'Amount due now',
                    style: AppTypography.sectionTitle.copyWith(
                      color: AppColors.primaryStrong,
                      fontWeight: FontWeight.w900,
                    ),
                  ),

                  const SizedBox(height: AppSpacing.sm),

                  FeastaPrimaryButton(
                    label: isProcessing
                        ? 'Opening Checkout...'
                        : 'Continue to Payment',
                    icon: isProcessing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.surface,
                            ),
                          )
                        : const Icon(Icons.lock_outline_rounded),
                    onPressed: isProcessing ? null : onPressed,
                  ),
                ],
              )
            : Row(
                children: [
                  Expanded(
                    flex: 4,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Due now',
                          style: AppTypography.caption.copyWith(
                            color: AppColors.secondaryTextAccessible,
                          ),
                        ),

                        const SizedBox(height: 2),

                        FeastaPriceText(
                          amount: amount,
                          decimalDigits: 0,
                          semanticLabel: 'Amount due now',
                          style: AppTypography.cardTitle.copyWith(
                            color: AppColors.primaryStrong,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(width: AppSpacing.md),

                  Expanded(
                    flex: 6,
                    child: FeastaPrimaryButton(
                      label: isProcessing ? 'Opening...' : 'Pay Now',
                      icon: isProcessing
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.surface,
                              ),
                            )
                          : const Icon(Icons.lock_outline_rounded),
                      onPressed: isProcessing ? null : onPressed,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
