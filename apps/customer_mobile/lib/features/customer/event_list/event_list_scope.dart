import 'dart:async';
import 'package:flutter/material.dart';
import 'event_list_controller.dart';
import 'event_list_store.dart';

/// One app-owned controller above the Navigator, shared by all customer routes.
class EventListScope extends StatefulWidget {
  const EventListScope({required this.child, this.controller, super.key});
  final Widget child;
  final EventListController? controller;
  static EventListController? maybeOf(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<_EventListInherited>()
      ?.notifier;
  static EventListController of(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<_EventListInherited>()!
      .notifier!;
  @override
  State<EventListScope> createState() => _EventListScopeState();
}

class _EventListScopeState extends State<EventListScope> {
  late final EventListController controller;
  EventListAuthSession? _loadedSession;
  @override
  void initState() {
    super.initState();
    controller =
        widget.controller ?? EventListController(store: EventListStore());
    controller.authentication.addListener(_changed);
    _changed();
  }

  void _changed() {
    final session = controller.authentication.session;
    if (session == _loadedSession) return;
    _loadedSession = session;
    if (session.customerUid != null) unawaited(controller.load());
  }

  @override
  void dispose() {
    controller.authentication.removeListener(_changed);
    if (widget.controller == null) controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _EventListInherited(notifier: controller, child: widget.child);
}

class _EventListInherited extends InheritedNotifier<EventListController> {
  const _EventListInherited({required super.notifier, required super.child});
}

String eventListMessage(EventListResult result) => switch (result) {
  EventListResult.saved => 'Event List saved.',
  EventListResult.loaded => 'Event List loaded.',
  EventListResult.capacity =>
    'Your Event List is full (24 packages). Remove a package to add another.',
  EventListResult.unauthorized =>
    'Your customer session changed. Please log in again.',
  EventListResult.persistenceError =>
    'Could not verify your Event List in secure storage. Please retry.',
};
