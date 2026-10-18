import 'package:flutter/material.dart';
import '../../core/helpers/provider_category_helper.dart';
import '../../core/helpers/provider_discovery.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/badges/feasta_price_text.dart';
import '../../shared/models/feasta_models.dart';
import 'provider_profile_screen.dart';
import 'widgets/provider_brand_visual.dart';

class CustomerProviderCollectionScreen extends StatefulWidget {
  const CustomerProviderCollectionScreen({
    required this.title,
    required this.subtitle,
    required this.stream,
    required this.serviceCategoryNames,
    this.excludeProviderIds = const <String>{},
    this.onBack,
    super.key,
  });
  final String title;
  final String subtitle;
  final Stream<List<ProviderModel>> stream;
  final Future<Map<String, String>> serviceCategoryNames;
  final Set<String> excludeProviderIds;
  final VoidCallback? onBack;

  @override
  State<CustomerProviderCollectionScreen> createState() => _CollectionState();
}

class _CollectionState extends State<CustomerProviderCollectionScreen> {
  final _search = TextEditingController();
  final _location = TextEditingController();
  final _minimum = TextEditingController();
  final _maximum = TextEditingController();
  String? _category;
  String _event = 'All';
  bool _filtersOpen = false;

  bool get _hasFilters =>
      _category != null ||
      _event != 'All' ||
      [
        _location,
        _minimum,
        _maximum,
      ].any((controller) => controller.text.trim().isNotEmpty);

  @override
  void dispose() {
    for (final controller in [_search, _location, _minimum, _maximum]) {
      controller.dispose();
    }
    super.dispose();
  }

  Widget _field(
    String label,
    TextEditingController controller, {
    bool number = false,
  }) => TextField(
    controller: controller,
    keyboardType: number ? TextInputType.number : TextInputType.text,
    onChanged: (_) => setState(() {}),
    decoration: InputDecoration(labelText: label, isDense: true),
  );

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    appBar: AppBar(
      backgroundColor: AppColors.background,
      leading: widget.onBack == null
          ? null
          : BackButton(onPressed: widget.onBack),
      title: Text(widget.title, style: AppTypography.title),
    ),
    body: SafeArea(
      top: false,
      child: FutureBuilder<Map<String, String>>(
        future: widget.serviceCategoryNames,
        builder: (context, categorySnapshot) {
          final categoryNames =
              categorySnapshot.data ?? const <String, String>{};
          return StreamBuilder<List<ProviderModel>>(
            stream: widget.stream,
            builder: (context, snapshot) {
              final providers = (snapshot.data ?? const <ProviderModel>[])
                  .where(
                    (p) =>
                        !widget.excludeProviderIds.contains(p.id) &&
                        matchesProviderDiscovery(
                          p,
                          keyword: _search.text,
                          categoryCode: _category,
                          eventType: _event,
                          location: _location.text,
                          minBudget: _minimum.text.isEmpty
                              ? null
                              : double.tryParse(_minimum.text) ?? double.nan,
                          maxBudget: _maximum.text.isEmpty
                              ? null
                              : double.tryParse(_maximum.text) ?? double.nan,
                        ),
                  )
                  .toList();
              if (_search.text.trim().isNotEmpty) {
                providers.sort(
                  (a, b) => compareProviderSearchRelevance(a, b, _search.text),
                );
              }
              return CustomScrollView(
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                slivers: [
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                    sliver: SliverToBoxAdapter(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(widget.subtitle, style: AppTypography.bodySmall),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _search,
                                  onChanged: (_) => setState(() {}),
                                  decoration: InputDecoration(
                                    hintText: 'Search providers',
                                    isDense: true,
                                    prefixIcon: const Icon(
                                      Icons.search_rounded,
                                    ),
                                    suffixIcon: _search.text.isEmpty
                                        ? null
                                        : IconButton(
                                            tooltip: 'Clear search',
                                            icon: const Icon(
                                              Icons.close_rounded,
                                            ),
                                            onPressed: () =>
                                                setState(_search.clear),
                                          ),
                                    border: OutlineInputBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Filter providers',
                                isSelected: _filtersOpen || _hasFilters,
                                icon: const Icon(Icons.tune_rounded),
                                onPressed: () => setState(
                                  () => _filtersOpen = !_filtersOpen,
                                ),
                              ),
                            ],
                          ),
                          if (_filtersOpen) ...[
                            DropdownButtonFormField<String>(
                              key: ValueKey(_category),
                              initialValue: _category ?? '',
                              isExpanded: true,
                              decoration: const InputDecoration(
                                labelText: 'Service category',
                              ),
                              items: [
                                const DropdownMenuItem(
                                  value: '',
                                  child: Text('All categories'),
                                ),
                                ...categoryNames.entries.map(
                                  (e) => DropdownMenuItem(
                                    value: e.key,
                                    child: Text(
                                      e.value,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ),
                              ],
                              onChanged: (value) => setState(
                                () => _category = value == '' ? null : value,
                              ),
                            ),
                            DropdownButtonFormField<String>(
                              key: ValueKey(_event),
                              initialValue: _event,
                              decoration: const InputDecoration(
                                labelText: 'Event type',
                              ),
                              items:
                                  const [
                                        'All',
                                        'Birthday',
                                        'Wedding',
                                        'Anniversary',
                                        'Reunion',
                                        'Corporate',
                                        'Baptism',
                                        'Graduation',
                                        'Other',
                                      ]
                                      .map(
                                        (e) => DropdownMenuItem(
                                          value: e,
                                          child: Text(e),
                                        ),
                                      )
                                      .toList(),
                              onChanged: (value) =>
                                  setState(() => _event = value ?? 'All'),
                            ),
                            _field('Location', _location),
                            Row(
                              children: [
                                Expanded(
                                  child: _field(
                                    'Min budget',
                                    _minimum,
                                    number: true,
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _field(
                                    'Max budget',
                                    _maximum,
                                    number: true,
                                  ),
                                ),
                              ],
                            ),
                            TextButton(
                              onPressed: () => setState(() {
                                _category = null;
                                _event = 'All';
                                _location.clear();
                                _minimum.clear();
                                _maximum.clear();
                              }),
                              child: const Text('Clear filters'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  if (snapshot.connectionState == ConnectionState.waiting &&
                      !snapshot.hasData)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: Center(
                        child: CircularProgressIndicator(
                          color: AppColors.primary,
                        ),
                      ),
                    )
                  else if (snapshot.hasError)
                    const SliverFillRemaining(
                      hasScrollBody: false,
                      child: _CollectionMessage(
                        icon: Icons.error_outline_rounded,
                        title: 'Could not load providers',
                        message: 'Check your connection and try again.',
                      ),
                    )
                  else if (providers.isEmpty)
                    SliverFillRemaining(
                      hasScrollBody: false,
                      child: _CollectionMessage(
                        icon: Icons.storefront_outlined,
                        title: _search.text.trim().isNotEmpty || _hasFilters
                            ? 'No matching providers'
                            : 'No providers available yet',
                        message: 'Try another search or adjust your filters.',
                      ),
                    )
                  else
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      sliver: SliverLayoutBuilder(
                        builder: (context, constraints) {
                          // Fixed rows scale with both available width and accessibility text.
                          final width = (constraints.crossAxisExtent - 12) / 2;
                          final textScale = MediaQuery.textScalerOf(
                            context,
                          ).scale(1);
                          return SliverGrid(
                            gridDelegate:
                                SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 2,
                                  crossAxisSpacing: 12,
                                  mainAxisSpacing: 12,
                                  mainAxisExtent:
                                      width * .88 + 24 + 142 * textScale,
                                ),
                            delegate: SliverChildBuilderDelegate(
                              (context, index) => _CollectionProviderCard(
                                key: ValueKey(
                                  'provider-${providers[index].id}',
                                ),
                                provider: providers[index],
                                categoryNames: categoryNames,
                              ),
                              childCount: providers.length,
                            ),
                          );
                        },
                      ),
                    ),
                ],
              );
            },
          );
        },
      ),
    ),
  );
}

class _CollectionProviderCard extends StatelessWidget {
  const _CollectionProviderCard({
    required this.provider,
    required this.categoryNames,
    super.key,
  });

  final ProviderModel provider;
  final Map<String, String> categoryNames;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.card),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ProviderProfileScreen(provider: provider),
            ),
          );
        },
        child: Container(
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadius.card),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              LayoutBuilder(
                builder: (context, constraints) => ProviderBrandVisual(
                  provider: provider,
                  height: constraints.maxWidth * 0.88,
                  logoSize: 38,
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.sm),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: SizedBox(
                            height: MediaQuery.textScalerOf(
                              context,
                            ).scale(39.2),
                            child: Text(
                              provider.businessName,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.cardTitle.copyWith(
                                color: AppColors.mainText,
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ),
                        if (provider.isApproved)
                          const Icon(
                            Icons.verified_rounded,
                            size: 18,
                            color: AppColors.success,
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      provider.providerCategory.trim().isEmpty
                          ? (provider.providerServiceType == 'catering'
                                ? 'Catering Service'
                                : 'Event Service')
                          : providerCategoryLabel(
                              provider.providerCategory,
                              categoryNames: categoryNames,
                            ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    SizedBox(
                      height: MediaQuery.textScalerOf(context).scale(17),
                      child:
                          provider.reviewCount > 0 &&
                              provider.ratingAverage.isFinite
                          ? Row(
                              children: [
                                const Icon(
                                  Icons.star_rounded,
                                  color: AppColors.rating,
                                  size: 17,
                                ),
                                const SizedBox(width: 3),
                                Expanded(
                                  child: Text(
                                    '${provider.ratingAverage.toStringAsFixed(1)} '
                                    '(${provider.reviewCount})',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: AppTypography.caption.copyWith(
                                      color: AppColors.mainText,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            )
                          : null,
                    ),
                    const SizedBox(height: 4),
                    if (provider.minPrice > 0 && provider.minPrice.isFinite)
                      Text(
                        'From ${FeastaPriceFormatter.format(provider.minPrice, decimalDigits: 0)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.caption.copyWith(
                          color: AppColors.primaryStrong,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    Text(
                      provider.location,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.caption.copyWith(
                        color: AppColors.secondaryTextAccessible,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CollectionMessage extends StatelessWidget {
  const _CollectionMessage({
    required this.icon,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: AppColors.primary),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: AppTypography.title.copyWith(
                color: AppColors.mainText,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              message,
              textAlign: TextAlign.center,
              style: AppTypography.bodySmall.copyWith(
                color: AppColors.secondaryTextAccessible,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
