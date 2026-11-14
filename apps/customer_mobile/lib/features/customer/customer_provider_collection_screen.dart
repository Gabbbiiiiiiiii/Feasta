import 'widgets/provider_grid.dart';
import 'customer_search_screen.dart' show SearchProviderCard;
import 'package:flutter/material.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/helpers/provider_discovery.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../shared/models/feasta_models.dart';

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
  StateSetter? _sheetState;

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
    onChanged: (_) {
      setState(() {});
      _sheetState?.call(() {});
    },
    decoration: InputDecoration(labelText: label, isDense: true),
  );

  Future<void> _openFilters(Map<String, String> categoryNames) async {
    FocusScope.of(context).unfocus();
    setState(() => _filtersOpen = true);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => StatefulBuilder(
        builder: (context, sheetSetState) {
          _sheetState = sheetSetState;
          void update(VoidCallback action) {
            setState(action);
            sheetSetState(() {});
          }

          return SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                20,
                0,
                20,
                MediaQuery.viewInsetsOf(context).bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Filter providers',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F4C3A),
                    ),
                  ),
                  const SizedBox(height: 20),

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
                          child: Text(e.value, overflow: TextOverflow.ellipsis),
                        ),
                      ),
                    ],
                    onChanged: (value) =>
                        update(() => _category = value == '' ? null : value),
                  ),
                  DropdownButtonFormField<String>(
                    key: ValueKey(_event),
                    initialValue: _event,
                    decoration: const InputDecoration(labelText: 'Event type'),
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
                              (e) => DropdownMenuItem(value: e, child: Text(e)),
                            )
                            .toList(),
                    onChanged: (value) => update(() => _event = value ?? 'All'),
                  ),
                  _field('Location', _location),
                  Row(
                    children: [
                      Expanded(
                        child: _field('Min budget', _minimum, number: true),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: _field('Max budget', _maximum, number: true),
                      ),
                    ],
                  ),
                  TextButton(
                    onPressed: () => update(() {
                      _category = null;
                      _event = 'All';
                      _location.clear();
                      _minimum.clear();
                      _maximum.clear();
                    }),
                    child: const Text('Clear filters'),
                  ),

                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Show results'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    _sheetState = null;
    if (mounted) setState(() => _filtersOpen = false);
  }

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
                                      borderRadius: BorderRadius.circular(24),
                                    ),
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Filter providers',
                                isSelected: _filtersOpen || _hasFilters,
                                icon: const Icon(Icons.tune_rounded),
                                onPressed: () => _openFilters(categoryNames),
                              ),
                            ],
                          ),
                          if (_hasFilters)
                            Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: Wrap(
                                spacing: 8,
                                runSpacing: 6,
                                children: [
                                  if (_category != null)
                                    InputChip(
                                      label: Text(
                                        categoryNames[_category] ?? _category!,
                                      ),
                                      onDeleted: () =>
                                          setState(() => _category = null),
                                    ),
                                  if (_event != 'All')
                                    InputChip(
                                      label: Text(_event),
                                      onDeleted: () =>
                                          setState(() => _event = 'All'),
                                    ),
                                  if (_location.text.isNotEmpty)
                                    InputChip(
                                      label: Text(_location.text),
                                      onDeleted: () =>
                                          setState(_location.clear),
                                    ),
                                  if (_minimum.text.isNotEmpty ||
                                      _maximum.text.isNotEmpty)
                                    InputChip(
                                      label: Text(
                                        '₱${_minimum.text.isEmpty ? '0' : _minimum.text} – ${_maximum.text.isEmpty ? 'Any' : '₱${_maximum.text}'}',
                                      ),
                                      onDeleted: () => setState(() {
                                        _minimum.clear();
                                        _maximum.clear();
                                      }),
                                    ),
                                ],
                              ),
                            ),
                          const SizedBox(height: 18),
                          Text(
                            '${providers.length} providers found',
                            style: const TextStyle(
                              color: Color(0xFF0F4C3A),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 16),
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
                      sliver: SliverToBoxAdapter(
                        child: ProviderCardGrid(
                          itemCount: providers.length,
                          itemBuilder: (context, index) => SearchProviderCard(
                            key: ValueKey('provider-${providers[index].id}'),
                            provider: providers[index],
                            categoryNames: categoryNames,
                          ),
                        ),
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
