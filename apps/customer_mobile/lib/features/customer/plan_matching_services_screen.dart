import 'event_list/save_package_to_event_list.dart';
import 'package:flutter/foundation.dart' show setEquals;
import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../../core/domain/service_category.dart';
import '../../core/theme/app_typography.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/badges/feasta_price_text.dart';
import '../../shared/models/customer_address_model.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'best_fit_controller.dart';
import 'customer_search_screen.dart';
import 'marketplace_availability.dart';
import 'package_details_screen.dart';
import 'provider_profile_screen.dart';

class PlanMatchingServicesScreen extends StatefulWidget {
  static ({
    String? owner,
    BestFitResult result,
    List<ServiceCategory> categories,
  })?
  _session;

  static BestFitResult? get activeResult =>
      _session?.owner == FirebaseAuth.instance.currentUser?.uid
      ? _session?.result
      : null;

  static void clearSession() => _session = null;

  const PlanMatchingServicesScreen({
    super.key,
    required this.eventType,
    required this.address,
    required this.eventDate,
    required this.startTime,
    required this.endTime,
    required this.minBudget,
    required this.maxBudget,
    required this.guestCount,
    required this.categories,
    required this.selectedCategories,
    this.occasionLabel,
  });

  final String eventType;
  final String? occasionLabel;
  final CustomerAddressModel address;
  final DateTime eventDate;
  final TimeOfDay startTime, endTime;
  final double minBudget, maxBudget;
  final int guestCount;
  final List<ServiceCategory> categories;
  final Set<String> selectedCategories;

  @override
  State<PlanMatchingServicesScreen> createState() =>
      _PlanMatchingServicesScreenState();
}

class _PlanMatchingServicesScreenState
    extends State<PlanMatchingServicesScreen> {
  final _repository = FeastaRepository();
  late final _controller = BestFitController(repository: _repository);
  late final _owner = FirebaseAuth.instance.currentUser?.uid;
  bool _selectionNeedsReview = false;
  List<ServiceCategory> get _categories => widget.categories;

  @override
  void initState() {
    super.initState();
    final saved = PlanMatchingServicesScreen.activeResult;
    _controller.addListener(_rememberResult);
    if (saved != null && _sameEvent(saved.event)) {
      _controller.result = saved;
    } else {
      _search(previous: saved);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool _sameEvent(BestFitEvent saved) {
    final current = _event(widget.selectedCategories);
    return setEquals(saved.categories, current.categories) &&
        saved.schedule.key == current.schedule.key &&
        saved.occasion == current.occasion &&
        saved.venue.fullAddress == current.venue.fullAddress &&
        saved.venue.latitude == current.venue.latitude &&
        saved.venue.longitude == current.venue.longitude &&
        saved.minimumBudgetCentavos == current.minimumBudgetCentavos &&
        saved.maximumBudgetCentavos == current.maximumBudgetCentavos;
  }

  void _rememberResult() {
    final result = _controller.result;
    if (!_controller.loading &&
        _controller.error == null &&
        result != null &&
        _owner == FirebaseAuth.instance.currentUser?.uid) {
      PlanMatchingServicesScreen._session = (
        owner: _owner,
        result: result,
        categories: _categories,
      );
    }
  }

  Future<void> _search({BestFitResult? previous}) async {
    await _controller.search(_event(widget.selectedCategories));
    if (!mounted || previous == null || _controller.error != null) return;
    for (final entry in previous.selected.entries) {
      if (!widget.selectedCategories.contains(entry.key)) continue;
      if (_controller.result?.selected[entry.key]?.id != entry.value.id) {
        _controller.replace(entry.key, entry.value.id);
      }
    }
    setState(() {
      _selectionNeedsReview = previous.selected.entries.any(
        (entry) =>
            widget.selectedCategories.contains(entry.key) &&
            _controller.result?.selected[entry.key]?.id != entry.value.id,
      );
    });
  }

  BestFitEvent _event(Iterable<String> categories) {
    String time(TimeOfDay value) =>
        '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';
    return BestFitEvent(
      schedule: MarketplaceEventContext(
        eventDate: widget.eventDate.toIso8601String().split('T').first,
        eventTime: time(widget.startTime),
        eventEndTime: time(widget.endTime),
        guestCount: widget.guestCount,
      ),
      occasion: widget.eventType,
      venue: widget.address,
      categories: categories,
      minimumBudgetCentavos: (widget.minBudget * 100).round(),
      maximumBudgetCentavos: (widget.maxBudget * 100).round(),
    );
  }

  String _money(int cents) => FeastaPriceFormatter.format(cents / 100);

  void _open(BestFitOffer offer, BestFitEvent event) {
    final package = offer.package;
    final navigator = Navigator.of(context);
    final resultsRoute = ModalRoute.of(context);
    navigator.push(
      MaterialPageRoute<void>(
        builder: (_) => package == null
            ? ProviderProfileScreen(provider: offer.provider)
            : PackageDetailsScreen(
                provider: offer.provider,
                eventPackage: package,
                initialServiceTier: offer.serviceTier,
                bestFitEvent: event,
                openCustomizationOnLoad: true,
                onReturnToBestFit: () {
                  if (mounted && resultsRoute != null) {
                    navigator.popUntil(
                      (route) => identical(route, resultsRoute),
                    );
                  }
                },
              ),
      ),
    );
  }

  Widget _card(
    Widget child, {
    bool featured = false,
    Color? background,
    double padding = 12,
  }) => Container(
    padding: EdgeInsets.all(padding),
    decoration: BoxDecoration(
      color: background ?? AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(
        color: featured ? AppColors.primary : AppColors.border,
      ),
    ),
    child: child,
  );

  Widget _editEventBar() => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    decoration: BoxDecoration(
      color: AppColors.primarySubtle,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      children: [
        const Icon(
          Icons.auto_awesome,
          size: 18,
          color: AppColors.primaryStrong,
        ),
        const SizedBox(width: 8),
        const Expanded(
          child: Text(
            'Showing recommendations based on your event preferences.',
          ),
        ),
        const SizedBox(width: 8),
        OutlinedButton.icon(
          onPressed: () => Navigator.of(context).pop(true),
          icon: const Icon(Icons.edit_outlined, size: 16),
          label: const Text('Edit event'),
        ),
      ],
    ),
  );

  Widget _offerPhoto(BestFitOffer offer, {required double height}) {
    final image = offer.package?.imageUrl ?? offer.provider.coverImageUrl;
    const placeholder = ColoredBox(
      color: AppColors.primarySubtle,
      child: Center(
        child: Icon(Icons.image_outlined, color: AppColors.primaryStrong),
      ),
    );
    return SizedBox(
      height: height,
      width: double.infinity,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: image == null || image.trim().isEmpty
            ? placeholder
            : Image.network(
                image,
                fit: BoxFit.cover,
                errorBuilder: (_, error, stack) => placeholder,
              ),
      ),
    );
  }

  String _offerName(BestFitOffer offer) {
    final tier = switch (offer.serviceTier) {
      'drop_off' => 'Drop-Off Catering',
      'buffet_setup' => 'Buffet Setup',
      'full_service' => 'Full-Service Catering',
      _ => null,
    };
    return tier == null ? offer.name : '${offer.name} · $tier';
  }

  Widget _offerTag(String label, {IconData? icon}) => DecoratedBox(
    decoration: BoxDecoration(
      color: AppColors.primarySubtle,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: AppColors.primaryStrong),
            const SizedBox(width: 4),
          ],
          Flexible(
            child: Text(label, style: Theme.of(context).textTheme.labelMedium),
          ),
        ],
      ),
    ),
  );

  String? _categoryFilter;

  Widget _categoryHeading(
    ServiceCategory category,
    int count,
    VoidCallback showAll,
  ) => Row(
    children: [
      Expanded(
        child: Text(
          '${category.name} ($count matches)',
          style: AppTypography.cardTitle,
        ),
      ),
      if (count > 1)
        TextButton(onPressed: showAll, child: Text('See all ($count)')),
    ],
  );

  Widget _compactOffer(
    ServiceCategory category,
    BestFitOffer offer, {
    required bool selected,
    required bool enabled,
    required VoidCallback onTap,
  }) {
    final inlineAction =
        offer.package == null &&
        MediaQuery.textScalerOf(context).scale(1) <= 1.25;
    final label = selected
        ? (offer.package == null ? 'View' : 'Customize')
        : offer.package == null
        ? 'Select'
        : 'Choose package';
    final action = inlineAction
        ? TextButton(
            style: TextButton.styleFrom(
              backgroundColor: AppColors.primarySubtle,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              textStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
            onPressed: enabled ? onTap : null,
            child: Text(label),
          )
        : OutlinedButton(
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(0, 28),
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              textStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
            onPressed: enabled ? onTap : null,
            child: Text(
              selected
                  ? (offer.package == null ? 'View provider' : 'Customize')
                  : offer.package == null
                  ? 'Select'
                  : 'Choose package',
            ),
          );
    return _card(
      Row(
        crossAxisAlignment: inlineAction
            ? CrossAxisAlignment.center
            : CrossAxisAlignment.start,
        children: [
          SizedBox(width: 54, child: _offerPhoto(offer, height: 64)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  offer.provider.businessName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.cardTitle.copyWith(
                    fontSize: 13,
                    height: 1.2,
                  ),
                ),
                Text(
                  _offerName(offer),
                  style: const TextStyle(fontSize: 12, height: 1.2),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  _money(offer.centavos),
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                if (!inlineAction) action,
              ],
            ),
          ),
          if (inlineAction) ...[const SizedBox(width: 4), action],
        ],
      ),
      featured: selected,
      padding: 8,
    );
  }

  void _seeAll(
    ServiceCategory category,
    BestFitOffer picked,
    BestFitResult result,
    bool enabled,
  ) {
    final offers = [picked, ...result.alternatives(category.code)];
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (sheetContext) => FractionallySizedBox(
        heightFactor: .85,
        child: Column(
          children: [
            ListTile(
              title: Text(category.name, style: AppTypography.sectionTitle),
              trailing: IconButton(
                tooltip: 'Close',
                onPressed: () => Navigator.pop(sheetContext),
                icon: const Icon(Icons.close),
              ),
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.all(16),
                itemCount: offers.length,
                separatorBuilder: (_, index) => const SizedBox(height: 8),
                itemBuilder: (_, index) {
                  final offer = offers[index];
                  return _compactOffer(
                    category,
                    offer,
                    selected: index == 0,
                    enabled: enabled && (index != 0 || !_selectionNeedsReview),
                    onTap: () {
                      Navigator.pop(sheetContext);
                      if (index == 0) {
                        _open(offer, result.event);
                      } else {
                        _controller.replace(category.code, offer.id);
                      }
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _offerStrip(
    ServiceCategory category,
    List<BestFitOffer> offers,
    BestFitOffer picked,
    BestFitResult result,
    bool enabled,
  ) => SizedBox(
    height:
        (picked.package == null &&
                MediaQuery.textScalerOf(context).scale(1) <= 1.25
            ? 100
            : 144) +
        144 * (MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 3.0) - 1),
    child: ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: offers.length,
      separatorBuilder: (_, index) => const SizedBox(width: 8),
      itemBuilder: (_, index) {
        final offer = offers[index];
        final selected = offer.id == picked.id;
        return SizedBox(
          width:
              (MediaQuery.sizeOf(context).width *
                      (picked.package == null ? .67 : .56))
                  .clamp(195.0, 290.0),
          child: _compactOffer(
            category,
            offer,
            selected: selected,
            enabled: enabled && (!selected || !_selectionNeedsReview),
            onTap: () {
              if (selected) {
                _open(offer, result.event);
              } else {
                _controller.replace(category.code, offer.id);
              }
            },
          ),
        );
      },
    ),
  );

  Widget _offerCard(
    ServiceCategory category,
    BestFitOffer offer,
    BestFitResult result,
    bool enabled,
  ) {
    final alternatives = result.alternatives(category.code).toList();
    final matchCount = alternatives.length + 1;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _categoryHeading(
          category,
          matchCount,
          () => _seeAll(category, offer, result, enabled),
        ),
        const SizedBox(height: 6),
        if (offer.package == null)
          _offerStrip(
            category,
            [offer, ...alternatives],
            offer,
            result,
            enabled,
          )
        else
          _card(
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                LayoutBuilder(
                  builder: (context, constraints) {
                    final photo = Stack(
                      children: [
                        _offerPhoto(offer, height: 96),
                        Positioned(
                          top: 5,
                          left: 5,
                          child: _offerTag('Selected'),
                        ),
                      ],
                    );
                    final details = Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          offer.provider.businessName,
                          style: AppTypography.cardTitle,
                        ),
                        Text(_offerName(offer)),
                        Text(
                          _money(offer.centavos),
                          style: AppTypography.cardTitle,
                        ),
                        const SizedBox(height: 4),
                        Wrap(
                          spacing: 4,
                          runSpacing: 4,
                          children: [
                            _offerTag(
                              'Matches ${widget.address.city}',
                              icon: Icons.location_on_outlined,
                            ),
                            _offerTag(
                              'Fits ${widget.guestCount} guests',
                              icon: Icons.people_outline,
                            ),
                          ],
                        ),
                      ],
                    );
                    if (constraints.maxWidth < 235 ||
                        MediaQuery.textScalerOf(context).scale(1) > 1.35) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [photo, const SizedBox(height: 8), details],
                      );
                    }
                    return Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: constraints.maxWidth * .39,
                          child: photo,
                        ),
                        const SizedBox(width: 8),
                        Expanded(child: details),
                      ],
                    );
                  },
                ),
                const SizedBox(height: 6),
                FilledButton(
                  onPressed: enabled && !_selectionNeedsReview
                      ? () => _open(offer, result.event)
                      : null,
                  child: Text(
                    offer.package == null
                        ? 'View provider'
                        : 'View & customize package',
                  ),
                ),
              ],
            ),
            featured: true,
          ),
        if (offer.package != null && alternatives.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(
            'Other matching offers',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          _offerStrip(category, alternatives, offer, result, enabled),
        ],
      ],
    );
  }

  Widget _unmatchedCard(ServiceCategory category, BestFitResult result) =>
      _card(
        Row(
          children: [
            Icon(
              switch (category.code) {
                'photographer' => Icons.photo_camera_outlined,
                'videographer' => Icons.videocam_outlined,
                _ => Icons.search_outlined,
              },
              color: AppColors.primaryStrong,
              size: 26,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(category.name, style: AppTypography.cardTitle),
                  Text(switch (result.unmatched(category.code)) {
                    BestFitUnmatched.budget =>
                      'Available offers exceed your remaining budget.',
                    BestFitUnmatched.unavailable =>
                      'Providers are unavailable for your schedule.',
                    BestFitUnmatched.serviceArea =>
                      'No confirmed service area for ${widget.address.city}.',
                    _ => 'No eligible offer with a confirmed price was found.',
                  }),
                ],
              ),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => CustomerSearchScreen(
                    initialCategoryCode: category.code,
                    initialEventType: widget.eventType,
                    initialLocation: widget.address.city,
                    repository: _repository,
                  ),
                ),
              ),
              child: Text('Browse', semanticsLabel: 'Browse ${category.name}'),
            ),
          ],
        ),
      );

  Future<void> _reviewSelections(BestFitResult result) async {
    final packages = result.selected.values.where(
      (offer) => offer.package != null,
    );
    final bookingOffer = packages.length == 1 ? packages.single : null;
    final editEvent = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (reviewContext) => Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(title: const Text('Review selected services')),
          body: SafeArea(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Primary details',
                  style: AppTypography.sectionTitle,
                ),
                const SizedBox(height: 8),
                for (final category in _categories)
                  if (result.selected[category.code] case final offer?)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _compactOffer(
                        category,
                        offer,
                        selected: true,
                        enabled: true,
                        onTap: () => _open(offer, result.event),
                      ),
                    ),
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Event details',
                        style: AppTypography.sectionTitle,
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () => Navigator.of(reviewContext).pop(true),
                      icon: const Icon(Icons.edit_outlined, size: 16),
                      label: const Text('Edit event'),
                    ),
                  ],
                ),
                _card(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.occasionLabel ?? widget.eventType),
                      Text(
                        MaterialLocalizations.of(
                          reviewContext,
                        ).formatFullDate(widget.eventDate),
                      ),
                      Text(
                        '${widget.startTime.format(reviewContext)} – ${widget.endTime.format(reviewContext)}',
                      ),
                      Text(
                        '${widget.guestCount} guests · ${widget.address.displayTitle}',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'Booking estimate',
                  style: AppTypography.sectionTitle,
                ),
                const SizedBox(height: 8),
                _card(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (final category in _categories)
                        if (result.selected[category.code] case final offer?)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    '${category.name} · ${offer.provider.businessName}',
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(_money(offer.centavos)),
                              ],
                            ),
                          ),
                      const Divider(),
                      Row(
                        children: [
                          const Expanded(
                            child: Text(
                              'Estimated total',
                              style: AppTypography.cardTitle,
                            ),
                          ),
                          Text(
                            _money(result.totalCentavos),
                            style: AppTypography.cardTitle,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('${_money(result.remainingCentavos)} remaining'),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                if (bookingOffer != null) ...[
                  const Text(
                    'Review your package details and accept the booking agreements before submitting.',
                  ),
                  const SizedBox(height: 8),
                  SavePackageToEventList(
                    provider: bookingOffer.provider,
                    eventPackage: bookingOffer.package!,
                    compact: true,
                  ),
                  Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      const Text('Want to add more services?'),
                      TextButton(
                        onPressed: () => Navigator.of(reviewContext).push(
                          MaterialPageRoute<void>(
                            builder: (_) => CustomerSearchScreen(
                              initialEventType: widget.eventType,
                              initialLocation: widget.address.city,
                              repository: _repository,
                            ),
                          ),
                        ),
                        child: const Text('browse more providers.'),
                      ),
                    ],
                  ),
                  FilledButton.icon(
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                    ),
                    onPressed: () => _open(bookingOffer, result.event),
                    icon: const Icon(Icons.send_rounded),
                    label: const Text('Submit booking request'),
                  ),
                ] else
                  const Text(
                    'Open a selected package to review its booking terms and submit a request.',
                  ),
              ],
            ),
          ),
        ),
      ),
    );
    if (mounted && editEvent == true) Navigator.of(context).pop(true);
  }

  Widget _budgetFooter(BestFitResult result, bool enabled) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Total estimate'),
                      Text(
                        _money(result.totalCentavos),
                        style: AppTypography.title,
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Text(
                    '${_money(result.remainingCentavos)} remaining',
                    textAlign: TextAlign.end,
                    style: AppTypography.cardTitle,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            LinearProgressIndicator(
              value: result.totalCentavos / result.event.maximumBudgetCentavos,
              semanticsLabel: 'Estimated budget used',
              borderRadius: BorderRadius.circular(8),
            ),
            const SizedBox(height: 4),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    flex: 6,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        backgroundColor: AppColors.surface,
                        foregroundColor: AppColors.primaryStrong,
                        side: BorderSide(color: AppColors.border),
                        shape: const StadiumBorder(),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 8,
                        ),
                      ),
                      onPressed: enabled
                          ? _controller.restoreDefaultSuggestions
                          : null,
                      child: const Text(
                        'Restore default suggestions',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  ),
                  if (result.selected.isNotEmpty) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 4,
                      child: FilledButton(
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 8,
                          ),
                        ),
                        onPressed: enabled && !_selectionNeedsReview
                            ? () => _reviewSelections(result)
                            : null,
                        child: const Text(
                          'Continue →',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(
      backgroundColor: AppColors.background,
      foregroundColor: AppColors.primaryStrong,
      title: const Text('Best Fit', style: AppTypography.pageTitle),
    ),
    body: SafeArea(
      child: ListenableBuilder(
        listenable: _controller,
        builder: (context, _) {
          final result = _controller.result;
          final busy = _controller.loading;
          final enabled = !busy && _controller.error == null;
          return LayoutBuilder(
            builder: (context, constraints) => Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    children: [
                      _editEventBar(),
                      const SizedBox(height: 12),
                      const Text(
                        'Best Fit recommendations',
                        style: AppTypography.sectionTitle,
                      ),
                      Text(
                        'Based on your ${FeastaPriceFormatter.format(widget.maxBudget)} maximum budget.',
                        style: AppTypography.body,
                      ),
                      const SizedBox(height: 6),
                      if (busy)
                        const LinearProgressIndicator(
                          semanticsLabel: 'Checking Best Fit offers',
                        ),
                      if (_controller.error != null) ...[
                        Text(_controller.error!),
                        TextButton(
                          onPressed: _search,
                          child: const Text('Try again'),
                        ),
                      ],
                      if (_selectionNeedsReview) ...[
                        const Text(
                          'Some previous choices no longer fit your event. Review the updated recommendations before continuing.',
                        ),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton(
                            onPressed: () =>
                                setState(() => _selectionNeedsReview = false),
                            child: const Text(
                              'Confirm updated recommendations',
                            ),
                          ),
                        ),
                      ],
                      if (result != null) ...[
                        SizedBox(
                          height: 42,
                          child: ListView(
                            scrollDirection: Axis.horizontal,
                            children: [
                              for (final category in [
                                null,
                                ..._categories.where(
                                  (item) => result.event.categories.contains(
                                    item.code,
                                  ),
                                ),
                              ])
                                Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: ChoiceChip(
                                    showCheckmark: false,
                                    selectedColor: AppColors.primaryStrong,
                                    backgroundColor: AppColors.primarySubtle,
                                    side: BorderSide.none,
                                    labelStyle: TextStyle(
                                      fontSize: 12,
                                      color: _categoryFilter == category?.code
                                          ? Colors.white
                                          : AppColors.primaryStrong,
                                    ),
                                    label: Text(
                                      category == null
                                          ? 'All (${result.selected.keys.fold<int>(0, (count, code) => count + 1 + result.alternatives(code).length)})'
                                          : '${category.name} (${result.selected.containsKey(category.code) ? 1 + result.alternatives(category.code).length : 0})',
                                    ),
                                    selected: _categoryFilter == category?.code,
                                    onSelected: (_) => setState(
                                      () => _categoryFilter = category?.code,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        if (result.incompleteCatalog)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 8),
                            child: Text(
                              'Some offers could not be verified. Results may be incomplete.',
                            ),
                          ),
                        for (final category in _categories.where(
                          (item) =>
                              result.selected.containsKey(item.code) &&
                              (_categoryFilter == null ||
                                  _categoryFilter == item.code),
                        ))
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: _offerCard(
                              category,
                              result.selected[category.code]!,
                              result,
                              enabled,
                            ),
                          ),
                        if (result.selected.length > 1)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Wrap(
                              spacing: 12,
                              children: [
                                for (final category in _categories.where(
                                  (item) =>
                                      result.selected.containsKey(item.code),
                                ))
                                  Text(
                                    '${category.name} · ${_money(result.selected[category.code]!.centavos)}',
                                  ),
                              ],
                            ),
                          ),
                        LayoutBuilder(
                          builder: (context, constraints) {
                            return Wrap(
                              spacing: 10,
                              runSpacing: 10,
                              children: [
                                for (final category in _categories.where(
                                  (item) =>
                                      result.event.categories.contains(
                                        item.code,
                                      ) &&
                                      !result.selected.containsKey(item.code) &&
                                      (_categoryFilter == null ||
                                          _categoryFilter == item.code),
                                ))
                                  SizedBox(
                                    width: constraints.maxWidth,
                                    child: _unmatchedCard(category, result),
                                  ),
                              ],
                            );
                          },
                        ),
                      ],
                    ],
                  ),
                ),
                if (result != null)
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      maxHeight: constraints.maxHeight * .33,
                    ),
                    child: SingleChildScrollView(
                      primary: false,
                      child: _budgetFooter(result, enabled),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    ),
  );
}
