import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import 'event_list_scope.dart';

/// Shares the account-scoped controller used by the Event List screen.
class EventListCountBadge extends StatelessWidget {
  const EventListCountBadge({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final controller = EventListScope.maybeOf(context);
    if (controller == null) return child;
    return AnimatedBuilder(
      animation: Listenable.merge([controller, controller.authentication]),
      builder: (context, _) {
        final count = controller.authentication.session.customerUid != null
            ? controller.selectionCount
            : 0;
        return Badge(
          key: const ValueKey('event-list-count-badge'),
          isLabelVisible: count > 0,
          backgroundColor: AppColors.primary,
          label: Text(
            '$count',
            semanticsLabel: '$count saved Event List selections',
          ),
          child: child,
        );
      },
    );
  }
}
