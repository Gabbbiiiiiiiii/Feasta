import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../shared/models/feasta_models.dart';

class CustomerBookingsPage {
  const CustomerBookingsPage(this.bookings, this.cursor, this.hasMore);
  final List<BookingModel> bookings;
  final Object? cursor;
  final bool hasMore;
}

abstract interface class CustomerBookingsSource {
  String? get currentUid;
  Stream<String?> get accounts;
  Stream<CustomerBookingsPage> watch(String uid, Object? cursor);
}

/// Every loaded page is live. A page emission invalidates all its descendants,
/// including in-flight requests, because their cursors may no longer be valid.
class CustomerBookingsController extends ChangeNotifier {
  CustomerBookingsController(this.source) {
    _reset();
    _account = source.accounts.listen((_) {
      // Auth emits the current identity on subscription as well as on changes.
      if (!_disposed && _uid != source.currentUid) _reset();
    });
  }
  final CustomerBookingsSource source;
  late final StreamSubscription<String?> _account;
  final _subscriptions = <StreamSubscription<CustomerBookingsPage>>[];
  final _pages = <CustomerBookingsPage>[];
  final _tokens = <Object>[];
  final _waiters = <Completer<void>>[];
  bool _disposed = false;
  String? _uid;
  bool loading = false;
  Object? error;
  bool historyUpdated = false;
  bool get hasMore => _pages.isNotEmpty && _pages.last.hasMore;
  bool get signedIn => _uid != null;
  List<BookingModel> get bookings {
    if (_uid != source.currentUid) return const [];
    final seen = <String>{};
    return _pages
        .expand((p) => p.bookings)
        .where((b) => seen.add(b.id))
        .toList();
  }

  void _truncate(int index) {
    while (_subscriptions.length > index) {
      unawaited(_subscriptions.removeLast().cancel());
      _tokens.removeLast();
      final waiter = _waiters.removeLast();
      if (!waiter.isCompleted) waiter.complete();
    }
    if (_pages.length > index) _pages.removeRange(index, _pages.length);
  }

  Future<void> refresh() => _reset();
  Future<void> _reset() {
    _truncate(0);
    _uid = source.currentUid;
    error = null;
    historyUpdated = false;
    loading = false;
    if (_disposed) return Future.value();
    if (_uid == null) {
      notifyListeners();
      return Future.value();
    }
    return _listen();
  }

  Future<void> loadMore() {
    if (_disposed || loading || !hasMore) return Future.value();
    return _listen();
  }

  Future<void> _listen() {
    final uid = _uid;
    if (uid == null || uid != source.currentUid) return _reset();
    final index = _pages.length;
    final token = Object();
    final done = Completer<void>();
    _tokens.add(token);
    _waiters.add(done);
    loading = true;
    error = null;
    notifyListeners();
    bool valid() =>
        !_disposed &&
        uid == source.currentUid &&
        uid == _uid &&
        index < _tokens.length &&
        _tokens[index] == token;
    void fail(Object failure) {
      if (!valid()) return;
      _truncate(index);
      loading = false;
      error = failure;
      if (!done.isCompleted) done.complete();
      notifyListeners();
    }

    // A cache-only/offline listener may otherwise never finish its first load.
    final deadline = Timer(const Duration(seconds: 30), () {
      fail(TimeoutException('Bookings could not be refreshed. Please retry.'));
    });
    unawaited(done.future.then((_) => deadline.cancel()));
    final subscription = source
        .watch(uid, index == 0 ? null : _pages.last.cursor)
        .listen((page) {
          if (!valid()) return;
          if (page.bookings.any((b) => b.customerId != uid)) {
            fail(StateError('Booking ownership mismatch'));
            return;
          }
          if (_tokens.length > index + 1) historyUpdated = true;
          _truncate(index + 1);
          if (_pages.length == index) {
            _pages.add(page);
          } else {
            _pages[index] = page;
          }
          loading = false;
          error = null;
          if (!done.isCompleted) done.complete();
          notifyListeners();
        }, onError: fail);
    _subscriptions.add(subscription);
    return done.future;
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_account.cancel());
    _truncate(0);
    super.dispose();
  }
}
