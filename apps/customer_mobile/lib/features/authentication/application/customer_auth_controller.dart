import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../app/router/customer_route_guard.dart';
import '../../../core/enums/enums.dart';
import '../data/repositories/customer_auth_state_repository.dart';
import '../domain/auth_account_state.dart';

enum CustomerAuthenticationFailureKind { network, server }

class CustomerAuthenticationState {
  const CustomerAuthenticationState({
    required this.gate,
    this.email,
    this.failure,
  });

  const CustomerAuthenticationState.loading()
    : gate = const AuthenticationGateResult(AuthenticationGateKind.loading),
      email = null,
      failure = null;

  final AuthenticationGateResult gate;
  final String? email;
  final CustomerAuthenticationFailureKind? failure;
}

class CustomerAuthenticationController extends ChangeNotifier {
  CustomerAuthenticationController({
    required this.repository,
    String initialLocation = CustomerAppLocations.browse,
  }) : _intendedLocation =
           CustomerRouteGuard.sanitizeIntendedLocation(initialLocation) ??
           CustomerAppLocations.browse;

  @visibleForTesting
  final CustomerAuthStateRepository repository;

  CustomerAuthenticationState _state =
      const CustomerAuthenticationState.loading();
  CustomerAuthenticationState get state => _state;

  String _intendedLocation;
  String get intendedLocation => _intendedLocation;

  StreamSubscription<CustomerAuthIdentity?>? _authSubscription;
  StreamSubscription<CustomerAuthIdentity?>? _tokenSubscription;
  StreamSubscription<void>? _accountSubscription;
  CustomerAuthIdentity? _identity;
  Future<void>? _activeLoad;
  bool _reloadQueued = false;
  bool _forceRefreshQueued = false;
  bool _started = false;
  bool _disposed = false;
  bool _preserveTerminalState = false;
  int _identityGeneration = 0;

  void start() {
    if (_started) return;
    _started = true;
    _authSubscription = repository.authStateChanges().listen(
      (identity) => _handleIdentity(identity, forceTokenRefresh: false),
      onError: (_) =>
          _setTransientFailure(CustomerAuthenticationFailureKind.server),
    );
    _tokenSubscription = repository.idTokenChanges().listen(
      (identity) => _handleIdentity(identity, forceTokenRefresh: false),
      onError: (_) =>
          _setTransientFailure(CustomerAuthenticationFailureKind.network),
    );
  }

  bool requestIntendedLocation(Object? location) {
    final safeLocation = CustomerRouteGuard.sanitizeIntendedLocation(location);
    if (safeLocation == null) return false;
    if (_intendedLocation != safeLocation) {
      _intendedLocation = safeLocation;
      notifyListeners();
    }
    return true;
  }

  String consumeIntendedLocation() {
    final location = _intendedLocation;
    _intendedLocation = CustomerAppLocations.customer;
    return location;
  }

  Future<void> refresh({bool forceTokenRefresh = true}) async {
    final identity = repository.currentIdentity ?? _identity;
    if (identity == null) {
      _setState(
        const CustomerAuthenticationState(
          gate: AuthenticationGateResult(
            AuthenticationGateKind.unauthenticated,
          ),
        ),
      );
      return;
    }
    _identity = identity;
    await _requestLoad(forceTokenRefresh: forceTokenRefresh);
  }

  Future<void> signOut() async {
    _preserveTerminalState = false;
    await repository.signOut();
    _identity = null;
    _intendedLocation = CustomerAppLocations.browse;
    _reloadQueued = false;
    _forceRefreshQueued = false;
    await _accountSubscription?.cancel();
    _accountSubscription = null;
    _setState(
      const CustomerAuthenticationState(
        gate: AuthenticationGateResult(AuthenticationGateKind.unauthenticated),
      ),
    );
  }

  Future<void> acknowledgeSessionExpired() async {
    _preserveTerminalState = false;
    _intendedLocation = CustomerAppLocations.browse;
    _setState(
      const CustomerAuthenticationState(
        gate: AuthenticationGateResult(AuthenticationGateKind.unauthenticated),
      ),
    );
  }

  void _handleIdentity(
    CustomerAuthIdentity? identity, {
    required bool forceTokenRefresh,
  }) {
    if (identity == null) {
      _identity = null;
      _identityGeneration++;
      unawaited(_accountSubscription?.cancel());
      _accountSubscription = null;
      if (_preserveTerminalState) return;
      _setState(
        const CustomerAuthenticationState(
          gate: AuthenticationGateResult(
            AuthenticationGateKind.unauthenticated,
          ),
        ),
      );
      return;
    }

    _preserveTerminalState = false;
    final identityChanged = _identity?.uid != identity.uid;
    _identity = identity;
    if (identityChanged) {
      _identityGeneration++;
      _bindAccountChanges(identity.uid);
      _setState(
        CustomerAuthenticationState(
          gate: const AuthenticationGateResult(AuthenticationGateKind.loading),
          email: identity.email,
        ),
      );
    }
    unawaited(_requestLoad(forceTokenRefresh: forceTokenRefresh));
  }

  void _bindAccountChanges(String uid) {
    unawaited(_accountSubscription?.cancel());
    _accountSubscription = repository
        .accountChanges(uid)
        .listen(
          (_) {
            if (_identity?.uid == uid) {
              unawaited(_requestLoad(forceTokenRefresh: false));
            }
          },
          onError: (_) {
            _setState(
              CustomerAuthenticationState(
                gate: const AuthenticationGateResult(
                  AuthenticationGateKind.invalidAccountState,
                ),
                email: _identity?.email,
              ),
            );
            _terminateSessionPreservingState();
          },
        );
  }

  Future<void> _requestLoad({required bool forceTokenRefresh}) {
    _forceRefreshQueued = _forceRefreshQueued || forceTokenRefresh;
    if (_activeLoad != null) {
      _reloadQueued = true;
      return _activeLoad!;
    }

    final load = _drainLoads();
    _activeLoad = load;
    return load;
  }

  Future<void> _drainLoads() async {
    try {
      do {
        _reloadQueued = false;
        final forceTokenRefresh = _forceRefreshQueued;
        _forceRefreshQueued = false;
        await _performLoad(forceTokenRefresh: forceTokenRefresh);
      } while (_reloadQueued && !_disposed);
    } finally {
      _activeLoad = null;
    }
  }

  Future<void> _performLoad({required bool forceTokenRefresh}) async {
    final identity = _identity;
    if (identity == null) return;
    final generation = _identityGeneration;

    try {
      final result = await repository.loadAccount(
        identity: identity,
        forceTokenRefresh: forceTokenRefresh,
      );
      if (!_isCurrent(identity.uid, generation)) return;

      final gate = resolveAuthenticationGate(
        AuthenticationGateInput(
          authenticated: true,
          emailVerified: result.identity.emailVerified,
          userProfile: result.userProfile,
          requiredRoles: const {UserRole.customer},
        ),
      );
      _setState(
        CustomerAuthenticationState(gate: gate, email: result.identity.email),
      );
      if (_requiresTermination(gate.kind)) {
        _terminateSessionPreservingState();
      }
    } on CustomerAuthLoadFailure catch (failure) {
      if (!_isCurrent(identity.uid, generation)) return;
      _handleLoadFailure(failure.kind);
    }
  }

  bool _isCurrent(String uid, int generation) {
    return !_disposed &&
        _identity?.uid == uid &&
        _identityGeneration == generation;
  }

  void _handleLoadFailure(CustomerAuthLoadFailureKind kind) {
    switch (kind) {
      case CustomerAuthLoadFailureKind.network:
        _setTransientFailure(CustomerAuthenticationFailureKind.network);
        return;
      case CustomerAuthLoadFailureKind.server:
        _setTransientFailure(CustomerAuthenticationFailureKind.server);
        return;
      case CustomerAuthLoadFailureKind.sessionExpired:
        _setState(
          CustomerAuthenticationState(
            gate: const AuthenticationGateResult(
              AuthenticationGateKind.sessionExpired,
            ),
            email: _identity?.email,
          ),
        );
        _terminateSessionPreservingState();
        return;
      case CustomerAuthLoadFailureKind.disabledAuthAccount:
        _setState(
          CustomerAuthenticationState(
            gate: const AuthenticationGateResult(
              AuthenticationGateKind.disabledAuthAccount,
            ),
            email: _identity?.email,
          ),
        );
        _terminateSessionPreservingState();
        return;
      case CustomerAuthLoadFailureKind.authorization:
        _setState(
          CustomerAuthenticationState(
            gate: const AuthenticationGateResult(
              AuthenticationGateKind.invalidAccountState,
            ),
            email: _identity?.email,
          ),
        );
        _terminateSessionPreservingState();
        return;
      case CustomerAuthLoadFailureKind.configuration:
        _setState(
          CustomerAuthenticationState(
            gate: const AuthenticationGateResult(
              AuthenticationGateKind.configurationError,
            ),
            email: _identity?.email,
          ),
        );
        return;
    }
  }

  void _setTransientFailure(CustomerAuthenticationFailureKind kind) {
    _setState(
      CustomerAuthenticationState(
        gate: const AuthenticationGateResult(AuthenticationGateKind.loading),
        email: _identity?.email,
        failure: kind,
      ),
    );
  }

  void _setState(CustomerAuthenticationState value) {
    if (_disposed) return;
    _state = value;
    notifyListeners();
  }

  bool _requiresTermination(AuthenticationGateKind kind) => switch (kind) {
    AuthenticationGateKind.blocked ||
    AuthenticationGateKind.deactivated ||
    AuthenticationGateKind.disabledAuthAccount ||
    AuthenticationGateKind.disabledAccount ||
    AuthenticationGateKind.forbiddenRole ||
    AuthenticationGateKind.adminReady ||
    AuthenticationGateKind.providerBusinessSetupRequired ||
    AuthenticationGateKind.providerVerificationDraft ||
    AuthenticationGateKind.providerVerificationSubmitted ||
    AuthenticationGateKind.providerUnderReview ||
    AuthenticationGateKind.providerResubmissionRequired ||
    AuthenticationGateKind.providerRejected ||
    AuthenticationGateKind.providerSuspended ||
    AuthenticationGateKind.providerApproved ||
    AuthenticationGateKind.invalidAccountState => true,
    _ => false,
  };

  void _terminateSessionPreservingState() {
    if (_preserveTerminalState || _disposed) return;
    _preserveTerminalState = true;
    unawaited(_accountSubscription?.cancel());
    _accountSubscription = null;
    unawaited(repository.signOut().catchError((_) {}));
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_authSubscription?.cancel());
    unawaited(_tokenSubscription?.cancel());
    unawaited(_accountSubscription?.cancel());
    super.dispose();
  }
}
