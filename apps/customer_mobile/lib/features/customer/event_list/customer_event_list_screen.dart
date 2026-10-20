import 'package:flutter/material.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/widgets.dart';
import '../../../shared/models/customer_event_list.dart';
import 'event_list_controller.dart';
import 'event_list_scope.dart';
import 'event_list_catalog.dart';
import 'event_list_review_controller.dart';
import 'event_list_review_models.dart';

class CustomerEventListScreen extends StatefulWidget {
  const CustomerEventListScreen({this.catalog, super.key});
  final EventListCatalog? catalog;
  @override
  State<CustomerEventListScreen> createState() =>
      _CustomerEventListScreenState();
}

class _CustomerEventListScreenState extends State<CustomerEventListScreen>
    with WidgetsBindingObserver {
  bool _busy = false;
  EventListReviewController? _review;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final controller = EventListScope.of(context);
    if (_review?.controller == controller) return;
    _review?.removeListener(_reviewChanged);
    _review?.dispose();
    _review = EventListReviewController(
      controller: controller,
      catalog: widget.catalog,
    )..addListener(_reviewChanged);
  }

  void _reviewChanged() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _review?.resume();
    } else {
      _review?.suspend();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _review?.removeListener(_reviewChanged);
    _review?.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
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
    final session = EventListScope.of(context).authentication.session;
    final result = await action();
    if (!mounted) return;
    setState(() => _busy = false);
    if (feedback &&
        result != EventListResult.unauthorized &&
        session == EventListScope.of(context).authentication.session) {
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
                Text('${groupEventList(list).length} saved providers'),
                if (list.entries.isNotEmpty)
                  TextButton.icon(
                    onPressed: () {
                      if (session == controller.authentication.session) {
                        _review?.refresh();
                      }
                    },
                    icon: const Icon(Icons.refresh, color: AppColors.mainText),
                    label: const Text('Check latest details'),
                  ),
                if (list.entries.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 32),
                    child: Text(
                      'Your Event List is empty. Save a package to start planning.',
                    ),
                  ),
                for (final group in groupEventList(list)) ...[
                  Semantics(
                    header: true,
                    label:
                        '${group.providerName}, ${group.entries.length} saved packages',
                    excludeSemantics: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.storefront_outlined,
                          color: AppColors.mainText,
                        ),
                        Text(
                          group.providerName,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        Text(
                          '${group.entries.length} packages from this provider',
                        ),
                      ],
                    ),
                  ),
                  for (final entry in group.entries)
                    _card(entry, controller, session),
                ],
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
          Text(
            entry.packageName,
            style: Theme.of(context).textTheme.titleLarge,
          ),
          Semantics(
            liveRegion: true,
            child: Text(_review!.resultFor(entry).status.message),
          ),
          const Text('Saved estimate'),
          if (entry.estimatedPrice != null)
            FeastaPriceText(
              amount: entry.estimatedPrice!,
              semanticLabel:
                  'Saved estimate: ${FeastaPriceFormatter.format(entry.estimatedPrice!, symbol: '')} Philippine pesos.',
            ),
          if (entry.estimatedPrice == null) const Text('No saved estimate.'),
          if (_review!.resultFor(entry).latestPrice
              case final double price) ...[
            const Text('Latest listed estimate'),
            FeastaPriceText(
              amount: price,
              semanticLabel:
                  'Latest listed estimate: ${FeastaPriceFormatter.format(price, symbol: '')} Philippine pesos.',
            ),
          ],
          if (_review!.resultFor(entry).priceChanged(entry))
            const Text(
              'The listed price has changed since you saved this package. Final pricing and availability require confirmation.',
            ),
          if (_review!.resultFor(entry).status ==
              EventListCatalogStatus.couldNotVerify)
            TextButton(
              onPressed: () {
                if (session == controller.authentication.session) {
                  _review?.refresh(only: entry.identity);
                }
              },
              child: Text('Retry verification for ${entry.packageName}'),
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
