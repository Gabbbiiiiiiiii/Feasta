import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../app/router/customer_route_guard.dart';
import '../../../core/enums/enums.dart';
import '../data/repositories/customer_auth_state_repository.dart';
import '../domain/auth_account_state.dart';

enum CustomerAuthenticationFailureKind {
  network,
  server,
  accountAccess,
  callableAccess,
}

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
  CustomerAuthIdentity? get currentIdentity => repository.currentIdentity;
  bool get signingOut => _signingOut;

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
  bool _signingOut = false;
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

    if (safeLocation == null) {
      return false;
    }

    if (_intendedLocation != safeLocation) {
      _intendedLocation = safeLocation;
      notifyListeners();
    }

    return true;
  }

  /// Stores the user's intended destination without notifying listeners.
  ///
  /// This is used by modal authentication so AuthenticationGate does not
  /// replace the current guest screen with a full login page while the
  /// modal is open.
  bool stageIntendedLocation(Object? location) {
    final safeLocation = CustomerRouteGuard.sanitizeIntendedLocation(location);

    if (safeLocation == null) {
      return false;
    }

    _intendedLocation = safeLocation;

    return true;
  }

  String consumeIntendedLocation() {
    final location = _intendedLocation;

    _intendedLocation = CustomerAppLocations.customer;

    return location;
  }

  Future<void> refresh({bool forceTokenRefresh = true}) async {
    if (_signingOut) return;
    final identity = repository.currentIdentity;

    if (identity == null) {
      if (_preserveTerminalState) return;
      _consentRequired = false;
      _identity = null;

      _setState(
        const CustomerAuthenticationState(
          gate: AuthenticationGateResult(
            AuthenticationGateKind.unauthenticated,
          ),
        ),
      );

      return;
    }

    final identityChanged = _identity?.uid != identity.uid;

    _preserveTerminalState = false;
    _identity = identity;

    if (identityChanged) {
      _consentRequired = false;
      _identityGeneration++;
      unawaited(_accountSubscription?.cancel());
      _accountSubscription = null;

      _setState(
        CustomerAuthenticationState(
          gate: const AuthenticationGateResult(AuthenticationGateKind.loading),
          email: identity.email,
        ),
      );
    }

    await _requestLoad(forceTokenRefresh: forceTokenRefresh);
  }

  Future<void> signOut() async {
    if (_signingOut) return;
    _signingOut = true;
    _preserveTerminalState = false;
    _consentRequired = false;

    _identityGeneration++;

    // Generation invalidation makes all callbacks inert immediately. Native
    // listener cleanup must not delay Firebase sign-out or recovery navigation.
    unawaited(_accountSubscription?.cancel().catchError((_) {}));
    _accountSubscription = null;

    _identity = null;
    _intendedLocation = CustomerAppLocations.browse;
    _reloadQueued = false;
    _forceRefreshQueued = false;

    _setState(const CustomerAuthenticationState.loading());

    try {
      // Invalidate repository work before awaiting listener cancellation.
      await repository.signOut();
    } catch (_) {
      _signingOut = false;
      _identity = repository.currentIdentity;
      _setTransientFailure(CustomerAuthenticationFailureKind.server);
      return;
    } finally {
      _signingOut = false;
    }

    if (_disposed) {
      return;
    }
    final remainingIdentity = repository.currentIdentity;
    if (remainingIdentity != null) {
      _handleIdentity(remainingIdentity, forceTokenRefresh: false);
      return;
    }

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
    if (_signingOut) return;
    if (identity == null) {
      _consentRequired = false;
      _identity = null;

      _identityGeneration++;

      unawaited(_accountSubscription?.cancel());

      _accountSubscription = null;

      if (_preserveTerminalState) {
        return;
      }

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
      _consentRequired = false;
      _identityGeneration++;

      unawaited(_accountSubscription?.cancel());
      _accountSubscription = null;

      _setState(
        CustomerAuthenticationState(
          gate: const AuthenticationGateResult(AuthenticationGateKind.loading),
          email: identity.email,
        ),
      );
    }

    if (!_consentRequired) {
      unawaited(_requestLoad(forceTokenRefresh: forceTokenRefresh));
    }
  }

  void _bindAccountChanges(String uid) {
    unawaited(_accountSubscription?.cancel());

    final generation = _identityGeneration;

    _accountSubscription = repository
        .accountChanges(uid)
        .listen(
          (_) {
            if (!_isCurrent(uid, generation)) {
              return;
            }

            unawaited(_requestLoad(forceTokenRefresh: false));
          },
          onError: (Object error, StackTrace stackTrace) {
            if (!_isCurrent(uid, generation)) {
              return;
            }

            unawaited(_requestLoad(forceTokenRefresh: true));
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
      } while (_reloadQueued && !_disposed && !_consentRequired);
    } finally {
      _activeLoad = null;
    }
  }

  Future<void> _performLoad({required bool forceTokenRefresh}) async {
    final identity = _identity;

    if (identity == null) {
      _consentRequired = false;
      return;
    }

    final generation = _identityGeneration;

    try {
      final result = await repository.loadAccount(
        identity: identity,
        forceTokenRefresh: forceTokenRefresh,
      );

      if (!_isCurrent(identity.uid, generation)) {
        return;
      }

      final gate = resolveAuthenticationGate(
        AuthenticationGateInput(
          authenticated: true,
          emailVerified: result.identity.emailVerified,
          userProfile: result.userProfile,
          requiredRoles: const {UserRole.customer},
        ),
      );
      _consentRequired = false;

      if (_accountSubscription == null &&
          result.userProfile != null &&
          !_requiresTermination(gate.kind)) {
        _bindAccountChanges(identity.uid);
      }

      _setState(
        CustomerAuthenticationState(gate: gate, email: result.identity.email),
      );

      if (_requiresTermination(gate.kind)) {
        _terminateSessionPreservingState();
      }
    } on CustomerAuthLoadFailure catch (failure) {
      if (!_isCurrent(identity.uid, generation)) {
        return;
      }

      _handleLoadFailure(failure.kind);
    }
  }

  bool _isCurrent(String uid, int generation) {
    return !_disposed &&
        repository.currentIdentity?.uid == uid &&
        _identity?.uid == uid &&
        _identityGeneration == generation;
  }

  bool get consentRequired => _consentRequired;
  int get consentGeneration => _identityGeneration;
  int get consentRevision => _consentRevision;
  String? get policyRecoveryNotice => _policyRecoveryNotice;
  String? _policyRecoveryNotice;
  bool get policiesOutdated => _policiesOutdated;
  bool _policiesOutdated = false;
  int _consentRevision = 0;
  bool _consentRequired = false;

  Future<void> acceptConsent({
    required String termsPolicyVersion,
    required String privacyPolicyVersion,
    int? expectedGeneration,
    int? expectedRevision,
  }) async {
    if (_disposed ||
        _signingOut ||
        (expectedRevision != null && expectedRevision != _consentRevision)) {
      return;
    }
    if (expectedGeneration != null &&
        expectedGeneration != _identityGeneration) {
      return;
    }
    final identity = _identity;
    final generation = _identityGeneration;
    if (identity == null ||
        !_consentRequired ||
        !_isCurrent(identity.uid, generation)) {
      return;
    }
    final consent = repository;
    if (consent is! CustomerConsentRepository) return;
    _consentRequired = false;
    _setState(
      CustomerAuthenticationState(
        email: identity.email,
        gate: const AuthenticationGateResult(AuthenticationGateKind.loading),
      ),
    );
    try {
      await (consent as CustomerConsentRepository).acceptConsent(
        identity.uid,
        termsPolicyVersion: termsPolicyVersion,
        privacyPolicyVersion: privacyPolicyVersion,
      );
      if (_isCurrent(identity.uid, generation)) {
        await refresh(forceTokenRefresh: false);
      }
    } on CustomerAuthLoadFailure catch (failure) {
      if (_isCurrent(identity.uid, generation)) {
        _handleLoadFailure(failure.kind);
      }
    } catch (_) {
      if (_isCurrent(identity.uid, generation)) {
        _consentRequired = true;
        _setTransientFailure(CustomerAuthenticationFailureKind.server);
      }
    }
  }

  void _handleLoadFailure(CustomerAuthLoadFailureKind kind) {
    switch (kind) {
      case CustomerAuthLoadFailureKind.policyVersionOutdated:
      case CustomerAuthLoadFailureKind.consentRequired:
      case CustomerAuthLoadFailureKind.policyUnavailable:
      case CustomerAuthLoadFailureKind.invalidPolicyVersion:
        _policyRecoveryNotice = switch (kind) {
          CustomerAuthLoadFailureKind.policyUnavailable =>
            "Current policies are temporarily unavailable. Retry policies, then review and accept both agreements again.",
          CustomerAuthLoadFailureKind.invalidPolicyVersion =>
            "The policy versions could not be validated. Reload both policies and accept them again. If this continues, contact support.",
          _ => null,
        };
        _policiesOutdated =
            kind == CustomerAuthLoadFailureKind.policyVersionOutdated;
        _consentRevision++;
        _consentRequired = true;
        _setState(
          CustomerAuthenticationState(
            email: _identity?.email,
            gate: const AuthenticationGateResult(
              AuthenticationGateKind.loading,
            ),
          ),
        );
        return;
      case CustomerAuthLoadFailureKind.accountAccess:
        _setTransientFailure(CustomerAuthenticationFailureKind.accountAccess);
        return;
      case CustomerAuthLoadFailureKind.callableAccess:
        _setTransientFailure(CustomerAuthenticationFailureKind.callableAccess);
        return;
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

      case CustomerAuthLoadFailureKind.blocked:
      case CustomerAuthLoadFailureKind.unsupportedRole:
      case CustomerAuthLoadFailureKind.authorization:
        _setState(
          CustomerAuthenticationState(
            gate: AuthenticationGateResult(switch (kind) {
              CustomerAuthLoadFailureKind.blocked =>
                AuthenticationGateKind.blocked,
              CustomerAuthLoadFailureKind.unsupportedRole =>
                AuthenticationGateKind.forbiddenRole,
              _ => AuthenticationGateKind.invalidAccountState,
            }),
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
    if (_preserveTerminalState || _disposed) {
      return;
    }

    _preserveTerminalState = true;
    _identityGeneration++;

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
