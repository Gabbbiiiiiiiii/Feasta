import 'package:flutter/foundation.dart';
import 'package:firebase_auth/firebase_auth.dart';
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

  // A null customer UID alone never authorizes guest storage.
  // Test and non-customer adapters remain denied unless explicitly opted in.
  bool get guestPlanningAllowed => false;
}

class CustomerSessionEventListAuthentication extends EventListAuthentication {
  CustomerSessionEventListAuthentication(this.coordinator) {
    coordinator.addListener(_changed);
  }
  final CustomerSessionCoordinator coordinator;
  bool _disposed = false;

  @override
  bool get guestPlanningAllowed {
    if (_disposed) return false;

    final snapshot = coordinator.readSnapshot();

    // Restoring/validating/ready/transitioning states are not guests.
    // The Firebase SDK signed-out check is enforced separately.
    return snapshot.sdkUid == null &&
        snapshot.customerUid == null &&
        snapshot.phase == CustomerAuthorizationPhase.closed;
  }

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

bool _defaultSignedOutGuest() {
  try {
    return FirebaseAuth.instance.currentUser == null;
  } catch (_) {
    // Never interpret an unavailable Auth SDK as a guest session.
    return false;
  }
}

enum EventListResult { saved, loaded, capacity, unauthorized, persistenceError }

enum EventListRestorationState {
  unauthorized,
  idle,
  loading,
  failed,
  empty,
  ready,
}

class EventListController extends ChangeNotifier {
  EventListController({
    required this.store,
    EventListAuthentication? authentication,
    bool Function()? signedOutGuest,
  }) : signedOutGuest = signedOutGuest ?? _defaultSignedOutGuest,
       authentication =
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
  final bool Function() signedOutGuest;

  bool get isGuestPlanning =>
      _ownsState &&
      authentication.session.customerUid == null &&
      authentication.guestPlanningAllowed &&
      signedOutGuest();
  final bool _ownsAuthentication;
  CustomerEventList? _list;
  // All account-scoped getters must use this live check, including future
  // derived selections/counts. Previously returned immutable snapshots cannot
  // be revoked, but the controller never exposes them to a different session.
  bool get _ownsState => !_disposed && _session == authentication.session;
  CustomerEventList? get list =>
      _ownsState && (_session?.customerUid != null || isGuestPlanning)
      ? _list
      : null;
  Object? _error;
  Object? get error => _ownsState ? _error : null;
  int _pendingLoads = 0;
  EventListRestorationState get restorationState {
    if (!_ownsState || (_session?.customerUid == null && !isGuestPlanning)) {
      return EventListRestorationState.unauthorized;
    }
    if (_pendingLoads > 0) return EventListRestorationState.loading;
    if (_error != null) return EventListRestorationState.failed;
    final restored = list;
    if (restored == null) return EventListRestorationState.idle;
    return restored.entries.isEmpty
        ? EventListRestorationState.empty
        : EventListRestorationState.ready;
  }

  bool _disposed = false;
  int _epoch = 0;
  EventListAuthSession? _session;
  void _accountChanged() {
    if (_disposed) return;
    final next = authentication.session;
    if (next == _session) return;
    _epoch++;
    _pendingLoads = 0;
    _session = next;
    _list = null;
    _error = null;
    notifyListeners();
  }

  Future<EventListResult> _run(
    Future<CustomerEventList> Function(
      String? uid,
      bool guest,
      void Function() authorize,
    )
    action,
    EventListResult success, {
    bool Function()? isCurrent,
  }) async {
    if (_disposed) return EventListResult.unauthorized;
    _accountChanged();
    final epoch = _epoch, session = _session!;
    final uid = session.customerUid;
    final guest =
        uid == null && authentication.guestPlanningAllowed && signedOutGuest();

    bool active() =>
        !_disposed &&
        (isCurrent?.call() ?? true) &&
        epoch == _epoch &&
        (uid != null ||
            (guest &&
                authentication.guestPlanningAllowed &&
                signedOutGuest())) &&
        session == authentication.session;
    void authorize() {
      if (!active()) throw StateError('Customer session changed.');
    }

    if (!active()) return EventListResult.unauthorized;
    try {
      final next = await action(uid, guest, authorize);
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

  Future<EventListResult> load() async {
    if (_disposed) return EventListResult.unauthorized;
    _accountChanged();
    final epoch = _epoch;
    _pendingLoads++;
    notifyListeners();
    try {
      return await _run(
        (uid, guest, guard) => guest
            ? store.guestRead(authorize: guard)
            : store.read(uid!, authorize: guard),
        EventListResult.loaded,
      );
    } finally {
      if (!_disposed && epoch == _epoch) {
        _pendingLoads--;
        notifyListeners();
      }
    }
  }

  Future<EventListResult> addPackage(
    CustomerEventListEntry entry, {
    bool Function()? isCurrent,
  }) => _run(
    (uid, guest, guard) {
      if (uid == null) throw StateError('An authorized customer is required.');
      return store.addPackage(uid, entry, authorize: guard);
    },
    EventListResult.saved,
    isCurrent: () =>
        authentication.session.customerUid != null &&
        (isCurrent?.call() ?? true),
  );
  Future<EventListResult> saveConfiguration(
    CustomerEventListEntry entry, {
    required int expectedRevision,
    EventListIdentity? editingIdentity,
    bool Function()? isCurrent,
  }) => _run(
    (uid, guest, guard) => store.saveConfiguration(
      uid!,
      entry,
      expectedRevision: expectedRevision,
      editingIdentity: editingIdentity,
      authorize: guard,
    ),
    EventListResult.saved,
    isCurrent: () =>
        authentication.session.customerUid != null &&
        (isCurrent?.call() ?? true),
  );
  Future<EventListResult> removePackage(EventListIdentity identity) => _run(
    (uid, guest, guard) => guest
        ? store.guestRemovePackage(identity, authorize: guard)
        : store.removePackage(uid!, identity, authorize: guard),
    EventListResult.saved,
  );
  Future<EventListResult> clear() => _run(
    (uid, guest, guard) => guest
        ? store.guestClear(authorize: guard)
        : store.clear(uid!, authorize: guard),
    EventListResult.saved,
  );

  /// Transfers device-local guest selections only to the current
  /// authorized customer session. Never use guest authorization here.
  Future<EventListResult> transferGuestToCustomer() {
    if (_disposed) {
      return Future.value(EventListResult.unauthorized);
    }

    _accountChanged();

    if (authentication.session.customerUid == null) {
      return Future.value(EventListResult.unauthorized);
    }

    return _run((uid, guest, guard) {
      if (guest || uid == null) {
        throw StateError('An authorized customer is required.');
      }

      return store.transferGuestToCustomer(uid, authorize: guard);
    }, EventListResult.saved);
  }

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
