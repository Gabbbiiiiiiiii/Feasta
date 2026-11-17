import 'booking_agreement_terms.dart';
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
    this.controller,
    super.key,
  });
  final BookingSelection selection;
  final AgreementLoader? loader;
  final AgreementProviderResolver? resolveProviders;
  final BookingAgreementController? controller;
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
    controller =
        widget.controller ??
        BookingAgreementController(
          resolveProviders:
              widget.resolveProviders ??
              FeastaRepository().resolveBookingAgreementProviders,
          loader:
              widget.loader ??
              FeastaRepository().getBookingPaymentAgreementDisclosures,
        );
    _owner = FirebaseAuth.instance.currentUser?.uid;
    controller.select(widget.selection, ownerId: _owner);
    unawaited(controller.load(revalidate: widget.controller != null));
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
    if (widget.controller == null) controller.dispose();
    super.dispose();
  }

  Widget _agreement(BookingAgreement a) => BookingAgreementTerms(
    agreement: a,
    acknowledged: controller.acknowledged(a),
    onChanged: (value) =>
        controller.acknowledge(a.providerId, a.agreementKey, value == true),
  );

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
