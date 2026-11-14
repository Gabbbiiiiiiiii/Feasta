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
        ..showSnackBar(SnackBar(content: Text(eventListMessage(result))));
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
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.primarySubtle,
                border: Border.all(color: AppColors.primarySubtleStrong),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_rounded, size: 18, color: AppColors.primary),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'This is a planning list, not a reservation. Prices are estimates; availability is not guaranteed.',
                      style: TextStyle(
                        fontSize: 13,
                        height: 1.6,
                        color: AppColors.mainText,
                      ),
                    ),
                  ),
                ],
              ),
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
                if (list.entries.isNotEmpty) ...[
                  Text('${list.entries.length} saved packages'),
                  Text('${groupEventList(list).length} saved providers'),
                ],
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
                  _EmptyEventList(
                    onBrowse: () => returnToCustomerRoot(Navigator.of(context)),
                  ),
                if (list.entries.isNotEmpty) ...[
                  _PlanningSummary(entries: list.entries),
                  for (final entry in list.entries)
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
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.primaryForeground,
                minimumSize: const Size(double.infinity, 52),
                shape: const StadiumBorder(),
                textStyle: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
              onPressed: () => returnToCustomerRoot(Navigator.of(context)),
              child: Text(
                authorized && (list?.entries.isNotEmpty ?? false)
                    ? 'Add another provider'
                    : 'Continue Browsing',
              ),
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
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: FeastaImage.network(
                  imageUrl: entry.imageUrl,
                  compactFallback: true,
                  description: '${entry.packageName} package cover',
                  height: 72,
                  width: 72,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.packageName,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Row(
                      children: [
                        const Icon(Icons.storefront_outlined, size: 16),
                        const SizedBox(width: 4),
                        Expanded(child: Text(entry.providerName)),
                      ],
                    ),
                    Text(
                      entry.configuration == null
                          ? 'Needs customization'
                          : 'Configured — revalidation required',
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (entry.configuration != null)
            EventListConfigurationSummary(
              key: ValueKey(entry.identity.key),
              entry: entry,
              compact: true,
              lookupPackage: _repository.getEligiblePackageForPreparation,
            ),
          Semantics(
            liveRegion: true,
            child: Text(_review!.resultFor(entry).status.message),
          ),
          Text(
            entry.configuration == null
                ? 'Saved estimate'
                : 'Saved package estimate',
          ),
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
          FilledButton(
            onPressed:
                _busy ||
                    _checkingPhoneForBooking ||
                    (_customization?.busy ?? true)
                ? null
                : () async {
                    if (session != controller.authentication.session) return;

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
                              controller.authentication.session.customerUid !=
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
                          unawaited(Navigator.of(context).push<void>(route));
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
            child: Text(
              entry.configuration == null
                  ? 'Customize Package'
                  : 'Edit configuration',
              semanticsLabel:
                  '${entry.configuration == null ? 'Customize Package' : 'Edit configuration'}: ${entry.packageName}',
            ),
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
            label: Text('Remove ${entry.packageName}'),
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
    // Configured totals include the saved choices. Never substitute a base
    // package price when the configured total is unknown.
    final prices = entries
        .map(
          (e) => e.configuration == null
              ? e.estimatedPrice
              : e.configuration!.estimatedTotal,
        )
        .whereType<double>()
        .toList();
    final events = entries.map((e) => e.configuration?.event).toList();
    final configured = events.whereType<CustomerEventListEvent>().toList();
    final consistent =
        configured.isNotEmpty &&
        configured.every(
          (e) => e.toJson().toString() == configured.first.toJson().toString(),
        );
    final complete = configured.length == entries.length;
    final event = consistent && complete ? configured.first : null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (event != null) ...[
              Text(
                event.eventType,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text(
                '${event.eventDate} · ${event.eventTime}–${event.eventEndTime}',
              ),
              Text('${event.guestCount} guests · ${event.eventLocation}'),
            ] else if (!consistent && configured.length > 1)
              const Text(
                'Event details differ. Review each configuration to reconcile your event.',
              ),
            if (!complete)
              const Text(
                'Event details are incomplete. Configure each package and confirm its schedule.',
              ),
            const SizedBox(height: 8),
            const Text('Known-price planning estimate'),
            if (prices.isNotEmpty)
              Text(
                'Known estimate: ${FeastaPriceFormatter.format(prices.fold<double>(0, (a, b) => a + b))}',
              )
            else
              const Text('Estimate unavailable'),
            Text(
              '${prices.length} of ${entries.length} saved package estimates included.',
            ),
            if (prices.length != entries.length)
              const Text(
                'Missing prices are excluded; this is not a complete total.',
              ),
            const Text(
              'Saved estimates require revalidation. Final booking prices and availability must be confirmed.',
            ),
            const SizedBox(height: 8),
            const Text(
              'Booking submission for this list is not available. Your selections remain saved; review and edit each provider configuration.',
            ),
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
