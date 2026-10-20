import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/widgets.dart';
import '../../../shared/models/customer_event_list.dart';
import 'event_list_controller.dart';
import 'event_list_scope.dart';

class CustomerEventListScreen extends StatefulWidget {
  const CustomerEventListScreen({super.key});
  @override
  State<CustomerEventListScreen> createState() =>
      _CustomerEventListScreenState();
}

class _CustomerEventListScreenState extends State<CustomerEventListScreen> {
  bool _busy = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        _run(() => EventListScope.of(context).load(), feedback: false);
      }
    });
  }

  Future<void> _run(
    Future<EventListResult> Function() action, {
    bool feedback = true,
    EventListAuthSession? expectedSession,
  }) async {
    if (_busy ||
        (expectedSession != null &&
            expectedSession !=
                EventListScope.of(context).authentication.session)) {
      return;
    }
    setState(() => _busy = true);
    final result = await action();
    if (!mounted) return;
    setState(() => _busy = false);
    if (feedback && result != EventListResult.unauthorized) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(eventListMessage(result))));
    }
  }

  Future<void> _clear(
    EventListController controller,
    EventListAuthSession session,
  ) async {
    if (session != controller.authentication.session) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clear Event List?'),
        content: const Text(
          'Remove all saved package selections from this customer’s Event List? Your event drafts and bookings will be kept.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm Clear List'),
          ),
        ],
      ),
    );
    if (!mounted ||
        confirmed != true ||
        session != controller.authentication.session) {
      return;
    }
    await _run(controller.clear);
  }

  @override
  Widget build(BuildContext context) {
    final controller = EventListScope.of(context);
    final session = controller.authentication.session;
    final authorized = session.customerUid != null;
    final list = controller.list;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(title: const Text('My Event List')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text(
              'Save packages while preparing your event. This is a planning list, not a reservation. Prices are estimates; availability is not guaranteed.',
            ),
            const SizedBox(height: 16),
            if (!authorized)
              const Text(
                'Log in with an authorized customer account to view your Event List.',
              )
            else ...[
              if (_busy)
                const LinearProgressIndicator(
                  semanticsLabel: 'Updating Event List',
                ),
              if (controller.error != null) ...[
                const Text(
                  'Your Event List could not be verified in secure storage. Previously verified selections, if shown, may be out of date.',
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => _run(controller.load, feedback: false),
                  child: const Text('Retry'),
                ),
              ],
              if (list == null && controller.error == null)
                const Center(
                  child: CircularProgressIndicator(
                    semanticsLabel: 'Loading Event List',
                  ),
                ),
              if (list != null) ...[
                Text('${list.entries.length} saved packages'),
                if (list.entries.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 32),
                    child: Text(
                      'Your Event List is empty. Save a package to start planning.',
                    ),
                  ),
                for (final entry in list.entries)
                  _card(entry, controller, session),
                if (list.entries.isNotEmpty)
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => _clear(controller, session),
                    icon: const Icon(
                      Icons.delete_sweep_outlined,
                      color: AppColors.mainText,
                    ),
                    label: const Text('Clear List'),
                  ),
              ],
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () =>
                  Navigator.of(context).popUntil((route) => route.isFirst),
              child: const Text('Continue Browsing'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _card(
    CustomerEventListEntry entry,
    EventListController controller,
    EventListAuthSession session,
  ) => Card(
    margin: const EdgeInsets.symmetric(vertical: 8),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FeastaImage.network(
            imageUrl: entry.imageUrl,
            description: '${entry.packageName} package cover',
            height: 140,
            width: double.infinity,
          ),
          const SizedBox(height: 12),
          const Icon(Icons.storefront_outlined, color: AppColors.mainText),
          Text(entry.providerName),
          Text(
            entry.packageName,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          if (entry.estimatedPrice != null)
            FeastaPriceText(
              amount: entry.estimatedPrice!,
              semanticLabel:
                  'Estimated price: ${FeastaPriceFormatter.format(entry.estimatedPrice!, symbol: '')} Philippine pesos.',
            ),
          Text(
            entry.estimatedPrice == null
                ? 'Estimate unavailable'
                : 'Estimated price · PHP',
          ),
          TextButton.icon(
            onPressed: _busy
                ? null
                : () => _run(
                    () => controller.removePackage(entry.identity),
                    expectedSession: session,
                  ),
            icon: const Icon(
              Icons.remove_circle_outline,
              color: AppColors.mainText,
            ),
            label: Text('Remove ${entry.packageName}'),
          ),
        ],
      ),
    ),
  );
}
