import '../../shared/models/food_choice_v2.dart';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../shared/models/booking_contract.dart';
import '../../shared/models/event_customization_data.dart';
import '../../shared/models/booking_agreement.dart';
import 'booking_agreement_controller.dart';
import 'booking_refund_policy_controller.dart';

enum BookingAttemptStatus {
  draft,
  blockedFreshDisclosures,
  ready,
  dispatchPending,
  confirmedCreated,
  confirmedExisting,
  rejectedBeforeCreation,
  outcomeUncertain,
  requiresReconciliation,
  selectionChanged,
  completed,
  safelyAbandoned,
}

enum BookingAttemptInterruption {
  timeout,
  connection,
  accountChanged,
  fingerprintConflict,
}

/// Trusted storage must provide confidentiality and integrity, or throw.
abstract interface class BookingAttemptStore {
  Future<String?> read(String uid);
  Future<void> write(String uid, String value);
}

class SecureBookingAttemptStore implements BookingAttemptStore {
  const SecureBookingAttemptStore();
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      storageNamespace: 'feasta_booking_attempts_v1',
      resetOnError: false,
    ),
    iOptions: IOSOptions(
      accountName: 'feasta_booking_attempts_v1',
      accessibility: KeychainAccessibility.unlocked_this_device,
      synchronizable: false,
    ),
  );
  String _key(String uid) =>
      'booking_attempt_v1_${base64Url.encode(utf8.encode(uid))}';
  void _supported() {
    if (kIsWeb ||
        ![
          TargetPlatform.android,
          TargetPlatform.iOS,
        ].contains(defaultTargetPlatform)) {
      throw UnsupportedError(
        'Trusted booking attempt storage requires Android or iOS.',
      );
    }
  }

  @override
  Future<String?> read(String uid) {
    _supported();
    return _storage.read(key: _key(uid));
  }

  @override
  Future<void> write(String uid, String value) async {
    _supported();
    await _storage.write(key: _key(uid), value: value);
    if (await _storage.read(key: _key(uid)) != value) {
      throw StateError('Attempt persistence could not be verified.');
    }
  }
}

/// Stores only normalized selection data, never display prices or consent.
/// This local identity is NOT the backend Node SHA-256 fingerprint.
String bookingSelectionIdentity(BookingSelection selection) {
  final data = selection.toJson(clientRequestId: 'identity_snapshot')
    ..remove('clientRequestId');
  data['addonIds'] = (data['addonIds'] as List<String>).toList()..sort();
  return jsonEncode(data);
}

class BookingAttempt {
  const BookingAttempt._(
    this.uid,
    this.clientRequestId,
    this.selectionIdentity,
    this.status,
    this.createdAt,
    this.updatedAt,
    this.result,
  );
  final String uid, clientRequestId, selectionIdentity;
  final BookingAttemptStatus status;
  final DateTime createdAt, updatedAt;
  final BookingSubmissionResult? result;
  // Decoding returns a detached copy: callers cannot mutate the stored snapshot.
  Map<String, dynamic> get selection =>
      jsonDecode(selectionIdentity) as Map<String, dynamic>;
  bool get safeToSupersede => const {
    BookingAttemptStatus.draft,
    BookingAttemptStatus.blockedFreshDisclosures,
    BookingAttemptStatus.ready,
    BookingAttemptStatus.rejectedBeforeCreation,
    BookingAttemptStatus.selectionChanged,
    BookingAttemptStatus.safelyAbandoned,
    BookingAttemptStatus.completed,
  }.contains(status);
  Map<String, dynamic> toJson() => {
    'version': 1,
    'uid': uid,
    'clientRequestId': clientRequestId,
    'selectionIdentity': selectionIdentity,
    'status': status.name,
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt.toIso8601String(),
    if (result != null)
      'result': {
        'bookingId': result!.bookingId,
        'mainEventId': result!.mainEventId,
        'providerRequestIds': result!.providerRequestIds,
        'created': result!.created,
      },
  };
}

/// One coordinator per process; all mutations serialize, including across accounts.
/// No submission transport is exposed by M4.4.
class BookingAttemptCoordinator {
  BookingAttemptCoordinator({required this.store, required this.currentUid});
  final BookingAttemptStore store;
  final String? Function() currentUid;
  Future<void> _tail = Future.value();
  int _sessionEpoch = 0;
  int _operationEpoch = 0;
  void invalidateSession() => _sessionEpoch++;
  Future<T> _serial<T>(Future<T> Function() action) {
    final owner = currentUid(), epoch = _sessionEpoch;
    final next = _tail.then((_) {
      if (owner != currentUid() || epoch != _sessionEpoch) {
        throw StateError('Account changed before preparation completed.');
      }
      _operationEpoch = epoch;
      return action();
    });
    _tail = next.then<void>(
      (_) {},
      onError: (Object error, StackTrace stack) {},
    );
    return next;
  }

  String _owner() {
    final uid = currentUid();
    if (uid == null || uid.isEmpty) {
      throw StateError('Sign in to prepare a request.');
    }
    return uid;
  }

  void _check(String uid) {
    if (currentUid() != uid || _operationEpoch != _sessionEpoch) {
      throw StateError('Account changed; refresh preparation.');
    }
  }

  Future<BookingAttempt?> _read(String uid) async {
    final raw = await store.read(uid);
    _check(uid);
    if (raw == null) return null;
    // Corruption is deliberately not deleted or interpreted as no attempt.
    final d = jsonDecode(raw) as Map<String, dynamic>;
    final id = d['clientRequestId'] as String;
    final identity = d['selectionIdentity'] as String;
    final selection = jsonDecode(identity) as Map<String, dynamic>;
    final normalized = bookingSelectionIdentity(
      BookingSelection(
        providerId: selection['providerId'] as String,
        packageId: selection['packageId'] as String,
        customization: EventCustomizationData(
          sharedContractVersion: selection['sharedContractVersion'] as int?,
          expectedPackageRevision: selection['expectedPackageRevision'] as int?,
          eventType: selection['eventType'] as String,
          eventDate: DateTime.parse(selection['eventDate'] as String),
          eventTime: selection['eventTime'] as String,
          eventEndTime: selection['eventEndTime'] as String,
          guestCount: selection['guestCount'] as int,
          eventLocation: selection['eventLocation'] as String,
          eventAddress: selection['eventAddress'] as String,
          foodChoiceSelections: parseFoodChoiceSelections(
            selection['foodChoiceSelections'],
          ),
          selectedFoods: List<String>.from(selection['selectedFoods'] as List),
          selectedDecorations: List<String>.from(
            selection['selectedDecorations'] as List,
          ),
          selectedFurniture: List<String>.from(
            selection['selectedFurniture'] as List,
          ),
          selectedAddOns: (selection['addonIds'] as List)
              .map((id) => <String, dynamic>{'addonId': id})
              .toList(),
          willArrangeOwnAddOns: selection['willArrangeOwnAddOns'] as bool,
          customerArrangedAddOnsNote:
              selection['customerArrangedAddOnsNote'] as String,
          specialRequest: selection['specialRequest'] as String,
          serviceTier: selection['serviceTier'] as String?,
          packageThemeId: selection['packageThemeId'] as String?,
        ),
      ),
    );
    if (normalized != identity) {
      throw const FormatException('Invalid selection snapshot.');
    }
    final status = BookingAttemptStatus.values.byName(d['status'] as String);
    final created = DateTime.parse(d['createdAt'] as String);
    final updated = DateTime.parse(d['updatedAt'] as String);
    if (d['version'] != 1 ||
        d['uid'] != uid ||
        !RegExp(r'^mobile_[0-9a-f]{64}$').hasMatch(id) ||
        selection['cateringSelectionType'] != 'package' ||
        selection.containsKey('clientRequestId') ||
        updated.isBefore(created)) {
      throw const FormatException(
        'Untrusted booking attempt; reconciliation required.',
      );
    }
    final result = d['result'] == null
        ? null
        : BookingSubmissionResult.fromJson(d['result']);
    if ({
          BookingAttemptStatus.confirmedCreated,
          BookingAttemptStatus.confirmedExisting,
          BookingAttemptStatus.completed,
        }.contains(status) &&
        result == null) {
      throw const FormatException('Missing confirmed result.');
    }
    return BookingAttempt._(
      uid,
      id,
      identity,
      status,
      created,
      updated,
      result,
    );
  }

  Future<BookingAttempt> _save(
    BookingAttempt a,
    BookingAttemptStatus status, {
    BookingSubmissionResult? result,
  }) async {
    _check(a.uid);
    final next = BookingAttempt._(
      a.uid,
      a.clientRequestId,
      a.selectionIdentity,
      status,
      a.createdAt,
      DateTime.now().toUtc(),
      result ?? a.result,
    );
    await store.write(a.uid, jsonEncode(next.toJson()));
    _check(a.uid);
    return next;
  }

  Future<BookingAttempt> prepare(BookingSelection selection) {
    // Freeze synchronously, before waiting behind any other storage operation.
    final String identity;
    try {
      identity = bookingSelectionIdentity(selection);
    } catch (error, stack) {
      return Future.error(error, stack);
    }
    return _serial(() async {
      final uid = _owner();
      final previous = await _read(uid);
      if (previous != null &&
          previous.selectionIdentity == identity &&
          previous.status != BookingAttemptStatus.safelyAbandoned &&
          previous.status != BookingAttemptStatus.completed) {
        final status = previous.safeToSupersede
            ? BookingAttemptStatus.blockedFreshDisclosures
            : previous.result == null
            ? BookingAttemptStatus.requiresReconciliation
            : previous.status;
        return _save(previous, status);
      }
      if (previous != null && !previous.safeToSupersede) {
        throw StateError(
          'Previous outcome requires reconciliation before another attempt.',
        );
      }
      final random = Random.secure();
      final id =
          'mobile_${List.generate(32, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join()}';
      final now = DateTime.now().toUtc();
      return _save(
        BookingAttempt._(
          uid,
          id,
          identity,
          BookingAttemptStatus.draft,
          now,
          now,
          null,
        ),
        BookingAttemptStatus.blockedFreshDisclosures,
      );
    });
  }

  Future<BookingAttempt?> restore() => _serial(() async {
    final a = await _read(_owner());
    if (a == null) return null;
    if (a.status == BookingAttemptStatus.completed ||
        a.status == BookingAttemptStatus.safelyAbandoned) {
      return a;
    }
    return _save(
      a,
      a.safeToSupersede
          ? BookingAttemptStatus.blockedFreshDisclosures
          : a.result == null
          ? BookingAttemptStatus.requiresReconciliation
          : a.status,
    );
  });

  /// Preparation readiness only. Fresh, in-memory reviews are never persisted.
  /// Rollout-off stays blocked until the M4.5 product/backend decision.
  Future<BookingAttempt> reviewReadiness({
    required String requestId,
    required BookingSelection selection,
    required BookingAgreementController agreements,
    required BookingRefundPolicyController refunds,
    required AgreementProviderResolver resolveProviders,
  }) {
    final identity = bookingSelectionIdentity(selection);
    final request = BookingAgreementRequest(selection, requestId);
    return _serial(() async {
      final uid = _owner();
      final a = await _read(uid);
      if (a == null || a.clientRequestId != requestId) {
        throw StateError('Attempt mismatch.');
      }
      if (!a.safeToSupersede || a.result != null) {
        throw StateError('Resolve the previous outcome first.');
      }
      if (a.selectionIdentity != identity) {
        return _save(a, BookingAttemptStatus.selectionChanged);
      }
      bool current() =>
          bookingSelectionIdentity(selection) == identity &&
          (a.status == BookingAttemptStatus.ready ||
              (agreements.loadedAt != null &&
                  refunds.loadedAt != null &&
                  !agreements.loadedAt!.isBefore(a.updatedAt) &&
                  !refunds.loadedAt!.isBefore(a.updatedAt))) &&
          agreements.matchesSelection(selection, uid) &&
          refunds.matchesSelection(selection, uid) &&
          agreements.allAcknowledged &&
          refunds.allAcknowledged;
      if (!current()) {
        return _save(a, BookingAttemptStatus.blockedFreshDisclosures);
      }
      // Capture exact provider/key pairs; a refresh during lookup invalidates them.
      final agreementKeys = jsonEncode(agreements.acknowledgements);
      final refundKeys = jsonEncode(refunds.acknowledgements);
      Set<String> providers;
      try {
        providers = await resolveProviders(request);
      } catch (_) {
        return _save(a, BookingAttemptStatus.requiresReconciliation);
      }
      _check(uid);
      if (!current() ||
          agreementKeys != jsonEncode(agreements.acknowledgements) ||
          refundKeys != jsonEncode(refunds.acknowledgements)) {
        return _save(a, BookingAttemptStatus.blockedFreshDisclosures);
      }
      final agreementProviders = agreements.agreements
          .map((a) => a.providerId)
          .toSet();
      final refundProviders = refunds.disclosures!.policies
          .map((p) => p.providerId)
          .toSet();
      if (!setEquals(providers, agreementProviders) ||
          !setEquals(providers, refundProviders)) {
        return _save(a, BookingAttemptStatus.requiresReconciliation);
      }
      return _save(
        a,
        refunds.disclosures!.rolloutMode == 'required'
            ? BookingAttemptStatus.ready
            : BookingAttemptStatus.blockedFreshDisclosures,
      );
    });
  }

  /// Explicit user intent is required to end an attempt. An unknown outcome
  /// cannot be abandoned; a confirmed result can be marked completed locally.
  Future<BookingAttempt> close(String requestId) => _serial(() async {
    final a = await _read(_owner());
    if (a == null || a.clientRequestId != requestId) {
      throw StateError('Attempt mismatch.');
    }
    if (a.status == BookingAttemptStatus.requiresReconciliation ||
        (!a.safeToSupersede && a.result == null)) {
      throw StateError('Reconcile the previous outcome before closing it.');
    }
    return _save(
      a,
      a.result == null
          ? BookingAttemptStatus.safelyAbandoned
          : BookingAttemptStatus.completed,
    );
  });

  /// Future transport adapter may report a response only for a pending attempt.
  /// Parsing failure never establishes rejection or absence.
  Future<BookingAttempt> recordResponse(String requestId, Object? response) =>
      _serial(() async {
        final a = await _read(_owner());
        if (a == null ||
            a.clientRequestId != requestId ||
            (a.safeToSupersede && a.result == null)) {
          throw StateError('No dispatched attempt.');
        }
        BookingSubmissionResult result;
        try {
          result = BookingSubmissionResult.fromJson(response);
        } catch (_) {
          return _save(a, BookingAttemptStatus.requiresReconciliation);
        }
        if (a.result != null &&
            (a.result!.bookingId != result.bookingId ||
                a.result!.mainEventId != result.mainEventId ||
                !listEquals(
                  a.result!.providerRequestIds,
                  result.providerRequestIds,
                ))) {
          return _save(a, BookingAttemptStatus.requiresReconciliation);
        }
        return _save(
          a,
          result.created
              ? BookingAttemptStatus.confirmedCreated
              : BookingAttemptStatus.confirmedExisting,
          result: result,
        );
      });

  /// Timeouts, conflicts, read errors and missing list entries are all inconclusive.
  Future<BookingAttempt> recordInterruption(
    String requestId,
    BookingAttemptInterruption interruption,
  ) => _serial(() async {
    final a = await _read(_owner());
    if (a == null || a.clientRequestId != requestId) {
      throw StateError('Attempt mismatch.');
    }
    return _save(
      a,
      interruption == BookingAttemptInterruption.fingerprintConflict
          ? BookingAttemptStatus.requiresReconciliation
          : BookingAttemptStatus.outcomeUncertain,
    );
  });

  Future<BookingAttempt> requireReconciliation(String requestId) =>
      _serial(() async {
        final a = await _read(_owner());
        if (a == null || a.clientRequestId != requestId) {
          throw StateError('Attempt mismatch.');
        }
        return _save(a, BookingAttemptStatus.requiresReconciliation);
      });
}
