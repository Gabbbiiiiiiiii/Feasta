import 'package:flutter/foundation.dart';
import '../../../core/security/customer_session_coordinator.dart';
import '../../../shared/models/customer_event_list.dart';
import 'event_list_store.dart';

/// SDK-visible customer authorization and FEASTA authorization generation.
/// Controlled boundaries (including same UID) invalidate before dispatch.
/// Unobserved native transitions are outside this scoped production contract.
@immutable
class EventListAuthSession {
  const EventListAuthSession({
    required this.customerUid,
    required this.generation,
  });
  final String? customerUid;
  final int generation;

  @override
  bool operator ==(Object other) =>
      other is EventListAuthSession &&
      customerUid == other.customerUid &&
      generation == other.generation;
  @override
  int get hashCode => Object.hash(customerUid, generation);
}

/// Implementations must expose live state before notifying listeners. Return a
/// null UID for unauthorized roles/gates; restoring authorization must use a new
/// generation. Never derive generation solely from delivered UID events.
///
/// Native changes become enforceable when SDK identity/observations reach Dart;
/// neither UID equality nor token refresh proves uninterrupted native identity.
abstract class EventListAuthentication extends ChangeNotifier {
  EventListAuthSession get session;
}

class CustomerSessionEventListAuthentication extends EventListAuthentication {
  CustomerSessionEventListAuthentication(this.coordinator) {
    coordinator.addListener(_changed);
  }
  final CustomerSessionCoordinator coordinator;
  bool _disposed = false;
  @override
  EventListAuthSession get session {
    final snapshot = coordinator.readSnapshot();
    return EventListAuthSession(
      customerUid: _disposed ? null : snapshot.customerUid,
      generation: snapshot.generation,
    );
  }

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    coordinator.removeListener(_changed);
    super.dispose();
  }
}

enum EventListResult { saved, loaded, capacity, unauthorized, persistenceError }

class EventListController extends ChangeNotifier {
  EventListController({
    required this.store,
    EventListAuthentication? authentication,
  }) : authentication =
           authentication ??
           CustomerSessionEventListAuthentication(
             CustomerSessionCoordinator.shared,
           ),
       _ownsAuthentication = authentication == null {
    this.authentication.addListener(_accountChanged);
    _accountChanged();
  }
  final EventListStore store;
  final EventListAuthentication authentication;
  final bool _ownsAuthentication;
  CustomerEventList? _list;
  // All account-scoped getters must use this live check, including future
  // derived selections/counts. Previously returned immutable snapshots cannot
  // be revoked, but the controller never exposes them to a different session.
  bool get _ownsState => !_disposed && _session == authentication.session;
  CustomerEventList? get list => _ownsState ? _list : null;
  Object? _error;
  Object? get error => _ownsState ? _error : null;
  bool _disposed = false;
  int _epoch = 0;
  EventListAuthSession? _session;
  void _accountChanged() {
    if (_disposed) return;
    final next = authentication.session;
    if (next == _session) return;
    _epoch++;
    _session = next;
    _list = null;
    _error = null;
    notifyListeners();
  }

  Future<EventListResult> _run(
    Future<CustomerEventList> Function(String uid, void Function() authorize)
    action,
    EventListResult success,
  ) async {
    if (_disposed) return EventListResult.unauthorized;
    _accountChanged();
    final epoch = _epoch, session = _session!;
    final uid = session.customerUid;
    bool active() =>
        !_disposed &&
        epoch == _epoch &&
        uid != null &&
        session == authentication.session;
    void authorize() {
      if (!active()) throw StateError('Customer session changed.');
    }

    if (!active()) return EventListResult.unauthorized;
    try {
      final next = await action(uid!, authorize);
      authorize();
      _list = next;
      _error = null;
      notifyListeners();
      return success;
    } catch (error) {
      if (!active()) return EventListResult.unauthorized;
      _error = error;
      // Keep the last verified state; failed writes are never published.
      notifyListeners();
      return error is EventListCapacityException
          ? EventListResult.capacity
          : EventListResult.persistenceError;
    }
  }

  Future<EventListResult> load() => _run(
    (uid, guard) => store.read(uid, authorize: guard),
    EventListResult.loaded,
  );
  Future<EventListResult> addPackage(CustomerEventListEntry entry) => _run(
    (uid, guard) => store.addPackage(uid, entry, authorize: guard),
    EventListResult.saved,
  );
  Future<EventListResult> removePackage(EventListIdentity identity) => _run(
    (uid, guard) => store.removePackage(uid, identity, authorize: guard),
    EventListResult.saved,
  );
  Future<EventListResult> clear() => _run(
    (uid, guard) => store.clear(uid, authorize: guard),
    EventListResult.saved,
  );
  @override
  void dispose() {
    _disposed = true;
    _epoch++;
    _list = null;
    _error = null;
    authentication.removeListener(_accountChanged);
    if (_ownsAuthentication) authentication.dispose();
    super.dispose();
  }
}
