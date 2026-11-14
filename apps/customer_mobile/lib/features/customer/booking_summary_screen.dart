import 'booking_payment_requirement.dart';
import 'widgets/package_option_cards.dart' show CustomizationProgress;
import 'event_list/save_review_configuration.dart';
import '../../shared/models/customer_availability.dart';
import 'dart:async';
import 'customization_session.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'booking_attempt_coordinator.dart';
import 'booking_agreement_controller.dart';
import 'booking_refund_policy_controller.dart';
import 'booking_refund_policy_review_screen.dart';
import '../../shared/models/booking_contract.dart';
import 'booking_agreement_review_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../../core/helpers/verification_guard.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_sizes.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/widgets.dart';
import '../../shared/models/event_customization_data.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'booking_submitted_screen.dart';
import 'booking_details_screen.dart';
import 'widgets/booking_preparation_price.dart';
import '../../core/helpers/booking_preparation.dart';

enum BookingReviewEdit { event, package }

class BookingSummaryScreen extends StatefulWidget {
  const BookingSummaryScreen({
    required this.provider,
    required this.eventPackage,
    required this.customization,
    this.preparationOnly = true,
    this.session,
    this.attempts,
    this.availability,
    this.agreements,
    this.refunds,
    super.key,
  });

  final CustomerAvailability? availability;
  final BookingAgreementController? agreements;
  final BookingRefundPolicyController? refunds;
  final bool preparationOnly;
  final CustomizationSession? session;
  final BookingAttemptCoordinator? attempts;
  final ProviderModel provider;
  final PackageModel eventPackage;
  final EventCustomizationData customization;

  @override
  State<BookingSummaryScreen> createState() => _BookingSummaryScreenState();
}

class _BookingSummaryScreenState extends State<BookingSummaryScreen> {
  final FeastaRepository repository = FeastaRepository();
  late final _agreements =
      widget.agreements ??
      BookingAgreementController(
        loader: repository.getBookingPaymentAgreementDisclosures,
        resolveProviders: repository.resolveBookingAgreementProviders,
      );
  late final _refunds =
      widget.refunds ??
      BookingRefundPolicyController(
        loader: repository.getBookingRefundPolicyDisclosures,
        resolveProviders: repository.resolveBookingAgreementProviders,
      );
  BookingSelection get _selection => BookingSelection(
    providerId: widget.provider.id,
    packageId: widget.eventPackage.id,
    customization: snapshotCustomization(widget.customization),
  );
  bool _checkingSavedAttempt = true;
  bool _reconciliationRequired = false;
  String? _requestReference;
  Future<void> _restoreSavedAttempt() async {
    try {
      final attempt = await _attemptCoordinator.restore();
      if (!mounted || !_authorized) return;
      if (attempt != null && !attempt.safeToSupersede) {
        setState(() {
          _requestReference = attempt.clientRequestId;
          _reconciliationRequired = true;
          _attemptMessage =
              'Request ${attempt.clientRequestId} needs reconciliation. Use Check previous request or contact FEASTA support. Another submission is blocked.';
        });
      }
    } catch (error) {
      debugPrint('Cannot restore booking attempt: $error');
      if (mounted && _authorized) {
        setState(() {
          _reconciliationRequired = true;
          _attemptMessage =
              'Saved request could not be verified. Use Check previous request or contact FEASTA support. Submission is blocked and stored requests are retained.';
        });
      }
    } finally {
      if (mounted) setState(() => _checkingSavedAttempt = false);
    }
  }

  bool _reviewingAgreements = false;
  bool _reviewingRefunds = false;

  final Set<(String, String)> _reviewedAgreementKeys = {};
  final Set<(String, String)> _reviewedRefundKeys = {};

  void _rememberReviewedAcknowledgments() {
    if (_reviewingAgreements &&
        _agreements.status == AgreementReviewStatus.ready) {
      for (final agreement in _agreements.agreements) {
        if (_agreements.acknowledged(agreement)) {
          _reviewedAgreementKeys.add((
            agreement.providerId,
            agreement.agreementKey,
          ));
        }
      }
    }

    final policies = _refunds.disclosures?.policies;
    if (_reviewingRefunds &&
        _refunds.status == RefundReviewStatus.ready &&
        policies != null) {
      for (final policy in policies) {
        if (_refunds.acknowledged(policy)) {
          _reviewedRefundKeys.add((
            policy.providerId,
            policy.effectivePolicyKey,
          ));
        }
      }
    }
  }

  bool _reviewRebuildScheduled = false;

  void _reviewChanged() {
    if (!mounted) return;
    _rememberReviewedAcknowledgments();
    if (_reviewRebuildScheduled) return;
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      // Review routes can synchronously invalidate shared controllers while
      // mounting. Keep that state change immediate; rebuild after this frame.
      _reviewRebuildScheduled = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _reviewRebuildScheduled = false;
        if (mounted) setState(() {});
      });
      return;
    }
    setState(() {});
  }

  void _selectReviews() {
    final uid = FirebaseAuth.instance.currentUser?.uid;
    final agreementChanged = _agreements.select(_selection, ownerId: uid);
    final refundChanged = _refunds.select(_selection, ownerId: uid);

    if (agreementChanged || refundChanged) {
      _reviewedAgreementKeys.clear();
      _reviewedRefundKeys.clear();
    }

    if (!widget.preparationOnly && uid != null && _authorized) {
      unawaited(_agreements.load(revalidate: true));
      unawaited(_refunds.load(revalidate: true));
    }
  }

  Future<void> _checkPreviousRequest() async {
    if (!_canRecover || isSubmitting) return;
    setState(() => isSubmitting = true);
    try {
      final attempt = await _attemptCoordinator.restore();
      if (!_canRecover || attempt == null) return;
      _requestReference = attempt.clientRequestId;
      final reconciled = await _attemptCoordinator.reconcile(
        attempt.clientRequestId,
        repository.reconcileBookingSubmission,
      );
      if (!_canRecover) return;
      final rejected =
          reconciled.status == BookingAttemptStatus.rejectedBeforeCreation;
      if (rejected) {
        _agreements.select(_selection, ownerId: null);
        _refunds.select(_selection, ownerId: null);
        _selectReviews();
      }
      setState(() {
        _reconciliationRequired = !rejected;
        _attemptMessage = rejected
            ? 'Request ${attempt.clientRequestId} was confirmed rejected before creation. Review and explicitly acknowledge current agreements and refund policies before preparing another request.'
            : reconciled.result != null &&
                  reconciled.status == BookingAttemptStatus.confirmedExisting
            ? 'Booking ${reconciled.result!.bookingId} is confirmed. Open booking history to view it. Request ${attempt.clientRequestId} has been retained.'
            : 'Request ${attempt.clientRequestId} remains unresolved. Contact FEASTA support; another submission remains blocked.';
      });
      if (reconciled.status == BookingAttemptStatus.confirmedExisting &&
          reconciled.result != null &&
          _canRecover &&
          mounted) {
        await Navigator.of(context).push<void>(
          CustomizationSessionRoute<void>(
            session: _session,
            builder: (_) =>
                BookingDetailsScreen(bookingId: reconciled.result!.bookingId),
          ),
        );
      }
    } catch (error, stack) {
      debugPrint('Booking recovery check failed: $error\n$stack');
      if (mounted) {
        setState(
          () => _attemptMessage =
              'Cannot verify the previous request. Sign in with the original account and retry Check previous request, or contact FEASTA support. The saved request has been retained.',
        );
      }
    } finally {
      if (mounted) setState(() => isSubmitting = false);
    }
  }

  Future<void> _toggleDisclosure({required bool refunds}) async {
    if (!_canAct || isSubmitting || _savingAttempt) return;

    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid == null || !_authorized) return;

    try {
      if (refunds) {
        if (_refunds.status != RefundReviewStatus.ready) {
          await _refunds.load(revalidate: true);
        }

        if (!_canAct ||
            isSubmitting ||
            _savingAttempt ||
            FirebaseAuth.instance.currentUser?.uid != uid) {
          return;
        }

        if (_refunds.status != RefundReviewStatus.ready ||
            !_refunds.matchesSelection(_selection, uid)) {
          _showDisclosureLoadError('Refund Policy');
          return;
        }

        final policies = _refunds.disclosures?.policies;

        if (policies == null || policies.isEmpty) {
          _showDisclosureLoadError('Refund Policy');
          return;
        }

        if (policies.length != 1) {
          _openDisclosure(refunds: true);
          return;
        }

        final policy = policies.single;

        _refunds.acknowledge(
          policy.providerId,
          policy.effectivePolicyKey,
          !_refunds.acknowledged(policy),
        );

        return;
      }

      if (_agreements.status != AgreementReviewStatus.ready) {
        await _agreements.load(revalidate: true);
      }

      if (!_canAct ||
          isSubmitting ||
          _savingAttempt ||
          FirebaseAuth.instance.currentUser?.uid != uid) {
        return;
      }

      if (_agreements.status != AgreementReviewStatus.ready ||
          !_agreements.matchesSelection(_selection, uid)) {
        _showDisclosureLoadError('Booking & Payment Agreement');
        return;
      }

      if (_agreements.agreements.isEmpty) {
        _showDisclosureLoadError('Booking & Payment Agreement');
        return;
      }

      if (_agreements.agreements.length != 1) {
        _openDisclosure(refunds: false);
        return;
      }

      final agreement = _agreements.agreements.single;

      _agreements.acknowledge(
        agreement.providerId,
        agreement.agreementKey,
        !_agreements.acknowledged(agreement),
      );
    } catch (_) {
      if (_canAct) {
        _showDisclosureLoadError(
          refunds ? 'Refund Policy' : 'Booking & Payment Agreement',
        );
      }
    }
  }

  void _showDisclosureLoadError(String title) {
    if (!_canAct) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Cannot load the current $title. Check your connection and try again.',
        ),
      ),
    );
  }

  Widget _acknowledgmentChecklist() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      _disclosureRow(
        'Booking & Payment Agreement',
        _agreements.allAcknowledged,
        false,
      ),
      const Divider(height: 12),
      _disclosureRow('Refund Policy', _refunds.allAcknowledged, true),
    ],
  );

  Widget _disclosureRow(String title, bool acknowledged, bool refunds) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      IconButton(
        tooltip: acknowledged ? 'Uncheck $title' : 'Acknowledge $title',
        onPressed: isSubmitting
            ? null
            : () => _toggleDisclosure(refunds: refunds),
        icon: Icon(
          acknowledged
              ? Icons.check_box_outlined
              : Icons.check_box_outline_blank,
          size: 20,
        ),
        constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
        padding: EdgeInsets.zero,
      ),
      const SizedBox(width: 8),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
            Text(
              acknowledged ? 'Acknowledged' : 'Review required',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
      const SizedBox(width: 8),
      TextButton(
        style: TextButton.styleFrom(
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 8),
        ),
        onPressed: isSubmitting
            ? null
            : () => _openDisclosure(refunds: refunds),
        child: Text('Review', semanticsLabel: 'Review $title'),
      ),
    ],
  );

  Widget _requestNotice() => Card(
    color: Theme.of(context).colorScheme.errorContainer,
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _CardHeading(
            icon: Icons.warning_amber_rounded,
            title: 'Request status',
          ),
          const SizedBox(height: 8),
          Text(
            _requestReference == null
                ? _attemptMessage!
                : _attemptMessage!.replaceAll(
                    _requestReference!,
                    '(saved reference)',
                  ),
          ),
          OutlinedButton.icon(
            onPressed: isSubmitting ? null : _checkPreviousRequest,
            icon: const Icon(Icons.refresh),
            label: const Text('Check previous request'),
          ),
          if (_requestReference != null)
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Request reference for support'),
              children: [
                SelectableText(_requestReference!),
                TextButton.icon(
                  icon: const Icon(Icons.copy_outlined),
                  label: const Text('Copy reference'),
                  onPressed: () async {
                    await Clipboard.setData(
                      ClipboardData(text: _requestReference!),
                    );
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Request reference copied')),
                    );
                  },
                ),
              ],
            ),
        ],
      ),
    ),
  );

  static final _attempts = BookingAttemptCoordinator(
    store: const SecureBookingAttemptStore(),
    currentUid: () => FirebaseAuth.instance.currentUser?.uid,
  );
  bool _savingAttempt = false;
  String? _attemptMessage;
  StreamSubscription<User?>? _attemptAuth;
  late final _session = widget.session;
  bool _sessionClosed = false;
  BookingAttemptCoordinator get _attemptCoordinator =>
      widget.attempts ?? _attempts;
  bool get _authorized =>
      _session == null ||
      (!_sessionClosed &&
          _session.authorized &&
          (_session.isGuest
              ? FirebaseAuth.instance.currentUser == null
              : FirebaseAuth.instance.currentUser?.uid == _session.uid));
  bool get _availabilityPermits =>
      widget.availability?.permits(
        FirebaseAuth.instance.currentUser?.uid,
        widget.eventPackage.id,
        widget.provider.id,
        widget.customization,
      ) ==
      true;
  bool get _canAct =>
      mounted &&
      _authorized &&
      (widget.preparationOnly || _session == null || _availabilityPermits) &&
      (ModalRoute.of(context)?.isActive ?? true);
  bool get _canRecover =>
      mounted && _authorized && (ModalRoute.of(context)?.isActive ?? true);

  void _sessionChanged() {
    if (!_sessionClosed && !_authorized) {
      _sessionClosed = true;
      // Reject already queued preparation without changing the M4.4 queue.
      _attemptCoordinator.invalidateSession();
    }
  }

  @override
  void initState() {
    super.initState();
    _agreements.addListener(_reviewChanged);
    _refunds.addListener(_reviewChanged);
    _selectReviews();
    if (!widget.preparationOnly) unawaited(_restoreSavedAttempt());
    _session?.addListener(_sessionChanged);
    _attemptAuth = FirebaseAuth.instance.authStateChanges().listen((_) {
      _selectReviews();
      if (_session != null) {
        _sessionChanged();
        return;
      }
      _attemptCoordinator.invalidateSession();
      if (mounted) setState(() => _attemptMessage = null);
    });
  }

  @override
  void dispose() {
    _agreements.removeListener(_reviewChanged);
    _refunds.removeListener(_reviewChanged);
    if (widget.agreements == null) _agreements.dispose();
    if (widget.refunds == null) _refunds.dispose();
    if (_session != null &&
        (_savingAttempt || isSubmitting) &&
        !_sessionClosed) {
      _attemptCoordinator.invalidateSession();
    }
    _session?.removeListener(_sessionChanged);
    _attemptAuth?.cancel();
    super.dispose();
  }

  Future<void> _prepareAttempt() async {
    if (!_canAct || _savingAttempt) return;
    setState(() => _savingAttempt = true);
    try {
      final attempt = await _attemptCoordinator.prepare(
        BookingSelection(
          providerId: widget.provider.id,
          packageId: widget.eventPackage.id,
          customization: snapshotCustomization(widget.customization),
        ),
      );
      if (!_canAct) return;
      setState(
        () => _attemptMessage = attempt.result != null
            ? 'This request already has a confirmed booking result. Review booking history.'
            : attempt.status == BookingAttemptStatus.requiresReconciliation
            ? 'Previous request outcome needs reconciliation. No new booking has been sent.'
            : 'Request identity saved securely. No booking has been sent. Fresh agreement and refund-policy reviews are required before future submission.',
      );
    } catch (_) {
      if (_canAct) {
        setState(
          () => _attemptMessage =
              'Request identity could not be safely prepared. Submission remains blocked; existing attempts have been retained.',
        );
      }
    } finally {
      if (_canAct) setState(() => _savingAttempt = false);
    }
  }

  void _openDisclosure({required bool refunds}) {
    if (!_canAct || isSubmitting) return;

    if (refunds) {
      _reviewingRefunds = true;
    } else {
      _reviewingAgreements = true;
    }

    final selection = BookingSelection(
      providerId: widget.provider.id,
      packageId: widget.eventPackage.id,
      customization: snapshotCustomization(widget.customization),
    );
    Navigator.of(context)
        .push<void>(
          CustomizationSessionRoute<void>(
            session: _session,
            builder: (_) => refunds
                ? BookingRefundPolicyReviewScreen(
                    controller: _refunds,
                    selection: selection,
                    resolveProviders: (request) => _withSession(
                      () =>
                          repository.resolveBookingAgreementProviders(request),
                    ),
                    loader: (request) => _withSession(
                      () =>
                          repository.getBookingRefundPolicyDisclosures(request),
                    ),
                  )
                : BookingAgreementReviewScreen(
                    controller: _agreements,
                    selection: selection,
                    resolveProviders: (request) => _withSession(
                      () =>
                          repository.resolveBookingAgreementProviders(request),
                    ),
                    loader: (request) => _withSession(
                      () => repository.getBookingPaymentAgreementDisclosures(
                        request,
                      ),
                    ),
                  ),
          ),
        )
        .whenComplete(() {
          _rememberReviewedAcknowledgments();

          if (refunds) {
            _reviewingRefunds = false;
          } else {
            _reviewingAgreements = false;
          }
        });
  }

  Future<T> _withSession<T>(Future<T> Function() action) async {
    if (!_canAct) throw StateError('Customization session closed.');
    final result = await action();
    if (!_canAct) throw StateError('Customization session closed.');
    return result;
  }

  bool isSubmitting = false;

  String get formattedDate {
    final date = widget.customization.eventDate;

    const months = <String>[
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];

    return '${months[date.month - 1]} '
        '${date.day}, ${date.year}';
  }

  Future<void> _submitBookingRequest() async {
    if (widget.preparationOnly ||
        _session == null ||
        !_canAct ||
        _checkingSavedAttempt ||
        _reconciliationRequired ||
        !_agreements.allAcknowledged ||
        !_refunds.allAcknowledged ||
        isSubmitting) {
      return;
    }

    setState(() => isSubmitting = true);
    String? dispatchedId;
    try {
      final canSubmit = await requireVerifiedPhoneForBooking(context);
      if (!_canAct || !canSubmit) return;
      final selection = BookingSelection(
        providerId: widget.provider.id,
        packageId: widget.eventPackage.id,
        customization: snapshotCustomization(widget.customization),
      );
      final prepared = await _attemptCoordinator.prepare(selection);
      if (!_canAct) return;
      if (!prepared.safeToSupersede || prepared.result != null) {
        _reconciliationRequired = true;
        throw StateError('reconciliation');
      }
      _selectReviews();
      await Future.wait([
        _agreements.load(revalidate: true),
        _refunds.load(revalidate: true),
      ]);
      if (!_canAct) return;
      final ready = await _attemptCoordinator.reviewReadiness(
        requestId: prepared.clientRequestId,
        selection: selection,
        agreements: _agreements,
        refunds: _refunds,
        resolveProviders: repository.resolveBookingAgreementProviders,
      );
      if (!_canAct) return;
      if (ready.status != BookingAttemptStatus.ready) {
        setState(
          () => _attemptMessage =
              'Review and acknowledge every current Booking & Payment Agreement and Refund Policy below. Changed terms require a new review.',
        );
        return;
      }
      final customer = await repository.getCurrentCustomer();
      if (!_canAct) return;
      // No await between capturing current evidence and queuing dispatch.
      final agreementAcknowledgements = _agreements.acknowledgements;
      final policyAcknowledgements = _refunds.acknowledgements;
      // Retain the identity even if persistence throws after writing pending.
      // From this point, every failure is conservatively reconciliation-only.
      dispatchedId = ready.clientRequestId;
      final expectedUid = _session.uid;
      final result = await _attemptCoordinator.dispatch(
        selection,
        (attempt) => repository.createBookingRequest(
          clientRequestId: attempt.clientRequestId,
          agreementAcknowledgements: agreementAcknowledgements,
          policyAcknowledgements: policyAcknowledgements,
          expectedUid: expectedUid,
          customer: customer,
          provider: widget.provider,
          package: widget.eventPackage,
          serviceTier: widget.customization.serviceTier,
          packageThemeId: widget.customization.packageThemeId,
          eventType: widget.customization.eventType,
          eventDate: widget.customization.eventDate,
          eventTime: widget.customization.eventTime,
          eventEndTime: widget.customization.eventEndTime,
          guestCount: widget.customization.guestCount,
          eventLocation: widget.customization.eventLocation,
          eventAddress: widget.customization.eventAddress,
          foodChoiceSelections: widget.customization.foodChoiceSelections,
          selectedFoods: widget.customization.selectedFoods,
          selectedDecorations: widget.customization.selectedDecorations,
          selectedFurniture: widget.customization.selectedFurniture,
          selectedAddOns: widget.customization.selectedAddOns,
          willArrangeOwnAddOns: widget.customization.willArrangeOwnAddOns,
          customerArrangedAddOnsNote:
              widget.customization.customerArrangedAddOnsNote,
          specialRequest: widget.customization.specialRequest,
        ),
      );

      if (!mounted) {
        return;
      }

      if (!_canAct) return;
      await _attemptCoordinator.recordResponse(dispatchedId, {
        'bookingId': result.bookingId,
        'mainEventId': result.mainEventId,
        'providerRequestIds': result.providerRequestIds,
        'created': result.created,
      });
      if (!mounted || !_canAct) return;
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
          builder: (_) => BookingSubmittedScreen(
            bookingId: result.bookingId,
            providerName: widget.provider.businessName,
          ),
        ),
        (_) => false,
      );
    } catch (error, stack) {
      debugPrint('Booking submission failed: $error\n$stack');
      if (dispatchedId != null) {
        _reconciliationRequired = true;
        _requestReference = dispatchedId;
      }
      if (dispatchedId != null && _authorized) {
        try {
          await _attemptCoordinator.requireReconciliation(dispatchedId);
        } catch (storageError) {
          debugPrint(
            'Booking reconciliation persistence failed: $storageError',
          );
        }
      }
      if (!mounted) {
        return;
      }

      final message = dispatchedId != null || error is StateError
          ? 'A previous request needs reconciliation. Do not submit again. Check booking history and contact FEASTA support with your saved request ID; your request identity has been retained.'
          : 'Booking could not be prepared. Check your connection, verification, and current agreements and refund policies, then retry.';
      setState(() => _attemptMessage = message);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(message)));
    } finally {
      if (mounted) {
        setState(() {
          isSubmitting = false;
        });
      }
    }
  }

  String? get _blockedReason {
    if (_reconciliationRequired) {
      return 'Previous request needs review before another submission.';
    }
    if (_checkingSavedAttempt) {
      return 'Checking previous request readiness.';
    }
    if (!_authorized) {
      return 'Sign in again to continue your booking.';
    }
    if (!_availabilityPermits) {
      return 'Check availability again before submitting.';
    }
    if (!_agreements.allAcknowledged) {
      return 'Review and acknowledge Booking & Payment Agreement.';
    }
    if (!_refunds.allAcknowledged) {
      return 'Review and acknowledge Refund Policy.';
    }
    if (!_canAct) {
      return 'Return to the active booking review before submitting.';
    }
    return null;
  }

  Widget _review(BuildContext context, {required bool submissionEnabled}) {
    final data = widget.customization;
    final service = preparationServices(widget.eventPackage)[data.serviceTier];
    final inclusions = service?['includedServices'];
    final theme = preparationThemes(widget.eventPackage)
        .where((item) => item['id'] == data.packageThemeId)
        .map((item) => item['name'].toString())
        .join(', ');
    final foods = <String>[
      ...data.selectedFoods,
      for (final group in widget.eventPackage.foodChoiceGroups)
        for (final option in group.options.entries)
          if (data.foodChoiceSelections.any(
            (selection) =>
                selection['groupId'] == group.id &&
                (selection['optionIds'] as List).contains(option.key),
          ))
            option.value,
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(submissionEnabled ? 'Review Booking' : 'Review Event'),
      ),
      backgroundColor: AppColors.background,
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const CustomizationProgress(step: 2),
          if (!submissionEnabled)
            SaveReviewConfiguration(
              editingIdentity: _session?.eventListIdentity,
              provider: widget.provider,
              package: widget.eventPackage,
              data: widget.customization,
              submitting: isSubmitting || _savingAttempt,
              isAuthorized: () =>
                  mounted &&
                  _authorized &&
                  (ModalRoute.of(context)?.isCurrent ?? true),
            ),
          if (!submissionEnabled && _session?.isGuest != true)
            OutlinedButton(
              onPressed: _savingAttempt ? null : _prepareAttempt,
              child: Text(
                _savingAttempt
                    ? 'Saving request identity...'
                    : 'Prepare request identity',
              ),
            ),
          if (_attemptMessage != null) _requestNotice(),
          if (submissionEnabled && _attemptMessage == null)
            TextButton(
              onPressed: isSubmitting ? null : _checkPreviousRequest,
              child: const Text('Check previous request'),
            ),
          const SizedBox(height: 8),
          if (!submissionEnabled)
            const Text(
              'Preparation only. Availability is unverified. No booking has been sent.',
            ),
          const SizedBox(height: 12),
          Text(
            'Review your booking request',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Check your event, package customization, and selected services before sending the request to the provider.',
          ),
          const SizedBox(height: 16),
          _SummaryCard(
            icon: Icons.calendar_month_outlined,
            title: 'Event details',
            children: [
              if (submissionEnabled)
                _editAction('Edit event', BookingReviewEdit.event),
              _SummaryRow(label: 'Event type', value: data.eventType),
              _SummaryRow(label: 'Date', value: formattedDate),
              _SummaryRow(
                label: 'Time',
                value: '${data.eventTime} - ${data.eventEndTime}',
              ),
              _SummaryRow(label: 'Guests', value: '${data.guestCount}'),
              _SummaryRow(label: 'Location', value: data.eventLocation),
              _SummaryRow(label: 'Full address', value: data.eventAddress),
            ],
          ),
          const SizedBox(height: 12),
          _SummaryCard(
            icon: Icons.tune_rounded,
            title: 'Package & customization',
            children: [
              if (submissionEnabled)
                _editAction('Edit package', BookingReviewEdit.package),
              _SummaryRow(label: 'Package', value: widget.eventPackage.name),
              const Divider(color: AppColors.border, height: 12),
              _SummaryRow(
                label: 'Provider',
                value: widget.provider.businessName,
              ),
              const Divider(color: AppColors.border, height: 12),
              _SummaryRow(
                label: 'Service level',
                value: data.serviceTier == null
                    ? 'Not selected'
                    : service == null
                    ? data.serviceTier!
                    : serviceOptionTitle(data.serviceTier!, service),
              ),
              if (theme.isNotEmpty) _SummaryRow(label: 'Theme', value: theme),
              _SelectionGroup(
                icon: Icons.restaurant_outlined,
                title: widget.eventPackage.isCustomizable
                    ? 'Food selections'
                    : 'Included food',
                values: foods,
              ),
              _SelectionGroup(
                icon: Icons.local_florist_outlined,
                title: 'Decorations',
                values: data.selectedDecorations,
              ),
              _SelectionGroup(
                icon: Icons.chair_outlined,
                title: 'Furniture and equipment',
                values: data.selectedFurniture,
              ),
              _SelectionGroup(
                icon: Icons.room_service_outlined,
                title: 'Service inclusions',
                values: inclusions is List
                    ? inclusions.map((item) => item.toString()).toList()
                    : const [],
              ),
              _SelectionGroup(
                icon: Icons.inventory_2_outlined,
                title: 'Package services',
                values: widget.eventPackage.serviceInclusions,
              ),
            ],
          ),
          const SizedBox(height: 12),
          _SummaryCard(
            icon: Icons.add_circle_outline,
            title: 'Optional event services',
            children: [
              if (data.selectedAddOns.isEmpty && !data.willArrangeOwnAddOns)
                const Text('No FEASTA event services selected.'),
              for (final addon in data.selectedAddOns)
                _AddOnSummaryRow(
                  addOn: {
                    ...addon,
                    if (addon['source'] == 'catering_provider' &&
                        (addon['providerBusinessName']
                                ?.toString()
                                .trim()
                                .isEmpty ??
                            true))
                      'providerBusinessName': widget.provider.businessName,
                  },
                ),
              if (data.willArrangeOwnAddOns)
                _SummaryRow(
                  label: 'Customer-arranged',
                  value: data.customerArrangedAddOnsNote.trim().isEmpty
                      ? 'Arranging own services; costs unconfirmed'
                      : data.customerArrangedAddOnsNote,
                ),
              if (data.specialRequest.trim().isNotEmpty)
                _SummaryRow(
                  label: 'Special request',
                  value: data.specialRequest,
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (submissionEnabled) ...[
            BookingPaymentRequirement(
              controller: _agreements,
              onRetry: () {
                if (_canAct && !isSubmitting) {
                  unawaited(_agreements.load(revalidate: true));
                }
              },
            ),
            const SizedBox(height: 12),
          ],
          _SummaryCard(
            icon: Icons.policy_outlined,
            title: 'Agreements & refund policies',
            children: [_acknowledgmentChecklist()],
          ),
          const SizedBox(height: 12),
          _SummaryPrice(
            package: widget.eventPackage,
            addons: data.selectedAddOns,
            serviceTier: data.serviceTier,
            guests: data.guestCount,
            hasUnconfirmedRequests:
                data.willArrangeOwnAddOns ||
                data.specialRequest.trim().isNotEmpty,
          ),
          if (submissionEnabled)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text(
                'Your provider reviews the request first. Final charges follow the accepted booking, not this estimate.',
              ),
            ),
        ],
      ),
      bottomNavigationBar: submissionEnabled
          ? _BookingSubmitBar(
              eventListAction: SaveReviewConfiguration(
                editingIdentity: _session?.eventListIdentity,
                provider: widget.provider,
                package: widget.eventPackage,
                data: widget.customization,
                submitting: isSubmitting || _savingAttempt,
                isAuthorized: () =>
                    mounted &&
                    _authorized &&
                    (ModalRoute.of(context)?.isCurrent ?? true),
              ),
              isSubmitting: isSubmitting,
              blockedReason: _blockedReason,
              onSubmit:
                  _checkingSavedAttempt ||
                      _reconciliationRequired ||
                      !_agreements.allAcknowledged ||
                      !_refunds.allAcknowledged ||
                      !_canAct
                  ? null
                  : _submitBookingRequest,
            )
          : SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Wrap(
                  spacing: 12,
                  children: [
                    _editAction('Edit event', BookingReviewEdit.event),
                    _editAction('Edit package', BookingReviewEdit.package),
                  ],
                ),
              ),
            ),
    );
  }

  @override
  Widget build(BuildContext context) =>
      CustomizationSessionBoundary(session: _session, builder: _buildContent);

  Widget _editAction(String label, BookingReviewEdit target) => TextButton.icon(
    onPressed:
        _canAct &&
            !_savingAttempt &&
            !isSubmitting &&
            Navigator.of(context).canPop()
        ? () => Navigator.of(context).pop(target)
        : null,
    icon: const Icon(Icons.edit_outlined),
    label: Text(label),
  );

  Widget _buildContent(BuildContext context) => _review(
    context,
    submissionEnabled:
        !widget.preparationOnly &&
        _session != null &&
        _authorized &&
        _availabilityPermits,
  );
}

class _SelectionGroup extends StatefulWidget {
  const _SelectionGroup({
    required this.icon,
    required this.title,
    required this.values,
  });
  final IconData icon;
  final String title;
  final List<String> values;

  @override
  State<_SelectionGroup> createState() => _SelectionGroupState();
}

class _SelectionGroupState extends State<_SelectionGroup> {
  bool _expanded = false;
  static const _previewCount = 2;

  @override
  Widget build(BuildContext context) {
    final visible = _expanded
        ? widget.values
        : widget.values.take(_previewCount);
    final hidden = widget.values.length - _previewCount;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(color: AppColors.border, height: 12),
        Semantics(
          expanded: _expanded,
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  Icon(widget.icon, size: 20, color: AppColors.primaryStrong),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.title,
                      style: AppTypography.bodySmall.copyWith(
                        color: AppColors.primaryStrong,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '${widget.values.length}',
                    semanticsLabel: '${widget.values.length} selected items',
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.secondaryTextAccessible,
                    ),
                  ),
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    color: AppColors.primaryStrong,
                  ),
                ],
              ),
            ),
          ),
        ),
        if (widget.values.isEmpty)
          Text(
            'None selected',
            style: AppTypography.bodySmall.copyWith(
              color: AppColors.secondaryTextAccessible,
            ),
          )
        else
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final value in visible)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.primarySubtle,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    value,
                    style: AppTypography.bodySmall.copyWith(
                      color: AppColors.primaryStrong,
                    ),
                  ),
                ),
              if (!_expanded && hidden > 0)
                TextButton(
                  onPressed: () => setState(() => _expanded = true),
                  style: TextButton.styleFrom(
                    minimumSize: Size.zero,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text('+$hidden more'),
                ),
            ],
          ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
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
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardHeading(icon: icon, title: title),
          const SizedBox(height: 12),
          for (var index = 0; index < children.length; index++) ...[
            children[index],
            if (index != children.length - 1) const SizedBox(height: 8),
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
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primarySubtle,
            borderRadius: BorderRadius.circular(AppRadius.medium),
          ),
          child: Icon(
            icon,
            color: AppColors.primaryStrong,
            size: AppSizes.iconMedium,
          ),
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

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

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

class _AddOnSummaryRow extends StatelessWidget {
  const _AddOnSummaryRow({required this.addOn});

  final Map<String, dynamic> addOn;

  @override
  Widget build(BuildContext context) {
    final name = addOn['name']?.toString().trim() ?? '';

    final providerBusinessName =
        addOn['providerBusinessName']?.toString().trim() ?? '';

    final category = addOn['category']?.toString().trim() ?? '';

    final rawPrice = addOn['price'];

    final price = rawPrice is num ? rawPrice.toDouble() : double.nan;

    final secondaryText = [
      providerBusinessName,
      category,
      switch (addOn['source']) {
        'catering_provider' => 'Catering provider',
        'feasta_addon_provider' => 'FEASTA marketplace',
        _ => addOn['source']?.toString() ?? 'Source unavailable',
      },
    ].where((value) => value.isNotEmpty).join(' \u2022 ');

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.primarySubtle,
            borderRadius: BorderRadius.circular(AppRadius.medium),
          ),
          child: const Icon(
            Icons.add_rounded,
            color: AppColors.primaryStrong,
            size: AppSizes.iconMedium,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name.isEmpty ? 'Add-on' : name,
                style: AppTypography.label.copyWith(
                  color: AppColors.mainText,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (secondaryText.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  secondaryText,
                  style: AppTypography.caption.copyWith(
                    color: AppColors.secondaryTextAccessible,
                  ),
                ),
              ],

              FeastaPriceText(
                amount: price,
                decimalDigits: 0,
                semanticLabel: '${name.isEmpty ? 'Add-on' : name} price',
                style: AppTypography.label.copyWith(
                  color: AppColors.primaryStrong,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _BookingSubmitBar extends StatelessWidget {
  const _BookingSubmitBar({
    required this.eventListAction,
    required this.isSubmitting,
    required this.onSubmit,
    required this.blockedReason,
  });
  final String? blockedReason;

  final Widget eventListAction;
  final bool isSubmitting;
  final VoidCallback? onSubmit;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screen,
        AppSpacing.sm,
        AppSpacing.screen,
        AppSpacing.md,
      ),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.45,
          ),
          child: SingleChildScrollView(
            primary: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (onSubmit == null && !isSubmitting)
                  if (blockedReason ==
                          'Review and acknowledge Booking & Payment Agreement.' ||
                      blockedReason == 'Review and acknowledge Refund Policy.')
                    Material(
                      color: AppColors.surface,
                      child: ExpansionTile(
                        key: const PageStorageKey('booking-agreement-footer'),
                        initiallyExpanded: false,
                        tilePadding: EdgeInsets.zero,
                        childrenPadding: const EdgeInsets.only(bottom: 8),
                        leading: const Icon(Icons.fact_check_outlined),
                        title: const Text('Agreements required'),
                        children: [
                          Align(
                            alignment: Alignment.centerLeft,
                            child: Text(blockedReason!),
                          ),
                        ],
                      ),
                    )
                  else
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(
                        blockedReason ??
                            'Submission blocked: complete the required checks and reviews.',
                      ),
                    ),
                eventListAction,
                const SizedBox(height: AppSpacing.sm),
                FeastaPrimaryButton(
                  label: isSubmitting
                      ? 'Submitting Request...'
                      : 'Submit booking request',
                  icon: isSubmitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.surface,
                          ),
                        )
                      : const Icon(Icons.send_rounded),
                  onPressed: isSubmitting ? null : onSubmit,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryPrice extends StatelessWidget {
  const _SummaryPrice({
    required this.package,
    required this.addons,
    this.serviceTier,
    this.guests,
    this.hasUnconfirmedRequests = false,
  });
  final PackageModel package;
  final List<Map<String, dynamic>> addons;
  final String? serviceTier;
  final int? guests;
  final bool hasUnconfirmedRequests;
  @override
  Widget build(BuildContext context) {
    final services = preparationServices(package);
    final base = preparationEstimate(
      package,
      const [],
      serviceTier: serviceTier,
      guests: guests,
    );
    final needsSelection =
        services.isNotEmpty && !services.containsKey(serviceTier);
    String money(dynamic value) => value is num && knownPreparationPrice(value)
        ? FeastaPriceFormatter.format(value)
        : 'Published price unavailable';
    return FeastaCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Booking estimate',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            package.name,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          if (services.isNotEmpty)
            _EstimateRow(
              label: 'Selected service',
              value: services.containsKey(serviceTier)
                  ? serviceOptionTitle(serviceTier!, services[serviceTier]!)
                  : 'Choose a service option',
            ),
          _EstimateRow(
            label: 'Estimated service price',
            value: needsSelection ? 'Selection required' : money(base),
          ),
          if (addons.isEmpty)
            const _EstimateRow(
              label: 'Selected FEASTA services',
              value: 'None selected',
            ),
          for (final addon in addons)
            _EstimateRow(
              label: (addon['name'] ?? 'Add-on').toString(),
              value: money(addon['price']),
            ),
          const Divider(),
          DefaultTextStyle.merge(
            style: AppTypography.cardTitle.copyWith(
              color: AppColors.primaryStrong,
              fontWeight: FontWeight.w900,
            ),
            child: _EstimateRow(
              label: 'Estimated total',
              value: preparationEstimateText(
                package,
                addons,
                serviceTier: serviceTier,
                guests: guests,
              ).replaceFirst('Known estimate: ', ''),
            ),
          ),
          const SizedBox(height: 8),
          if (hasUnconfirmedRequests)
            const Text(
              'Customer-arranged services and special requests: costs unconfirmed and excluded from the booking estimate.',
            ),
          const Text(
            'FEASTA verifies prices, availability, and payment terms when you submit. This action sends a booking request for provider review; it does not confirm the booking or collect payment.',
          ),
        ],
      ),
    );
  }
}

class _EstimateRow extends StatelessWidget {
  const _EstimateRow({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 6),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final stacked =
            constraints.maxWidth < 360 ||
            MediaQuery.textScalerOf(context).scale(14) > 20;
        if (stacked) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(label),
              const SizedBox(height: 4),
              Text(value, textAlign: TextAlign.end),
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: Text(label)),
            const SizedBox(width: 12),
            Text(value, textAlign: TextAlign.end),
          ],
        );
      },
    ),
  );
}
