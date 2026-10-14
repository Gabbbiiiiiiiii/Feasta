import 'dart:async';

/// Serializes FEASTA-controlled Auth operations across repository instances.
/// Entry points acquire this queue once; internal helpers must not reacquire it.
/// This does not lock external/native SDK events, which still require UID checks.
class AuthOperationCoordinator {
  static final shared = AuthOperationCoordinator();
  Future<void> _tail = Future<void>.value();
  int _epoch = 0;
  int get epoch => _epoch;

  void noteTransition() {
    _epoch++;
  }

  Future<T> transition<T>(Future<T> Function() operation) => run(() async {
    noteTransition();
    return await operation();
  });

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
