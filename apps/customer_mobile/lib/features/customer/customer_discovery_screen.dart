import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_radius.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../shared/models/feasta_models.dart';
import '../authentication/data/repositories/feasta_repository.dart';
import 'customer_search_screen.dart';

enum CustomerDiscoveryView {
  categories,
  eventServices,
  recommendedCaterers,
  popularProviders,
}

class CustomerDiscoveryScreen extends StatefulWidget {
  const CustomerDiscoveryScreen({super.key, required this.view});

  final CustomerDiscoveryView view;

  @override
  State<CustomerDiscoveryScreen> createState() =>
      _CustomerDiscoveryScreenState();
}

class _CustomerDiscoveryScreenState extends State<CustomerDiscoveryScreen> {
  late final FeastaRepository _repository;

  @override
  void initState() {
    super.initState();
    _repository = FeastaRepository();
  }

  String get _title {
    return switch (widget.view) {
      CustomerDiscoveryView.categories => 'All Categories',
      CustomerDiscoveryView.eventServices => 'Event Services',
      CustomerDiscoveryView.recommendedCaterers => 'Recommended Caterers',
      CustomerDiscoveryView.popularProviders => 'Popular Providers',
    };
  }

  String get _subtitle {
    return switch (widget.view) {
      CustomerDiscoveryView.categories =>
        'Browse every FEASTA service category.',
      CustomerDiscoveryView.eventServices =>
        'Everything you need for your celebration.',
      CustomerDiscoveryView.recommendedCaterers =>
        'Verified caterers for your next celebration.',
      CustomerDiscoveryView.popularProviders =>
        'Highly rated providers customers are discovering.',
    };
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.mainText,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Text(
          _title,
          style: AppTypography.title.copyWith(
            color: AppColors.mainText,
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screen,
                AppSpacing.xs,
                AppSpacing.screen,
                AppSpacing.md,
              ),
              child: Text(
                _subtitle,
                style: AppTypography.bodySmall.copyWith(
                  color: AppColors.secondaryTextAccessible,
                ),
              ),
            ),
            Expanded(child: _buildContent()),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    return switch (widget.view) {
      CustomerDiscoveryView.categories => const _CategoryDiscoveryGrid(
        items: _allCategories,
      ),
      CustomerDiscoveryView.eventServices => const _CategoryDiscoveryGrid(
        items: _eventServices,
      ),
      CustomerDiscoveryView.recommendedCaterers => _ProviderDiscoveryList(
        stream: _repository.verifiedProviders(),
        emptyText: 'No recommended caterers are available yet.',
      ),
      CustomerDiscoveryView.popularProviders => _ProviderDiscoveryList(
        stream: _repository.homeCateringProviders(
          eventType: 'All',
          nearOrmoc: false,
          rating4Plus: false,
          budgetFriendly: false,
        ),
        emptyText: 'No popular providers are available yet.',
      ),
    };
  }
}

class _DiscoveryCategory {
  const _DiscoveryCategory({
    required this.label,
    required this.query,
    required this.icon,
  });

  final String label;
  final String query;
  final IconData icon;
}

const List<_DiscoveryCategory> _allCategories = [
  _DiscoveryCategory(
    label: 'Catering',
    query: 'Catering',
    icon: Icons.restaurant_menu_outlined,
  ),
  _DiscoveryCategory(
    label: 'Photography',
    query: 'Photography',
    icon: Icons.camera_alt_outlined,
  ),
  _DiscoveryCategory(
    label: 'Videography',
    query: 'Videography',
    icon: Icons.videocam_outlined,
  ),
  _DiscoveryCategory(
    label: 'Event Styling',
    query: 'Event Styling',
    icon: Icons.auto_awesome_rounded,
  ),
  _DiscoveryCategory(
    label: 'Makeup Artist',
    query: 'Makeup Artist',
    icon: Icons.brush_outlined,
  ),
  _DiscoveryCategory(
    label: 'Entertainment',
    query: 'Entertainment',
    icon: Icons.music_note_outlined,
  ),
  _DiscoveryCategory(
    label: 'Sound System',
    query: 'Sound System',
    icon: Icons.speaker_outlined,
  ),
  _DiscoveryCategory(
    label: 'Hosts & Emcees',
    query: 'Hosts & Emcees',
    icon: Icons.mic_outlined,
  ),
];

const List<_DiscoveryCategory> _eventServices = [
  _DiscoveryCategory(
    label: 'Photography',
    query: 'Photography',
    icon: Icons.camera_alt_outlined,
  ),
  _DiscoveryCategory(
    label: 'Videography',
    query: 'Videography',
    icon: Icons.videocam_outlined,
  ),
  _DiscoveryCategory(
    label: 'Event Styling',
    query: 'Event Styling',
    icon: Icons.auto_awesome_rounded,
  ),
  _DiscoveryCategory(
    label: 'Entertainment',
    query: 'Entertainment',
    icon: Icons.music_note_outlined,
  ),
  _DiscoveryCategory(
    label: 'Sound System',
    query: 'Sound System',
    icon: Icons.speaker_outlined,
  ),
  _DiscoveryCategory(
    label: 'Hosts & Emcees',
    query: 'Hosts & Emcees',
    icon: Icons.mic_outlined,
  ),
  _DiscoveryCategory(
    label: 'Makeup Artist',
    query: 'Makeup Artist',
    icon: Icons.brush_outlined,
  ),
  _DiscoveryCategory(
    label: 'Rentals',
    query: 'Rental',
    icon: Icons.chair_outlined,
  ),
];

class _CategoryDiscoveryGrid extends StatelessWidget {
  const _CategoryDiscoveryGrid({required this.items});

  final List<_DiscoveryCategory> items;

  void _openSearch(BuildContext context, _DiscoveryCategory item) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CustomerSearchScreen(initialQuery: item.query),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 700
            ? 4
            : constraints.maxWidth >= 430
            ? 3
            : 2;

        return GridView.builder(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.xs,
            AppSpacing.screen,
            AppSpacing.xl,
          ),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: columns,
            crossAxisSpacing: AppSpacing.sm,
            mainAxisSpacing: AppSpacing.sm,
            childAspectRatio: 1.18,
          ),
          itemCount: items.length,
          itemBuilder: (context, index) {
            final item = items[index];

            return Semantics(
              button: true,
              label: 'Browse ${item.label}',
              child: Material(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(AppRadius.large),
                child: InkWell(
                  onTap: () => _openSearch(context, item),
                  borderRadius: BorderRadius.circular(AppRadius.large),
                  child: Container(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(AppRadius.large),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: AppColors.primarySubtle,
                            borderRadius: BorderRadius.circular(
                              AppRadius.medium,
                            ),
                          ),
                          child: Icon(
                            item.icon,
                            color: AppColors.primary,
                            size: 25,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          item.label,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: AppTypography.label.copyWith(
                            color: AppColors.mainText,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _ProviderDiscoveryList extends StatelessWidget {
  const _ProviderDiscoveryList({required this.stream, required this.emptyText});

  final Stream<List<ProviderModel>> stream;
  final String emptyText;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<ProviderModel>>(
      stream: stream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(
            child: CircularProgressIndicator(color: AppColors.primary),
          );
        }

        if (snapshot.hasError) {
          return _DiscoveryMessage(
            icon: Icons.error_outline_rounded,
            title: 'Unable to load providers',
            message: 'Please check your connection and try again.',
          );
        }

        final providers = snapshot.data ?? const <ProviderModel>[];

        if (providers.isEmpty) {
          return _DiscoveryMessage(
            icon: Icons.storefront_outlined,
            title: 'Nothing here yet',
            message: emptyText,
          );
        }

        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screen,
            AppSpacing.xs,
            AppSpacing.screen,
            AppSpacing.xl,
          ),
          itemCount: providers.length,
          separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.sm),
          itemBuilder: (context, index) {
            return SearchProviderCard(provider: providers[index]);
          },
        );
      },
    );
  }
}

class _DiscoveryMessage extends StatelessWidget {
  const _DiscoveryMessage({
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
            Icon(icon, size: 48, color: AppColors.secondaryTextAccessible),
            const SizedBox(height: AppSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: AppTypography.sectionTitle.copyWith(
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
