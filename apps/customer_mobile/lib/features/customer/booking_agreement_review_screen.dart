import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/booking_agreement.dart';
import '../../shared/models/booking_contract.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_agreement_controller.dart';

class BookingAgreementReviewScreen extends StatefulWidget {
  const BookingAgreementReviewScreen({
    required this.selection,
    this.loader,
    this.resolveProviders,
    super.key,
  });
  final BookingSelection selection;
  final AgreementLoader? loader;
  final AgreementProviderResolver? resolveProviders;
  @override
  State<BookingAgreementReviewScreen> createState() =>
      _BookingAgreementReviewScreenState();
}

class _BookingAgreementReviewScreenState
    extends State<BookingAgreementReviewScreen> {
  late final BookingAgreementController controller;
  StreamSubscription<User?>? _account;
  String? _owner;
  @override
  void initState() {
    super.initState();
    controller = BookingAgreementController(
      resolveProviders:
          widget.resolveProviders ??
          FeastaRepository().resolveBookingAgreementProviders,
      loader:
          widget.loader ??
          FeastaRepository().getBookingPaymentAgreementDisclosures,
    );
    _owner = FirebaseAuth.instance.currentUser?.uid;
    controller.select(widget.selection, ownerId: _owner);
    unawaited(controller.load());
    _account = FirebaseAuth.instance.authStateChanges().listen((user) {
      if (!mounted || user?.uid == _owner) return;
      _owner = user?.uid;
      controller.select(widget.selection, ownerId: _owner);
      unawaited(controller.load());
    });
  }

  @override
  void didUpdateWidget(covariant BookingAgreementReviewScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (controller.select(widget.selection, ownerId: _owner)) {
      unawaited(controller.load());
    }
  }

  @override
  void dispose() {
    unawaited(_account?.cancel());
    controller.dispose();
    super.dispose();
  }

  Widget _agreement(BookingAgreement a) {
    Widget row(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelLarge),
          Text(value),
        ],
      ),
    );
    return FeastaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(a.providerName, style: Theme.of(context).textTheme.titleLarge),
          row('Included services', a.serviceNames.join(', ')),
          if (a.serviceTierLabel != null)
            row('Service level', a.serviceTierLabel!),
          row('Scheduled event start', agreementTime(a.time('eventStartAt'))),
          Text(
            a.depositEligible
                ? 'Deposit option available'
                : 'Full payment required',
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
            ),
          ),
          row('Total service amount', agreementMoney(a.gross)),
          row('Required upfront payment', agreementMoney(a.upfront)),
          row('Remaining balance', agreementMoney(a.remaining)),
          if (a.depositEligible || a.eligibilityReason == 'short_notice')
            row(
              'Deposit eligibility cutoff',
              agreementTime(a.time('depositEligibilityCutoffAt')),
            ),
          Text(
            a.depositEligible
                ? 'Deposit eligibility is finalized on submission. Review again if the cutoff passes.'
                : a.eligibilityReason == 'short_notice'
                ? 'Full payment is required because the 72-hour deposit eligibility cutoff has passed.'
                : "Full payment is required under this service's saved payment policy.",
          ),
          if (a.depositEligible)
            row(
              'Remaining balance becomes due',
              agreementTime(a.time('remainingBalanceDueAt')),
            ),
          row(
            'Final payment deadline',
            agreementTime(a.time('hardPaymentDeadlineAt')),
          ),
          row(
            'Preparation Period begins',
            agreementTime(a.time('preparationStartsAt')),
          ),
          const Text(
            'Preparation begins once the booking is fully paid and clear. The event enters In Progress at its scheduled start when clear. The provider confirms completion.',
          ),
          if (a.allocation != null) ...[
            const SizedBox(height: 12),
            Text(
              'Failure to Pay Remaining Balance',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const Text(
              'If the remaining balance is not settled by the final payment deadline, the booking will be automatically cancelled and will not enter the Preparation Period. A payment started before the deadline may await final confirmation.',
            ),
            row(
              'Refund to you',
              agreementMoney(
                a.allocation!['customerDefaultRefundAmountInCentavos']!,
              ),
            ),
            row(
              'Provider reservation compensation',
              agreementMoney(
                a.allocation!['providerReservationCompAmountInCentavos']!,
              ),
            ),
            row(
              'FEASTA cancellation/platform fee',
              agreementMoney(
                a.allocation!['feastaCancellationFeeAmountInCentavos']!,
              ),
            ),
            const Text(
              'This payment-default rule is separate from the Cancellation Refund Policy. Refund-policy review is not part of this step.',
            ),
          ],
          CheckboxListTile(
            key: ValueKey('agreement-${a.providerId}'),
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: controller.acknowledged(a),
            onChanged: (value) => controller.acknowledge(
              a.providerId,
              a.agreementKey,
              value == true,
            ),
            title: const Text(
              "I have reviewed and agree to this provider's Booking & Payment Agreement shown above.",
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(title: const Text('Booking & Payment Agreements')),
    body: AnimatedBuilder(
      animation: controller,
      builder: (context, _) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(
            'Preparation review only. No booking is submitted and no payment is collected here.',
          ),
          const SizedBox(height: 8),
          const Text(
            "FEASTA generates these terms for your current selections. All times are Asia/Manila. Each total applies to that provider's services.",
          ),
          const SizedBox(height: 16),
          if (controller.status == AgreementReviewStatus.loading) ...[
            const LinearProgressIndicator(),
            const SizedBox(height: 8),
            const Text('Loading current booking agreements...'),
          ],
          if (controller.message != null) ...[
            Semantics(liveRegion: true, child: Text(controller.message!)),
            const SizedBox(height: 12),
          ],
          for (final agreement in controller.agreements) ...[
            _agreement(agreement),
            const SizedBox(height: 16),
          ],
          if (controller.status != AgreementReviewStatus.loading)
            OutlinedButton.icon(
              onPressed: () => controller.load(),
              icon: const Icon(Icons.refresh),
              label: const Text('Reload current agreements'),
            ),
          if (controller.status == AgreementReviewStatus.ready)
            Text(
              controller.allAcknowledged
                  ? 'All displayed agreements acknowledged for this review only. Submission remains unavailable.'
                  : 'Review and acknowledge each provider agreement. Submission remains unavailable.',
            ),
          const SizedBox(height: 16),
          FeastaPrimaryButton(
            label: 'Return to event review',
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
    ),
  );
}
