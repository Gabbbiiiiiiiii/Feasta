import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/models/booking_agreement.dart';
import '../../../shared/models/customer_event_list.dart';
import '../booking_agreement_terms.dart';
import '../booking_refund_policy_terms.dart';
import '../booking_attempt_coordinator.dart';
import 'event_list_configuration_summary.dart';
import 'event_review_card.dart';
import '../../../core/widgets/widgets.dart';
import 'event_list_controller.dart';
import 'event_list_scope.dart';
import 'event_list_submission_controller.dart';

/// Read-only list snapshot. Back returns to the saved, editable planning list.
class EventListSubmissionScreen extends StatefulWidget {
  const EventListSubmissionScreen({
    this.call = callEventListFunction,
    this.store = const SecureBookingAttemptStore(),
    super.key,
  });
  final EventListCallable call;
  final BookingAttemptStore store;
  @override
  State<EventListSubmissionScreen> createState() =>
      _EventListSubmissionScreenState();
}

class _EventListSubmissionScreenState extends State<EventListSubmissionScreen> {
  EventListController? _list;
  EventListSubmissionController? _submission;
  EventListAuthSession? _session;
  int? _revision;
  List<CustomerEventListEntry> _entries = const [];
  bool _cleanupStarted = false,
      _cleanupComplete = false,
      _cleanupFailed = false;
  bool get _sessionCurrent =>
      mounted &&
      (ModalRoute.of(context)?.isCurrent ?? false) &&
      _list?.authentication.session == _session &&
      _session?.customerUid != null;
  bool get _current =>
      mounted &&
      (ModalRoute.of(context)?.isCurrent ?? false) &&
      _list?.authentication.session == _session &&
      _session?.customerUid != null &&
      (_submission?.result != null ||
          (_list?.list?.revision == _revision &&
              _list?.error == null &&
              _list?.cloudError == null &&
              !(_list?.saving ?? true) &&
              (_list?.unsupportedCloudEntries.isEmpty ?? false)));
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_list != null) return;
    _list = EventListScope.of(context);
    _session = _list!.authentication.session;
    _revision = _list!.list?.revision;
    _entries = List.unmodifiable(
      _list!.list?.entries ?? <CustomerEventListEntry>[],
    );
    _list!.addListener(_changed);
    _list!.authentication.addListener(_changed);
    if (_session!.customerUid != null) {
      _submission = EventListSubmissionController(
        uid: _session!.customerUid!,
        isCurrent: () => _current,
        store: widget.store,
        call: widget.call,
      )..addListener(_changed);
      scheduleMicrotask(() => _submission?.prepare(_entries));
    }
  }

  void _changed() {
    if (_list?.list?.revision != _revision ||
        _list?.authentication.session != _session ||
        _list?.error != null) {
      _submission?.invalidateReviews();
    }
    if (_submission?.result != null && !_cleanupStarted && _sessionCurrent) {
      _cleanupStarted = true;
      scheduleMicrotask(_removeSubmitted);
    }
    if (mounted) setState(() {});
  }

  Future<void> _removeSubmitted() async {
    if (!_sessionCurrent || _submission?.result == null) return;
    final result = await _list!.removeSubmitted(
      _submission!.confirmedEntries,
      session: _session!,
      isCurrent: () => _sessionCurrent,
    );
    if (!_sessionCurrent) return;
    setState(() {
      _cleanupComplete = result == EventListResult.saved;
      _cleanupFailed = !_cleanupComplete;
    });
  }

  @override
  void dispose() {
    _list?.removeListener(_changed);
    _list?.authentication.removeListener(_changed);
    _submission?.removeListener(_changed);
    _submission?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final submission = _submission;
    final event = _entries.isEmpty ? null : _entries.first.configuration?.event;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('Review event request')),
      body: !_current || submission == null
          ? const Padding(
              padding: EdgeInsets.all(20),
              child: Text(
                'Your Event List or session changed. Return to the list and reopen this review.',
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Review all selected providers for the same event. Submitting sends one coordinated request for provider review. Payment is not collected here.',
                ),
                if (event != null) ...[
                  const SizedBox(height: 12),
                  EventReviewCard(
                    icon: Icons.calendar_month_outlined,
                    title: 'Event details',
                    children: [
                      EventReviewRow(
                        label: 'Event type',
                        value: event.eventType,
                      ),
                      EventReviewRow(label: 'Date', value: event.eventDate),
                      EventReviewRow(
                        label: 'Time',
                        value: '${event.eventTime} - ${event.eventEndTime}',
                      ),
                      EventReviewRow(
                        label: 'Guests',
                        value: event.guestCount.toString(),
                      ),
                      EventReviewRow(
                        label: 'Location',
                        value: event.eventLocation,
                      ),
                      EventReviewRow(
                        label: 'Full address',
                        value: event.eventAddress,
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 12),
                if (submission.busy) const LinearProgressIndicator(),
                if (submission.message != null)
                  Semantics(
                    liveRegion: true,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text(submission.message!),
                    ),
                  ),
                if (submission.result != null) ...[
                  const Text(
                    'Booking request recorded',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  Text('Event reference: ${submission.result!.mainEventId}'),
                  Text(
                    '${submission.result!.providerRequestIds.length} provider requests linked to this event.',
                  ),
                  Text(
                    _cleanupComplete
                        ? 'Submitted items removed from your Event List. Follow provider responses in your bookings.'
                        : _cleanupFailed
                        ? 'Booking recorded, but the Event List could not be updated. Retry updating the list; do not submit again.'
                        : 'Updating your Event List...',
                  ),
                  if (_cleanupFailed)
                    TextButton(
                      onPressed: _removeSubmitted,
                      child: const Text('Retry Event List update'),
                    ),
                ],
                for (final entry
                    in submission.result == null
                        ? _entries
                        : <CustomerEventListEntry>[])
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: EventReviewCard(
                      icon: Icons.tune_rounded,
                      title: 'Package & customization',
                      children: [
                        if (entry.imageUrl != null)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Image.network(
                              entry.imageUrl!,
                              height: 160,
                              width: double.infinity,
                              fit: BoxFit.cover,
                              errorBuilder: (_, error, stack) => const SizedBox(
                                height: 80,
                                child: Icon(
                                  Icons.inventory_2_outlined,
                                  color: AppColors.primaryStrong,
                                ),
                              ),
                            ),
                          ),
                        EventReviewRow(
                          label: 'Package',
                          value: entry.packageName,
                        ),
                        const Divider(color: AppColors.border, height: 12),
                        EventReviewRow(
                          label: 'Provider',
                          value: entry.providerName,
                        ),
                        EventReviewRow(
                          label: 'Saved estimate',
                          value: entry.configuration?.estimatedTotal != null
                              ? FeastaPriceFormatter.format(
                                  entry.configuration!.estimatedTotal!,
                                )
                              : entry.estimatedPrice != null
                              ? '${FeastaPriceFormatter.format(entry.estimatedPrice!)} (package only)'
                              : 'Price unavailable',
                        ),
                        EventListConfigurationSummary(
                          entry: entry,
                          compact: true,
                        ),
                      ],
                    ),
                  ),
                if (submission.agreements.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  EventReviewCard(
                    icon: Icons.receipt_long_outlined,
                    title: 'Booking estimate',
                    children: [
                      Text(
                        'Server-verified service total: ${agreementMoney(submission.agreements.fold<int>(0, (sum, a) => sum + a.gross))}',
                      ),
                      const Text(
                        'Each provider retains separate payment requirements and deadlines.',
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  for (final agreement in submission.agreements)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: BookingAgreementTerms(
                        agreement: agreement,
                        acknowledged: submission.agreementAccepted(agreement),
                        onChanged: submission.busy
                            ? null
                            : (value) => submission.acceptAgreement(
                                agreement,
                                value == true,
                              ),
                      ),
                    ),
                  const Text(
                    'Cancellation refund policies are separate from payment-default consequences. Rates do not guarantee a refund for every cancellation.',
                  ),
                  for (final policy in submission.policies)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: BookingRefundPolicyTerms(
                        policy: policy,
                        acknowledged: submission.policyAccepted(policy),
                        onChanged: submission.busy
                            ? null
                            : (value) => submission.acceptPolicy(
                                policy,
                                value == true,
                              ),
                      ),
                    ),
                ],
                if (submission.pending)
                  OutlinedButton(
                    onPressed: submission.busy ? null : submission.reconcile,
                    child: const Text('Check previous request'),
                  ),
                if (!submission.pending && submission.result == null)
                  OutlinedButton(
                    onPressed: submission.busy
                        ? null
                        : () => submission.prepare(_entries),
                    child: const Text('Reload current terms'),
                  ),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Return to Event List to edit'),
                ),
                const SizedBox(height: 24),
              ],
            ),
      bottomNavigationBar: !_current || submission == null
          ? null
          : Container(
              color: AppColors.surface,
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (!submission.ready &&
                          !submission.busy &&
                          !submission.pending &&
                          submission.result == null &&
                          submission.message == null)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 8),
                          child: Text(
                            'Review and accept each provider’s current payment agreement and refund policy before submitting.',
                          ),
                        ),
                      FeastaPrimaryButton(
                        onPressed: submission.ready ? submission.submit : null,
                        label: submission.busy
                            ? 'Checking request...'
                            : 'Submit event booking request',
                        icon: const Icon(Icons.send_rounded),
                      ),
                    ],
                  ),
                ),
              ),
            ),
    );
  }
}
