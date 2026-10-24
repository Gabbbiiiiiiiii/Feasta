import 'dart:async';
import 'package:flutter/material.dart';

/// One entry lifetime; closing is irreversible even for a later same-UID login.
class CustomizationSession extends ChangeNotifier {
  CustomizationSession({
    required this.uid,
    required this.generation,
    required this.changes,
    required this.isCurrent,
  }) {
    changes.addListener(_changed);
  }
  final String uid;
  final int generation;
  final Listenable changes;
  final bool Function() isCurrent;
  bool _closed = false, _disposed = false;
  bool get authorized {
    if (!_closed && !isCurrent()) _closed = true;
    return !_closed;
  }

  void _changed() {
    if (!_disposed && !authorized) notifyListeners();
  }

  void close() {
    if (_closed) return;
    _closed = true;
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    close();
    _disposed = true;
    changes.removeListener(_changed);
    super.dispose();
  }
}

/// Conceals and unmounts the entire private subtree, including its semantics.
/// It observes the original binding; a later authorization cannot reopen it.
class CustomizationSessionBoundary extends StatefulWidget {
  const CustomizationSessionBoundary({
    required this.session,
    required this.builder,
    super.key,
  });
  final CustomizationSession? session;
  final WidgetBuilder builder;

  @override
  State<CustomizationSessionBoundary> createState() =>
      _CustomizationSessionBoundaryState();
}

class _CustomizationSessionBoundaryState
    extends State<CustomizationSessionBoundary> {
  late final _session = widget.session;
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    _session?.addListener(_changed);
  }

  void _changed() {
    if (!(_session?.authorized ?? true)) {
      _closed = true;
      // A parent may revoke access during framework tree finalization.
      scheduleMicrotask(() {
        if (mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _session?.removeListener(_changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_closed || !(_session?.authorized ?? true)) {
      _closed = true;
      return Scaffold(
        appBar: AppBar(title: const Text('Session closed')),
        body: const Center(
          child: Text('Please sign in again to continue preparing your event.'),
        ),
      );
    }
    return widget.builder(context);
  }
}

/// Used for nested routes whose existing screens need no session-specific API.
/// Invalid pickers cannot return their old data, even through retained callbacks.
class CustomizationSessionRoute<T> extends MaterialPageRoute<T> {
  CustomizationSessionRoute({
    required this.session,
    required WidgetBuilder builder,
  }) : super(
         builder: (context) =>
             CustomizationSessionBoundary(session: session, builder: builder),
       );
  final CustomizationSession? session;

  @override
  bool didPop(T? result) =>
      super.didPop((session?.authorized ?? true) ? result : null);
}
