import 'event_list_submission_contract.dart';
import 'event_list_submission_screen.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import '../../../app/router/customer_auth_navigation.dart';
import '../../../core/helpers/verification_guard.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/widgets.dart';
import '../../../shared/models/customer_event_list.dart';
import 'event_list_controller.dart';
import 'event_list_scope.dart';
import 'event_list_catalog.dart';
import 'event_list_review_controller.dart';
import 'event_list_review_models.dart';
import 'event_list_customization_controller.dart';
import 'event_list_configuration_summary.dart';
import '../event_customization_screen.dart';
import '../../authentication/data/repositories/feasta_repository.dart';

class CustomerEventListScreen extends StatefulWidget {
  const CustomerEventListScreen({
    this.catalog,
    this.repository,
    this.bookingEligibilityCheck,
    super.key,
  });

  final EventListCatalog? catalog;
  final FeastaRepository? repository;

  // Production always uses the real verification guard unless a caller
  // explicitly supplies a verifier (used by controlled widget tests).
  final Future<bool> Function(BuildContext context)? bookingEligibilityCheck;
  @override
  State<CustomerEventListScreen> createState() =>
      _CustomerEventListScreenState();
}

class _CustomerEventListScreenState extends State<CustomerEventListScreen>
    with WidgetsBindingObserver {
  bool _busy = false;
  bool _checkingPhoneForBooking = false;
  bool _clearDialogOpen = false;
  EventListCustomizationController? _customization;
  late final FeastaRepository _repository =
      widget.repository ?? FeastaRepository();
  EventListReviewController? _review;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Observe route transitions even if the same list controller is retained.
    // A temporary Clear confirmation is not a mutation or a new entry route.
    if (!_clearDialogOpen &&
        !(ModalRoute.of(context)?.isCurrent ?? false) &&
        (_customization?.verifying ?? false)) {
      _customization?.invalidate();
    }
    final controller = EventListScope.of(context);
    if (_review?.controller == controller) return;
    _review?.removeListener(_reviewChanged);
    _review?.dispose();
    _customization?.removeListener(_reviewChanged);
    _customization?.dispose();
    _customization = EventListCustomizationController(
      controller: controller,
      lookupPackage: (provider, package) =>
          _repository.getEligiblePackageForPreparation(provider, package),
      lookupProvider: (provider) => _repository.getProviderById(provider),
    )..addListener(_reviewChanged);
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
    _customization?.removeListener(_reviewChanged);
    _customization?.dispose();
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
        ..showSnackBar(
          SnackBar(
            content: Text(
              eventListMessage(
                result,
                cloud: EventListScope.of(context).cloudActive,
              ),
            ),
          ),
        );
    }
  }

  Future<void> _clear(
    EventListController controller,
    EventListAuthSession session,
  ) async {
    if (_clearDialogOpen || session != controller.authentication.session) {
      return;
    }
    _clearDialogOpen = true;
    final bool? confirmed;
    try {
      confirmed = await showDialog<bool>(
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
    } finally {
      _clearDialogOpen = false;
    }
    if (!mounted ||
        confirmed != true ||
        session != controller.authentication.session) {
      return;
    }
    await _run(() {
      _customization?.invalidate();
      return controller.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = EventListScope.of(context);
    final session = controller.authentication.session;
    final authorized =
        session.customerUid != null || controller.isGuestPlanning;
    final list = controller.list;
    final providerCount = controller.cloudActive
        ? _cloudProviderCount(controller)
        : (list == null ? 0 : groupEventList(list).length);
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        foregroundColor: AppColors.primary,
        leading: BackButton(
          onPressed: () => returnToCustomerRoot(Navigator.of(context)),
        ),
        title: const Text(
          'My Event List',
          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
        ),
        actions: [
          if (authorized &&
              ((list?.entries.isNotEmpty ?? false) ||
                  controller.unsupportedCloudEntries.isNotEmpty))
            IconButton(
              tooltip: 'Clear list',
              onPressed: _busy ? null : () => _clear(controller, session),
              icon: const Icon(Icons.delete_outline),
            ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (!authorized)
              const Text(
                'Log in with an authorized customer account to view your Event List.',
              )
            else ...[
              if (_busy || controller.saving)
                const LinearProgressIndicator(
                  semanticsLabel: 'Updating Event List',
                ),
              if (controller.cloudActive)
                Text(
                  (_busy || controller.saving)
                      ? 'Saving to your account…'
                      : controller.cloudError != null ||
                            controller.error != null
                      ? 'Cloud synchronization failed. Retry to recover your save.'
                      : controller.cloudServerConfirmed
                      ? 'Event List verified with server'
                      : 'Connecting to your Event List…',
                ),
              if (controller.error != null ||
                  controller.cloudError != null) ...[
                const Text(
                  'Your Event List could not be verified. Previously verified selections, if shown, may be out of date.',
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
                if (controller.selectionCount > 0) ...[
                  Text(
                    '$providerCount ${providerCount == 1 ? 'provider' : 'providers'} · ${controller.selectionCount} ${controller.selectionCount == 1 ? 'selection' : 'selections'}',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
                if (controller.unsupportedCloudEntries.isNotEmpty)
                  _cloudPlanningSummary(controller.cloudDocument!.toJson()),
                for (final entry in controller.unsupportedCloudEntries)
                  _readOnlyCard(entry, controller, session),
                if (list.entries.isEmpty &&
                    controller.unsupportedCloudEntries.isEmpty)
                  _EmptyEventList(
                    onBrowse: () => returnToCustomerRoot(Navigator.of(context)),
                  ),
                if (list.entries.isNotEmpty) ...[
                  if (controller.unsupportedCloudEntries.isEmpty)
                    _PlanningSummary(entries: list.entries),
                  for (final group in groupEventList(list))
                    for (final entry in group.entries)
                      _card(entry, controller, session),
                  _eventListEstimatedTotalCard(
                    context: context,
                    prices: controller.cloudActive &&
                            controller.cloudDocument != null
                        ? ((controller.cloudDocument!.toJson()['entries']
                                        as List?) ??
                                const [])
                            .whereType<Map>()
                            .map<double?>((row) {
                              final config = row['configuration'];
                              final raw = config is Map
                                  ? config['estimatedTotal'] ??
                                      row['estimatedPrice']
                                  : row['estimatedPrice'];
                              if (raw is! num ||
                                  !raw.isFinite ||
                                  raw < 0) {
                                return null;
                              }
                              return raw.toDouble();
                            })
                            .toList()
                        : list.entries
                            .map<double?>(
                              (entry) =>
                                  entry.configuration?.estimatedTotal ??
                                  entry.estimatedPrice,
                            )
                            .toList(),
                    cloudVerified: !controller.cloudActive ||
                        controller.cloudServerConfirmed,
                  ),
                  if (!controller.isGuestPlanning)
                    FilledButton(
                      onPressed:
                          _busy ||
                              _checkingPhoneForBooking ||
                              controller.saving ||
                              controller.error != null ||
                              controller.cloudError != null ||
                              controller.unsupportedCloudEntries.isNotEmpty ||
                              (controller.cloudActive &&
                                  !controller.cloudServerConfirmed) ||
                              !_canReview(list.entries)
                          ? null
                          : () async {
                              setState(() => _checkingPhoneForBooking = true);
                              try {
                                final verify =
                                    widget.bookingEligibilityCheck ??
                                    requireVerifiedPhoneForBooking;
                                final navigator = Navigator.of(context);
                                final verified = await verify(context);
                                if (!mounted ||
                                    !verified ||
                                    controller.saving ||
                                    controller.error != null ||
                                    controller.cloudError != null ||
                                    controller.list?.revision !=
                                        list.revision ||
                                    controller
                                        .unsupportedCloudEntries
                                        .isNotEmpty ||
                                    session.customerUid !=
                                        controller
                                            .authentication
                                            .session
                                            .customerUid) {
                                  return;
                                }
                                if (list.entries.length == 1) {
                                  final entry = list.entries.single;

                                  if (entry.kind != 'catering_package' ||
                                      entry.configuration == null) {
                                    ScaffoldMessenger.of(
                                      this.context,
                                    ).showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'Complete this catering package before booking review.',
                                        ),
                                      ),
                                    );
                                    return;
                                  }

                                  await _customization?.customize(
                                    entry,
                                    originIsCurrent: () =>
                                        mounted &&
                                        session.customerUid ==
                                            controller
                                                .authentication
                                                .session
                                                .customerUid &&
                                        (ModalRoute.of(
                                              this.context,
                                            )?.isCurrent ??
                                            false),
                                    navigate:
                                        (provider, package, binding) async {
                                          if (!mounted ||
                                              session.customerUid !=
                                                  controller
                                                      .authentication
                                                      .session
                                                      .customerUid) {
                                            return;
                                          }

                                          final route = EventCustomizationRoute(
                                            origin: ModalRoute.of(this.context),
                                            builder: (_) =>
                                                EventCustomizationScreen(
                                                  provider: provider,
                                                  eventPackage: package,
                                                  repository: _repository,
                                                  session: binding,
                                                  initialConfiguration:
                                                      entry.configuration,
                                                  openReviewOnLoad: true,
                                                ),
                                          );

                                          unawaited(
                                            navigator.push<void>(route),
                                          );
                                          await route.completed;
                                        },
                                  );
                                } else {
                                  await navigator.push<void>(
                                    MaterialPageRoute(
                                      builder: (_) =>
                                          const EventListSubmissionScreen(),
                                    ),
                                  );
                                }
                              } catch (_) {
                                if (mounted) {
                                  ScaffoldMessenger.of(
                                    this.context,
                                  ).showSnackBar(
                                    const SnackBar(
                                      content: Text(
                                        'Could not verify booking eligibility. Please retry.',
                                      ),
                                    ),
                                  );
                                }
                              } finally {
                                if (mounted) {
                                  setState(
                                    () => _checkingPhoneForBooking = false,
                                  );
                                }
                              }
                            },
                      child: const Text('Review and submit booking request'),
                    ),
                ],
              ],
            ],
            const SizedBox(height: 16),
            OutlinedButton(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primary,
                side: const BorderSide(color: AppColors.primary),
                minimumSize: const Size(double.infinity, 52),
                shape: const StadiumBorder(),
                textStyle: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              onPressed: () => returnToCustomerRoot(Navigator.of(context)),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (authorized && controller.selectionCount > 0) ...[
                    const Icon(Icons.add, size: 20),
                    const SizedBox(width: 8),
                  ],
                  Flexible(
                    child: Text(
                      authorized && controller.selectionCount > 0
                          ? 'Add another provider'
                          : 'Continue Browsing',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8),
              child: Text(
                'Planning only. No reservation or payment until the applicable booking steps are completed.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: AppColors.mainText),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _entryHeader({
    required String name,
    required String providerName,
    required String kind,
    required String? imageUrl,
    required double? estimatedPrice,
  }) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: FeastaImage.network(
          imageUrl: imageUrl,
          compactFallback: true,
          description: '$name package cover',
          height: 88,
          width: 88,
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: AppColors.mainText,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '$providerName · ${kind == 'catering_package' ? 'Catering' : 'Event service'}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.secondaryTextAccessible,
              ),
            ),
            const SizedBox(height: 6),
            if (estimatedPrice != null)
              FeastaPriceText(
                amount: estimatedPrice,
                semanticLabel:
                    'Saved estimate: ${FeastaPriceFormatter.format(estimatedPrice, symbol: '')} Philippine pesos.',
              )
            else
              const Text('Price unavailable'),
            const SizedBox(height: 2),
            const Text(
              'Estimated price',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ],
        ),
      ),
    ],
  );

  Widget _readOnlyCard(
    Map<String, dynamic> entry,
    EventListController controller,
    EventListAuthSession session,
  ) => Card(
    margin: const EdgeInsets.symmetric(vertical: 8),
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _entryHeader(
            name: entry['name'] as String,
            providerName: entry['providerName'] as String,
            kind: entry['kind'] as String,
            imageUrl: entry['imageUrl'] as String?,
            estimatedPrice: (entry['estimatedPrice'] as num?)?.toDouble(),
          ),
          const SizedBox(height: 8),
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: const Text(
              'Package details',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
            children: [_cloudSavedDetails(entry)],
          ),
          const Text(
            'Open Web to review or edit this selection. Its full data is preserved.',
          ),
          const SizedBox(height: 4),
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: 8,
            runSpacing: 8,
            children: [
              const FilledButton(
                onPressed: null,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.edit_outlined, size: 16),
                    SizedBox(width: 6),
                    Text('Edit details', style: TextStyle(fontSize: 13)),
                  ],
                ),
              ),
              TextButton.icon(
                onPressed: _busy || controller.saving
                    ? null
                    : () => _run(
                        () => controller.removeCloudEntry(
                          entry['identity'] as String,
                        ),
                        expectedSession: session,
                      ),
                icon: const Icon(
                  Icons.remove_circle_outline,
                  color: AppColors.mainText,
                ),
                label: Text(
                  'Remove',
                  semanticsLabel: 'Remove ${entry['name']}',
                  style: const TextStyle(fontSize: 13),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );

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
          _entryHeader(
            name: entry.packageName,
            providerName: entry.providerName,
            kind: entry.kind,
            imageUrl: entry.imageUrl,
            estimatedPrice: entry.estimatedPrice,
          ),
          const SizedBox(height: 8),
          ExpansionTile(
            tilePadding: EdgeInsets.zero,
            title: const Text(
              'Package details',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
            children: [
              if (entry.configuration != null)
                EventListConfigurationSummary(
                  key: ValueKey(entry.identity.key),
                  entry: entry,
                  compact: true,
                  lookupPackage: _repository.getEligiblePackageForPreparation,
                ),
              if (_review!.resultFor(entry).status.message.trim() !=
                  'Latest package details verified')
                Semantics(
                  liveRegion: true,
                  child: Text(_review!.resultFor(entry).status.message),
                ),
              if (_review!.resultFor(entry).latestPrice case final double price)
                if (_review!.resultFor(entry).priceChanged(entry)) ...[
                  const Text('Updated listed estimate'),
                  FeastaPriceText(
                    amount: price,
                    semanticLabel:
                        'Updated listed estimate: ${FeastaPriceFormatter.format(price, symbol: '')} Philippine pesos.',
                  ),
                  const Text(
                    'The listed price has changed. Final pricing and availability require confirmation.',
                  ),
                ],
              TextButton.icon(
                onPressed: () {
                  if (session == controller.authentication.session) {
                    _review?.refresh(only: entry.identity);
                  }
                },
                icon: const Icon(Icons.refresh),
                label: const Text('Refresh details'),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Wrap(
            alignment: WrapAlignment.spaceBetween,
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(
                onPressed:
                    entry.kind != 'catering_package' ||
                        controller.saving ||
                        controller.error != null ||
                        controller.cloudError != null ||
                        _busy ||
                        _checkingPhoneForBooking ||
                        (_customization?.busy ?? true)
                    ? null
                    : () async {
                        if (session != controller.authentication.session) {
                          return;
                        }

                        final originalUid = session.customerUid;
                        final guest = controller.isGuestPlanning;
                        if (originalUid == null && !guest) return;

                        setState(() => _checkingPhoneForBooking = true);

                        try {
                          // Match Web: require verified phone before customization.
                          final verify =
                              widget.bookingEligibilityCheck ??
                              requireVerifiedPhoneForBooking;
                          final verified = guest || await verify(context);

                          if (!mounted || !verified) return;

                          // OTP may refresh authentication state. Preserve account
                          // identity, rather than requiring the old session object.
                          if (controller.authentication.session.customerUid !=
                              originalUid) {
                            return;
                          }

                          if (!(ModalRoute.of(context)?.isCurrent ?? false)) {
                            return;
                          }

                          await _customization?.customize(
                            entry,
                            originIsCurrent: () =>
                                mounted &&
                                controller.authentication.session.customerUid ==
                                    originalUid &&
                                (ModalRoute.of(context)?.isCurrent ?? false),
                            navigate: (provider, package, binding) async {
                              if (!mounted ||
                                  controller
                                          .authentication
                                          .session
                                          .customerUid !=
                                      originalUid) {
                                return;
                              }

                              final route = EventCustomizationRoute(
                                origin: ModalRoute.of(context),
                                builder: (_) => EventCustomizationScreen(
                                  provider: provider,
                                  eventPackage: package,
                                  repository: _repository,
                                  session: binding,
                                  initialConfiguration: entry.configuration,
                                ),
                              );
                              unawaited(
                                Navigator.of(context).push<void>(route),
                              );
                              await route.completed;
                            },
                          );
                        } catch (_) {
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text(
                                  'Could not verify booking eligibility. Please retry.',
                                ),
                              ),
                            );
                          }
                        } finally {
                          if (mounted) {
                            setState(() => _checkingPhoneForBooking = false);
                          }
                        }
                      },
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.edit_outlined, size: 16),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        entry.configuration == null
                            ? 'Customize Package'
                            : 'Edit details',
                        style: const TextStyle(fontSize: 13),
                        semanticsLabel:
                            '${entry.configuration == null ? 'Customize Package' : 'Edit details'}: ${entry.packageName}',
                      ),
                    ),
                  ],
                ),
              ),
              TextButton.icon(
                onPressed: _busy
                    ? null
                    : () => _run(() {
                        _customization?.invalidate(identity: entry.identity);
                        return controller.removePackage(entry.identity);
                      }, expectedSession: session),
                icon: const Icon(
                  Icons.remove_circle_outline,
                  color: AppColors.mainText,
                ),
                label: Text(
                  'Remove',
                  style: const TextStyle(fontSize: 13),
                  semanticsLabel: 'Remove ${entry.packageName}',
                ),
              ),
            ],
          ),
          if (_customization?.selectedKey == entry.identity.key) ...[
            if (_customization!.verifying)
              Semantics(
                liveRegion: true,
                excludeSemantics: true,
                label: 'Checking current package: ${entry.packageName}',
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    LinearProgressIndicator(),
                    Text('Checking current package\u2026'),
                  ],
                ),
              ),
            if (_customization!.message != null)
              Semantics(
                liveRegion: true,
                child: Text(_customization!.message!),
              ),
          ],
        ],
      ),
    ),
  );
}

/// Read saved canonical fields without converting them to an editable model.
bool _canReview(List<CustomerEventListEntry> entries) {
  if (entries.length == 1) {
    return entries.single.kind == 'catering_package' &&
        entries.single.configuration != null;
  }
  try {
    eventListSubmission(
      entries,
      'eligibility_check',
      currentMarketplaceMetadata: [
        for (final entry in entries)
          if (entry.kind == 'marketplace_service' &&
              entry.expectedRevision != null)
            EventListIdentityRevision(
              providerId: entry.providerId,
              serviceId: entry.serviceId!,
              revision: entry.expectedRevision!,
            ),
      ],
    );
    return true;
  } on FormatException {
    return false;
  }
}

Widget _cloudSavedDetails(Map<String, dynamic> entry) {
  final config = entry['configuration'] as Map<String, dynamic>?;
  final event = config?['event'] as Map<String, dynamic>?;
  final menu = entry['menu'] as Map<String, dynamic>?;
  Widget line(String label, Object? value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Text(
      '$label: ${value == null || value == '' ? 'None selected' : value}',
    ),
  );
  String names(Object? rows) => rows is List
      ? rows
            .map(
              (row) => row is Map
                  ? row['name'] ?? row['addonName'] ?? 'Saved selection'
                  : row,
            )
            .join(', ')
      : '';
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (event != null) ...[
        line('Event', event['eventType']),
        line('Date', event['eventDate']),
        line('Time', '${event['eventTime']}–${event['eventEndTime'] ?? ''}'),
        line('Guests', event['guestCount']),
        line('City / location', event['eventLocation']),
        line('Address', event['eventAddress']),
        line('Special requests', event['specialRequest']),
      ],
      if (menu != null) ...[
        line('Serving option', menu['servingOptionName']),
        line('Serving description', menu['servingDescription']),
        line(
          'Guests',
          '${menu['servingMinimumGuests']}–${menu['servingMaximumGuests']}',
        ),
      ],
      if (config != null) ...[
        line('Service level', config['serviceTier']),
        line('Food selections', names(config['selectedFoods'])),
        line('Decorations', names(config['selectedDecorations'])),
        line('Furniture', names(config['selectedFurniture'])),
        line('Event services', names(config['selectedEventServices'])),
        line('Add-ons', names(config['selectedAddOns'])),
        if (config['themeInspiration'] case final Map theme)
          line('Theme inspiration', theme['notes']),
        if (config['customTheme'] != null)
          line('Custom theme request', config['customTheme']),
      ],
    ],
  );
}

int _cloudProviderCount(EventListController controller) {
  final entries =
      (controller.cloudDocument?.toJson()['entries'] as List?) ?? const [];
  return entries
      .whereType<Map>()
      .map((entry) => entry['providerId'])
      .whereType<String>()
      .where((id) => id.trim().isNotEmpty)
      .toSet()
      .length;
}

Widget _cloudPlanningSummary(Map<String, dynamic> document) {
  final entries = (document['entries'] as List).cast<Map<String, dynamic>>();
  final events = entries
      .map((e) => (e['configuration'] as Map?)?['event'])
      .whereType<Map>()
      .toList();
  final consistent =
      events.length == entries.length &&
      events.isNotEmpty &&
      events.every(
        (e) => [
          'eventType',
          'eventDate',
          'eventTime',
          'eventEndTime',
          'guestCount',
          'eventLocation',
          'eventAddress',
        ].every((key) => e[key] == events.first[key]),
      );
  final prices = entries
      .map(
        (e) =>
            (e['configuration'] as Map?)?['estimatedTotal'] ??
            e['estimatedPrice'],
      )
      .whereType<num>()
      .toList();
  return Card(
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (consistent) ...[
            Text(_eventListDisplayType(events.first['eventType'] as String)),
            Text(
              '${events.first['eventDate']} · ${_eventListDisplayTime(events.first['eventTime'] as String)} – ${_eventListDisplayTime(events.first['eventEndTime'] as String? ?? '')}',
            ),
            Text(
              '${events.first['guestCount']} guests · ${events.first['eventLocation']}',
            ),
          ] else
            const Text('Open package details to review the saved selections.'),
          if (entries.length > 1)
            Text(
              '${prices.length == entries.length ? 'Estimated total' : 'Partial estimate'}: ${FeastaPriceFormatter.format(prices.fold<double>(0, (sum, price) => sum + price))}',
            ),
        ],
      ),
    ),
  );
}

String _eventListDisplayType(String value) {
  final text = value.trim();
  if (text.isEmpty) return text;
  return '${text[0].toUpperCase()}${text.substring(1)}';
}

String _eventListDisplayTime(String value) {
  final text = value.trim();
  final match = RegExp(r'^([01]?\d|2[0-3]):([0-5]\d)$').firstMatch(text);

  if (match == null) return text;

  final hour = int.parse(match.group(1)!);
  final minute = match.group(2)!;
  final displayHour = hour % 12 == 0 ? 12 : hour % 12;
  final period = hour < 12 ? 'AM' : 'PM';

  return '$displayHour:$minute $period';
}

Widget _eventListEstimatedTotalCard({
  required BuildContext context,
  required List<double?> prices,
  required bool cloudVerified,
}) {
  final known = prices
      .whereType<double>()
      .where((price) => price.isFinite && price >= 0)
      .toList();

  final complete = known.length == prices.length;
  final total = known.fold<double>(0, (sum, price) => sum + price);

  final label = known.isEmpty
      ? 'Estimate unavailable'
      : complete
      ? 'Estimated Event Total'
      : 'Partial estimate';

  final amount = known.isEmpty
      ? 'Estimate unavailable'
      : FeastaPriceFormatter.format(total);

  return Card(
    child: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            amount,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            known.isEmpty
                ? 'Saved selections do not have a usable price estimate.'
                : complete
                ? 'Combined planning estimate for all saved selections.'
                : 'Some saved selections have unavailable prices.',
          ),
          const SizedBox(height: 4),
          Text(
            cloudVerified
                ? 'Final prices and availability are verified during booking.'
                : 'Waiting for server confirmation of your saved Event List.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    ),
  );
}
class _PlanningSummary extends StatelessWidget {
  const _PlanningSummary({required this.entries});

  final List<CustomerEventListEntry> entries;

  @override
  Widget build(BuildContext context) {
    final prices = entries
        .map(
          (e) => e.configuration == null
              ? e.estimatedPrice
              : e.configuration!.estimatedTotal,
        )
        .whereType<double>()
        .toList();

    final configured = entries
        .map((e) => e.configuration?.event)
        .whereType<CustomerEventListEvent>()
        .toList();

    final complete = configured.length == entries.length;
    final consistent =
        configured.isNotEmpty &&
        configured.every((e) => sameEventListEvent(e, configured.first));
    final event = complete && consistent ? configured.first : null;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (event != null) ...[
              Text(
                _eventListDisplayType(event.eventType),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text(
                '${event.eventDate} · ${_eventListDisplayTime(event.eventTime)} – ${_eventListDisplayTime(event.eventEndTime)}',
              ),
              Text('${event.guestCount} guests · ${event.eventLocation}'),
            ] else if (!consistent && configured.length > 1)
              const Text('Event details differ. Edit details to reconcile.')
            else if (!complete)
              const Text('Complete the event details for each package.'),
            if (entries.length > 1) ...[
              const SizedBox(height: 8),
              Text(
                prices.length == entries.length
                    ? 'Estimated total: ${FeastaPriceFormatter.format(prices.fold<double>(0, (a, b) => a + b))}'
                    : 'Partial estimate: ${FeastaPriceFormatter.format(prices.fold<double>(0, (a, b) => a + b))} — some prices unavailable',
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _EmptyEventList extends StatelessWidget {
  const _EmptyEventList({required this.onBrowse});
  final VoidCallback onBrowse;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 48, bottom: 6),
    child: Column(
      children: [
        const ExcludeSemantics(
          child: SizedBox(
            width: 160,
            height: 148,
            child: CustomPaint(painter: _EventPlanningPainter()),
          ),
        ),
        const SizedBox(height: 20),
        Semantics(
          header: true,
          child: const Text(
            'Your Event List is Empty',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
            ),
          ),
        ),
        const SizedBox(height: 10),
        const Text(
          'Save packages and providers to start planning your event.',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 15,
            height: 1.6,
            color: AppColors.secondaryTextAccessible,
          ),
        ),
        const SizedBox(height: 22),
        const Wrap(
          alignment: WrapAlignment.center,
          spacing: 16,
          children: [Text('0 saved packages'), Text('0 saved providers')],
        ),
        const SizedBox(height: 10),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 10,
          runSpacing: 10,
          children: [
            _metric(Icons.inventory_2_outlined, '0 Packages'),
            _metric(Icons.soup_kitchen_outlined, '0 Providers'),
          ],
        ),
      ],
    ),
  );

  Widget _metric(IconData icon, String label) => OutlinedButton.icon(
    onPressed: onBrowse,
    icon: Icon(icon, size: 19),
    label: Text(label),
    style: OutlinedButton.styleFrom(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.primary,
      side: const BorderSide(color: AppColors.primary, width: 1.4),
      minimumSize: const Size(136, 46),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
  );
}

class _EventPlanningPainter extends CustomPainter {
  const _EventPlanningPainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 160, size.height / 148);
    final ink = Paint()
      ..color = AppColors.primary
      ..strokeWidth = 1.8;
    void box(Rect rect, double radius, Color fill, Color border) {
      final shape = RRect.fromRectAndRadius(rect, Radius.circular(radius));
      canvas.drawRRect(shape, Paint()..color = fill);
      canvas.drawRRect(
        shape,
        Paint()
          ..color = border
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.7,
      );
    }

    box(
      const Rect.fromLTWH(30, 21, 82, 108),
      5,
      AppColors.surface,
      AppColors.borderStrong,
    );
    box(
      const Rect.fromLTWH(36, 27, 70, 96),
      2,
      AppColors.background,
      AppColors.border,
    );
    final clip = Path()
      ..moveTo(53, 33)
      ..lineTo(53, 23)
      ..quadraticBezierTo(53, 17, 64, 17)
      ..cubicTo(64, 3, 81, 3, 81, 17)
      ..quadraticBezierTo(91, 17, 91, 23)
      ..lineTo(91, 33)
      ..close();
    canvas.drawPath(clip, Paint()..color = AppColors.primarySubtleStrong);
    canvas.drawPath(
      clip,
      Paint()
        ..color = ink.color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.8,
    );
    canvas.drawCircle(const Offset(72.5, 15), 2.5, ink);
    for (var i = 0; i < 4; i++) {
      final y = 46.0 + i * 17;
      box(
        Rect.fromLTWH(46, y, 10, 10),
        1,
        i > 1 ? AppColors.primarySubtleStrong : AppColors.surface,
        ink.color,
      );
      canvas.drawLine(
        Offset(64, y + 5),
        Offset(96, y + 5),
        Paint()
          ..color = AppColors.borderStrong
          ..strokeWidth = 1.7,
      );
      if (i < 2) {
        canvas.drawPath(
          Path()
            ..moveTo(48, y + 3)
            ..lineTo(51, y + 6)
            ..lineTo(59, y - 3),
          Paint()
            ..color = ink.color
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.8,
        );
      }
    }
    final roof = Path()
      ..moveTo(86, 105)
      ..lineTo(112, 82)
      ..lineTo(139, 105)
      ..close();
    canvas.drawPath(roof, Paint()..color = AppColors.primarySubtleStrong);
    canvas.drawPath(
      roof,
      Paint()
        ..color = ink.color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.8,
    );
    box(
      const Rect.fromLTWH(92, 105, 41, 25),
      1,
      AppColors.primarySubtle,
      ink.color,
    );
    for (final x in [92.0, 102.0, 112.0, 122.0]) {
      canvas.drawPath(
        Path()
          ..moveTo(x, 106)
          ..quadraticBezierTo(x + 5, 116, x + 10, 106),
        Paint()
          ..color = ink.color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    }
    final opening = Path()
      ..moveTo(99, 130)
      ..lineTo(112, 110)
      ..lineTo(126, 130)
      ..close();
    canvas.drawPath(opening, Paint()..color = AppColors.primarySubtleStrong);
    canvas.drawPath(
      opening,
      Paint()
        ..color = ink.color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );
    canvas.drawLine(
      const Offset(92, 105),
      const Offset(80, 131),
      Paint()
        ..color = AppColors.borderStrong
        ..strokeWidth = 1.5,
    );
    canvas.drawLine(
      const Offset(133, 105),
      const Offset(145, 131),
      Paint()
        ..color = AppColors.borderStrong
        ..strokeWidth = 1.5,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _EventPlanningPainter oldDelegate) => false;
}
