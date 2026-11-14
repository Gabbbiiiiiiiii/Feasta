import 'dart:async';

import 'package:flutter/foundation.dart';

enum CustomerAuthorizationPhase { restoring, closed, validating, ready }

@immutable
class CustomerSessionSnapshot {
  const CustomerSessionSnapshot({
    required this.sdkUid,
    required this.customerUid,
    required this.generation,
    required this.phase,
  });
  final String? sdkUid;
  final String? customerUid;
  final int generation;
  final CustomerAuthorizationPhase phase;
}

/// A FEASTA authorization lifetime, not a Firebase session identifier.
/// Native transitions that have not become visible in Dart cannot be detected.
/// The existing authentication controller supplies actual customer validation;
/// SDK identity alone can close access but can never open it.
class CustomerSessionCoordinator extends ChangeNotifier {
  CustomerSessionCoordinator({String? Function()? currentUid})
    : _currentUid = currentUid ?? (() => null);

  static final shared = CustomerSessionCoordinator();
  String? Function() _currentUid;
  String? _sdkUid;
  String? _customerUid;
  int _generation = 0;
  CustomerAuthorizationPhase _phase = CustomerAuthorizationPhase.restoring;
  final Set<Object> _transitions = {};
  bool _restored = false;
  bool _suspended = false;
  bool _disposed = false;
  bool _notificationScheduled = false;
  bool _refreshScheduled = false;
  VoidCallback? _revalidate;
  Object? _owner;

  /// One application auth controller owns publication and restoration.
  void attach({
    required Object owner,
    required String? Function() currentUid,
    required VoidCallback revalidate,
  }) {
    if (_disposed) throw StateError('Session coordinator disposed.');
    if (_owner != null) {
      throw StateError('Session coordinator already attached.');
    }
    _owner = owner;
    _currentUid = currentUid;
    _revalidate = revalidate;
    _sdkUid = currentUid();
    _restored = false;
    _suspended = false;
    _generation++;
    _customerUid = null;
    _phase = CustomerAuthorizationPhase.restoring;
    notifyListeners();
  }

  void detach(Object owner) {
    if (!identical(_owner, owner)) return;
    _owner = null;
    _revalidate = null;
    _restored = false;
    invalidate();
  }

  /// Reads the SDK-visible identity on *every* access. A mismatch is sticky:
  /// returning to A later cannot revive the earlier A authorization lifetime.
  CustomerSessionSnapshot readSnapshot() {
    final live = _currentUid();
    if (!_disposed && live != _sdkUid) {
      _sdkUid = live;
      _generation++;
      _customerUid = null;
      _phase = CustomerAuthorizationPhase.closed;
      // Getters may run while widgets build. Close synchronously, notify later.
      _notifyLater();
      _requestRevalidation();
    }
    return CustomerSessionSnapshot(
      sdkUid: live,
      customerUid:
          !_disposed &&
              !_suspended &&
              _transitions.isEmpty &&
              _phase == CustomerAuthorizationPhase.ready &&
              live == _customerUid
          ? _customerUid
          : null,
      generation: _generation,
      phase: _disposed ? CustomerAuthorizationPhase.closed : _phase,
    );
  }

  /// Called for Auth observations, including the first restoration replay.
  /// Historical payloads never authorize their UID. A mismatching payload is
  /// evidence of uncertainty and closes access; validation uses live identity.
  void observeIdentity(String? observedUid) {
    if (_disposed) return;
    _restored = true;
    final live = readSnapshot().sdkUid;
    if (live == null && _phase == CustomerAuthorizationPhase.restoring) {
      _phase = CustomerAuthorizationPhase.closed;
      notifyListeners();
    }
    if (observedUid != live) {
      requireValidation();
      _requestRevalidation();
    }
  }

  /// Always advances for an explicit controlled boundary, even for the same UID.
  void invalidate() {
    if (_disposed) return;
    _generation++;
    _customerUid = null;
    _phase = CustomerAuthorizationPhase.closed;
    notifyListeners();
  }

  /// Coalesces repeated requests while already closed/validating.
  void requireValidation() {
    if (_disposed) return;
    if (_phase == CustomerAuthorizationPhase.ready ||
        _phase == CustomerAuthorizationPhase.validating) {
      invalidate();
    }
  }

  Object beginTransition() {
    final ticket = Object();
    if (_disposed) return ticket;
    _transitions.add(ticket);
    invalidate();
    return ticket;
  }

  void finishTransition(Object ticket) {
    if (_disposed || !_transitions.remove(ticket)) return;
    // No completion, including an older ticket, grants authorization. Only a
    // fresh validation after *all* queued/in-flight transitions may do that.
    if (_transitions.isEmpty) {
      invalidate();
      _requestRevalidation();
    }
  }

  CustomerSessionSnapshot beginValidation() {
    final captured = readSnapshot();
    if (!_disposed &&
        _restored &&
        !_suspended &&
        _transitions.isEmpty &&
        captured.sdkUid != null &&
        _phase != CustomerAuthorizationPhase.ready) {
      _phase = CustomerAuthorizationPhase.validating;
      notifyListeners();
    }
    return captured;
  }

  bool completeValidation(
    CustomerSessionSnapshot captured, {
    required String validatedUid,
    required bool authorizedCustomer,
  }) {
    if (!canPublishValidation(captured, validatedUid)) {
      return false;
    }
    if (!authorizedCustomer) {
      requireValidation();
      _customerUid = null;
      _phase = CustomerAuthorizationPhase.closed;
      notifyListeners();
      return false;
    }
    if (_phase != CustomerAuthorizationPhase.ready) {
      // Opening is a fresh lifetime too; snapshots from closed state stay stale.
      _generation++;
      _customerUid = validatedUid;
      _phase = CustomerAuthorizationPhase.ready;
      notifyListeners();
    }
    return true;
  }

  bool canPublishValidation(CustomerSessionSnapshot captured, String uid) {
    final live = readSnapshot();
    return !_disposed &&
        _restored &&
        !_suspended &&
        _transitions.isEmpty &&
        captured.generation == live.generation &&
        captured.sdkUid == live.sdkUid &&
        live.sdkUid == uid;
  }

  bool isCurrent(CustomerSessionSnapshot captured) {
    final live = readSnapshot();
    return captured.customerUid != null &&
        captured.customerUid == live.customerUid &&
        captured.sdkUid == live.sdkUid &&
        captured.generation == live.generation;
  }

  void suspend() {
    if (_disposed || _suspended) return;
    _suspended = true;
    invalidate();
  }

  void resume() {
    if (_disposed || !_suspended) return;
    _suspended = false;
    _requestRevalidation();
  }

  void _requestRevalidation() {
    if (_disposed ||
        _refreshScheduled ||
        _suspended ||
        _transitions.isNotEmpty) {
      return;
    }
    _refreshScheduled = true;
    scheduleMicrotask(() {
      _refreshScheduled = false;
      if (!_disposed &&
          !_suspended &&
          _transitions.isEmpty &&
          _phase != CustomerAuthorizationPhase.ready &&
          _phase != CustomerAuthorizationPhase.validating) {
        _revalidate?.call();
      }
    });
  }

  void _notifyLater() {
    if (_notificationScheduled) return;
    _notificationScheduled = true;
    scheduleMicrotask(() {
      _notificationScheduled = false;
      if (!_disposed) notifyListeners();
    });
  }

  @override
  void dispose() {
    _disposed = true;
    _generation++;
    _customerUid = null;
    _revalidate = null;
    super.dispose();
  }
}
