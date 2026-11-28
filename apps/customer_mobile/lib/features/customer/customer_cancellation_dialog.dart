import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import 'customer_cancellation_attempt_store.dart';

import 'customer_cancellation_client.dart';

typedef CancellationSubmission =
    Future<Map<String, dynamic>> Function({
      required String providerRequestId,
      required String reason,
      required String idempotencyKey,
      required bool acknowledged,
    });

/// Opens cancellation options for one canonical provider request.
/// Other services in the same event are never selected implicitly.
class CustomerCancellationDialog extends StatefulWidget {
  const CustomerCancellationDialog({
    required this.providerRequestId,
    required this.providerName,
    required this.serviceName,
    this.client,
    this.attemptStore,
    this.loadOptions,
    this.loadStatus,
    this.submitCancellation,
    this.createAttemptKey,
    this.currentCustomerUid,
    super.key,
  });

  final String providerRequestId;
  final String providerName;
  final String serviceName;
  final CustomerCancellationClient? client;
  final CancellationAttemptStore? attemptStore;

  /// Overrides for isolated widget tests. Production uses Firebase.
  final Future<Map<String, dynamic>> Function(String)? loadOptions;
  final Future<Map<String, dynamic>> Function(String)? loadStatus;
  final CancellationSubmission? submitCancellation;
  final String Function()? createAttemptKey;
  final String? Function()? currentCustomerUid;

  @override
  State<CustomerCancellationDialog> createState() =>
      _CustomerCancellationDialogState();
}

class _CustomerCancellationDialogState extends State<CustomerCancellationDialog>
    with WidgetsBindingObserver {
  CustomerCancellationClient? _client;

  CustomerCancellationClient get _api =>
      _client ??= CustomerCancellationClient();

  Future<Map<String, dynamic>> _getOptions(String id) =>
      widget.loadOptions?.call(id) ?? _api.getOptions(id);

  Future<Map<String, dynamic>> _getStatus(String id) =>
      widget.loadStatus?.call(id) ?? _api.getStatus(id);

  String? _uid() => widget.currentCustomerUid != null
      ? widget.currentCustomerUid!()
      : FirebaseAuth.instance.currentUser?.uid;
  late final CancellationAttemptStore _attemptStore;
  Timer? _eligibilityTimer;
  CancellationAttempt? _savedAttempt;
  bool _eligibilityFresh = false;
  final _reason = TextEditingController();

  Map<String, dynamic>? _options;
  Map<String, dynamic>? _status;
  Map<String, dynamic>? _submitted;

  String? _error;
  String? _attemptKey;
  String? _attemptReason;

  bool _loading = true;
  bool _submitting = false;
  bool _submissionUncertain = false;
  bool _acknowledged = false;
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _client = widget.client;
    _attemptStore =
        widget.attemptStore ?? const SecureCancellationAttemptStore();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && !_submitting) {
      _load();
    }
  }

  @override
  void dispose() {
    ++_generation;
    _eligibilityTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_submitting || !mounted) return;
    final generation = ++_generation;
    _eligibilityTimer?.cancel();
    _eligibilityTimer = null;
    _eligibilityFresh = false;

    setState(() {
      _loading = true;
      _error = null;
      _options = null;
      _status = null;
    });

    try {
      final uid = _uid();
      if (uid == null) {
        throw StateError('Customer session unavailable.');
      }

      // Read persistent attempt identity before enabling submission.
      // Storage errors fail closed.
      final saved = await _attemptStore.read(
        uid: uid,
        providerRequestId: widget.providerRequestId,
      );

      if (!mounted || generation != _generation) return;

      // Remember an existing attempt even if later network reads fail.
      if (saved != null) {
        _savedAttempt = saved;
        _submissionUncertain = true;
      }

      final results = await Future.wait([
        _getOptions(widget.providerRequestId),
        _getStatus(widget.providerRequestId),
      ]);

      if (!mounted || generation != _generation) return;

      final options = results[0];
      final status = results[1];
      final expiry = options['eligibilityExpiresInMs'];

      // A zero or extremely short TTL cannot authorize submission.
      final fresh = expiry == null || (expiry is int && expiry >= 1000);

      setState(() {
        _options = options;
        _status = status;
        _savedAttempt = saved;
        _submissionUncertain =
            saved != null &&
            options['activeCancellation'] == null &&
            status['cancellation'] == null &&
            _submitted == null;
        _eligibilityFresh = fresh;
        _loading = false;
      });

      if (fresh && expiry is int && expiry >= 1000) {
        _eligibilityTimer = Timer(Duration(milliseconds: expiry), () {
          if (!mounted || _submitting || generation != _generation) {
            return;
          }

          setState(() => _eligibilityFresh = false);
          _load();
        });
      }
    } catch (_) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _loading = false;
        _error =
            'Cancellation information could not be verified. '
            'Please try again or contact FEASTA support.';
      });
    }
  }

  String? get _validationError {
    final count = _reason.text.trim().length;
    if (count < 5 || count > 1000) {
      return 'Enter a cancellation reason between 5 and 1,000 characters.';
    }
    return null;
  }

  bool get _canSubmit =>
      !_loading &&
      !_submitting &&
      !_submissionUncertain &&
      _savedAttempt == null &&
      _eligibilityFresh &&
      _status?['cancellation'] == null &&
      _error == null &&
      _submitted == null &&
      _options?['cancellationAllowed'] == true &&
      _options?['activeCancellation'] == null &&
      _validationError == null &&
      _acknowledged;

  Future<void> _submit() async {
    if (!_canSubmit) return;

    final reason = _reason.text.trim();

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      // Revalidate immediately before submitting; device time is
      // never used to grant cancellation eligibility.
      final latest = await _getOptions(widget.providerRequestId);

      if (!mounted) return;

      if (latest['cancellationAllowed'] != true ||
          latest['activeCancellation'] != null) {
        setState(() {
          _options = latest;
          _error =
              'Cancellation eligibility has changed. '
              'Review the latest status before continuing.';
        });
        return;
      }

      if (_attemptKey == null || _attemptReason != reason) {
        _attemptKey =
            widget.createAttemptKey?.call() ?? _api.createIdempotencyKey();
        _attemptReason = reason;
      }

      final uid = _uid();
      if (uid == null) {
        throw StateError('Customer session unavailable.');
      }

      final attempt = CancellationAttempt(
        uid: uid,
        providerRequestId: widget.providerRequestId,
        idempotencyKey: _attemptKey!,
        reason: reason,
      );

      // The Firebase submission MUST NOT run unless storage
      // has persisted and verified this exact attempt.
      await _attemptStore.save(attempt);

      _savedAttempt = attempt;
      _submissionUncertain = true;

      final result = widget.submitCancellation != null
          ? await widget.submitCancellation!(
              providerRequestId: widget.providerRequestId,
              reason: reason,
              idempotencyKey: _attemptKey!,
              acknowledged: true,
            )
          : await _api.submit(
              providerRequestId: widget.providerRequestId,
              reason: reason,
              idempotencyKey: _attemptKey!,
              acknowledged: true,
            );

      if (!mounted) return;

      setState(() {
        _submitted = result;
        _savedAttempt = attempt;
        _submissionUncertain = false;
        _options = latest;
      });

      try {
        final status = await _getStatus(widget.providerRequestId);
        if (mounted) setState(() => _status = status);
      } catch (_) {
        // Successful submission remains authoritative.
        // A later refresh can retrieve its full progress.
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error =
            'The cancellation request could not be confirmed. '
            'Check its status before attempting again.';
      });
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  String _label(String value) => value
      .split('_')
      .map(
        (word) => word.isEmpty
            ? word
            : '${word[0].toUpperCase()}${word.substring(1)}',
      )
      .join(' ');

  String _money(dynamic centavos) {
    if (centavos is! int || centavos < 0) return 'Unavailable';
    return 'PHP ${(centavos / 100).toStringAsFixed(2)}';
  }

  Widget _panel(String title, String description, {IconData? icon}) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon ?? Icons.info_outline, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(description),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _isUnifiedCutoffPolicy(List<dynamic> rules, Object? cutoffAt) {
    if (cutoffAt is! String || cutoffAt.isEmpty) return false;
    int? before;
    int? prep;
    int? service;
    for (final entry in rules) {
      if (entry is! Map) continue;
      final stage = entry['stage'];
      final bps = entry['refundBasisPoints'];
      if (bps is! int) continue;
      if (stage == 'preparation_not_started') before = bps;
      if (stage == 'preparation_started') prep = bps;
      if (stage == 'service_started') service = bps;
    }
    return before != null && service == 0 && (prep == 0 || prep == before);
  }

  String _formatPercent(int basisPoints) =>
      '${(basisPoints / 100).toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '')}%';

  Widget _policyPanel(Map<String, dynamic> policy) {
    final rules = policy['rules'] as List;
    final preview = _options?['refundPreview'];
    final unified = _isUnifiedCutoffPolicy(
      rules,
      _options?['cancellationCutoffAt'],
    );
    int beforeBps = 0;
    for (final entry in rules) {
      if (entry is Map &&
          entry['stage'] == 'preparation_not_started' &&
          entry['refundBasisPoints'] is int) {
        beforeBps = entry['refundBasisPoints'] as int;
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Recorded refund policy',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 6),
        if (unified) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Text(
              'Before cancellation cutoff: ${_formatPercent(beforeBps)} refundable',
            ),
          ),
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 3),
            child: Text(
              'After cancellation cutoff: 0% refundable (Cancellation closed)',
            ),
          ),
        ] else
          for (final entry in rules)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Text(
                '${_label(entry['stage'] as String)}: '
                '${((entry['refundBasisPoints'] as int) / 100).toStringAsFixed(0)}% refundable',
              ),
            ),
        if (policy['terms'] is String &&
            (policy['terms'] as String).isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(policy['terms'] as String),
        ],
        if (preview is Map<String, dynamic>) ...[
          const Divider(),
          Text(
            unified
                ? 'Eligible window: Before cancellation cutoff'
                : 'Recorded stage: ${_label(preview['frozenStage'] as String)}',
          ),
          Text(
            'Estimated refundable amount: '
            '${_money(preview['refundAmountInCentavos'])}',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const Text(
            'This is an informational estimate, not a completed '
            'or guaranteed refund.',
          ),
        ],
      ],
    );
  }

  Widget _cancellationProgress(Map<String, dynamic> cancellation) {
    final refund = cancellation['refund'] as Map<String, dynamic>;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _panel(
          'Cancellation: ${_label(cancellation['status'] as String)}',
          'Decision: ${_label(cancellation['decisionStatus'] as String)}',
          icon: Icons.assignment_turned_in_outlined,
        ),
        _panel(
          'Refund: ${_label(refund['status'] as String)}',
          'Recorded amount: ${_money(refund['amountInCentavos'])}\n'
              'Completed amount: ${_money(refund['completedAmountInCentavos'])}',
          icon: Icons.receipt_long_outlined,
        ),
      ],
    );
  }

  Widget _body() {
    final options = _options;

    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (options == null) {
      return _panel(
        'Cancellation information unavailable',
        'The service could not be verified.',
        icon: Icons.error_outline,
      );
    }

    final reasonCode = options['reasonCode'] as String;
    final allowed = options['cancellationAllowed'] == true;
    final active = options['activeCancellation'];
    final policy = options['policy'];
    final statusCancellation = _status?['cancellation'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (options['providerRequestStatus'] is String)
          Text(
            'Service status: '
            '${_label(options['providerRequestStatus'] as String)}',
          ),
        if (active is Map<String, dynamic>)
          _cancellationProgress(active)
        else if (statusCancellation is Map<String, dynamic>)
          _cancellationProgress(statusCancellation),
        if (!_eligibilityFresh && allowed && _submitted == null)
          _panel(
            'Eligibility must be refreshed',
            'The previous cancellation eligibility has expired. '
                'Refresh to retrieve the current server decision.',
            icon: Icons.refresh_outlined,
          ),
        if (_submissionUncertain && _submitted == null)
          _panel(
            'Submission status needs verification',
            'Your previous cancellation request may have been '
                'recorded. Refresh its status before taking further '
                'action. A new submission is disabled in this dialog.',
            icon: Icons.warning_amber_outlined,
          ),
        if (_submitted != null)
          _panel(
            'Cancellation request recorded',
            'Current status: '
                '${_label(_submitted!['status'] as String)}. '
                'Submission does not guarantee or complete a refund.',
            icon: Icons.check_circle_outline,
          ),
        if (policy is Map<String, dynamic>) ...[
          const SizedBox(height: 12),
          _policyPanel(policy),
        ],
        if (reasonCode == 'LEGACY_MANUAL_REVIEW')
          _panel(
            'Manual review required',
            'FEASTA must review this cancellation before '
                'determining any refund.',
          ),
        if (reasonCode == 'PAYMENT_RECONCILIATION_REQUIRED')
          _panel(
            'Payment resolution required',
            'FEASTA must first verify the recorded payment state.',
          ),
        if (!allowed)
          _panel(
            reasonCode == 'CANCELLATION_CUTOFF_PASSED'
                ? 'Cancellation closed — cutoff passed'
                : reasonCode == 'EVENT_ENDED'
                ? 'Cancellation closed — event ended'
                : 'New cancellation unavailable',
            reasonCode == 'CANCELLATION_CUTOFF_PASSED'
                ? 'The cancellation cutoff date has passed. New cancellation requests are no longer accepted. Report an Issue remains available.'
                : 'Current reason: ${_label(reasonCode)}. '
                      'Existing cancellation and refund requests may '
                      'still continue through review.',
          ),
        if (allowed &&
            active == null &&
            statusCancellation == null &&
            !_submissionUncertain &&
            _savedAttempt == null &&
            _submitted == null) ...[
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            enabled: !_submitting && _eligibilityFresh,
            maxLength: 1000,
            minLines: 3,
            maxLines: 5,
            decoration: const InputDecoration(
              labelText: 'Cancellation reason',
              hintText: 'Explain why you need to cancel this service.',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) {
              setState(() {
                _error = null;
              });
            },
          ),
          const Text(
            'Submitting a cancellation request does not mean '
            'that a refund has been approved or completed.',
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _acknowledged,
            onChanged: _submitting || !_eligibilityFresh
                ? null
                : (value) => setState(() {
                    _acknowledged = value == true;
                  }),
            title: Text(
              reasonCode == 'LEGACY_MANUAL_REVIEW'
                  ? 'I understand that FEASTA must review this '
                        'cancellation before determining any refund.'
                  : 'I understand that this cancellation is subject '
                        'to the refund policy accepted for this booking.',
            ),
          ),
        ],
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_submitting,
      child: Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560, maxHeight: 720),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Cancel ${widget.providerName} service?',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(widget.serviceName),
                const SizedBox(height: 6),
                const Text(
                  'Only this provider service is affected. '
                  'Other services in your event are not automatically cancelled.',
                ),
                const Divider(),
                Flexible(
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _body(),
                        if (_error != null)
                          _panel(
                            'Please review',
                            _error!,
                            icon: Icons.warning_amber_outlined,
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                if (_submitting) const LinearProgressIndicator(),
                Row(
                  children: [
                    TextButton(
                      onPressed: _submitting
                          ? null
                          : () => Navigator.of(context).pop(),
                      child: const Text('Close'),
                    ),
                    const Spacer(),
                    TextButton(
                      onPressed: _submitting ? null : _load,
                      child: const Text('Refresh'),
                    ),
                  ],
                ),
                if (_options?['cancellationAllowed'] == true &&
                    _submitted == null)
                  FilledButton(
                    onPressed: _canSubmit ? _submit : null,
                    child: Text(
                      _submitting
                          ? 'Submitting...'
                          : 'Submit cancellation request',
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
