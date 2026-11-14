import 'package:flutter/material.dart';

import 'event_list_controller.dart';
import 'event_list_configuration_summary.dart';
import 'guest_configuration_edit.dart';
import 'event_list_navigation.dart';
import 'event_list_scope.dart';

/// Device-local planning preview; never an authenticated booking review.
class GuestEventListPanel extends StatelessWidget {
  const GuestEventListPanel({
    required this.controller,
    required this.session,
    super.key,
  });

  final EventListController controller;
  final EventListAuthSession session;

  bool get _allowed =>
      controller.isGuestPlanning &&
      controller.authentication.session == session;

  Future<void> _confirmClearAll(BuildContext context) async {
    if (!_allowed || controller.list?.entries.isEmpty != false) {
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Clear your Event List?'),
        content: const Text(
          'This removes all saved packages from your Event List. '
          'You can add them again while browsing.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Clear All'),
          ),
        ],
      ),
    );

    if (!context.mounted || !_allowed || confirmed != true) {
      return;
    }

    final result = await controller.clear();

    if (!context.mounted || !_allowed) {
      return;
    }

    if (result != EventListResult.saved) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(eventListMessage(result))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;

    return SafeArea(
      child: FractionallySizedBox(
        heightFactor: 0.82,
        child: AnimatedBuilder(
          animation: Listenable.merge([controller, controller.authentication]),
          builder: (context, _) {
            if (!_allowed) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'Your account session changed. Close this panel to continue.',
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }

            final list = controller.list;

            if (list == null) {
              return const Center(child: CircularProgressIndicator());
            }

            final entries = list.entries;
            final count = entries.length;
            final pricedCount = entries
                .where((entry) => entry.estimatedPrice != null)
                .length;

            final total = entries.fold<double>(
              0,
              (sum, entry) => sum + (entry.estimatedPrice ?? 0),
            );

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 12, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Your selections',
                              style: theme.textTheme.labelMedium?.copyWith(
                                color: colors.primary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Your Event List',
                              style: theme.textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '$count ${count == 1 ? 'package' : 'packages'} saved',
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close Event List',
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close_rounded),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 12, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Items saved for your event',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: colors.onSurfaceVariant,
                          ),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: entries.isEmpty
                            ? null
                            : () => _confirmClearAll(context),
                        icon: const Icon(
                          Icons.delete_outline_rounded,
                          size: 18,
                        ),
                        label: const Text('Clear All'),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: entries.isEmpty
                      ? ListView(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 24,
                            vertical: 12,
                          ),
                          children: [
                            Center(
                              child: Icon(
                                Icons.event_note_outlined,
                                size: 46,
                                color: colors.primary,
                              ),
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'Your Event List is empty.',
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Browse packages and add selections to plan your event.',
                              textAlign: TextAlign.center,
                            ),
                          ],
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                          itemCount: entries.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 10),
                          itemBuilder: (context, index) {
                            final entry = entries[index];

                            return Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: colors.surface,
                                border: Border.all(
                                  color: colors.outlineVariant,
                                ),
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: SizedBox(
                                      width: 72,
                                      height: 72,
                                      child: entry.imageUrl == null
                                          ? ColoredBox(
                                              color: colors
                                                  .surfaceContainerHighest,
                                              child: const Icon(
                                                Icons.image_outlined,
                                              ),
                                            )
                                          : Image.network(
                                              entry.imageUrl!,
                                              fit: BoxFit.cover,
                                              errorBuilder: (_, _, _) =>
                                                  ColoredBox(
                                                    color: colors
                                                        .surfaceContainerHighest,
                                                    child: const Icon(
                                                      Icons.image_outlined,
                                                    ),
                                                  ),
                                            ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          entry.packageName,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: theme.textTheme.titleSmall
                                              ?.copyWith(
                                                fontWeight: FontWeight.w700,
                                              ),
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          entry.providerName,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: theme.textTheme.bodySmall,
                                        ),
                                        const SizedBox(height: 8),
                                        EventListConfigurationSummary(
                                          key: ValueKey(
                                            'summary-${entry.identity.key}',
                                          ),
                                          entry: entry,
                                        ),
                                        GuestConfigurationEdit(
                                          key: ValueKey(
                                            'edit-${entry.identity.key}',
                                          ),
                                          entry: entry,
                                          controller: controller,
                                        ),
                                        Text(
                                          entry.estimatedPrice == null
                                              ? 'Price not available'
                                              : '₱${entry.estimatedPrice!.toStringAsFixed(2)}',
                                          style: theme.textTheme.titleSmall
                                              ?.copyWith(
                                                color: colors.primary,
                                                fontWeight: FontWeight.w700,
                                              ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    tooltip: 'Remove ${entry.packageName}',
                                    icon: const Icon(Icons.close_rounded),
                                    onPressed: () async {
                                      if (!_allowed) return;

                                      final result = await controller
                                          .removePackage(entry.identity);

                                      if (!context.mounted || !_allowed) {
                                        return;
                                      }

                                      if (result != EventListResult.saved) {
                                        ScaffoldMessenger.of(
                                          context,
                                        ).showSnackBar(
                                          SnackBar(
                                            content: Text(
                                              eventListMessage(result),
                                            ),
                                          ),
                                        );
                                      }
                                    },
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                ),
                const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              pricedCount == count
                                  ? 'Estimated event total'
                                  : 'Known event total',
                              style: theme.textTheme.bodyMedium,
                            ),
                          ),
                          Text(
                            pricedCount == 0
                                ? 'Not available'
                                : '₱${total.toStringAsFixed(2)}',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: colors.primary,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Planning estimates only. Prices and availability are confirmed during booking.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: colors.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: entries.isEmpty
                            ? null
                            : () async {
                                if (!_allowed) return;
                                await openCustomerEventList(context);
                              },
                        icon: const Icon(Icons.arrow_forward_rounded),
                        label: const Text('Review List'),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton.icon(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.add_rounded),
                        label: const Text('Browse More'),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Saved on this device. Sign in to review your full Event List.',
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
