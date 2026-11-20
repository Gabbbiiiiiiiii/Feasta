import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final _safeId = RegExp(r'^[A-Za-z0-9_-]{8,160}$');
final _safeKey = RegExp(r'^[A-Za-z0-9:_-]{8,200}$');

/// Durable cancellation attempt prepared before the Firebase callable.
/// Refund values and eligibility are never calculated or persisted here.
class CancellationAttempt {
  const CancellationAttempt({
    required this.uid,
    required this.providerRequestId,
    required this.idempotencyKey,
    required this.reason,
  });

  final String uid;
  final String providerRequestId;
  final String idempotencyKey;
  final String reason;

  static void validateIdentity(String uid, String providerRequestId) {
    if (uid.isEmpty ||
        uid.length > 256 ||
        !_safeId.hasMatch(providerRequestId)) {
      throw const FormatException('Invalid cancellation attempt identity.');
    }
  }

  void validate() {
    validateIdentity(uid, providerRequestId);

    if (!_safeKey.hasMatch(idempotencyKey) ||
        !idempotencyKey.startsWith('customer-cancellation:') ||
        reason.trim() != reason ||
        reason.length < 5 ||
        reason.length > 1000) {
      throw const FormatException('Invalid saved cancellation attempt.');
    }
  }

  String encode() {
    validate();

    return jsonEncode({
      'version': 1,
      'uid': uid,
      'providerRequestId': providerRequestId,
      'idempotencyKey': idempotencyKey,
      'reason': reason,
    });
  }

  static CancellationAttempt decode(
    String encoded, {
    required String uid,
    required String providerRequestId,
  }) {
    validateIdentity(uid, providerRequestId);

    final dynamic raw;
    try {
      raw = jsonDecode(encoded);
    } on FormatException {
      throw const FormatException('Invalid saved cancellation attempt.');
    }

    if (raw is! Map || raw.keys.any((key) => key is! String)) {
      throw const FormatException('Invalid saved cancellation attempt.');
    }

    final record = Map<String, dynamic>.from(raw);

    if (record['version'] != 1 ||
        record['uid'] != uid ||
        record['providerRequestId'] != providerRequestId ||
        record['idempotencyKey'] is! String ||
        record['reason'] is! String) {
      throw const FormatException('Cancellation attempt scope mismatch.');
    }

    final attempt = CancellationAttempt(
      uid: uid,
      providerRequestId: providerRequestId,
      idempotencyKey: record['idempotencyKey'] as String,
      reason: record['reason'] as String,
    );

    attempt.validate();
    return attempt;
  }
}

abstract interface class CancellationAttemptStore {
  Future<CancellationAttempt?> read({
    required String uid,
    required String providerRequestId,
  });

  /// Rejects overwriting an existing different attempt.
  Future<void> save(CancellationAttempt attempt);
}

/// Secure, fail-closed storage on Android and iOS.
class SecureCancellationAttemptStore implements CancellationAttemptStore {
  const SecureCancellationAttemptStore();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      storageNamespace: 'feasta_customer_cancellation_v1',
      resetOnError: false,
    ),
    iOptions: IOSOptions(
      accountName: 'feasta_customer_cancellation_v1',
      accessibility: KeychainAccessibility.unlocked_this_device,
      synchronizable: false,
    ),
  );

  void _requireSupportedPlatform() {
    if (kIsWeb ||
        !{
          TargetPlatform.android,
          TargetPlatform.iOS,
        }.contains(defaultTargetPlatform)) {
      throw UnsupportedError(
        'Secure cancellation attempt storage requires Android or iOS.',
      );
    }
  }

  String _key(String uid, String providerRequestId) {
    CancellationAttempt.validateIdentity(uid, providerRequestId);

    final userPart = base64Url.encode(utf8.encode(uid));
    final requestPart = base64Url.encode(utf8.encode(providerRequestId));

    return 'cancellation_attempt_v1_${userPart}_$requestPart';
  }

  @override
  Future<CancellationAttempt?> read({
    required String uid,
    required String providerRequestId,
  }) async {
    _requireSupportedPlatform();

    final saved = await _storage.read(key: _key(uid, providerRequestId));

    if (saved == null) return null;

    return CancellationAttempt.decode(
      saved,
      uid: uid,
      providerRequestId: providerRequestId,
    );
  }

  @override
  Future<void> save(CancellationAttempt attempt) async {
    _requireSupportedPlatform();

    final encoded = attempt.encode();
    final key = _key(attempt.uid, attempt.providerRequestId);
    final existing = await _storage.read(key: key);

    if (existing != null && existing != encoded) {
      throw StateError(
        'A previous cancellation attempt requires reconciliation.',
      );
    }

    if (existing == null) {
      await _storage.write(key: key, value: encoded);
    }

    final verified = await _storage.read(key: key);

    if (verified != encoded) {
      throw StateError(
        'Cancellation attempt persistence could not be verified.',
      );
    }
  }
}
