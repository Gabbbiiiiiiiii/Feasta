import 'dart:async';
import 'dart:collection';
import 'package:flutter/foundation.dart';
import '../../../shared/models/customer_event_list.dart';
import 'event_list_catalog.dart';
import 'event_list_controller.dart';
import 'event_list_review_models.dart';

class _ReviewJob {
  _ReviewJob(
    this.entry,
    this.session,
    this.list,
    this.generation,
    this.request,
  );
  final CustomerEventListEntry entry;
  final EventListAuthSession session;
  final CustomerEventList list;
  final int generation;
  final int request;
  final done = Completer<void>();
}

/// In-memory review. Pending old requests retain their worker slots until they
/// finish: superseding a pass never creates more than four active lookups.
class EventListReviewController extends ChangeNotifier {
  EventListReviewController({
    required this.controller,
    EventListCatalog? catalog,
  }) : catalog = catalog ?? EventListCatalog() {
    controller.addListener(_sync);
    controller.authentication.addListener(_sync);
    scheduleMicrotask(_sync);
  }
  final EventListController controller;
  final EventListCatalog catalog;
  final _queue = Queue<_ReviewJob>();
  final _results = <String, EventListCatalogResult>{};
  final _requests = <String, int>{};
  EventListAuthSession? _session;
  CustomerEventList? _list;
  int _generation = 0, _active = 0;
  int _nextRequest = 0;
  bool _disposed = false, _suspended = false;

  bool get _current =>
      !_disposed &&
      !_suspended &&
      _list != null &&
      _session?.customerUid != null &&
      _session == controller.authentication.session &&
      controller.list?.revision == _list?.revision &&
      controller.list?.ownerUid == _list?.ownerUid;

  EventListCatalogResult resultFor(CustomerEventListEntry entry) => _current
      ? _results[entry.identity.key] ??
            const EventListCatalogResult(EventListCatalogStatus.notChecked)
      : const EventListCatalogResult(EventListCatalogStatus.notChecked);

  void _invalidate() {
    _generation++;
    _results.clear();
    _requests.clear();
    while (_queue.isNotEmpty) {
      _queue.removeFirst().done.complete();
    }
  }

  void _sync() {
    if (_disposed) return;
    final session = controller.authentication.session;
    final list = controller.list;
    if (session == _session &&
        list?.revision == _list?.revision &&
        list?.ownerUid == _list?.ownerUid) {
      return;
    }
    _invalidate();
    _session = session;
    _list = list;
    notifyListeners();
    if (_current) unawaited(refresh());
  }

  Future<void> refresh({EventListIdentity? only}) async {
    if (!_current) return;
    final list = controller.list!;
    final session = controller.authentication.session;
    // Full passes supersede all work. Targeted retries supersede only that
    // composite identity, preserving other packages' results and queued work.
    if (only == null) {
      _invalidate();
    } else {
      _results.remove(only.key);
      final superseded = _queue
          .where((job) => job.entry.identity.key == only.key)
          .toList();
      _queue.removeWhere((job) => job.entry.identity.key == only.key);
      for (final job in superseded) {
        job.done.complete();
      }
    }
    final jobs = [
      for (final entry in list.entries)
        if (only == null || entry.identity.key == only.key)
          _ReviewJob(
            entry,
            session,
            list,
            _generation,
            _requests[entry.identity.key] = ++_nextRequest,
          ),
    ];
    _queue.addAll(jobs);
    notifyListeners();
    _pump();
    await Future.wait(jobs.map((job) => job.done.future));
  }

  bool _accept(_ReviewJob job) =>
      _current &&
      job.session == controller.authentication.session &&
      job.generation == _generation &&
      _requests[job.entry.identity.key] == job.request &&
      job.list.revision == controller.list?.revision &&
      controller.list!.entries.any(
        (entry) => entry.identity.key == job.entry.identity.key,
      );

  void _pump() {
    while (!_disposed && _active < 4 && _queue.isNotEmpty) {
      final job = _queue.removeFirst();
      if (!_accept(job)) {
        job.done.complete();
        continue;
      }
      _active++;
      _results[job.entry.identity.key] = const EventListCatalogResult(
        EventListCatalogStatus.checking,
      );
      notifyListeners();
      unawaited(_run(job));
    }
  }

  Future<void> _run(_ReviewJob job) async {
    try {
      if (!_accept(job)) return;
      final result = await catalog.check(job.entry);
      if (!_accept(job)) return;
      _results[job.entry.identity.key] = result;
      notifyListeners();
    } finally {
      _active--;
      job.done.complete();
      _pump();
    }
  }

  void suspend() {
    if (_disposed || _suspended) return;
    _suspended = true;
    _invalidate();
    notifyListeners();
  }

  void resume() {
    if (_disposed || !_suspended) return;
    _suspended = false;
    final generation = _generation;
    _sync();
    if (_current && generation == _generation) unawaited(refresh());
  }

  @override
  void dispose() {
    _disposed = true;
    _invalidate();
    controller.removeListener(_sync);
    controller.authentication.removeListener(_sync);
    super.dispose();
  }
}
