import 'dart:async';
import 'package:flutter/material.dart';

import '../../features/authentication/application/customer_auth_scope.dart';
import '../../features/authentication/domain/auth_account_state.dart';
import 'customer_route_guard.dart';

/// A route-owned save barrier. Registration lasts through widget disposal.
class CustomerNavigationExitGuard {
  CustomerNavigationExitGuard({
    required this.route,
    required this.authorized,
    required this.canRemove,
    required this.prepare,
    required this.parentIsActive,
  }) {
    _owner._guards.add(this);
  }
  final ModalRoute<void> route;
  final bool Function() authorized;
  final bool Function() canRemove;
  final Future<bool> Function() prepare;
  final bool Function() parentIsActive;
  Future<bool> Function()? _retry;
  Object? _retryOwner;
  Future<bool> Function()? get retry => _retry;
  late final _CustomerRootNavigation _owner = _navigationFor(route.navigator!);

  void authorizationChanged() {
    if (!authorized() && (_owner._request?.guards.contains(this) ?? false)) {
      _owner._request?.cancel();
    }
  }

  void dispose() {
    if (_owner._request?.guards.contains(this) ?? false) {
      _owner._request?.cancel();
    }
    _retry = null;
    _retryOwner = null;
    _owner._guards.remove(this);
  }
}

final _navigators = Expando<_CustomerRootNavigation>();
_CustomerRootNavigation _navigationFor(NavigatorState navigator) =>
    _navigators[navigator] ??= _CustomerRootNavigation(navigator);

class _CustomerRootNavigation {
  _CustomerRootNavigation(this.navigator);
  final NavigatorState navigator;
  final _guards = <CustomerNavigationExitGuard>{};
  _CustomerRootReturn? _request;
}

// The predicate always returns true: this reads the top route without popping.
Route<dynamic>? _topRoute(NavigatorState navigator) {
  Route<dynamic>? top;
  navigator.popUntil((route) {
    top = route;
    return true;
  });
  return top;
}

/// Returns actual completion, not merely acceptance. The first pending request
/// owns the destination and callback, including across save-failure Retry.
Future<bool> returnToCustomerRoot(
  NavigatorState navigator, {
  VoidCallback? onReached,
}) {
  final owner = _navigationFor(navigator);
  // Security exits supersede an old authorized request without awaiting storage.
  if (owner._guards.any((g) => g.route.isActive && !g.authorized())) {
    owner._request?.cancel();
  }
  final request = owner._request ??= _CustomerRootReturn(owner, onReached);
  return request.run();
}

class _CustomerRootReturn {
  _CustomerRootReturn(this.owner, this.onReached)
    : guards = owner._guards.where((g) => g.route.isActive).toList(),
      top = owner.navigator.mounted ? _topRoute(owner.navigator) : null;
  final _CustomerRootNavigation owner;
  final VoidCallback? onReached;
  final List<CustomerNavigationExitGuard> guards;
  final Route<dynamic>? top;
  final _canceled = Completer<bool>();
  Future<bool>? _flight;
  bool get _valid =>
      !_canceled.isCompleted &&
      identical(owner._request, this) &&
      owner.navigator.mounted &&
      guards.every(
        (g) => g.route.isActive && (!g.authorized() || g.parentIsActive()),
      ) &&
      top != null &&
      top!.isActive &&
      identical(_topRoute(owner.navigator), top);

  void cancel() {
    if (!_canceled.isCompleted) _canceled.complete(false);
    for (final guard in guards) {
      if (identical(guard._retryOwner, this)) {
        guard._retry = null;
        guard._retryOwner = null;
      }
    }
    if (identical(owner._request, this)) owner._request = null;
  }

  Future<bool> run() => _flight ??= _run().whenComplete(() => _flight = null);

  Future<bool> _run() async {
    if (!_valid) {
      cancel();
      return false;
    }
    final authorizedGuards = guards.where((g) => g.authorized()).toList();
    for (final guard in authorizedGuards) {
      guard._retryOwner = this;
      guard._retry = run;
      final saved = await Future.any([guard.prepare(), _canceled.future]);
      if (!_valid || !guard.authorized()) {
        cancel();
        return false;
      }
      if (!saved) {
        return false; // Retain the original request for explicit Retry.
      }
    }
    if (!_valid ||
        authorizedGuards.any((g) => !g.authorized()) ||
        guards.any((g) => !g.canRemove())) {
      cancel();
      return false;
    }
    // All participating barriers are ready before any bulk removal. Check
    // progress after each pop so an unrelated route veto cannot spin either.
    final visited = <Route<dynamic>>{};
    while (owner.navigator.mounted) {
      if (_canceled.isCompleted ||
          !identical(owner._request, this) ||
          authorizedGuards.any((g) => !g.authorized())) {
        cancel();
        return false;
      }
      final route = _topRoute(owner.navigator);
      if (route == null) break;
      if (route.isFirst) {
        // Clear ownership before publishing the destination callback.
        cancel();
        onReached?.call();
        return true;
      }
      if (guards.any((g) => identical(g.route, route) && !g.canRemove())) {
        break;
      }
      if (!visited.add(route)) break;
      owner.navigator.pop();
    }
    cancel();
    return false;
  }
}

/// Authentication flows return to the persistent gate-owning root route.
/// They must never replace that route with a login or customer screen.
bool returnToCustomerAuthenticationGate(
  BuildContext context, {
  String? intendedLocation,
}) {
  final controller = CustomerAuthenticationScope.maybeOf(context);
  if (controller == null) return false;
  final generation = controller.consentGeneration;
  final uid = controller.currentIdentity?.uid;
  void reached() {
    if (generation != controller.consentGeneration ||
        uid != controller.currentIdentity?.uid) {
      return;
    }
    if (intendedLocation == null) return;
    // A protected destination already routes guests to login. Retain that
    // destination when returning from password recovery.
    final alreadyRequestsLogin =
        CustomerRouteGuard.resolve(
          gate: AuthenticationGateKind.unauthenticated,
          requestedLocation: controller.intendedLocation,
        ) ==
        CustomerAppLocations.login;
    if (intendedLocation != CustomerAppLocations.login ||
        !alreadyRequestsLogin) {
      controller.requestIntendedLocation(intendedLocation);
    }
  }

  // The bool means this helper handled the request; completion is coordinated
  // asynchronously. Existing fallback callers must not start another route.
  unawaited(
    returnToCustomerRoot(
      Navigator.of(context, rootNavigator: true),
      onReached: reached,
    ),
  );
  return true;
}
