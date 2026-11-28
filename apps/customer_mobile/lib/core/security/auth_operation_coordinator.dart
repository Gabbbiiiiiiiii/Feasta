import 'dart:async';
import 'customer_session_coordinator.dart';

/// Serializes FEASTA-controlled Auth operations across repository instances.
/// Entry points acquire this queue once; internal helpers must not reacquire it.
/// This does not lock external/native SDK events, which still require UID checks.
class AuthOperationCoordinator {
  AuthOperationCoordinator({CustomerSessionCoordinator? sessions})
    : sessions = sessions ?? CustomerSessionCoordinator.shared;
  final CustomerSessionCoordinator sessions;
  static final shared = AuthOperationCoordinator();
  Future<void> _tail = Future<void>.value();
  int _epoch = 0;
  int get epoch => _epoch;

  void noteTransition() {
    _epoch++;
  }

  Future<T> transition<T>(Future<T> Function() operation) => protectSession(
    () => run(() async {
      noteTransition();
      return await operation();
    }),
  );

  /// Closes Event List authorization synchronously, before queue acquisition.
  /// Does not acquire the queue or alter the existing recovery/consent epoch.
  /// Also wraps session-changing helpers already executing inside the queue.
  Future<T> protectSession<T>(Future<T> Function() operation) {
    final ticket = sessions.beginTransition();
    return (() async {
      try {
        return await operation();
      } finally {
        sessions.finishTransition(ticket);
      }
    })();
  }

  Future<T> run<T>(Future<T> Function() operation) {
    final previous = _tail;
    final released = Completer<void>();
    _tail = released.future;
    return (() async {
      await previous;
      try {
        return await operation();
      } finally {
        released.complete();
      }
    })();
  }
}
