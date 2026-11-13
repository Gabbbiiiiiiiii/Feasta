import 'dart:async';
import 'package:flutter/material.dart';
import 'event_list_controller.dart';
import 'event_list_store.dart';

/// One app-owned controller above the Navigator, shared by all customer routes.
class EventListScope extends StatefulWidget {
  const EventListScope({
    required this.child,
    this.controller,
    this.navigatorKey,
    super.key,
  });
  final Widget child;
  final EventListController? controller;
  final GlobalKey<NavigatorState>? navigatorKey;
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
  bool? _loadedGuestAllowed;
  EventListAuthSession? _consideredTransferSession;
  EventListAuthSession? _activePromptSession;
  DialogRoute<bool>? _activePromptRoute;
  final Set<String> _dismissedTransferUids = {};
  @override
  void initState() {
    super.initState();
    controller =
        widget.controller ?? EventListController(store: EventListStore());
    controller.authentication.addListener(_changed);
    _changed();
  }

  @override
  void didUpdateWidget(covariant EventListScope oldWidget) {
    super.didUpdateWidget(oldWidget);

    // The MaterialApp Navigator can become available after authorization.
    // Reconsider the pending transfer after the updated child is mounted.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _changed();
    });
  }

  bool _isCurrentCustomer(EventListAuthSession session) =>
      mounted &&
      session.customerUid != null &&
      controller.authentication.session == session;

  void _changed() {
    final session = controller.authentication.session;

    if (_activePromptSession != null && session != _activePromptSession) {
      final route = _activePromptRoute;
      _activePromptRoute = null;
      _activePromptSession = null;

      if (route?.navigator != null) {
        route!.navigator!.removeRoute(route);
      }
    }

    final guestAllowed = controller.isGuestPlanning;

    if (session != _loadedSession || guestAllowed != _loadedGuestAllowed) {
      _loadedSession = session;
      _loadedGuestAllowed = guestAllowed;

      if (session.customerUid != null || guestAllowed) {
        unawaited(_restore(session));
      }
    }

    final uid = session.customerUid;

    if (widget.navigatorKey != null &&
        uid != null &&
        !_dismissedTransferUids.contains(uid) &&
        session != _consideredTransferSession) {
      _consideredTransferSession = session;

      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_isCurrentCustomer(session)) {
          unawaited(_offerTransfer(session));
        }
      });
    }
  }

  Future<void> _restore(EventListAuthSession session) async {
    final result = await controller.load();
    // One completion-driven retry, only for a failed customer startup read.
    // Empty records, guests and stale authorization never trigger recovery.
    if (result == EventListResult.persistenceError &&
        _isCurrentCustomer(session) &&
        controller.list == null &&
        controller.error != null) {
      await controller.load();
    }
  }

  Future<void> _offerTransfer(EventListAuthSession session) async {
    if (!_isCurrentCustomer(session)) return;

    void authorize() {
      if (!_isCurrentCustomer(session)) {
        throw StateError('Customer session changed.');
      }
    }

    try {
      final guest = await controller.store.guestRead(authorize: authorize);
      authorize();

      if (guest.entries.isEmpty) return;

      final navigator = widget.navigatorKey?.currentState;

      if (navigator == null || !navigator.mounted) {
        // Nothing was shown. Do not permanently mark this session
        // as having received its transfer opportunity.
        if (_consideredTransferSession == session) {
          _consideredTransferSession = null;
        }
        return;
      }

      final route = DialogRoute<bool>(
        context: navigator.context,
        barrierDismissible: false,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Add saved packages to your account?'),
          content: Text(
            'You have ${guest.entries.length} package(s) saved while '
            'browsing as a guest. Add them to your account Event List? '
            'Existing packages will be preserved.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Not Now'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Add to My Account'),
            ),
          ],
        ),
      );

      _activePromptSession = session;
      _activePromptRoute = route;

      final accepted = await navigator.push<bool>(route);

      if (identical(_activePromptRoute, route)) {
        _activePromptRoute = null;
        _activePromptSession = null;
      }

      if (!_isCurrentCustomer(session)) return;

      if (accepted != true) {
        if (accepted == false) {
          _dismissedTransferUids.add(session.customerUid!);
        }
        return;
      }

      final result = await controller.transferGuestToCustomer();

      if (!_isCurrentCustomer(session)) return;

      if (result != EventListResult.saved) {
        final context = navigator.context;
        if (context.mounted) {
          ScaffoldMessenger.maybeOf(
            context,
          )?.showSnackBar(SnackBar(content: Text(eventListMessage(result))));
        }
      }
    } catch (_) {
      // Guest storage failure or a changed session must never trigger
      // automatic transfer or deletion of the guest list.
    }
  }

  @override
  void dispose() {
    final route = _activePromptRoute;
    _activePromptRoute = null;
    _activePromptSession = null;
    if (route?.navigator != null) {
      route!.navigator!.removeRoute(route);
    }
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
