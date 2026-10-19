import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../shared/models/booking_agreement.dart';
import '../../shared/models/booking_contract.dart';
import '../../shared/models/booking_refund_policy.dart';
import 'booking_agreement_controller.dart';

typedef RefundLoader =
    Future<RefundDisclosures> Function(BookingAgreementRequest request);

enum RefundReviewStatus { idle, loading, ready, failed }

class BookingRefundPolicyController extends ChangeNotifier {
  BookingRefundPolicyController({
    required this.loader,
    required this.resolveProviders,
  });
  final RefundLoader loader;
  final AgreementProviderResolver resolveProviders;
  RefundReviewStatus status = RefundReviewStatus.idle;
  RefundDisclosures? disclosures;
  String? message;
  String? _signature;
  BookingAgreementRequest? _request;
  final Map<String, String> _accepted = {};
  int _generation = 0;
  bool _disposed = false;
  Future<void>? _pending;

  bool select(BookingSelection selection, {String? ownerId}) {
    if (_disposed) return false;
    String? signature;
    BookingAgreementRequest? request;
    try {
      signature = agreementSelectionSignature(selection, ownerId);
      request = BookingAgreementRequest(selection, 'refund_review_snapshot');
    } catch (_) {
      /* Invalid selections clear all previous evidence. */
    }
    if (signature != null && signature == _signature) return false;
    _generation++;
    _pending = null;
    _signature = signature;
    _request = request;
    disclosures = null;
    _accepted.clear();
    status = request == null
        ? RefundReviewStatus.failed
        : RefundReviewStatus.idle;
    message = request == null
        ? 'Review your event details and selections before loading refund policies.'
        : null;
    notifyListeners();
    return true;
  }

  Future<void> load() {
    if (_disposed || _request == null) return Future.value();
    if (_pending != null) return _pending!;
    final generation = _generation, request = _request!;
    status = RefundReviewStatus.loading;
    disclosures = null;
    _accepted.clear();
    message = null;
    final pending = Future<void>.microtask(() async {
      if (_disposed || generation != _generation) return;
      try {
        final expected = Set<String>.unmodifiable(
          await resolveProviders(request),
        );
        if (_disposed || generation != _generation) return;
        final result = await loader(request);
        if (_disposed || generation != _generation) return;
        if (expected.length != result.policies.length ||
            result.policies.any((p) => !expected.contains(p.providerId))) {
          throw const RefundReviewFailure(
            'Refund policies do not match all selected providers. Return to your selections, then reload.',
          );
        }
        // Reconcile again after the callable: ownership may change in flight,
        // including swaps that leave the overall provider set unchanged.
        final currentProviders = await resolveProviders(request);
        if (_disposed || generation != _generation) return;
        if (currentProviders.length != expected.length ||
            !currentProviders.containsAll(expected)) {
          throw const RefundReviewFailure(
            'Selected providers changed during review. Return to your selections, then reload.',
          );
        }
        final selection = request.toJson();
        if (result.policies.any(
          (p) =>
              p.sourceKind == 'package_override' &&
              (p.providerId != selection['providerId'] ||
                  p.effectivePolicyKey.split(':')[1] != selection['packageId']),
        )) {
          throw const RefundReviewFailure(
            'The refund policy does not match the selected package. Reload current policies.',
          );
        }
        disclosures = result;
        status = RefundReviewStatus.ready;
      } catch (error) {
        if (_disposed || generation != _generation) return;
        disclosures = null;
        _accepted.clear();
        status = RefundReviewStatus.failed;
        message = refundReviewFailure(error).message;
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

  bool acknowledged(BookingRefundPolicy p) =>
      status == RefundReviewStatus.ready &&
      _accepted[p.providerId] == p.effectivePolicyKey;
  void acknowledge(String providerId, String key, bool accepted) {
    if (_disposed || status != RefundReviewStatus.ready) return;
    if (!disclosures!.policies.any(
      (p) => p.providerId == providerId && p.effectivePolicyKey == key,
    )) {
      _accepted.clear();
    } else if (accepted) {
      _accepted[providerId] = key;
    } else {
      _accepted.remove(providerId);
    }
    notifyListeners();
  }

  bool get allAcknowledged =>
      !_disposed &&
      status == RefundReviewStatus.ready &&
      disclosures!.policies.every(acknowledged);
  List<Map<String, String>> get acknowledgements {
    if (!allAcknowledged) {
      throw const RefundReviewFailure(
        'Explicitly acknowledge every current provider refund policy.',
      );
    }
    return List.unmodifiable(
      disclosures!.policies.map((p) => p.acknowledgement),
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    disclosures = null;
    _accepted.clear();
    super.dispose();
  }
}
