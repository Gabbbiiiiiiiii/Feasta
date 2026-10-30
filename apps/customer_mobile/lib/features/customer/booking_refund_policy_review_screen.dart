import 'dart:async';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/booking_refund_policy.dart';
import '../../shared/models/booking_contract.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_agreement_controller.dart';
import 'booking_refund_policy_controller.dart';

class BookingRefundPolicyReviewScreen extends StatefulWidget {
  const BookingRefundPolicyReviewScreen({
    required this.selection,
    this.loader,
    this.resolveProviders,
    super.key,
  });
  final BookingSelection selection;
  final RefundLoader? loader;
  final AgreementProviderResolver? resolveProviders;
  @override
  State<BookingRefundPolicyReviewScreen> createState() =>
      _BookingRefundPolicyReviewScreenState();
}

class _BookingRefundPolicyReviewScreenState
    extends State<BookingRefundPolicyReviewScreen> {
  late final BookingRefundPolicyController controller;
  StreamSubscription<User?>? _account;
  String? _owner;
  @override
  void initState() {
    super.initState();
    controller = BookingRefundPolicyController(
      resolveProviders:
          widget.resolveProviders ??
          FeastaRepository().resolveBookingAgreementProviders,
      loader:
          widget.loader ?? FeastaRepository().getBookingRefundPolicyDisclosures,
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
  void didUpdateWidget(covariant BookingRefundPolicyReviewScreen oldWidget) {
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

  Widget _policy(BookingRefundPolicy p) => FeastaCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(p.providerName, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(
          p.sourceKind == 'package_override'
              ? 'Package-specific refund policy'
              : 'Provider default refund policy',
        ),
        Text('Current applicable policy ? Version ${p.policyVersion}'),
        const SizedBox(height: 12),
        for (var i = 0; i < p.rules.length; i++)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              '${refundStageLabels[i]}: ${refundPercentage(p.rules[i].refundBasisPoints)} refund rate',
            ),
          ),
        if (p.terms != null && p.terms!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            'Additional policy terms',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          Text(p.terms!),
        ],
        CheckboxListTile(
          key: ValueKey('refund-${p.providerId}'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: controller.acknowledged(p),
          onChanged: (value) => controller.acknowledge(
            p.providerId,
            p.effectivePolicyKey,
            value == true,
          ),
          title: const Text(
            "I have reviewed and acknowledge this provider's current refund policy.",
          ),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(title: const Text('Refund Policies')),
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
            'These cancellation refund policies are separate from Booking & Payment Agreements, deposit eligibility, payment deadlines and payment-default consequences. Rates do not guarantee a refund for every cancellation.',
          ),
          if (controller.disclosures != null)
            Text(
              controller.disclosures!.acknowledgementsRequired
                  ? 'The server requires acknowledgment of every provider policy.'
                  : 'Server enforcement is off. You can review and acknowledge these disclosures here; this does not authorize submission.',
            ),
          const SizedBox(height: 16),
          if (controller.status == RefundReviewStatus.loading) ...[
            const LinearProgressIndicator(),
            const SizedBox(height: 8),
            const Text('Loading current refund policies...'),
          ],
          if (controller.message != null) ...[
            Semantics(liveRegion: true, child: Text(controller.message!)),
            const SizedBox(height: 12),
          ],
          for (final policy
              in controller.disclosures?.policies ??
                  <BookingRefundPolicy>[]) ...[
            _policy(policy),
            const SizedBox(height: 16),
          ],
          if (controller.status != RefundReviewStatus.loading)
            OutlinedButton.icon(
              onPressed: () => controller.load(),
              icon: const Icon(Icons.refresh),
              label: const Text('Reload current refund policies'),
            ),
          if (controller.status == RefundReviewStatus.ready)
            Text(
              controller.allAcknowledged
                  ? 'All current refund policies acknowledged for this review only. Submission remains unavailable.'
                  : 'Review and acknowledge each provider refund policy. Submission remains unavailable.',
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
