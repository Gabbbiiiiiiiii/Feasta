import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import '../../shared/models/booking_agreement.dart';
import '../../shared/models/booking_contract.dart';

typedef AgreementLoader =
    Future<List<BookingAgreement>> Function(BookingAgreementRequest request);
typedef AgreementProviderResolver =
    Future<Set<String>> Function(BookingAgreementRequest request);

enum AgreementReviewStatus { idle, loading, ready, failed, reconciliation }

class BookingAgreementController extends ChangeNotifier {
  BookingAgreementController({
    required this.loader,
    this.resolveProviders,
    DateTime Function()? now,
  }) : now = now ?? DateTime.now;
  final AgreementLoader loader;
  final AgreementProviderResolver? resolveProviders;
  final DateTime Function() now;
  AgreementReviewStatus status = AgreementReviewStatus.idle;
  List<BookingAgreement> agreements = const [];
  String? message;
  String? _signature;
  BookingAgreementRequest? _request;
  final Map<String, String> _accepted = {};
  int _generation = 0;
  bool _disposed = false;
  Future<void>? _pending;
  Timer? _expiry;

  bool select(BookingSelection selection, {String? ownerId}) {
    if (_disposed) return false;
    String signature;
    try {
      signature = agreementSelectionSignature(selection, ownerId);
    } catch (_) {
      _generation++;
      _pending = null;
      _request = null;
      _signature = null;
      _expiry?.cancel();
      _accepted.clear();
      agreements = const [];
      status = AgreementReviewStatus.failed;
      message =
          'Review your event details and selections before loading agreements.';
      notifyListeners();
      return false;
    }
    if (signature == _signature) return false;
    _signature = signature;
    _generation++;
    _pending = null;
    _expiry?.cancel();
    agreements = const [];
    _accepted.clear();
    message = null;
    status = AgreementReviewStatus.idle;
    final random = Random.secure().nextInt(1 << 32).toRadixString(16);
    _request = BookingAgreementRequest(
      selection,
      'mobile-review_${DateTime.now().microsecondsSinceEpoch}_$random',
    );
    notifyListeners();
    return true;
  }

  Future<void> load() {
    if (_disposed || _request == null) return Future.value();
    if (_pending != null) return _pending!;
    final generation = _generation;
    final request = _request!;
    status = AgreementReviewStatus.loading;
    agreements = const [];
    _accepted.clear();
    _expiry?.cancel();
    message = null;
    // Schedule after assigning _pending so repeated review calls deduplicate.
    final pending = Future<void>.microtask(() async {
      if (_disposed || generation != _generation) return;
      try {
        final expected = Set<String>.unmodifiable(
          await (resolveProviders?.call(request) ??
              request.expectedProviderIds()),
        );
        if (_disposed || generation != _generation) return;
        final result = await loader(request);
        if (_disposed || generation != _generation) return;
        if (result.isEmpty ||
            result.length > 21 ||
            result.map((a) => a.providerId).toSet().length != result.length ||
            expected.length != result.length ||
            result.any((a) => !expected.contains(a.providerId))) {
          throw const AgreementReviewFailure(
            'Provider agreements need to be refreshed. Reload to review all selected providers, or return to your selections.',
          );
        }
        agreements = List.unmodifiable(result);
        status = AgreementReviewStatus.ready;
        _scheduleExpiry();
      } catch (error) {
        if (_disposed || generation != _generation) return;
        final failure = agreementReviewFailure(error);
        agreements = const [];
        _accepted.clear();
        status = failure.reconciliation
            ? AgreementReviewStatus.reconciliation
            : AgreementReviewStatus.failed;
        message = failure.message;
      } finally {
        if (!_disposed && generation == _generation) {
          _pending = null;
          notifyListeners();
        }
      }
    });
    _pending = pending;
    notifyListeners();
    return pending;
  }

  bool _current(BookingAgreement agreement) =>
      now().toUtc().isBefore(agreement.time('hardPaymentDeadlineAt')) &&
      (!agreement.depositEligible ||
          now().toUtc().isBefore(agreement.time('depositEligibilityCutoffAt')));

  void _scheduleExpiry() {
    if (agreements.any((a) => !_current(a))) {
      _expire();
      return;
    }
    final deadlines =
        agreements
            .map(
              (a) => a.time(
                a.depositEligible
                    ? 'depositEligibilityCutoffAt'
                    : 'hardPaymentDeadlineAt',
              ),
            )
            .toList()
          ..sort();
    _expiry = Timer(deadlines.first.difference(now().toUtc()), () {
      if (_disposed) return;
      _expire();
      notifyListeners();
    });
  }

  void _expire() {
    _accepted.clear();
    agreements = const [];
    status = AgreementReviewStatus.failed;
    message =
        'Agreement timing has changed. Reload and review current terms again.';
  }

  bool acknowledged(BookingAgreement a) =>
      status == AgreementReviewStatus.ready &&
      _current(a) &&
      _accepted[a.providerId] == a.agreementKey;
  void acknowledge(String providerId, String agreementKey, bool accepted) {
    if (_disposed || status != AgreementReviewStatus.ready) return;
    final matches = agreements.where(
      (a) => a.providerId == providerId && a.agreementKey == agreementKey,
    );
    if (matches.length != 1 || !_current(matches.single)) {
      _accepted.clear();
      notifyListeners();
      return;
    }
    if (accepted) {
      _accepted[providerId] = agreementKey;
    } else {
      _accepted.remove(providerId);
    }
    notifyListeners();
  }

  bool get allAcknowledged =>
      status == AgreementReviewStatus.ready &&
      agreements.isNotEmpty &&
      agreements.every(acknowledged);
  List<Map<String, String>> get acknowledgements {
    if (!allAcknowledged) {
      throw const AgreementReviewFailure(
        'Review and acknowledge each current Booking & Payment Agreement.',
      );
    }
    return List.unmodifiable(
      agreements.map(
        (a) => Map<String, String>.unmodifiable(a.acknowledgement),
      ),
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    _accepted.clear();
    _expiry?.cancel();
    super.dispose();
  }
}
