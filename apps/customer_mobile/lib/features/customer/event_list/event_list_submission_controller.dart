import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import '../../../shared/models/booking_agreement.dart';
import '../../../shared/models/booking_contract.dart';
import '../../../shared/models/booking_refund_policy.dart';
import '../../../shared/models/customer_event_list.dart';
import '../../../shared/models/feasta_models.dart';
import '../../authentication/data/repositories/feasta_repository.dart';
import '../booking_attempt_coordinator.dart';
import 'event_list_submission_contract.dart';

typedef EventListCallable =
    Future<Object?> Function(String name, Map<String, dynamic> data);

typedef EventListMarketplaceLookup = Future<AddonModel?> Function(String id);

Future<AddonModel?> refreshEventListMarketplaceService(String id) =>
    FeastaRepository().getEligiblePreparationAddon(id);

Future<Object?> callEventListFunction(
  String name,
  Map<String, dynamic> data,
) async => (await FirebaseFunctions.instanceFor(
  region: 'asia-southeast1',
).httpsCallable(name).call(data)).data;

/// One coordinated request; stored before dispatch. Consent is memory-only.
/// Unknown outcomes retain the original identity across routes/process restarts.
class EventListSubmissionController extends ChangeNotifier {
  EventListSubmissionController({
    required this.uid,
    required this.isCurrent,
    required this.store,
    this.call = callEventListFunction,
    this.refreshMarketplaceService = refreshEventListMarketplaceService,
    DateTime Function()? now,
  }) : now = now ?? DateTime.now;
  final String uid;
  final bool Function() isCurrent;
  final BookingAttemptStore store;
  final EventListCallable call;
  final EventListMarketplaceLookup refreshMarketplaceService;
  List<CustomerEventListEntry> _entries = const [];
  List<CustomerEventListEntry> _confirmedEntries = const [];
  List<CustomerEventListEntry> get confirmedEntries =>
      result == null ? const [] : List.unmodifiable(_confirmedEntries);
  final DateTime Function() now;
  static bool _operationActive = false;
  bool busy = false, pending = false, _disposed = false;
  bool _loaded = false;
  String? message;
  Map<String, dynamic>? _submission;
  List<BookingAgreement> agreements = const [];
  List<BookingRefundPolicy> policies = const [];
  final Set<String> _acceptedAgreements = {}, _acceptedPolicies = {};
  BookingSubmissionResult? result;
  Timer? _expiry;
  String get _storageKey => 'event_list_v1:$uid';
  String? get requestId => _submission?['clientRequestId'] as String?;
  bool get current => !_disposed && isCurrent();
  bool _timely(BookingAgreement a) =>
      now().toUtc().isBefore(a.time('hardPaymentDeadlineAt')) &&
      (!a.depositEligible ||
          now().toUtc().isBefore(a.time('depositEligibilityCutoffAt')));
  bool get ready =>
      current &&
      _loaded &&
      !busy &&
      !pending &&
      result == null &&
      agreements.isNotEmpty &&
      agreements.every((a) => _timely(a) && agreementAccepted(a)) &&
      policies.every(policyAccepted);
  bool agreementAccepted(BookingAgreement a) =>
      _acceptedAgreements.contains('${a.providerId}:${a.agreementKey}');
  bool policyAccepted(BookingRefundPolicy p) =>
      _acceptedPolicies.contains('${p.providerId}:${p.effectivePolicyKey}');
  void acceptAgreement(BookingAgreement a, bool value) {
    if (!current || busy || !agreements.contains(a) || !_timely(a)) return;
    value
        ? _acceptedAgreements.add('${a.providerId}:${a.agreementKey}')
        : _acceptedAgreements.remove('${a.providerId}:${a.agreementKey}');
    _notify();
  }

  void acceptPolicy(BookingRefundPolicy p, bool value) {
    if (!current || busy || !policies.contains(p)) return;
    final key = '${p.providerId}:${p.effectivePolicyKey}';
    value ? _acceptedPolicies.add(key) : _acceptedPolicies.remove(key);
    _notify();
  }

  void _check() {
    if (!current) throw StateError('Event List session changed.');
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  void _clearReviews() {
    _loaded = false;
    agreements = const [];
    policies = const [];
    _acceptedAgreements.clear();
    _acceptedPolicies.clear();
    _expiry?.cancel();
  }

  /// Revoke consent when the saved list or its authorization changes.
  void invalidateReviews() {
    if (!_loaded && agreements.isEmpty && policies.isEmpty) return;
    _clearReviews();
    _notify();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (!current || busy || _operationActive) return;
    busy = true;
    _operationActive = true;
    message = null;
    _notify();
    try {
      await action();
    } catch (error) {
      if (current) {
        message = pending
            ? 'The request outcome needs checking. Use Check previous request. Your original request identity and selections are retained.'
            : error is FormatException
            ? error.message.toString()
            : error is FirebaseFunctionsException && error.code == 'not-found'
            ? 'Event booking review is unavailable for these selections. Your selections remain saved. Please retry later.'
            : 'Could not verify this event request. Review availability, verification and current terms, then retry.';
      }
    } finally {
      busy = false;
      _operationActive = false;
      _notify();
    }
  }

  Map<String, dynamic> _decode(String raw) {
    final record = jsonDecode(raw) as Map<String, dynamic>;
    if (record['version'] != 1 ||
        record['uid'] != uid ||
        !['pending', 'created', 'rejected'].contains(record['phase'])) {
      throw const FormatException(
        'Stored request needs support reconciliation.',
      );
    }
    final submission = Map<String, dynamic>.from(record['submission'] as Map);
    final schema = submission['schemaVersion'];
    if (schema != 1 && schema != 2) {
      throw const FormatException(
        'Stored request schema needs support reconciliation.',
      );
    }
    final selections = submission['selections'] as List;
    final revisions = <EventListIdentityRevision>[];
    final entries = selections.map((value) {
      final row = Map<String, dynamic>.from(value as Map);
      if (schema == 2 && row['kind'] == 'marketplace_service') {
        final revision = row['expectedRevision'];
        if (revision is! int || revision < 1 || revision > 9007199254740991) {
          throw const FormatException(
            'Stored service revision is invalid. Refresh and review selections after reconciling the previous request.',
          );
        }
        final configuration = Map<String, dynamic>.from(
          row['configuration'] as Map,
        );
        final entry = CustomerEventListEntry.marketplaceService(
          providerId: row['providerId'] as String,
          serviceId: row['serviceId'] as String,
          expectedRevision: revision,
          serviceName: 'Saved service',
          providerName: 'Saved provider',
          configuration: CustomerEventListConfiguration.marketplace(
            event: Map<String, dynamic>.from(configuration['event'] as Map),
            specialRequest: configuration['specialRequest'] as String,
          ),
        );
        // Saved revisions validate the persisted envelope only. They never
        // authorize a new dispatch; that still requires fresh catalog metadata.
        revisions.add(
          EventListIdentityRevision(
            providerId: entry.providerId,
            serviceId: entry.serviceId!,
            revision: revision,
          ),
        );
        return entry;
      }
      if (schema == 2 && row['kind'] != 'catering_package') {
        throw const FormatException('Stored selection kind is invalid.');
      }
      return CustomerEventListEntry(
        providerId: row['providerId'] as String,
        packageId: row['packageId'] as String,
        providerName: 'Saved provider',
        packageName: 'Saved package',
        configuration: CustomerEventListConfiguration.fromJson(
          Map<String, dynamic>.from(row['configuration'] as Map),
        ),
      );
    }).toList();
    final normalized = eventListSubmission(
      entries,
      submission['clientRequestId'] as String,
      currentMarketplaceMetadata: revisions,
    );
    if (jsonEncode(normalized) != jsonEncode(submission)) {
      throw const FormatException('Stored request is invalid.');
    }
    _confirmedEntries = List.unmodifiable(entries);
    return record;
  }

  Future<void> _persist(String phase) async {
    _check();
    await store.write(
      _storageKey,
      jsonEncode({
        'version': 1,
        'uid': uid,
        'phase': phase,
        'submission': _submission,
      }),
    );
    _check();
  }

  Future<void> prepare(List<CustomerEventListEntry> entries) => _run(() async {
    _clearReviews();
    result = null;
    // Read pending evidence BEFORE replacing anything, even if today's list is invalid.
    final raw = await store.read(_storageKey);
    _check();
    Map<String, dynamic>? record;
    if (raw != null) {
      // Treat corrupt storage conservatively; never replace a possible dispatch.
      pending = true;
      record = _decode(raw);
      _submission = Map<String, dynamic>.from(record['submission'] as Map);
      pending = record['phase'] != 'rejected';
      if (pending) {
        await _reconcile();
        if (pending) return;
        if (result != null) {
          final candidate = await _buildCurrentSubmission(entries, requestId!);
          // A confirmed prior event cannot be recreated by editing its packages.
          // A different shared event can start a separately reviewed request.
          if (jsonEncode(candidate['event']) ==
              jsonEncode(_submission!['event'])) {
            message =
                'An existing request for this event was found. Your saved planning selections have not been submitted again.';
            return;
          }
          result = null;
        }
      }
    }
    final id =
        'mobile_event_${List.generate(32, (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
    _entries = List.unmodifiable(entries);
    _submission = await _buildCurrentSubmission(_entries, id);
    _confirmedEntries = _entries;
    pending = false;
    await _loadDisclosures();
  });

  Future<Map<String, dynamic>> _buildCurrentSubmission(
    List<CustomerEventListEntry> entries,
    String id,
  ) async {
    final metadata = <EventListIdentityRevision>[];
    for (final entry in entries.where((e) => e.kind == 'marketplace_service')) {
      final service = await refreshMarketplaceService(entry.serviceId!);
      _check();
      if (service == null ||
          !service.hasMarketplaceSubmissionMetadata ||
          service.id != entry.serviceId ||
          service.providerId != entry.providerId ||
          !service.isActive ||
          !service.isAvailable) {
        throw const FormatException(
          'Refresh marketplace service metadata before submitting.',
        );
      }
      metadata.add(
        EventListIdentityRevision(
          providerId: service.providerId,
          serviceId: service.id,
          revision: service.revision!,
        ),
      );
    }
    return eventListSubmission(
      entries,
      id,
      currentMarketplaceMetadata: metadata,
    );
  }

  Future<void> _loadDisclosures() async {
    final response = await call('getMultiProviderBookingDisclosures', {
      'submission': _submission,
    });
    _check();
    if (response is! Map ||
        response['agreements'] is! List ||
        response['refundPolicies'] is! Map) {
      throw const FormatException('Incomplete event disclosures.');
    }
    final parsed = (response['agreements'] as List)
        .map(BookingAgreement.fromJson)
        .toList();
    final selections = (_submission!['selections'] as List).cast<Map>();
    final providers = selections.map((s) => s['providerId']).toSet();
    final event = _submission!['event'] as Map;
    final start = DateTime.parse(
      '${event['eventDate']}T${event['eventTime']}:00+08:00',
    ).toUtc();
    if (parsed.length != providers.length ||
        parsed.map((a) => a.providerId).toSet().length != providers.length ||
        parsed.any(
          (a) =>
              !providers.contains(a.providerId) ||
              !_timely(a) ||
              a.time('eventStartAt') != start,
        )) {
      throw const FormatException(
        'Agreements do not match all selected providers.',
      );
    }
    final refund = response['refundPolicies'] as Map;
    List<BookingRefundPolicy> parsedPolicies;
    if (refund['rolloutMode'] == 'off' &&
        refund['acknowledgementsRequired'] == false &&
        refund['policies'] is List &&
        (refund['policies'] as List).isEmpty) {
      parsedPolicies = [];
    } else {
      parsedPolicies = RefundDisclosures.fromJson(refund).policies;
      if (parsedPolicies.length != providers.length ||
          parsedPolicies.any(
            (p) =>
                !providers.contains(p.providerId) ||
                (p.sourceKind == 'package_override' &&
                    !selections.any(
                      (s) =>
                          s['providerId'] == p.providerId &&
                          s['packageId'] == p.effectivePolicyKey.split(':')[1],
                    )),
          )) {
        throw const FormatException(
          'Refund policies do not match all selected packages.',
        );
      }
    }
    agreements = List.unmodifiable(parsed);
    policies = List.unmodifiable(parsedPolicies);
    _loaded = true;
    final deadlines =
        parsed
            .map(
              (a) => a.time(
                a.depositEligible
                    ? 'depositEligibilityCutoffAt'
                    : 'hardPaymentDeadlineAt',
              ),
            )
            .toList()
          ..sort();
    _expiry?.cancel();
    _expiry = Timer(deadlines.first.difference(now().toUtc()), () {
      _clearReviews();
      message = 'Agreement timing changed. Reload and review current terms.';
      _notify();
    });
  }

  Future<void> submit() async {
    if (!ready) return;
    await _run(() async {
      // A failed refresh also invalidates consent. Never dispatch with old evidence.
      try {
        final refreshed = await _buildCurrentSubmission(_entries, requestId!);
        _check();
        if (jsonEncode(refreshed) != jsonEncode(_submission)) {
          throw const FormatException(
            'Selections changed. Reload current terms.',
          );
        }
        if (!agreements.every(_timely)) {
          throw const FormatException(
            'Agreement timing changed. Reload current terms.',
          );
        }
      } catch (_) {
        _clearReviews();
        rethrow;
      }
      // Backend revalidates every price, policy, acknowledgement and provider
      // within the same transaction. No client prices authorize payment.
      final payment = agreements.map((a) => a.acknowledgement).toList();
      final refund = policies.map((p) => p.acknowledgement).toList();
      pending =
          true; // Set before persistence: a failed write is uncertain too.
      await _persist('pending');
      _check();
      final response = await call('submitMultiProviderBookingRequest', {
        'submission': _submission,
        'agreementAcknowledgements': payment,
        'policyAcknowledgements': refund,
      });
      _check();
      final parsed = BookingSubmissionResult.fromJson(response);
      if (parsed.providerRequestIds.length != agreements.length) {
        throw const FormatException('Incomplete submission result.');
      }
      await _persist('created');
      _confirmedEntries = _entries;
      result = parsed;
      pending = false;
      _clearReviews();
    });
  }

  Future<void> reconcile() => _run(_reconcile);
  Future<void> _reconcile() async {
    if (_submission == null) {
      throw const FormatException(
        'Stored request needs support reconciliation.',
      );
    }
    final response = await call('reconcileBookingSubmission', {
      'clientRequestId': requestId,
    });
    _check();
    if (response is! Map || response['clientRequestId'] != requestId) {
      throw const FormatException('Invalid request outcome.');
    }
    if (response['outcome'] == 'confirmed_created') {
      final parsed = BookingSubmissionResult.fromJson(response['booking']);
      if (parsed.providerRequestIds.length !=
          (_submission!['selections'] as List).length) {
        throw const FormatException('Incomplete request outcome.');
      }
      await _persist('created');
      result = parsed;
      pending = false;
      _clearReviews();
    } else if (response['outcome'] == 'confirmed_rejected') {
      await _persist('rejected');
      pending = false;
      _clearReviews();
      message =
          'The previous request was rejected before creation. Reload current terms to prepare a new request.';
    } else {
      pending = true;
      _clearReviews();
      message =
          'The server cannot confirm the outcome yet. Keep request $requestId for FEASTA support. Another submission is blocked.';
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _expiry?.cancel();
    super.dispose();
  }
}
